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
var dictionaryMap = {};
var unvisitedWords = {};

boxActive = {
  color: 'red',
  weight: 3,
  stroke: true,
  opacity: 0.5,
  fillOpacity: 0
}
boxInactive = {
  color: 'gray',
  stroke: false,
  opacity: 0,
  fillOpacity: 0
}
boxVisited = {
  color: 'green',
  stroke: false,
  fillOpacity: 0
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
  $('#sourceInputField').val(d).attr('boxid', d.polyid);
  $('#targetInputField').focus();
  // updateBackground();
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
  // if (el === 0) {
  if (el == boxdata.length) {
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
  setFromData(box.word);
  // pick random line from box
  var pick = Math.floor(Math.random() * box.lines.length);
  var line = box.lines[pick];
  focusBoxID(line.polyid);
  clearTimeout(movingTimer);
  movingTimer = setTimeout(focusBoxID, doneMovingInterval, line.polyid);
}

function setStyle(rect) {
  if (rect) {
    rect.setStyle(boxActive)
  }

}

function removeStyle(rect) {
  if (rect) {
    rect.setStyle(boxVisited)
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

function focusBoxID(id) {
  removeStyle(selectedPoly)
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
            var symbole = {
              text: temp[0],
              x1: parseInt(temp[1]),
              y1: parseInt(temp[2]),
              x2: parseInt(temp[3]),
              y2: parseInt(temp[4])
            }
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
          rect.setStyle(boxInactive)
          // rect.on('edit', editRect);
          // rect.on('click', onRectClick);
          // addLayer

          boxlayer.addLayer(rect);
          var polyid = boxlayer.getLayerId(rect)
          symbole.polyid = polyid
          boxdata.push(symbole);
        });
    }
    map.addLayer(boxlayer);

    unvisitedWords = extractWordsFromBoxdataLines();
    // remove duplicate words and corresponding mapping


    $('#formrow').removeClass('hidden');
    // select next BB
    // var nextBB = getNextBB();
    pick = pickRandomWord();
    fillAndFocusRect(pick);
    // updateBackground();
  }
}


// function updateRect(polyid, d) {
//   var rect = boxlayer.getLayer(polyid);
//   var newbounds = [[d.y1, d.x1], [d.y2, d.x2]]
//   rect.setBounds(newbounds)
// }

var doneMovingInterval = 200,
  movingTimer;


function getNextAndFill() {
  submitText();
}

// function getPrevAndFill() {
//   submitText();
//   var box = getPrevtBB(selectedBox);
//   setFromData(box);
//   // setFromData(selectedBox);
//   clearTimeout(movingTimer);
//   movingTimer = setTimeout(focusBoxID, doneMovingInterval, box.polyid);
// }

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

$('#updateTxt').on('submit', getNextAndFill);
function submitText(e) {
  if (Object.keys(unvisitedWords).length == 0) {
    return
  }
  if (e) {
    e.preventDefault();
  }
  sourceWord = $('#sourceInputField').val();
  targetWord = $('#targetInputField').val();
  // if source or target not empty add mapping to dictionaryMap
  if (targetWord != "" && sourceWord != "") {
    dictionaryMap[sourceWord] = targetWord;
    delete unvisitedWords[sourceWord];
    if (Object.keys(unvisitedWords).length == 0) {
      displayMessage({ type: 'success', message: 'All words are done' })
      $('#targetInputField').prop('disabled', true);
      // remove on submit form event
      $('#updateTxt').on('submit', null);
      return;
    }
  }
  // clear input fields
  $('#sourceInputField').val("");
  $('#targetInputField').val("");
  // display message if all words are done

  pick = pickRandomWord();
  fillAndFocusRect(pick)
}

function updateBoxdata(id, d) {
  var thebox = boxdata.findIndex(function (x) {
    return x.polyid == id;
  });
  var ndata = Object.assign({}, boxdata[thebox], d);
  boxdata[thebox] = ndata
  // remember stuff is dirty
  boxdataIsDirty = true;
  lineIsDirty = false;
  updateProgressBar({ type: 'tagging' });
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


// $(document).bind('keydown', 'ctrl+shift+down', getNextAndFill);

// $(document).bind('keydown', 'ctrl+shift+up', getPrevAndFill);

// $('#formtxt').bind('keydown', 'ctrl+shift+down', getNextAndFill);
// $('#formtxt').bind('keydown', 'ctrl+shift+up', getPrevAndFill);
// $('#formtxt').bind('keydown', 'shift+return', getPrevAndFill);
// TODO: check binding for enter key
// $('#formtxt').bind('keydown', 'shift+enter', getPrevAndFill);
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
    } else if (imageFileName != file.name.split('.')[0] && imageFileName != undefined) {
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

    boxFileName = file.name.split('.')[0]
    boxFileNameForButton = file;
    // When it's loaded, process it
    $(reader).on('load', processFile);
  }
}

