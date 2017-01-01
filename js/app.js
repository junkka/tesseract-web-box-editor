$(document).ready(function(){
  var _URL = window.URL || window.webkitURL,
      h,
      w,
      bounds,
      boxdata = [],
      boxlayer = new L.FeatureGroup(),
      selectedPoly,
      imageLoaded = false,
      boxdataLoaded = false,
      selectedBox,
      zoomMax = 1,
      image;
  var drawControl = new L.Control.Draw({
          draw: {
                 polygon: false,
                 marker: false,
                 circle: false,
                 polyline: false,
                 rectangle: true
           },
           edit: {
             featureGroup: boxlayer,
             edit: false
           }
      });
         
  var map = new L.map('mapid', {
    crs: L.CRS.Simple,
    minZoom: -5
  });
  
  map.addControl(drawControl);
  
  // load boxfile
  $('#boxfile').change(function(e){
    var reader = new FileReader();
    var file;
    if ((file = this.files[0])) {
      // Read the file
      reader.readAsText(file);
      // When it's loaded, process it
      $(reader).on('load', processFile);
    } 
  });
  //   load Image
  $("#file").change(function(e) {
      var file, img;


      if ((file = this.files[0])) {
          img = new Image();
          img.onload = function() {
              console.log(this.width + " " + this.height);
            h = this.height
            w = this.width
            bounds = [[0,0], [parseInt(h), parseInt(w)]]
            var bounds2 = [[h-300,0], [h, w]]
            
            if (image){
              $(image._image).fadeOut(250, function(){
                map.removeLayer(image);
                map.fitBounds(bounds2);
                image = new L.imageOverlay(img.src, bounds).addTo(map);
                $(image._image).fadeIn(500);
              });
            } else {
              map.fitBounds(bounds2);
              image = new L.imageOverlay(img.src, bounds).addTo(map);
              $(image._image).fadeIn(500); 
            }
            
            
            map.fitBounds(bounds2);
            // set imageloaded
            
          };
          img.onerror = function() {
              alert( "not a valid file: " + file.type);
          };
          img.src = _URL.createObjectURL(file);
      }
  });
  
  function processFile(e){
    var file = e.target.result;
    console.log("bounds", bounds)
    if (file && file.length) {  
//       if (boxlayer){
      boxlayer.clearLayers();
//         map.removeLayer(boxlayer);
      boxdata = [];
//       }
      
      file.split("\n")
          .forEach(function(line){
            if (line.length > 5){
             
              var temp = line.split(" ");
              var symbole = {
                text: temp[0],
                x1: parseInt(temp[1]),
                y1: parseInt(temp[2]),
                x2: parseInt(temp[3]),
                y2: parseInt(temp[4])
              }
              var rect = new L.rectangle([[symbole.y1, symbole.x1], [symbole.y2, symbole.x2]]);

              rect.on('edit', editRect);
              rect.on('click', onRectClick);
              // addLayer  
              
              boxlayer.addLayer(rect);
              var polyid = boxlayer.getLayerId(rect)
              symbole.polyid = polyid
              boxdata.push(symbole);  
            }
      });
      map.addLayer(boxlayer);
      

      $('#formrow').removeClass('hidden');
      // select next BB
      var nextBB = getNextBB();
      fillAndFocusRect(nextBB);
    }
  }
  
  function editRect(e) {
    var layer = e.target;
    var box = getBoxdataFromRect(layer);
    var newd = {
      x1: Math.round(layer._latlngs[0][0].lng),
      y1: Math.round(layer._latlngs[0][0].lat),
      x2: Math.round(layer._latlngs[0][2].lng),
      y2: Math.round(layer._latlngs[0][2].lat)
    }
    
    updateBoxdata(layer._leaflet_id, newd);
    
    fillAndFocusRect(box);
  }
  
  function deleteBox(box){
    var boxindex = boxdata.findIndex(function(d){
      return d.polyid == box.polyid
    });
    if (boxindex > -1) {
        boxdata.splice(boxindex, 1);
    }
    return boxindex
  }
  // delete rect
  map.on('draw:deleted', function(event){
    // get boxdata
    Object.keys(event.layers._layers).forEach (function(x){
      var polyid = parseInt(x)
      var delbox = boxdata.find(function(x){
        return x.polyid == polyid;
      });
      
      var delindex = deleteBox(delbox);
      fillAndFocusRect(boxdata[delindex])
    });
  });
  
  map.on(L.Draw.Event.CREATED, function (event) {
    var layer = event.layer;
//     var nearest = leafletKnn(boxlayer).nearest(L.latLng(38, -78), 5);
    layer.on('edit', editRect);
    layer.on('click', onRectClick);
    // add new boxdata entry
    boxlayer.addLayer(layer);
//     console.log(layer._leaflet_id, layer)
    var newbb = {
      polyid: layer._leaflet_id,
      text: '',
      x1: Math.round(layer._latlngs[0][0].lng),
      y1: Math.round(layer._latlngs[0][0].lat),
      x2: Math.round(layer._latlngs[0][2].lng),
      y2: (layer._latlngs[0][2].lat)
    }
    // get intdex of prebious
    // console.log("prev", selectedBox)
    // console.log(selectedBox)
    var idx;
    if (selectedBox){
      idx = boxdata.findIndex(function(x){
        return x.polyid == selectedBox.polyid;
      });  
    } else {
      idx = 0;
    } 
    // insert after
    boxdata.splice(idx + 1, 0, newbb);
    fillAndFocusRect(newbb);
  });
  
  
  
  //
  function onRectClick(event){
    var rect = event.target;
//     var nearest = leafletKnn(boxlayer).nearest(L.latLng(point[0], point[1]), 5);
//     console.log(nearest)
    removeStyle(selectedPoly)
    map.fitBounds(rect.getBounds(), {maxZoom: zoomMax + 1});
    setStyle(rect)
    disableEdit(rect);
    enableEdit(rect);
    
    // get boxdatata
    var bb = getBoxdataFromRect(rect);
    
    setFromData(bb);
  }
  
  function updateRect(polyid, d){
    var rect = boxlayer.getLayer(polyid);
    var newbounds = [[d.y1, d.x1], [d.y2, d.x2]]
    rect.setBounds(newbounds)
  }
  
  var doneMovingInterval = 200,
      movingTimer;
  
  
  function getNextAndFill(){
    var box = getNextBB(selectedBox);
    setFromData(box);
    
    clearTimeout(movingTimer);
    movingTimer = setTimeout(focusRect, doneMovingInterval, box.polyid);
  }
  
  function getPrevAndFill(){
    var box = getPrevtBB(selectedBox);
    setFromData(box);
    clearTimeout(movingTimer);
    movingTimer = setTimeout(focusRect, doneMovingInterval, box.polyid);
  }
  
  $('#nextBB').on('click', getNextAndFill);
  
  
  $('#previousBB').on('click', getPrevAndFill);
  
  function onBoxInputChange(e) {
  
    var polyid = parseInt($('#formtxt').attr('boxid'));
//       console.log("polyig;", polyid, "val", $('#formtxt').val())
    var newdata = {
      text: $('#formtxt').val(),
      x1: parseInt($('#x1').val()),
      y1: parseInt($('#y1').val()),
      x2: parseInt($('#x2').val()),
      y2: parseInt($('#y2').val())
    }
    updateBoxdata(polyid, newdata)
    updateRect(polyid, newdata)
//     fillAndFocusRect(selectedBox)
  }
  
  $('#x1').on('input', function(e){
    clearTimeout(movingTimer);
    movingTimer = setTimeout(onBoxInputChange, doneMovingInterval);
  });
  $('#y1').on('input',function(e){
    clearTimeout(movingTimer);
    movingTimer = setTimeout(onBoxInputChange, doneMovingInterval);
  });
  $('#x2').on('input',function(e){
    clearTimeout(movingTimer);
    movingTimer = setTimeout(onBoxInputChange, doneMovingInterval);
  });
  $('#y2').on('input',function(e){
    clearTimeout(movingTimer);
    movingTimer = setTimeout(onBoxInputChange, doneMovingInterval);
  });
  
  $('#updateTxt').on('submit', function(e) {
      e.preventDefault();

      var polyid = parseInt($('#formtxt').attr('boxid'));
//       console.log("polyig;", polyid, "val", $('#formtxt').val())
      var newdata = {
        text: $('#formtxt').val(),
        x1: parseInt($('#x1').val()),
        y1: parseInt($('#y1').val()),
        x2: parseInt($('#x2').val()),
        y2: parseInt($('#y2').val())
      }
      updateBoxdata(polyid, newdata)
      updateRect(polyid, newdata)
      fillAndFocusRect(getNextBB(selectedBox))
  });
  
  function updateBoxdata(id, d){
    var thebox = boxdata.findIndex(function(x){
      return x.polyid == id;
    });
    var ndata = Object.assign({}, boxdata[thebox], d);
    boxdata[thebox] = ndata
  }
  
  function disableEdit(rect){
    if (selectedPoly && rect != selectedPoly){
      selectedPoly.editing.disable();
    }
  }
  
  function enableEdit(rect){
    selectedPoly = rect
    selectedPoly.editing.enable()
  }
  
  function getBoxdataFromRect(rect){
    var firstel = boxdata.find(function(x){
      return x.polyid == rect._leaflet_id
    });
    return firstel
  }
  
  function getBoxdataFromId(id){
    var firstel = boxdata.find(function(x){
      return x.polyid == id
    });
    return firstel
  }
  
  function getListData(d){
    var thebox = boxdata.findIndex(function(x){
      return x.polyid == d.polyid;
    });
//     console.log(thebox)
    var start = Math.max(thebox-10, 0)
    var end = Math.min(thebox+10, boxdata.length)
//     console.log(thebox, start, end)
    return boxdata.slice(start, end)
  }
  
  var list = $('#wordlist')
  
  function setFromData(d){
    selectedBox = d;
//     console.log(d)
    $('#formtxt').val(d.text).attr('boxid', d.polyid);
    $("#txtlabel").text(d.text);
    $("#x1").val(d.x1);
    $("#y1").val(d.y1);
    $("#x2").val(d.x2);
    $("#y2").val(d.y2);
    $('#formtxt').focus();
    
    var listwords = getListData(d);
    list.html('')
    $(listwords).each(function(i, word){
      var item = $('<a/>').text(word.text);
      if (word.polyid === d.polyid){
        item.attr('class', 'bg-primary symbol')
      } else {
        item.attr('class', 'text-muted symbol')
      }
      item.attr("name", word.polyid);
      item.click(function(){
        var polyid = $(this).attr("name");
        fillAndFocusRect(getBoxdataFromId(polyid))
      })
      list.append(item)
//       $('#wordlist').listview('refresh')
    });
    
  }
  
  function getPrevtBB(box){
    // Next 
    if (typeof box === "undefined"){
      return boxdata[0];
    }
    var el = boxdata.findIndex(function(x){
      return x.polyid == box.polyid;
    });
    if (el === 0){
      return boxdata[el]
    }
    return boxdata[el - 1];
  }
  
  function getNextBB(box){
    // Next 
    if (typeof box === "undefined"){
      return boxdata[0];
    }
    var el = boxdata.findIndex(function(x){
      return x.polyid == box.polyid;
    });
    if (el == boxdata.length){
      return boxdata[el]
    }
    return boxdata[el + 1];
  }
  
  function fillAndFocusRect(box){
    setFromData(box);
    focusRect(box.polyid);
  }
  
  function setStyle(rect){
    if (rect){
      rect.setStyle({color:'red', fillOpacity: 0})
    }
    
  }
  
  function removeStyle(rect){
    if (rect){
      rect.setStyle({color:'blue', opacity: 0.5, fillOpacity: 0.1})
    }
  }
  
  function focusRect(id){
    removeStyle(selectedPoly)
    var rect = boxlayer.getLayer(id);
    disableEdit(rect);
    var recb = rect.getBounds()
    map.fitBounds(recb, {maxZoom: zoomMax});
    // set style
    selectedPoly = rect
    setStyle(rect)
    $('#formtxt').focus();
  }
  
  
  
  $(document).bind('keydown', 'ctrl+right', getNextAndFill);
  
  $(document).bind('keydown', 'ctrl+left', getPrevAndFill);
  
  $('#formtxt').bind('keydown', 'ctrl+right', getNextAndFill);
  $('#formtxt').bind('keydown', 'ctrl+left', getPrevAndFill);
  
  $('#downloadBtn').on('click', function(e){
    var content = ''
    $.each(boxdata, function(){
      content = content + this.text + ' ' + this.x1 + ' ' + this.y1 + ' ' + this.x2 + ' ' + this.y2 + ' 0\n'
    })
    
    window.open("data:application/txt," + encodeURIComponent(content), "_self");
  });
  
  $('#formtxt').on('focus', function(){ $(this).select(); });
});