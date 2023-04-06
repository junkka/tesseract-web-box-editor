const BoxFileType = Object.freeze({ "WORDSTR": 1, "CHAR_OR_LINE": 2 })
const IgnoreEOFBox = true
var map
var imageFileName;
var imageFileNameForButton;
var boxFileName;
var boxFileNameForButton;
var boxdataIsDirty = false;
var lineIsDirty = false;
var unicodeData;

class Box {
  constructor({ text, x1, y1, x2, y2, polyid, visited = false, verified = false }) {
    this.text = text
    this.x1 = x1
    this.y1 = y1
    this.x2 = x2
    this.y2 = y2
    this.polyid = polyid
    // ternary operator to set default value
    this.filled = text != "" ? true : false
    this.visited = visited
    this.verified = verified
    this.modified = false
  }
  // compare function for .equals
  equals(other) {
    return this.text == other.text && this.x1 == other.x1 && this.y1 == other.y1 && this.x2 == other.x2 && this.y2 == other.y2
  }
}

boxActive = {
  color: 'red',
  weight: 3,
  stroke: true,
  opacity: 0.5,
  fillOpacity: 0
}
boxInactive = {
  color: 'gray',
  stroke: true,
  weight: 1,
  opacity: 0.5,
  fillOpacity: 0.3
}
boxVisited = {
  color: 'green',
  stroke: false,
  fillOpacity: 0.3
}


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
  zoomMax = 2,
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
  updateBackground();
  lineIsDirty = false;
  updateProgressBar({ type: 'tagging' });
}

