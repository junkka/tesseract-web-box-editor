const BoxFileType = Object.freeze({ "WORDSTR": 1, "CHAR_OR_LINE": 2 })
const IgnoreEOFBox = true
var map
var imageFileName;
var _URL = window.URL || window.webkitURL,
  h,
  w,
  bounds,
  boxdata = [],
  boxFileType = BoxFileType.WORDSTR,
  boxlayer = new L.FeatureGroup(),
  selectedPoly,
  imageLoaded = false,
  boxdataLoaded = false,
  selectedBox,
  zoomMax = 1,
  image;

function getBoxFileType(boxContent) {
  var assumeWordStrFormat;
  if (boxContent == "") {
    assumeWordStrFormat = true;
  } else {
    first = boxContent.startsWith("WordStr ");
    second = boxContent.split('\n')[1].startsWith("\t ");
  }
  if (assumeWordStrFormat || (first && second)) {
    boxFileType = BoxFileType.WORDSTR;
  } else {
    boxFileType = BoxFileType.CHAR_OR_LINE;
  }
}

function setFromData(d) {
  selectedBox = d;
  //     console.log(d)
  $('#formtxt').val(d.text).attr('boxid', d.polyid);
  // $("#txtlabel").text(d.text);
  $("#x1").val(d.x1);
  $("#y1").val(d.y1);
  $("#x2").val(d.x2);
  $("#y2").val(d.y2);
  $('#formtxt').focus();
}

function getPrevtBB(box) {
  // Next
  if (typeof box === "undefined") {
    return boxdata[0];
  }
  var el = boxdata.findIndex(function (x) {
    return x.polyid == box.polyid;
  });
  if (el === 0) {
    return boxdata[el]
  }
  return boxdata[el - 1];
}

function getNextBB(box) {
  // Next
  if (typeof box === "undefined") {
    return boxdata[0];
  }
  var el = boxdata.findIndex(function (x) {
    return x.polyid == box.polyid;
  });
  if (el == boxdata.length) {
    return boxdata[el]
  }
  return boxdata[el + 1];
}

function fillAndFocusRect(box) {
  setFromData(box);
  focusRect(box.polyid);
}

function setStyle(rect) {
  if (rect) {
    rect.setStyle({ color: 'red', fillOpacity: 0 })
  }

}

function removeStyle(rect) {
  if (rect) {
    rect.setStyle({ color: 'blue', opacity: 0.5, fillOpacity: 0.1 })
  }
}

function focusRect(id) {
  removeStyle(selectedPoly)
  var rect = boxlayer.getLayer(id);
  disableEdit(rect);
  var recb = rect.getBounds()
  map.fitBounds(recb, { maxZoom: zoomMax });
  // set style
  selectedPoly = rect
  setStyle(rect)
  $('#formtxt').focus();
}