// pick random word from extractWordsFromBoxdataLines()
function pickRandomWord() {
  var keys = Object.keys(unvisitedWords);
  var pick = Math.floor(keys.length * Math.random())
  return { word: keys[pick], lines: unvisitedWords[keys[pick]] }
}


function extractWordsFromBoxdataLines() {
  var words = {};
  var hyphenatedWord = null;
  for (var i = 0; i < boxdata.length; i++) {
    var line = boxdata[i];
    // remove punctuation except hyphens
    line.text = line.text.replace(/[.,\/#!$%\^&\*;:{}=_~()]/g, '').trim();
    // // remove spaces at beginning and end of line
    // line.text = line.text.trim();
    // split line into words by any number of spaces
    var lineWords = line.text.split(/\s+/);
    for (var j = 0; j < lineWords.length - 1; j++) {
      if (hyphenatedWord != null) {
        lineWords[j] = hyphenatedWord + lineWords[j];
        hyphenatedWord = null;
      }
      var word = lineWords[j];
      if (!words[word]) {
        words[word] = [];
      }
      words[word].push(line);
    }
    var lastWord = lineWords[lineWords.length - 1];
    if (lastWord.endsWith('-') && lastWord.length > 1) {
      hyphenatedWord = lastWord.substring(0, lastWord.length - 1);
    } else {
      if (!words[lastWord]) {
        words[lastWord] = [];
      }
      words[lastWord].push(line);
    }
  }
  // ignoring last hypenated word as it is not complete
  // return words and mapping
  return words;
}

// create a mapping of words to their line bounding boxes
function createWordToLineMapping() {
  var wordToLineMapping = {};
  for (var i = 0; i < boxdata.length; i++) {
    var line = boxdata[i];
    var lineWords = line.text.split(' ');
    for (var j = 0; j < lineWords.length; j++) {
      var word = lineWords[j];
      wordToLineMapping[word] = line;
    }
  }
  return wordToLineMapping;
}



async function setButtonsEnabledState(state) {
  if (state) {
    $('#boxFile').prop('disabled', false);
    $('#downloadWordListButton').removeClass('disabled');
    $('#downloadDictionaryMappingButton').removeClass('disabled');
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
    $('#downloadWordListButton').addClass('disabled');
    $('#downloadDictionaryMappingButton').addClass('disabled');
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
    // remove indicating and active class from #editingProgress
    $('#editingProgress').removeClass('active');
    $('#editingProgress').removeClass('indicating');
    // get all lines with text
    $('#editingProgress')
      .progress({
        value: Object.keys(dictionaryMap).length,
        total: Object.keys(unvisitedWords).length + Object.keys(dictionaryMap).length,
        text: {
          active: 'Mapping: {value} of {total} words mapped'
        }
      });
  }
  return;
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
    imageFileName = file.name.split('.')[0]
    imageFileNameForButton = file;
    img = new Image();
    img.onload = async function () {
      map.eachLayer(function (layer) {
        map.removeLayer(layer);
      });
      // result = await generateInitialBoxes(img)
      boxdataIsDirty = false;
      setButtonsEnabledState(true);
      updateProgressBar({ type: 'tagging' });

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

    updateDownloadButtonsLabels({ downloadWordListButton: imageFileName + '.wordlist', downloadDictionaryMappingButton: imageFileName + '.json' });
    // TODO: fix issue with text input not being focused after loading image

    // focus text input
    $('#formtxt').focus();
  }
}

function updateDownloadButtonsLabels(options = {}) {
  if (options.downloadWordListButton) {
    $('#downloadWordListButton').html('<i class = "download icon"></i>' + options.downloadWordListButton)
    $('#downloadWordListButton').css('white-space', 'nowrap');
  } else {
    $('#downloadWordListButton').html('<i class = "download icon"></i>Download')
  }
  if (options.downloadDictionaryMappingButton) {
    $('#downloadDictionaryMappingButton').html('<i class = "download icon"></i>' + options.downloadDictionaryMappingButton)
    $('#downloadDictionaryMappingButton').css('white-space', 'nowrap');
  } else {
    $('#downloadDictionaryMappingButton').html('<i class = "download icon"></i>Download')
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
function colorize(text) {
  var colored_text = '';
  if (text == '') {
    return '&nbsp;'
  }
  // Normalize text to decomposed form
  text = text.normalize('NFD');
  var current_script = null;
  var current_span = '';
  for (var i = 0; i < text.length; i++) {
    var char = text.charAt(i);
    if (cyrillic_pattern.test(char)) {
      if (current_script == 'cyrillic') {
        current_span += char;
      } else {
        colored_text += '</span>' + current_span;
        current_span = '<span class="cyrillic">' + char;
        current_script = 'cyrillic';
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
      if (current_script == 'latin') {
        current_span += char;
      } else {
        colored_text += '</span>' + current_span;
        current_span = '<span class="latin">' + char;
        current_script = 'latin';
      }
    } else {
      colored_text += '</span>' + current_span + char;
      current_span = '';
      current_script = null;
    }
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

function setLineIsDirty() {
  lineIsDirty = true;
}

// Function to update the background with the colorized text
function updateBackground() {
  var input = document.getElementById("formtxt");
  var text = input.value;
  var colored_text = colorize(text);
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
  $.toast({
    title: object.title,
    class: object.type,
    displayTime: 'auto',
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


$(document).ready(async function () {
  $('#imageFile').prop('disabled', false);
  // TODO: enable this after fixing bug when image is loaded after box file
  // $('#boxFile').prop('disabled', false);
  // displayMessage({ message: 'Hover over the question mark in the top right corner for help and keyboard shortcuts.' });

  $('.big.question.circle.icon')
    .popup({
      inline: true
    });
  $(window).keydown(function (event) {
    if (event.keyCode == 13) {
      event.preventDefault();
      // submitText(event)
      getNextAndFill();
      return false;
    }
  });


  map = new L.map('mapid', {
    crs: L.CRS.Simple,
    minZoom: -1,
    center: [0, 0],
    zoom: 0,
    zoomSnap: .25,
    scrollWheelZoom: true,
    touchZoom: true,
    zoomControl: false,
    drawControl: false,
    attributionControl: false,
    preferCanvas: true,
    maxBoundsViscosity: .5,
  });

  map.addControl(zoomControl);

  // load boxfile
  $('#boxFile').change(loadBoxFile);
  //   load Image
  $("#imageFile").change(loadImageFile);

  $('#downloadWordListButton').on('click', async function (e) {
    if (Object.keys(dictionaryMap).length == 0 && Object.keys(unvisitedWords).length == 0) {
      displayMessage({ type: 'warning', message: 'No word list to download.' });
      return;
    }
    if (lineIsDirty) {
      displayMessage({ type: 'warning', message: 'Please commit the current line before downloading.' });
      return;
    }
    sortAllBoxes()
    var fileExtension = '.wordlist'
    var content = '';
    // get all keys from dictionaryMap and unvisitedWords and sort them
    var keys = Object.keys(dictionaryMap).concat(Object.keys(unvisitedWords));
    keys.sort();
    // join keys with newlines
    content = keys.join('\n');
    downloadFile(content, fileExtension);
  });
  $('#downloadDictionaryMappingButton').on('click', async function (e) {
    if (Object.keys(dictionaryMap).length == 0) {
      displayMessage({ type: 'warning', message: 'No mapping to download.' });
      return;
    }
    if (lineIsDirty) {
      displayMessage({ type: 'warning', message: 'Please commit the current line before downloading.' });
      return;
    }
    sortAllBoxes()
    var fileExtension = '.wordmap'
    var content = '';
    // add word mappings to content
    content = Object.entries(dictionaryMap).map(([key, value]) => key + '\t' + value).join('\n');
    // downloadFile(content, fileExtension);
    // save mapping as json for easy loading
    var json = JSON.stringify(dictionaryMap);
    downloadFile(json, '.json', data = 'application/json');
    // var blob = new Blob([json], { type: 'application/json' });
    // var url = URL.createObjectURL(blob);
    // var a = document.createElement('a');
    // a.download = 'json';

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


  // $('#nextBB').on('click', getNextAndFill);
  // $('#updateText').on('click', submitText);
  // $('#previousBB').on('click', getPrevAndFill);

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


  $('#sourceInputField').bind('mouseup', showCharInfoPopup);
  $('#sourceInputField').bind('keyup', showCharInfoPopup);
  // when selection of readonly text is lost, hide popup
});


function downloadFile(content, fileExtension, data = 'application/text') {
  var element = document.createElement('a');
  element.href = 'data:' + data + ';charset=utf-8,' + encodeURIComponent(content);
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