function getPrevtBB(box) {
  // Prev
  if (typeof box === "undefined") {
    return boxdata[0];
  }
  var el = boxdata.findIndex(function (x) {
    return x.polyid == box.polyid;
  });
  if (el === 0) {
    // if (el == boxdata.length) {
    return boxdata[boxdata.length - 1]
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
  if (el == boxdata.length - 1) {
    return boxdata[0]
  }
  return boxdata[el + 1];
}

function fillAndFocusRect(box) {
  setFromData(box);
  focusBoxID(box.polyid);
}

function setStyle(rect) {
  if (rect) {
    rect.setStyle(boxActive)
  }

}

function removeStyle(rect, modified = false) {
  if (rect && modified) {
    rect.setStyle(boxVisited)
  } else if (rect) {
    rect.setStyle(boxInactive)
  }
}

function focusRectangle(rect) {
  disableEdit(rect);
  map.fitBounds(rect.getBounds(), { maxZoom: zoomMax, animate: true, padding: [10, 10] });
  // map.flyToBounds(rect.getBounds(), { duration: 0.1});
  // set style
  selectedPoly = rect
  setStyle(rect)
}

function focusBoxID(id, modified = false) {
  removeStyle(selectedPoly, modified)
  var rect = boxlayer.getLayer(id);
  focusRectangle(rect)
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
            // var symbole = {
            //   text: temp[0],
            //   x1: parseInt(temp[1]),
            //   y1: parseInt(temp[2]),
            //   x2: parseInt(temp[3]),
            //   y2: parseInt(temp[4])
            // }
            var symbole = new Box({
              text: temp[0],
              x1: parseInt(temp[1]),
              y1: parseInt(temp[2]),
              x2: parseInt(temp[3]),
              y2: parseInt(temp[4])
            })
            var rect = new L.rectangle([[symbole.y1, symbole.x1], [symbole.y2, symbole.x2]]);
            rect.setStyle(boxInactive);
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
            // symbole = {
            //   text: wordStr,
            //   x1: parseInt(dimensions[1]),
            //   y1: parseInt(dimensions[2]),
            //   x2: parseInt(dimensions[3]),
            //   y2: parseInt(dimensions[4])
            // }
            symbole = new Box({
              text: wordStr,
              x1: parseInt(dimensions[1]),
              y1: parseInt(dimensions[2]),
              x2: parseInt(dimensions[3]),
              y2: parseInt(dimensions[4])
            })
          } else if (!IgnoreEOFBox && line.startsWith("\t ")) {
            var [dimensions, wordStr] = line.split('#')
            dimensions = dimensions.split(" ")
            // symbole = {
            //   text: dimensions[0],
            //   x1: parseInt(dimensions[1]),
            //   y1: parseInt(dimensions[2]),
            //   x2: parseInt(dimensions[3]),
            //   y2: parseInt(dimensions[4])
            // }
            symbole = new Box({
              text: dimensions[0],
              x1: parseInt(dimensions[1]),
              y1: parseInt(dimensions[2]),
              x2: parseInt(dimensions[3]),
              y2: parseInt(dimensions[4])
            })
          } else {
            // if (line == "") {
            return
            // }
          }
          var rect = new L.rectangle([[symbole.y1, symbole.x1], [symbole.y2, symbole.x2]]);
          rect.setStyle(boxInactive)
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
    updateBackground();
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

  // TODO: always sync box on map with form data

  updateBoxdata(layer._leaflet_id, newd);
  console.log(e.target.getBounds());
  // update form data with new values
  $('#x1').val(newd.x1);
  $('#y1').val(newd.y1);
  $('#x2').val(newd.x2);
  $('#y2').val(newd.y2);

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
  focusRectangle(rect)
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

var doneMovingInterval = 100,
  movingTimer;


function getNextAndFill() {
  var modified = submitText();
  var box = getNextBB(selectedBox);
  setFromData(box);
  // setFromData(selectedBox);

  clearTimeout(movingTimer);
  movingTimer = setTimeout(focusBoxID, doneMovingInterval, box.polyid, modified);
}

function getPrevAndFill() {
  var modified = submitText();
  var box = getPrevtBB(selectedBox);
  setFromData(box);
  // setFromData(selectedBox);
  clearTimeout(movingTimer);
  movingTimer = setTimeout(focusBoxID, doneMovingInterval, box.polyid, modified);
}

function onBoxInputChange(e) {

  var polyid = parseInt($('#formtxt').attr('boxid'));
  //       console.log("polyig;", polyid, "val", $('#formtxt').val())
  // var newdata = {
  //   text: $('#formtxt').val(),
  //   x1: parseInt($('#x1').val()),
  //   y1: parseInt($('#y1').val()),
  //   x2: parseInt($('#x2').val()),
  //   y2: parseInt($('#y2').val())
  // }
  var newdata = new Box({
    text: $('#formtxt').val(),
    x1: parseInt($('#x1').val()),
    y1: parseInt($('#y1').val()),
    x2: parseInt($('#x2').val()),
    y2: parseInt($('#y2').val())
  })

  var modified = updateBoxdata(polyid, newdata)
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

$('#updateTxt').on('submit', getNextAndFill);
function submitText(e) {
  if (e) {
    e.preventDefault();
  }
  var polyid = parseInt($('#formtxt').attr('boxid'));
  var newdata = new Box({
    text: $('#formtxt').val(),
    x1: parseInt($('#x1').val()),
    y1: parseInt($('#y1').val()),
    x2: parseInt($('#x2').val()),
    y2: parseInt($('#y2').val())
  })
  var modified = updateBoxdata(polyid, newdata)
  updateRect(polyid, newdata)
  return modified;
}

function updateBoxdata(id, d) {
  modified = false;
  var thebox = boxdata.findIndex(function (x) {
    return x.polyid == id;
  });
  // var ndata = Object.assign(new Box(), boxdata[thebox], d);
  // boxdata[thebox] = ndata
  d.polyid = id
  // check if data is different
  if (boxdata[thebox].modified || !boxdata[thebox].equals(d)) {
    modified = true;
    if (boxdata[thebox].text != "") {
      d.modified = true;
    }
  }
  boxdata[thebox] = d
  // remember stuff is dirty
  boxdataIsDirty = true;
  lineIsDirty = false;
  updateProgressBar({ type: 'tagging' });
  return modified;
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

// process worker log messages
function processWorkerLogMessage(message) {
  // console.log(message.status, message.progress);
  if (message.status == 'recognizing text') {
    message.type = 'ocr';
  } else {
    message.type = 'initializingWorker';
  }
  updateProgressBar(message);
}

async function generateInitialBoxes(image) {
  // Set #main-edit-area loading status
  setMainLoadingStatus(true);
  displayMessage({ message: 'Generating initial boxes...' });

  boxlayer.clearLayers();
  //         map.removeLayer(boxlayer);
  boxdata = [];

  const worker = await Tesseract.createWorker({
    // langPath as relative path to the worker script

    langPath: '../../assets',
    gzip: false,
    logger: m => processWorkerLogMessage(m)
  });
  await worker.loadLanguage('LATCYR_from_Cyrillic');
  await worker.initialize('LATCYR_from_Cyrillic');
  // await worker.setParameters({
  //   tessedit_ocr_engine_mode: OcrEngineMode.OEM_LSTM_ONLY,
  //   tessedit_pageseg_mode: PSM_AUTO_OSD
  // });
  const results = await worker.recognize(image);
  // console.log(results);

  // get bounding boxes from results.data.lines
  var lines = results.data.lines;
  // var boxes = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var box = line.bbox;
    var text = line.text;
    // boxes.push([text, box.x0, box.y0, box.x1, box.y1]);
    // console.log(text, box)
    // var symbole = {
    //   text: '',
    //   y1: image.height - box.y1, // bottom
    //   y2: image.height - box.y0, // top
    //   x1: box.x0, // right
    //   x2: box.x1 // left
    // }
    var symbole = new Box({
      text: '',
      y1: image.height - box.y1, // bottom
      y2: image.height - box.y0, // top
      x1: box.x0, // right
      x2: box.x1 // left
    })
    var rect = new L.rectangle([[symbole.y1, symbole.x1], [symbole.y2, symbole.x2]]);
    rect.on('edit', editRect);
    rect.on('click', onRectClick);
    rect.setStyle(boxInactive);
    // addLayer

    boxlayer.addLayer(rect);
    var polyid = boxlayer.getLayerId(rect)
    symbole.polyid = polyid
    boxdata.push(symbole);
  }
  map.addLayer(boxlayer);

  // Set #main-edit-area loading status
  setMainLoadingStatus(false);
  setButtonsEnabledState(true);
  numberOFBoxes = boxdata.length;
  // displayMessage({ message: 'Generated ' + numberOFBoxes + ' boxes.', type: 'success' });

  $('#formrow').removeClass('hidden');
  // select next BB
  var nextBB = getNextBB();
  fillAndFocusRect(nextBB);
}

async function askUser(object) {
  if (object.confirmText == undefined) {
    object.confirmText = 'OK';
  }
  if (object.denyText == undefined) {
    object.denyText = 'Cancel';
  }
  return new Promise((resolve, reject) => {
    $.modal({
      title: object.title,
      // class: 'mini',
      blurring: true,
      closeIcon: true,
      onApprove: function () {
        resolve(true);
      },
      onDeny: function () {
        resolve(false);
      },
      onHide: function () {
        resolve(false);
      },
      content: object.message,
      actions: [{
        text: object.confirmText,
        class: 'green positive'
      }, {
        text: object.denyText,
        class: 'red negative'
      }]
    }).modal('show');
  });
}


async function loadBoxFile(e) {
  if (boxdataIsDirty) {
    var result = await askUser({ message: 'You have unsaved changes. Are you sure you want to continue?', title: 'Unsaved Changes', type: 'warning' });
    if (!result) {
      return;
    }
  }
  var reader = new FileReader();
  var file;
  if ((file = this.files[0])) {
    // Check file is .box
    var ext = file.name.split('.').pop();
    if (ext != 'box') {
      displayMessage({ type: 'error', message: 'Expected box file. Received ' + ext + ' file.', title: 'Invalid File Type' });
      // clear file input
      $('#boxFile').val(boxFileName);
      return;
    } else if (imageFileName != file.name.split('.').slice(0, -1).join('.') && imageFileName != undefined) {
      result = await askUser({ message: 'Chosen file has name <code>' + file.name + '</code> instead of expected <code>' + imageFileName + '.box</code>.<br> Are you sure you want to continue?', title: 'Different File Name', type: 'warning' });
      if (!result) {
        // TODO: resolve this error:
        // [Error] Unhandled Promise Rejection: InvalidStateError: The object is in an invalid state.
        // clear file input
        $('#boxFile').val(boxFileNameForButton);
        return;
      }
    }
    // Read the file
    reader.readAsText(file);
    // Set boxFileName taking into account it might have multiple dots
    file.name.split('.').slice(0, -1).join('.');
    boxFileNameForButton = file;
    // When it's loaded, process it
    $(reader).on('load', processFile);
  }
}

async function setButtonsEnabledState(state) {
  if (state) {
    $('#boxFile').prop('disabled', false);
    $('#downloadBoxFileButton').removeClass('disabled');
    $('#downloadGroundTruthButton').removeClass('disabled');
    $('#x1').prop('disabled', false);
    $('#y1').prop('disabled', false);
    $('#x2').prop('disabled', false);
    $('#y2').prop('disabled', false);
    $('#previousBB').removeClass('disabled');
    $('#nextBB').removeClass('disabled');
    $('#updateText').removeClass('disabled');
    $('#myInputContainer').removeClass('disabled');
    $('#formtxt').prop('disabled', false);
    $('#taggingSegment').removeClass('disabled');

  } else {
    $('#boxFile').prop('disabled', true);
    $('#downloadBoxFileButton').addClass('disabled');
    $('#downloadGroundTruthButton').addClass('disabled');
    $('#x1').prop('disabled', true);
    $('#y1').prop('disabled', true);
    $('#x2').prop('disabled', true);
    $('#y2').prop('disabled', true);
    $('#previousBB').addClass('disabled');
    $('#nextBB').addClass('disabled');
    $('#updateText').addClass('disabled');
    $('#myInputContainer').addClass('disabled');
    $('#formtxt').prop('disabled', true);
    $('#taggingSegment').addClass('disabled');
  }
}

function updateProgressBar(options = {}) {
  if (options.reset) {
    $('#editingProgress .label').text('');
    return;
  }
  if (options.type == 'tagging') {
    // if all lines are tagged, indicate modification progress
    if (boxdata.every(function (el) {
      return el.filled;
    })) {
      // count number of lines with modifications
      var linesWithModifications = boxdata.filter(function (el) {
        return el.modified;
      });
      // $('#editingProgress').removeClass('indicating');
      // $('#editingProgress').addClass('active');
      $('#editingProgress')
        .progress({
          value: linesWithModifications.length,
          total: boxdata.length,
          text: {
            active: 'Updating: {value} of {total} lines modified'
          }
        });
      return;
    } else {
      // remove indicating and active class from #editingProgress
      $('#editingProgress').removeClass('active');
      $('#editingProgress').removeClass('indicating');
      // get all lines with text
      var linesWithText = boxdata.filter(function (el) {
        return el.filled;
      });
      $('#editingProgress')
        .progress({
          value: linesWithText.length,
          total: boxdata.length,
          text: {
            active: 'Tagging: {value} of {total} lines tagged'
          }
        });
      var currentPosition = boxdata.indexOf(selectedBox);
      $('#positionProgress')
        .progress({
          value: currentPosition + 1,
          total: boxdata.length,
        });
    }
    return;
  } else {
    // add indicating class to #editingProgress
    $('#editingProgress').addClass('indicating');
    if (options.type == 'ocr') {
      $('#editingProgress')
        .progress({
          value: options.progress,
          total: 1,
          text: {
            active: 'Analyzing Image: {percent}%'
          }
        })
        ;
      return;
    } else if (options.type == 'initializingWorker') {
      $('#editingProgress')
        .progress({
          value: 0,
          total: 1,
          text: {
            active: options.status + '…'
          }
        })
        ;
    }
  }
}

async function loadImageFile(e) {
  if (boxdataIsDirty || lineIsDirty) {
    var result = await askUser({ message: 'You have unsaved changes. Are you sure you want to continue?', title: 'Unsaved Changes', type: 'warning' });
    if (!result) {
      $('#imageFile').val(imageFileNameForButton);
      return;
    }
  }
  setButtonsEnabledState(false);
  updateProgressBar({ reset: true });
  var file, img;


  if ((file = this.files[0])) {
    // get file name without extension, file might have dots in it
    imageFileName = file.name.split('.').slice(0, -1).join('.');
    imageFileNameForButton = file;
    img = new Image();
    img.onload = async function () {
      map.eachLayer(function (layer) {
        map.removeLayer(layer);
      });
      result = await generateInitialBoxes(img)
      boxdataIsDirty = false;
      updateProgressBar({ type: 'tagging' });
      // focus text input
      $('#formtxt').focus();

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
      // get extension
      var ext = file.name.split('.').pop();
      displayMessage({ type: 'error', message: 'Expected image file. Received ' + ext + ' file.', title: 'Invalid File Type' })

      // clear file input
      $('#imageFile').val(imageFileNameForButton);
    };
    img.src = _URL.createObjectURL(file);

    updateDownloadButtonsLabels({ boxDownloadButton: imageFileName + '.box', groundTruthDownloadButton: imageFileName + '.gt.txt' });
    // TODO: fix issue with text input not being focused after loading image

  }
}

function updateDownloadButtonsLabels(options = {}) {
  if (options.boxDownloadButton) {
    $('#downloadBoxFileButton').html('<i class = "download icon"></i>' + options.boxDownloadButton)
    $('#downloadBoxFileButton').css('white-space', 'nowrap');
  } else {
    $('#downloadBoxFileButton').html('<i class = "download icon"></i>Download')
  }
  if (options.groundTruthDownloadButton) {
    $('#downloadGroundTruthButton').html('<i class = "download icon"></i>' + options.groundTruthDownloadButton)
    $('#downloadGroundTruthButton').css('white-space', 'nowrap');
  } else {
    $('#downloadGroundTruthButton').html('<i class = "download icon"></i>Download')
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

// Define regular expressions
var cyrillic_pattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F\u1C80-\u1CBF]/;
var latin_pattern = /[\u0000-\u007F\u0080-\u00FF]/;

// Function to colorize text
async function colorize(text) {
  var colored_text = '';
  if (text == '') {
    return '&nbsp;'
  }
  // Normalize text to decomposed form
  text = text.normalize('NFD');
  var current_script = null;
  var current_span = '';
  var span_class = '';
  for (var i = 0; i < text.length; i++) {
    var isCapital = false;
    var char = text.charAt(i);
    if (char != char.toLowerCase()) {
      isCapital = true;
    }
    if (cyrillic_pattern.test(char)) {
      if (isCapital)
        span_class = 'cyrillic capital';
      else
        span_class = 'cyrillic';
      if (current_script == span_class) {
        current_span += char;
      } else {
        colored_text += '</span>' + current_span;
        current_span = '<span class="' + span_class + '">' + char;
        current_script = span_class;
      }
    } else if (char == ' ') {
      if (current_script == 'space') {
        current_span += '&nbsp;';
      } else {
        colored_text += '</span>' + current_span;
        current_span = '&nbsp;';
        current_script = 'space';
      }
    } else if (latin_pattern.test(char)) {
      if (isCapital)
        span_class = 'latin capital';
      else
        span_class = 'latin';
      if (current_script == span_class) {
        current_span += char;
      } else {
        colored_text += '</span>' + current_span;
        current_span = '<span class="' + span_class + '">' + char;
        current_script = span_class;
      }
    } else {
      colored_text += '</span>' + current_span + char;
      current_span = '';
      current_script = null;
    }
    isCapital = false;
  }
  colored_text += '</span>' + current_span;
  return colored_text;
}

// warn user if they try to leave page with unsaved changes
window.onbeforeunload = function () {
  if (boxdataIsDirty || lineIsDirty) {
    return 'You have unsaved changes. Are you sure you want to leave?';
  }
}

async function setLineIsDirty() {
  lineIsDirty = true;
}

// Function to update the background with the colorized text
async function updateBackground(e) {
  var input = document.getElementById("formtxt");
  console.log(input.value);
  var text = input.value;
  var colored_text = await colorize(text);
  var background = document.getElementById("myInputBackground");
  background.innerHTML = colored_text;
}

function displayMessage(object) {
  if (object.title) {
    object.message = '<br>' + object.message;
  }
  if (object.title == undefined) {
    if (object.type == 'error') {
      object.title = 'Error';
    } else if (object.type == 'warning') {
      object.title = 'Warning';
    }
  }
  if (object.time == undefined) {
    object.time = 'auto';
  }
  $.toast({
    title: object.title,
    class: object.type,
    displayTime: object.time,
    showProgress: 'top',
    position: 'top right',
    classProgress: object.color,
    message: object.message,
    minDisplayTime: 3000,
  });
}

var zoomControl = new L.Control.Zoom({
  position: 'topright'
});

var drawControl = new L.Control.Draw({
  draw: {
    polygon: false,
    marker: false,
    circle: false,
    polyline: false,
    rectangle: true,
    circlemarker: false,
  },
  position: 'topright',
  edit: {
    featureGroup: boxlayer,
    edit: false,
    remove: true,
  }
});

function formatForPopup(objects) {
  var formatted = '<div class="ui compact grid">';
  formatted += '<div class="two column stretched row">' + '<div class="twelve wide left floated column">' + '<b>Name</b>' + '</div>' + '<div class="four wide right floated column">' + '<b>Char</b>' + '</div>' + '</div>';
  for (var i = 0; i < objects.length; i++) {
    var object = objects[i];
    formatted += '<div class="two column stretched row">' + '<div class="twelve wide left floated column">' + object.name + '</div>' + '<div class="four wide right floated column">' + object.char + '</div>' + '</div>';
  }
  formatted += '</div>';
  return formatted;
}


// get all unicode info of characters in string
function getUnicodeInfo(string) {
  var unicodeInfo = [];
  string = string.normalize('NFD');
  for (var i = 0; i < string.length; i++) {
    var char = string.charAt(i);
    var code = char.charCodeAt(0);
    var hex = code.toString(16).toUpperCase();
    var unicode = '0000'.substring(hex.length) + hex;
    result = getUnicodeData(unicode);
    // push if not already in array
    if (unicodeInfo.find(function (x) {
      return x['code'] == result.code;
    }
    ) == undefined) {
      unicodeInfo.push(result);
    }

  }
  return unicodeInfo;
}

// get object with code from unicodeData
function getUnicodeData(code) {
  result = unicodeData.find(function (x) {
    return x['code'] == code;
  });
  result.char = String.fromCharCode(parseInt(code, 16));
  return result;
}

async function downloadBoxFile(e) {
  if (e) {
    e.preventDefault();
  }
  if (boxdata.length == 0) {
    displayMessage({ type: 'warning', message: 'No box files to download.' });
    return;
  }
  if (lineIsDirty) {
    displayMessage({ type: 'warning', message: 'Please commit the current line before downloading.' });
    return;
  }
  sortAllBoxes()
  var fileExtension = '.box'
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
  downloadFile(content, fileExtension);
}

async function downloadGroundTruth(e) {
  if (e) {
    e.preventDefault();
  }
  if (boxdata.length == 0) {
    displayMessage({ type: 'warning', message: 'No ground-truth to download.' });
    return;
  }
  if (lineIsDirty) {
    displayMessage({ type: 'warning', message: 'Please commit the current line before downloading.' });
    return;
  }
  sortAllBoxes()
  var fileExtension = '.gt.txt'
  var content = '';
  if (boxFileType == BoxFileType.CHAR_OR_LINE) {
    $.each(boxdata, function () {
      content = content + this.text + '\n'
    })
  }
  if (boxFileType == BoxFileType.WORDSTR) {
    $.each(boxdata, function () {
      content = content + this.text + '\n';
    })
  }
  downloadFile(content, fileExtension);
}


$(document).ready(async function () {
  $('#formtxt').on('input', function () {
    updateBackground();
    setLineIsDirty();
  });
  $('#imageFile').prop('disabled', false);
  // displayMessage({ message: 'Hover over the question mark in the top right corner for help and keyboard shortcuts.' });

  $('.menu .question.circle.icon')
    .popup({
      inline: true
    });
  $(window).keydown(function (event) {
    if (event.keyCode == 13) {
      event.preventDefault();
      if (event.shiftKey) {
        getPrevAndFill();
      } else {
        getNextAndFill();
      }
      return false;
    }
  });

  // on #formtxt focus apply class to #myInputBackground
  $('#formtxt').focus(function () {
    $('#myInputBackground').addClass('focused');
  });
  $('#formtxt').blur(function () {
    $('#myInputBackground').removeClass('focused');
  });


  map = new L.map('mapid', {
    crs: L.CRS.Simple,
    minZoom: -1,
    center: [0, 0],
    zoom: 0,
    zoomSnap: .5,
    scrollWheelZoom: true,
    touchZoom: true,
    zoomControl: false,
    drawControl: false,
    attributionControl: false,
    preferCanvas: true,
    maxBoundsViscosity: .5,
  });

  map.addControl(zoomControl);
  map.addControl(drawControl);

  // load boxfile
  $('#boxFile').change(loadBoxFile);
  //   load Image
  $("#imageFile").change(loadImageFile);

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
    // var newbb = {
    //   polyid: layer._leaflet_id,
    //   text: '',
    //   x1: Math.round(layer._latlngs[0][0].lng),
    //   y1: Math.round(layer._latlngs[0][0].lat),
    //   x2: Math.round(layer._latlngs[0][2].lng),
    //   y2: Math.round(layer._latlngs[0][2].lat)
    // }
    var newbb = new Box({
      polyid: polyid,
      text: '',
      x1: Math.round(layer._latlngs[0][0].lng),
      y1: Math.round(layer._latlngs[0][0].lat),
      x2: Math.round(layer._latlngs[0][2].lng),
      y2: Math.round(layer._latlngs[0][2].lat)
    })
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
  // $('#updateText').on('click', submitText);
  $('#previousBB').on('click', getPrevAndFill);
  $("#downloadBoxFileButton").on("click", downloadBoxFile);
  $('#downloadGroundTruthButton').on("click", downloadGroundTruth);

  await $.ajax({
    url: '../../assets/unicodeData.csv',
    dataType: 'text',
    success: function (data) {
      parsedData = $.csv.toObjects(data, {
        separator: ';',
        delimiter: '"'
      });
      unicodeData = parsedData;
    }
  });

  // when text inside #formtxt is selected
  $('#formtxt').bind('mouseup', showCharInfoPopup);
  $('#formtxt').bind('keyup', showCharInfoPopup);
});


function downloadFile(content, fileExtension) {
  var element = document.createElement('a');
  element.href = 'data:application/text;charset=utf-8,' + encodeURIComponent(content);
  element.download = imageFileName + fileExtension;
  element.target = '_blank';
  element.style.display = 'none';

  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  displayMessage({ message: 'Downloaded ' + imageFileName + fileExtension, type: 'success' });
  boxdataIsDirty = false;
}

function showCharInfoPopup(e) {
  // prevent modifier keys from triggering popup
  if (e.ctrlKey || e.altKey || e.metaKey) {
    return;
  }
  var selection;

  if (window.getSelection) {
    selection = window.getSelection();
  } else if (document.selection) {
    selection = document.selection.createRange();
  }
  // firefox fix
  if (selection.toString().length == 0) {
    var input = document.getElementById('formtxt');
    var startPos = input.selectionStart;
    var endPos = input.selectionEnd;
    selection = input.value.substring(startPos, endPos);
  }
  results = getUnicodeInfo(selection.toString());
  if (results.length == 0 || results.length > 5) {
    // if (selection.toString().length == 0 || selection.toString().length > 5) {
    $('#updateTxt').popup('hide');
    return;
  } else {
    formatted = formatForPopup(results);

    if ($('#updateTxt').popup('is visible')) {
      $('#updateTxt')
        .popup(
          'change content (html)', formatted
        )
    } else if ($('#updateTxt').popup('is hidden')) {
      $('#updateTxt')
        .popup(
          {
            on: 'manual',
            // hoverable: false,
            'html': formatted,
            // target: e.target,
          })
        .popup('show')
    } else {
      console.log('error with char info popup');
    }
  }


}