function processFile(e) {
  var file = e.target.result;
  getBoxFileType(file);
  // console.log("Box File Type", boxFileType);
  // console.log("bounds", bounds);
  if (file && file.length) {
    //       if (boxlayer){
    boxlayer.clearLayers();
    //         map.removeLayer(boxlayer);
    boxdata = [];
    //       }
    if (boxFileType == BoxFileType.CHAR_OR_LINE) {
      file.split("\n")
        .forEach(function (line) {
          if (line.length > 5) {

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
    } else if (boxFileType == BoxFileType.WORDSTR) {
      file.split('\n')
        .forEach(function (line) {
          var symbole
          if (line.startsWith("WordStr ")) {
            var [dimensions, wordStr] = line.split('#')
            dimensions = dimensions.split(" ")
            symbole = {
              text: wordStr,
              x1: parseInt(dimensions[1]),
              y1: parseInt(dimensions[2]),
              x2: parseInt(dimensions[3]),
              y2: parseInt(dimensions[4])
            }
          } else if (!IgnoreEOFBox && line.startsWith("\t ")) {
            var [dimensions, wordStr] = line.split('#')
            dimensions = dimensions.split(" ")
            symbole = {
              text: dimensions[0],
              x1: parseInt(dimensions[1]),
              y1: parseInt(dimensions[2]),
              x2: parseInt(dimensions[3]),
              y2: parseInt(dimensions[4])
            }
          } else {
            // if (line == "") {
            return
            // }
          }
          var rect = new L.rectangle([[symbole.y1, symbole.x1], [symbole.y2, symbole.x2]]);

          rect.on('edit', editRect);
          rect.on('click', onRectClick);
          // addLayer

          boxlayer.addLayer(rect);
          var polyid = boxlayer.getLayerId(rect)
          symbole.polyid = polyid
          boxdata.push(symbole);
        });
    }
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

function deleteBox(box) {
  var boxindex = boxdata.findIndex(function (d) {
    return d.polyid == box.polyid
  });
  if (boxindex > -1) {
    boxdata.splice(boxindex, 1);
  }
  return boxindex
}

function onRectClick(event) {
  var rect = event.target;
  //     var nearest = leafletKnn(boxlayer).nearest(L.latLng(point[0], point[1]), 5);
  //     console.log(nearest)
  removeStyle(selectedPoly)
  map.fitBounds(rect.getBounds(), { maxZoom: zoomMax + 1 });
  setStyle(rect)
  disableEdit(rect);
  enableEdit(rect);

  // get boxdatata
  var bb = getBoxdataFromRect(rect);

  setFromData(bb);
}

function updateRect(polyid, d) {
  var rect = boxlayer.getLayer(polyid);
  var newbounds = [[d.y1, d.x1], [d.y2, d.x2]]
  rect.setBounds(newbounds)
}

var doneMovingInterval = 200,
  movingTimer;


function getNextAndFill() {
  var box = getNextBB(selectedBox);
  setFromData(box);

  clearTimeout(movingTimer);
  movingTimer = setTimeout(focusRect, doneMovingInterval, box.polyid);
}

function getPrevAndFill() {
  var box = getPrevtBB(selectedBox);
  setFromData(box);
  clearTimeout(movingTimer);
  movingTimer = setTimeout(focusRect, doneMovingInterval, box.polyid);
}

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

$('#x1').on('input', function (e) {
  clearTimeout(movingTimer);
  movingTimer = setTimeout(onBoxInputChange, doneMovingInterval);
});
$('#y1').on('input', function (e) {
  clearTimeout(movingTimer);
  movingTimer = setTimeout(onBoxInputChange, doneMovingInterval);
});
$('#x2').on('input', function (e) {
  clearTimeout(movingTimer);
  movingTimer = setTimeout(onBoxInputChange, doneMovingInterval);
});
$('#y2').on('input', function (e) {
  clearTimeout(movingTimer);
  movingTimer = setTimeout(onBoxInputChange, doneMovingInterval);
});

$('#updateTxt').on('submit', submitText);
function submitText(e) {
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
}

function updateBoxdata(id, d) {
  var thebox = boxdata.findIndex(function (x) {
    return x.polyid == id;
  });
  var ndata = Object.assign({}, boxdata[thebox], d);
  boxdata[thebox] = ndata
}

function disableEdit(rect) {
  if (selectedPoly && rect != selectedPoly) {
    selectedPoly.editing.disable();
  }
}

function enableEdit(rect) {
  selectedPoly = rect
  selectedPoly.editing.enable()
}

function getBoxdataFromRect(rect) {
  var firstel = boxdata.find(function (x) {
    return x.polyid == rect._leaflet_id
  });
  return firstel
}

function getBoxdataFromId(id) {
  var firstel = boxdata.find(function (x) {
    return x.polyid == id
  });
  return firstel
}

function getListData(d) {
  var thebox = boxdata.findIndex(function (x) {
    return x.polyid == d.polyid;
  });
  //     console.log(thebox)
  var start = Math.max(thebox - 3, 0)
  var end = Math.min(thebox + 3, boxdata.length)
  //     console.log(thebox, start, end)
  return boxdata.slice(start, end)
}


$(document).bind('keydown', 'ctrl+shift+down', getNextAndFill);

$(document).bind('keydown', 'ctrl+shift+up', getPrevAndFill);

$('#formtxt').bind('keydown', 'ctrl+shift+down', getNextAndFill);
$('#formtxt').bind('keydown', 'ctrl+shift+up', getPrevAndFill);
$('#formtxt').bind('keydown', 'shift+return', getPrevAndFill);
// TODO: check binding for enter key
$('#formtxt').bind('keydown', 'shift+enter', getPrevAndFill);
// $('#formtxt').bind('keydown', 'return', submitText);

$('#formtxt').on('focus', function () { $(this).select(); });

// Set #main-edit-area loading status
function setMainLoadingStatus(status) {
  if (status) {
    $('#mapid').addClass('loading');
    // move map to background
    // $('#mapid').hide();
  } else {
    $('#mapid').removeClass('loading');
    // show map
    // $('#mapid').show();
  }
}

async function generateInitialBoxes(image) {
  // Set #main-edit-area loading status
  setMainLoadingStatus(true);

  boxlayer.clearLayers();
  //         map.removeLayer(boxlayer);
  boxdata = [];

  const worker = await Tesseract.createWorker({
    // corePath: '/tesseract-core-simd.wasm.js',
    // workerPath: "/dist/worker.dev.js"
  });
  await worker.loadLanguage('eng+rus');
  await worker.initialize('eng+rus');
  // await worker.setParameters({
  //   tessedit_ocr_engine_mode: OcrEngineMode.OEM_LSTM_ONLY,
  //   tessedit_pageseg_mode: PSM_AUTO_OSD
  // });
  const results = await worker.recognize(image);
  // console.log(results);

  // get bounding boxes from results.data.lines
  var lines = results.data.lines;
  var boxes = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var box = line.bbox;
    var text = line.text;
    boxes.push([text, box.x0, box.y0, box.x1, box.y1]);
    // console.log(text, box)
    var symbole = {
      // text: text,
      text: '',
      // x1: box.x0,
      // y1: image.height - box.y0,
      // x2: box.x1,
      // y2: image.height - box.y1,
      y1: image.height - box.y1, // bottom
      y2: image.height - box.y0, // top
      x1: box.x0, // right
      x2: box.x1 // left
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
  map.addLayer(boxlayer);

  // Set #main-edit-area loading status
  setMainLoadingStatus(false);

  $('#formrow').removeClass('hidden');
  // select next BB
  var nextBB = getNextBB();
  fillAndFocusRect(nextBB);
}

function loadBoxFile(e) {
  var reader = new FileReader();
  var file;
  if ((file = this.files[0])) {
    // Read the file
    reader.readAsText(file);
    // When it's loaded, process it
    $(reader).on('load', processFile);
  }
}

async function loadImageFile(e) {
  {
    var file, img;


    if ((file = this.files[0])) {
      imageFileName = file.name.split('.')[0]
      img = new Image();
      img.onload = async function () {
        res = await generateInitialBoxes(img)
        closeInfoMessage()
        // console.log(this.width + " " + this.height);
        h = this.height
        w = this.width
        bounds = [[0, 0], [parseInt(h), parseInt(w)]]
        var bounds2 = [[h - 300, 0], [h, w]]

        if (image) {
          $(image._image).fadeOut(250, function () {
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

      };
      img.onerror = function () {
        alert("not a valid file: " + file.type);
      };
      img.src = _URL.createObjectURL(file);
    }
  }
}

// Sort boxes from top to bottom
function sortBoxes(a, b) {
  return b.y1 - a.y1;
}

// Sort all bosees from top to bottom
function sortAllBoxes() {
  boxdata.sort(sortBoxes);
  // console.log(boxdata)
}

// // Define regular expressions and colors
// var cyrillic_pattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F\u1C80-\u1CBF]/;
// var latin_pattern = /[\u0000-\u007F\u0080-\u00FF]/;
// var cyrillicClass = 'red';
// var latinClass = 'blue';


// // Function to colorize input text
// function colorizeInput() {
//   var input = document.getElementById("formtxt");
//   var colored_text = '';
//   for (var i = 0; i < input.value.length; i++) {
//     var char = input.value.charAt(i);
//     if (cyrillic_pattern.test(char)) {
//       colored_text += '<span class="' + cyrillicClass + '">' + char + '</span>';
//     } else if (latin_pattern.test(char)) {
//       colored_text += '<span class="' + latinClass + '">' + char + '</span>';
//     } else {
//       colored_text += char;
//     }
//   }
//   input.innerHTML = colored_text;
// }

// Define regular expressions
var cyrillic_pattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F\u1C80-\u1CBF]/;
var latin_pattern = /[\u0000-\u007F\u0080-\u00FF]/;

// Function to colorize text
function colorize(text) {
  var colored_text = '';
  if (text == '') {
    return '&nbsp;'
  }
  for (var i = 0; i < text.length; i++) {
    var char = text.charAt(i);
    if (cyrillic_pattern.test(char)) {
      colored_text += '<span class="cyrillic">' + char + '</span>';
    } else if (char == ' ') {
      colored_text += '&nbsp;';
    } else if (latin_pattern.test(char)) {
      colored_text += '<span class="latin">' + char + '</span>';
    } else {
      colored_text += char;
    }
  }
  return colored_text;
}

// Function to update the background with the colorized text
function updateBackground() {
  var input = document.getElementById("formtxt");
  var text = input.value;
  var colored_text = colorize(text);
  var background = document.getElementById("myInputBackground");
  background.innerHTML = colored_text;
}


function closeInfoMessage() {
      $('#info-message.message .close')
        .closest('.message')
        .transition('fade up')
        ;
      $("#mapid").removeClass("bottom attached");
}


$(document).ready(function () {
  $('#info-message.message .close')
    .on('click', function () {
      $(this)
        .closest('.message')
        .transition('fade up')
        ;
      $("#mapid").removeClass("bottom attached");
    })
    ;
  $(window).keydown(function(event){
    if(event.keyCode == 13) {
      event.preventDefault();
      submitText(event)
      return false;
    }
  });
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

  map = new L.map('mapid', {
    crs: L.CRS.Simple,
    minZoom: -5
  });

  map.addControl(drawControl);

  // load boxfile
  $('#boxfile').change(loadBoxFile);
  //   load Image
  $("#file").change(loadImageFile);


  $('#downloadBtn').on('click', function (e) {
    var content = '';
    if (boxFileType == BoxFileType.CHAR_OR_LINE) {
      $.each(boxdata, function () {
        content = content + this.text + ' ' + this.x1 + ' ' + this.y1 + ' ' + this.x2 + ' ' + this.y2 + ' 0\n'
      })
    }
    if (boxFileType == BoxFileType.WORDSTR) {
      $.each(boxdata, function () {
        content = content + 'WordStr ' + this.x1 + ' ' + this.y1 + ' ' + this.x2 + ' ' + this.y2 + ' 0 #' + this.text + '\n';
        content = content + '\t ' + (this.x2 + 1) + ' ' + this.y1 + ' ' + (this.x2 + 5) + ' ' + this.y2 + ' 0\n';
      })
    }

    var element = document.createElement('a');
    element.href = 'data:application/text;charset=utf-8,' + encodeURIComponent(content);
    element.download = imageFileName + '.box';
    element.target = '_blank';
    element.style.display = 'none';

    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    // window.open("data:application/txt," + encodeURIComponent(content), "_blank");

  });

  // delete rect
  map.on('draw:deleted', function (event) {
    // get boxdata
    Object.keys(event.layers._layers).forEach(function (x) {
      var polyid = parseInt(x)
      var delbox = boxdata.find(function (x) {
        return x.polyid == polyid;
      });

      var delindex = deleteBox(delbox);
      // fillAndFocusRect(boxdata[delindex])
    });
  });

  map.on(L.Draw.Event.CREATED, function (event) {
    var layer = event.layer;
    //     var nearest = leafletKnn(boxlayer).nearest(L.latLng(38, -78), 5);
    layer.on('edit', editRect);
    layer.on('click', onRectClick);
    // add new boxdata entry
    boxlayer.addLayer(layer);
    var polyid = boxlayer.getLayerId(layer)
    //     console.log(layer._leaflet_id, layer)
    var newbb = {
      polyid: layer._leaflet_id,
      text: '',
      x1: Math.round(layer._latlngs[0][0].lng),
      y1: Math.round(layer._latlngs[0][0].lat),
      x2: Math.round(layer._latlngs[0][2].lng),
      y2: Math.round(layer._latlngs[0][2].lat)
    }
    // get intdex of prebious
    // console.log("prev", selectedBox)
    // console.log(selectedBox)
    var idx;
    if (selectedBox) {
      idx = boxdata.findIndex(function (x) {
        return x.polyid == selectedBox.polyid;
      });
    } else {
      idx = 0;
    }
    // boxlayer.addLayer(rect);
    // var polyid = boxlayer.getLayerId(rect)
    // symbole.polyid = polyid
    // boxdata.push(newbb);
    // insert after
    boxdata.splice(idx + 1, 0, newbb);
    fillAndFocusRect(newbb);
  });


  $('#nextBB').on('click', getNextAndFill);
  $('#updateText').on('click', submitText);


  $('#previousBB').on('click', getPrevAndFill);




});