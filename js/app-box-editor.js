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
var imageIsProcessed = false;
var recognizedLinesOfText = [];
var imageHeight;
var imageWidth;
var mapHeight;
var mapDeletingState = false;
var mapEditingState = false;
var currentSliderPosition = -1;

class Box {
    constructor({
        text,
        x1,
        y1,
        x2,
        y2,
        polyid,
        visited = false,
        verified = false
    }) {
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
    static compare(a, b) {
        var tolerance = 100;
        var aCenterX = (a.x1 + a.x2) / 2;
        var aCenterY = (a.y1 + a.y2) / 2;
        var bCenterX = (b.x1 + b.x2) / 2;
        var bCenterY = (b.y1 + b.y2) / 2;
        // check if at least one center is within the vertical distance of the other box
        if ((aCenterY > b.y1 && aCenterY < b.y2) || (bCenterY > a.y1 && bCenterY < a.y2)) {
            console.log("boxes " + a.text + " and " + b.text + " horizontally aligned");
            if (aCenterX - bCenterX < 0) {
                return -1;
            } else {
                return 1;
            }
        }
        // check if at least one horizontal side is within the horizontal distance of the other box
        if ((a.x1 > b.x1 - tolerance && a.x1 < b.x2 + tolerance) || (b.x1 > a.x1 - tolerance && b.x1 < a.x2 + tolerance)) {
            // console.log("boxes " + a.text + " and " + b.text + " horizontally aligned");
            if (aCenterY - bCenterY > 0) {
                return -1;
            } else {
                return 1;
            }
        }
        // console.log("boxes " + a.text + " and " + b.text + " are not close to each other");
        if (aCenterX - bCenterX < 0) {
            return -1;
        } else {
            return 1;
        }
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

// TODO: remove some of these globals. They are not all needed.
var _URL = window.URL || window.webkitURL,
    h,
    w,
    bounds,
    boxdata = [],
    boxFileType = BoxFileType.WORDSTR,
    boxlayer = new L.FeatureGroup(),
    regionlayer = new L.FeatureGroup(),
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
    $('#formtxt').val(d.text).attr('boxid', d.polyid);
    $("#x1").val(d.x1);
    $("#y1").val(d.y1);
    $("#x2").val(d.x2);
    $("#y2").val(d.y2);
    $('#formtxt').focus();
    $('#formtxt').select();
    updateBackground();
    lineIsDirty = false;
    updateProgressBar({ type: 'tagging' });
    $('#updateTxt').popup('hide');
}

function getPrevtBB(box) {
    if (typeof box === "undefined") {
        return boxdata[0];
    }
    var el = boxdata.findIndex(function (x) {
        return x.polyid == box.polyid;
    });
    if (el === 0) {
        return boxdata[boxdata.length - 1]
    }
    return boxdata[el - 1];
}

function getNextBB(box) {
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
    map.flyToBounds(rect.getBounds(), {
        maxZoom: zoomMax,
        animate: true,
        paddingBottomRight: [40, 0],
        duration: .25,
        easeLinearity: 0.25,
        // noMoveStart: true
    });
    selectedPoly = rect
    setStyle(rect)
}

function focusBoxID(id, modified = false) {
    removeStyle(selectedPoly, modified)
    var rect = boxlayer.getLayer(id);
    focusRectangle(rect)
    $('#formtxt').focus();
    $('#formtxt').select();
}


function processFile(e) {
    var file = e.target.result;
    getBoxFileType(file);
    if (file && file.length) {
        boxlayer.clearLayers();
        boxdata = [];
        if (boxFileType == BoxFileType.CHAR_OR_LINE) {
            file.split("\n").forEach(function (line) {
                if (line.length > 5) {

                    var temp = line.split(" ");
                    var symbole = new Box({
                        text: temp[0],
                        x1: parseInt(temp[1]),
                        y1: parseInt(temp[2]),
                        x2: parseInt(temp[3]),
                        y2: parseInt(temp[4])
                    })
                    var rect = new L.rectangle([
                        [
                            symbole.y1, symbole.x1
                        ],
                        [
                            symbole.y2, symbole.x2
                        ]
                    ]);
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
            file.split('\n').forEach(function (line) {
                var symbole
                if (line.startsWith("WordStr ")) {
                    var [dimensions, wordStr] = line.split('#')
                    dimensions = dimensions.split(" ")
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
                    symbole = new Box({
                        text: dimensions[0],
                        x1: parseInt(dimensions[1]),
                        y1: parseInt(dimensions[2]),
                        x2: parseInt(dimensions[3]),
                        y2: parseInt(dimensions[4])
                    })
                } else {
                    return;
                }
                var rect = new L.rectangle([
                    [
                        symbole.y1, symbole.x1
                    ],
                    [
                        symbole.y2, symbole.x2
                    ]
                ]);
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
        sortAllBoxes();
        // select next BB
        var nextBB = getNextBB();
        fillAndFocusRect(nextBB);
        updateBackground();
    }
}

async function editRect(e) {
    var layer = e.target;
    var box = getBoxdataFromRect(layer);
    var oldDimenstions = [box.x1, box.y1, box.x2, box.y2];
    var newd = new Box({
        text: box.text,
        x1: Math.round(layer._latlngs[0][0].lng),
        y1: Math.round(layer._latlngs[0][0].lat),
        x2: Math.round(layer._latlngs[0][2].lng),
        y2: Math.round(layer._latlngs[0][2].lat)
    })
    var lineWasDirty = lineIsDirty;
    await updateBoxdata(layer._leaflet_id, newd);

    // new dimensions
    var newDimenstions = [newd.x1, newd.y1, newd.x2, newd.y2];
    console.log("moved box ", [
        box.polyid, box.text
    ], " from ", oldDimenstions, " to ", newDimenstions);
    if (lineWasDirty) {
        newd.text = $('#formtxt').val();
    }
    // fillAndFocusRect(newd);
}

function deleteBox(box) {
    var boxindex = boxdata.findIndex(function (d) {
        return d.polyid == box.polyid
    });
    if (boxindex > -1) {
        boxdata.splice(boxindex, 1);
    }
    deleteBoxFromResults(box);
    return boxindex
}

function deleteBoxFromResults(box) {
    var boxindex = recognizedLinesOfText.findIndex(function (d) {
        // find matching box by bounding box
        d = d.bbox;
        var d = new Box({
            text: '',
            y1: imageHeight - d.y1, // bottom
            y2: imageHeight - d.y0, // top
            x1: d.x0, // right
            x2: d.x1 // left
        })
        return d.x1 == box.x1 && d.y1 == box.y1 && d.x2 == box.x2 && d.y2 == box.y2
    });
    if (boxindex > -1) {
        recognizedLinesOfText.splice(boxindex, 1);
    }
}

function onRectClick(event) {
    console.log(event.target);

    // if editing is enabled, do nothing
    if (event.target.editing.enabled()) {
        return;
    }
    // if mapDeletingState is enabled, do nothing
    if (mapDeletingState) {
        return;
    }
    var rect = event.target;
    // get boxdatata
    if (selectedPoly != rect) {
        var bb = getBoxdataFromRect(rect);
        setFromData(bb);
    }
    removeStyle(selectedPoly)

    focusRectangle(rect)
    setStyle(rect)
    disableEdit(rect);
    enableEdit(rect);

}

function updateRect(polyid, d) {
    var rect = boxlayer.getLayer(polyid);
    var newbounds = [
        [
            d.y1, d.x1
        ],
        [
            d.y2, d.x2
        ]
    ]
    rect.setBounds(newbounds)
}

var doneMovingInterval = 100,
    movingTimer;


function getNextAndFill() {
    var modified = submitText();
    var box = getNextBB(selectedBox);
    setFromData(box);
    clearTimeout(movingTimer);
    movingTimer = setTimeout(focusBoxID, doneMovingInterval, box.polyid, modified);
}

function getPrevAndFill() {
    var modified = submitText();
    var box = getPrevtBB(selectedBox);
    setFromData(box);
    clearTimeout(movingTimer);
    movingTimer = setTimeout(focusBoxID, doneMovingInterval, box.polyid, modified);
}

function onBoxInputChange(e) {

    var polyid = parseInt($('#formtxt').attr('boxid'));
    var newdata = new Box({
        text: $('#formtxt').val(),
        x1: parseInt(Math.round($('#x1').val())),
        y1: parseInt(Math.round($('#y1').val())),
        x2: parseInt(Math.round($('#x2').val())),
        y2: parseInt(Math.round($('#y2').val()))
    })

    var modified = updateBoxdata(polyid, newdata)
    updateRect(polyid, newdata)
}

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

$(document).bind('keydown', 'ctrl+shift+down', getNextAndFill);

$(document).bind('keydown', 'ctrl+shift+up', getPrevAndFill);

$('#formtxt').bind('keydown', 'ctrl+shift+down', getNextAndFill);
$('#formtxt').bind('keydown', 'ctrl+shift+up', getPrevAndFill);
$('#formtxt').on('focus', function () {
    $(this).select();
});

// Set #main-edit-area loading status
function setMainLoadingStatus(status) {
    if (status) {
        $('#mapid').addClass('loading');
    } else {
        $('#mapid').removeClass('loading');
    }
}

// process worker log messages
function processWorkerLogMessage(message) {
    if (message.status == 'recognizing text') {
        message.type = 'ocr';
    } else {
        message.type = 'initializingWorker';
    } updateProgressBar(message);
}

async function generateInitialBoxes(image) {
    setMainLoadingStatus(true);
    displayMessage({ message: 'Generating initial boxes...' });

    boxlayer.clearLayers();
    boxdata = [];

    const worker = await Tesseract.createWorker({
        langPath: '../../assets',
        gzip: false,
        logger: m => processWorkerLogMessage(m)
    });
    // await worker.loadLanguage('LATCYR_from_Cyrillic');
    // await worker.initialize('LATCYR_from_Cyrillic');
    await worker.loadLanguage(['osd', 'RTS_from_Cyrillic']);
    await worker.initialize(['osd', 'RTS_from_Cyrillic']);
    // TODO: 06/04/2023 Continue setting parameters to discover columns and not assume single block.
    await worker.setParameters({
        // tessedit_ocr_engine_mode: OcrEngineMode.OEM_LSTM_ONLY,
        // tessedit_ocr_engine_mode: "OcrEngineMode.OEM_LSTM_ONLY",
        // tessedit_pageseg_mode: "PSM_AUTO_OSD"
        tessedit_ocr_engine_mode: 1,
        tessedit_pageseg_mode: 12
    });
    // const results = await worker.recognize(image, { left: image.width, top: image.height, width: 10, height: 10 });
    // run worker on half of the image
    const rectangle = { left: 0, top: 0, width: image.width / 2, height: image.height }
    const results = await worker.recognize(image);
    // const results = await worker.recognize(image, { rectangle });
    // await worker.terminate();
    recognizedLinesOfText = results.data.lines;
    await insertSuggestions($('.ui.include-suggestions.checkbox').checkbox('is checked'));
    setMainLoadingStatus(false);
    setButtonsEnabledState(true);
    $('#formrow').removeClass('hidden');
    // select next BB
    var nextBB = getNextBB();
    fillAndFocusRect(nextBB);
}

// if selected box is deleted, select closest box
function selectClosestBox() {
    var nextBB = getNextBB();
    if (nextBB) {
        fillAndFocusRect(nextBB);
    } else {
        var prevBB = getPrevBB();
        if (prevBB) {
            fillAndFocusRect(prevBB);
        }
    }
}


async function insertSuggestions(bool) {
    // if data is dirty
    if (boxdataIsDirty) {
        // warn user
        var result = await askUser({
            title: 'Warning',
            message: 'Suggestions will be generated from the current text. Do you want to continue?',
            confirmText: 'Yes',
            denyText: 'No'
        });
        if (!result) {
            return;
        }
    }
    // clear all boxes
    boxlayer.clearLayers();
    boxdata = [];
    var lines = recognizedLinesOfText;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var box = line.bbox;
        var text = line.text;
        var symbole = new Box({
            text: bool ? text : '',
            y1: imageHeight - box.y1, // bottom
            y2: imageHeight - box.y0, // top
            x1: box.x0, // right
            x2: box.x1 // left
        })
        var rect = new L.rectangle([
            [
                symbole.y1, symbole.x1
            ],
            [
                symbole.y2, symbole.x2
            ]
        ]);
        rect.on('edit', editRect);
        rect.on('click', onRectClick);
        rect.setStyle(boxInactive);
        // addLayer
        boxlayer.addLayer(rect);
        var polyid = boxlayer.getLayerId(rect)
        symbole.polyid = polyid
        boxdata.push(symbole);
        map.addLayer(boxlayer);
    }
    numberOFBoxes = boxdata.length;
    selectClosestBox();
}


async function askUser(object) {
    setPromptKeyboardControl();
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
            autofocus: true,
            restoreFocus: true,
            onApprove: function () {
                resolve(true);
            },
            onDeny: function () {
                resolve(false);
            },
            onHide: function () {
                setFormKeyboardControl();
                resolve(false);
            },
            content: object.message,
            actions: [
                {
                    text: object.confirmText,
                    class: 'green positive'
                }, {
                    text: object.denyText,
                    class: 'red negative'
                }
            ]
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
        var ext = file.name.split('.').pop();
        if (ext != 'box') {
            displayMessage({
                type: 'error',
                message: 'Expected box file. Received ' + ext + ' file.',
                title: 'Invalid File Type'
            });
            $('#boxFile').val(boxFileName);
            return;
        } else if (imageFileName != file.name.split('.').slice(0, -1).join('.') && imageFileName != undefined) {
            result = await askUser({
                message: 'Chosen file has name <code>' + file.name + '</code> instead of expected <code>' + imageFileName + '.box</code>.<br> Are you sure you want to continue?',
                title: 'Different File Name',
                type: 'warning'
            });
            if (!result) {
                $('#boxFile').val(boxFileNameForButton);
                return;
            }
        }
        reader.readAsText(file);
        file.name.split('.').slice(0, -1).join('.');
        boxFileNameForButton = file;
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

function updateSlider(options) {
    if (options.max)
        // $('.ui.slider').slider('setting', 'max', options.max);
        initializeSlider();
        if (options.value)
        $('.ui.slider').slider('set value', options.value, fireChange = false);
    if (options.min)
        $('.ui.slider').slider('setting', 'min', options.min);
    return
}

function updateProgressBar(options = {}) {
    if (options.reset) {
        $('#editingProgress .label').text('');
        return;
    }
    if (options.type == 'tagging') {
        var currentPosition = boxdata.indexOf(selectedBox);
        updateSlider({ value: currentPosition + 1});
        // $('.ui.slider').slider('set value', currentPosition + 1);
        // set max value
        // $('.ui.slider').slider('setting', 'max', boxdata.length);
        // $('#positionProgress').progress({
        //     value: currentPosition + 1,
        //     total: boxdata.length
        // });
        if (boxdata.every(function (el) {
            return el.filled;
        })) {
            var linesWithModifications = boxdata.filter(function (el) {
                return el.modified;
            });
            $('#editingProgress').progress({
                value: linesWithModifications.length,
                total: boxdata.length,
                text: {
                    active: 'Updating: {value} of {total} lines modified'
                }
            });
            return;
        } else {
            $('#editingProgress').removeClass('active');
            $('#editingProgress').removeClass('indicating');
            var linesWithText = boxdata.filter(function (el) {
                return el.filled;
            });
            $('#editingProgress').progress({
                value: linesWithText.length,
                total: boxdata.length,
                text: {
                    active: 'Tagging: {value} of {total} lines tagged'
                }
            });
        }
        return;
    } else {
        $('#editingProgress').addClass('indicating');
        if (options.type == 'ocr') {
            $('#editingProgress').progress({
                value: options.progress,
                total: 1,
                text: {
                    active: 'Analyzing Image: {percent}%'
                }
            });
            return;
        } else if (options.type == 'initializingWorker') {
            $('#editingProgress').progress({
                value: 0,
                total: 1,
                text: {
                    active: options.status + '…'
                }
            });
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
    var file,
        img;


    if ((file = this.files[0])) {
        imageFileName = file.name.split('.').slice(0, -1).join('.');
        imageFileNameForButton = file;
        img = new Image();
        img.onload = async function () {
            map.eachLayer(function (layer) {
                map.removeLayer(layer);
            });

            h = this.height
            w = this.width
            bounds = [
                [
                    0, 0
                ],
                [
                    parseInt(h), parseInt(w)
                ]
            ]
            var bounds2 = [
                [
                    h - 300,
                    0
                ],
                [
                    h, w
                ]
            ]
            imageOverlayOptions = {
                opacity: 0.25
            }
            if (image) {
                $(image._image).fadeOut(750, function () {
                    map.removeLayer(image);
                    // map.fitBounds(bounds2,);
                    image = new L.imageOverlay(img.src, bounds, imageOverlayOptions).addTo(map);
                    $(image._image).fadeIn(500);
                });
            } else {
                map.fitBounds(bounds2);
                image = new L.imageOverlay(img.src, bounds, imageOverlayOptions).addTo(map);
                $(image._image).fadeIn(750);
            }
            imageHeight = this.height;
            imageWidth = this.width;
        };
        img.onerror = function () {
            var ext = file.name.split('.').pop();
            displayMessage({
                type: 'error',
                message: 'Expected image file. Received ' + ext + ' file.',
                title: 'Invalid File Type'
            })
            $('#imageFile').val(imageFileNameForButton);
        };
        img.src = _URL.createObjectURL(file);
        updateDownloadButtonsLabels({
            boxDownloadButton: imageFileName + '.box',
            groundTruthDownloadButton: imageFileName + '.gt.txt'
        });
        result = await generateInitialBoxes(img)
        initializeSlider();
        boxdataIsDirty = false;
        updateProgressBar({ type: 'tagging' });
        $('#formtxt').focus();
        $('#formtxt').select();
        // fade image opacity back to 1 during 500ms
        $(image._image).animate({ opacity: 1 }, 500);
    }
}

function initializeSlider() {
    $('.ui.slider')
        .slider({
            min: 1,
            max: boxdata.length,
            step: 1,
            start: 1,
            smooth: true,
            labelDistance: 50,
            onChange: function (value) {
                // displayMessage({ message: 'Slider value changed to ' + value + '.' });
                if (currentSliderPosition == value) {
                    return;
                }
                if (value > 0 && value <= boxdata.length) {
                    fillAndFocusRect(boxdata[value - 1]);
                    currentSliderPosition = value;
                }
            },
            onMove: function (value) {
                // displayMessage({ type: 'warning', message: 'Slider value moving to ' + value + '.' });
                if (currentSliderPosition == value) {
                    return;
                }
                // select box with index = value
                if (value > 0 && value <= boxdata.length) {
                    fillAndFocusRect(boxdata[value - 1]);
                    currentSliderPosition = value;
                }
            },
        });
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

// Sort all bosees from top to bottom
function sortAllBoxes() {
    // boxdata.sort(sortBoxes);
    // repead three times to make sure that the boxes are sorted correctly
    // I don't know why this is necessary, but it is 🤷‍♂️
    boxdata.sort(Box.compare);
    boxdata.sort(Box.compare);
    boxdata.sort(Box.compare);
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
    text = text.normalize('NFD');
    var current_script = null;
    var current_span = '';
    var span_class = '';
    for (var i = 0; i < text.length; i++) {
        var isCapital = false;
        var char = text.charAt(i);
        // if character name contains COMBINING
        var charName = getUnicodeInfo(char)[0].name;
        if (charName.includes('COMBINING')) {
            // add to previous span
            current_span += char;
            continue;
        }
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
        } isCapital = false;
    }
    colored_text += '</span>' + current_span;
    return colored_text;
}

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
        minDisplayTime: 3000
    });
}

var zoomControl = new L.Control.Zoom({ position: 'topright' });

var drawControl = new L.Control.Draw({
    draw: {
        polygon: false,
        marker: false,
        circle: false,
        polyline: false,
        rectangle: true,
        circlemarker: false
    },
    position: 'topright',
    edit: {
        featureGroup: boxlayer,
        edit: false,
        remove: true
    }
});

// L.Control.Region = L.Control.extend({
//     options: {
//         position: 'topright'
//     },
//     onAdd: function (map) {
//         var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
//         var section = L.DomUtil.create('div', 'leaflet-draw-section', container);
//         // var toolbar = L.DomUtil.create('div', 'leaflet-draw-toolbar leaflet-bar leaflet-draw-toolbar-top', section);
//         var inclusiveRegion = L.DomUtil.create('a', 'leaflet-control-button', section);
//         inclusiveRegion.innerHTML = '<i class="large grey fitted plus circle icon"></i>';
//         var exclusiveRegion = L.DomUtil.create('a', 'leaflet-control-button', section);
//         exclusiveRegion.innerHTML = '<i class="large grey fitted minus circle icon"></i>';
//         L.DomEvent.disableClickPropagation(inclusiveRegion);
//         L.DomEvent.on(inclusiveRegion, 'click', function () {
//             console.log('click');
//             // Get bounds of image from map
//             var imageBounds = map.getBounds();
//             // get image height and width
//             var imageHeight = imageBounds.getNorth() - imageBounds.getSouth();
//             var imageWidth = imageBounds.getEast() - imageBounds.getWest();
//             // get aspect ratio of image
//             var imageAspectRatio = imageBounds.getEast() - imageBounds.getWest();
//             imageAspectRatio = imageAspectRatio / (imageBounds.getNorth() - imageBounds.getSouth());
//             // increase height of #mapid to fit aspect ratio. use smooth animation
//             var mapHeight = $('#mapid').height();
//             var mapWidth = $('#mapid').width();
//             var mapAspectRatio = mapWidth / mapHeight;
//             console.log(imageAspectRatio, mapAspectRatio);
//             if (imageAspectRatio > .5) {
//                 var newHeight = mapWidth * imageAspectRatio;
//                 var newHeight = imageHeight;
//                 $('#mapid').animate({ height: newHeight }, 500);
//             }

//             // set map bounds
//             map.fitBounds(imageBounds);

//         });

//         container.title = "Title";

//         return container;
//     },
//     onRemove: function (map) { },
// });

async function setMapSize(options) {
    if (options.largeView) {
        // Get bounds of image from map
        var imageBounds = map.getBounds();
        // get image height and width
        // var imageHeight = imageBounds.getNorth() - imageBounds.getSouth();
        // var imageWidth = imageBounds.getEast() - imageBounds.getWest();
        // get aspect ratio of image
        var imageAspectRatio = imageBounds.getEast() - imageBounds.getWest();
        imageAspectRatio = imageAspectRatio / (imageBounds.getNorth() - imageBounds.getSouth());
        // increase height of #mapid to fit aspect ratio. use smooth animation
        var mapHeight = $('#mapid').height();
        var mapWidth = $('#mapid').width();
        var mapAspectRatio = mapWidth / mapHeight;
        console.log(imageAspectRatio, mapAspectRatio);
        if (imageAspectRatio > .5) {
            var newHeight = mapWidth * imageAspectRatio;
            var newHeight = imageHeight/2;
            await resizeMapTo(newHeight);
        }
        // map.fitBounds(imageBounds);
    } else {
        await resizeMapTo(280);
        // fit selected poly
        var bounds = new L.LatLngBounds();
        for (var i = 0; i < selectedPoly.length; i++) {
            bounds.extend(selectedPoly[i].getBounds());
        }
        // map.fitBounds(bounds);
    }
    setTimeout(function () { map.invalidateSize({pan:false}) }, 500);
}

async function resizeMapTo(height, duration = 500) {
    $('#mapid').animate({ height: height }, duration);
}

// L.Draw.AddRegion = L.Draw.Polygon.extend({
//     statics: {
//         TYPE: "addregion"
//     },
//     Poly: L.AddRegion,
//     options: {
//         showArea: !1,
//         showLength: !1,
//         shapeOptions: {
//             stroke: !0,
//             color: "#3388ff",
//             weight: 4,
//             opacity: .5,
//             fill: !0,
//             fillColor: null,
//             fillOpacity: .2,
//             clickable: !0
//         },
//         metric: !0,
//         feet: !0,
//         nautic: !1,
//         precision: {}
//     },
//     initialize: function (t, e) {
//         L.Draw.Polyline.prototype.initialize.call(this, t, e),
//             this.type = L.Draw.Polygon.TYPE
//     },
//     _updateFinishHandler: function () {
//         var t = this._markers.length;
//         1 === t && this._markers[0].on("click", this._finishShape, this),
//             t > 2 && (this._markers[t - 1].on("dblclick", this._finishShape, this), t > 3 && this._markers[t - 2].off("dblclick", this._finishShape, this))
//     },
//     _getTooltipText: function () {
//         var t,
//             e;
//         return 0 === this._markers.length ? t = L.drawLocal.draw.handlers.polygon.tooltip.start : this._markers.length < 3 ? (t = L.drawLocal.draw.handlers.polygon.tooltip.cont, e = this._getMeasurementString()) : (t = L.drawLocal.draw.handlers.polygon.tooltip.end, e = this._getMeasurementString()), {
//             text: t,
//             subtext: e
//         }
//     },
//     _getMeasurementString: function () {
//         var t = this._area,
//             e = "";
//         return t || this.options.showLength ? (this.options.showLength && (e = L.Draw.Polyline.prototype._getMeasurementString.call(this)), t && (e += "<br>" + L.GeometryUtil.readableArea(t, this.options.metric, this.options.precision)), e) : null
//     },
//     _shapeIsValid: function () {
//         return this._markers.length >= 3
//     },
//     _vertexChanged: function (t, e) {
//         var i;
//         !this.options.allowIntersection && this.options.showArea && (i = this._poly.getLatLngs(), this._area = L.GeometryUtil.geodesicArea(i)),
//             L.Draw.Polyline.prototype._vertexChanged.call(this, t, e)
//     },
//     _cleanUpShape: function () {
//         var t = this._markers.length;
//         t > 0 && (this._markers[0].off("click", this._finishShape, this), t > 2 && this._markers[t - 1].off("dblclick", this._finishShape, this))
//     }
// }),

// L.Draw.Region = L.Draw.Rectangle.extend({
//     statics: {
//         TYPE: "region"
//     },
//     options: {
//         shapeOptions: {
//             stroke: !0,
//             color: "#3388ff",
//             weight: 4,
//             opacity: .5,
//             fill: !0,
//             fillColor: null,
//             fillOpacity: .2,
//             clickable: !0
//         },
//         showArea: !0,
//         metric: !0
//     },
//     initialize: function (t, e) {
//         this.type = L.Draw.Region.TYPE,
//             this._initialLabelText = L.drawLocal.draw.handlers.region.tooltip.start,
//             L.Draw.SimpleShape.prototype.initialize.call(this, t, e)
//     },
//     disable: function () {
//         this._enabled && (this._isCurrentlyTwoClickDrawing = !1, L.Draw.SimpleShape.prototype.disable.call(this))
//     },
//     _onMouseUp: function (t) {
//         if (!this._shape && !this._isCurrentlyTwoClickDrawing)
//             return void (this._isCurrentlyTwoClickDrawing = !0);

//         this._isCurrentlyTwoClickDrawing && !o(t.target, "leaflet-pane") || L.Draw.SimpleShape.prototype._onMouseUp.call(this)
//     },
//     _drawShape: function (t) {
//         this._shape ? this._shape.setBounds(new L.LatLngBounds(this._startLatLng, t)) : (this._shape = new L.Region(new L.LatLngBounds(this._startLatLng, t), this.options.shapeOptions), this._map.addLayer(this._shape))
//     },
//     _fireCreatedEvent: function () {
//         var t = new L.Region(this._shape.getBounds(), this.options.shapeOptions);
//         L.Draw.SimpleShape.prototype._fireCreatedEvent.call(this, t)
//     },
//     _getTooltipText: function () {
//         var t,
//             e,
//             i,
//             o = L.Draw.SimpleShape.prototype._getTooltipText.call(this),
//             a = this._shape,
//             n = this.options.showArea;
//         return a && (t = this._shape._defaultShape ? this._shape._defaultShape() : this._shape.getLatLngs(), e = L.GeometryUtil.geodesicArea(t), i = n ? L.GeometryUtil.readableArea(e, this.options.metric) : ""), {
//             text: o.text,
//             subtext: i
//         }
//     }
// });

// L.DrawToolbar = L.Toolbar.extend({
//     statics: {
//         TYPE: "draw"
//     },
//     options: {
//         polyline: {},
//         polygon: {},
//         rectangle: {},
//         region: {},
//         circle: {},
//         marker: {},
//         circlemarker: {}
//     },
//     initialize: function (t) {
//         for (var e in this.options)
//             this.options.hasOwnProperty(e) && t[e] && (t[e] = L.extend({}, this.options[e], t[e]));

//         this._toolbarClass = "leaflet-draw-draw",
//             L.Toolbar.prototype.initialize.call(this, t)
//     },
//     getModeHandlers: function (t) {
//         return [
//             {
//                 enabled: this.options.polyline,
//                 handler: new L.Draw.Polyline(t, this.options.polyline),
//                 title: L.drawLocal.draw.toolbar.buttons.polyline
//             },
//             {
//                 enabled: this.options.polygon,
//                 handler: new L.Draw.Polygon(t, this.options.polygon),
//                 title: L.drawLocal.draw.toolbar.buttons.polygon
//             },
//             {
//                 enabled: this.options.rectangle,
//                 handler: new L.Draw.Rectangle(t, this.options.rectangle),
//                 title: L.drawLocal.draw.toolbar.buttons.rectangle
//             },
//             {
//                 enabled: this.options.circle,
//                 handler: new L.Draw.Circle(t, this.options.circle),
//                 title: L.drawLocal.draw.toolbar.buttons.circle
//             }, {
//                 enabled: this.options.marker,
//                 handler: new L.Draw.Marker(t, this.options.marker),
//                 title: L.drawLocal.draw.toolbar.buttons.marker
//             }, {
//                 enabled: this.options.circlemarker,
//                 handler: new L.Draw.CircleMarker(t, this.options.circlemarker),
//                 title: L.drawLocal.draw.toolbar.buttons.circlemarker
//             }, {
//                 enabled: this.options.region,
//                 handler: new L.Draw.Region(t, this.options.region),
//                 title: L.drawLocal.draw.toolbar.buttons.region
//             }
//         ]
//     },
//     getActions: function (t) {
//         return [
//             {
//                 enabled: t.completeShape,
//                 title: L.drawLocal.draw.toolbar.finish.title,
//                 text: L.drawLocal.draw.toolbar.finish.text,
//                 callback: t.completeShape,
//                 context: t
//             }, {
//                 enabled: t.deleteLastVertex,
//                 title: L.drawLocal.draw.toolbar.undo.title,
//                 text: L.drawLocal.draw.toolbar.undo.text,
//                 callback: t.deleteLastVertex,
//                 context: t
//             }, {
//                 title: L.drawLocal.draw.toolbar.actions.title,
//                 text: L.drawLocal.draw.toolbar.actions.text,
//                 callback: this.disable,
//                 context: this
//             }, {
//                 title: L.drawLocal.draw.toolbar.buttons.clear,
//                 text: L.drawLocal.draw.toolbar.buttons.clear,
//                 callback: this.clearAll,
//                 context: this
//             }
//         ]
//     },
//     setOptions: function (t) {
//         L.setOptions(this, t);
//         for (var e in this._modes)
//             this._modes.hasOwnProperty(e) && t.hasOwnProperty(e) && this._modes[e].handler.setOptions(t[e])

//     }
// });

// var regionControl = new L.Control.Draw({
//     draw: {
//         rectangle: false,
//         polygon: false,
//         marker: false,
//         circle: false,
//         region: true,
//         polyline: false,
//         circlemarker: false
//     },
//     position: 'topright',
//     edit: {
//         featureGroup: regionlayer,
//         edit: true,
//         remove: true
//     }
// });

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

function getUnicodeInfo(string) {
    var unicodeInfo = [];
    string = string.normalize('NFD');
    for (var i = 0; i < string.length; i++) {
        var char = string.charAt(i);
        var code = char.charCodeAt(0);
        var hex = code.toString(16).toUpperCase();
        var unicode = '0000'.substring(hex.length) + hex;
        result = getUnicodeData(unicode);
        if (unicodeInfo.find(function (x) {
            return x['code'] == result.code;
        }) == undefined) {
            unicodeInfo.push(result);
        }

    }
    return unicodeInfo;
}

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
            content = content + '\t ' + (
                this.x2 + 1
            ) + ' ' + this.y1 + ' ' + (
                    this.x2 + 5
                ) + ' ' + this.y2 + ' 0\n';
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

function setFormKeyboardControl(event) {
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
}

function setPromptKeyboardControl(event) {
    $(window).off('keydown');
}

// set kerning on or off
const setKerning = (elements, kerning) => {
    for (const element of elements) {
        if (kerning) {
            element.classList.remove('no-kerning');
        } else {
            element.classList.add('no-kerning');
        }
    }
};

$(document).ready(async function () {
    colorizedFields = [];
    colorizedFields.push($('#myInputBackground')[0]);
    colorizedFields.push($('#formtxt')[0]);
    setKerning(colorizedFields, false);

    $('#formtxt').on('input', function () {
        updateBackground();
        setLineIsDirty();
    });
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
    $('#imageFile').prop('disabled', false);
    // displayMessage({ message: 'Hover over the question mark in the top right corner for help and keyboard shortcuts.' });

    $('.menu .question.circle.icon').popup({ inline: true });
    setFormKeyboardControl();

    $('#formtxt').focus(function () {
        $('#myInputBackground').addClass('focused');
    });
    $('#formtxt').blur(function () {
        $('#myInputBackground').removeClass('focused');
    });

    $('.ui.checkbox').checkbox();

    // set checkbox from cookie
    if (Cookies.get('include-suggestions') == 'true') {
        $('.ui.include-suggestions.toggle.checkbox').checkbox('check');
    } else {
        $('.ui.include-suggestions.toggle.checkbox').checkbox('uncheck');
    }

    // save cookie for checkbox
    $('.ui.include-suggestions.toggle.checkbox').checkbox({
        onChecked: function () {
            Cookies.set('include-suggestions', 'true');
            insertSuggestions(true);
        },
        onUnchecked: function () {
            Cookies.set('include-suggestions', 'false');
            insertSuggestions(false);
        }
    });

    map = new L.map('mapid', {
        crs: L.CRS.Simple,
        minZoom: -1,
        center: [
            0, 0
        ],
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
    // var control = new L.Control.Region()
    // control.addTo(map);
    map.addControl(drawControl);

    $('#boxFile').change(loadBoxFile);
    $("#imageFile").change(loadImageFile);

    map.on('draw:deleted', function (event) {
        Object.keys(event.layers._layers).forEach(function (x) {
            var polyid = parseInt(x);
            var delbox = boxdata.find(function (x) {
                return x.polyid == polyid;
            });

            var delindex = deleteBox(delbox);
        });
        updateProgressBar({ type: 'tagging' });
    });
    map.on('draw:deletestart', async function (event) {
        mapDeletingState = true;
        await setMapSize({ largeView: true });
    });
    map.on('draw:deletestop', async function (event) {
        await setMapSize({ largeView: false });
        mapDeletingState = false;
        updateSlider({ max: boxdata.length });
    });
    // map.on('draw:drawstart', async function (event) {
    //     mapEditingState = true;
    //     await setMapSize({ largeView: true });
    // });
    // map.on('draw:drawstop', async function (event) {
    //     await setMapSize({ largeView: false });
    //     mapEditingState = false;
    // });

    map.on(L.Draw.Event.CREATED, function (event) {
        var layer = event.layer;
        layer.on('edit', editRect);
        layer.on('click', onRectClick);
        boxlayer.addLayer(layer);
        var polyid = boxlayer.getLayerId(layer)
        var newbb = new Box({
            polyid: polyid,
            text: '',
            x1: Math.round(layer._latlngs[0][0].lng),
            y1: Math.round(layer._latlngs[0][0].lat),
            x2: Math.round(layer._latlngs[0][2].lng),
            y2: Math.round(layer._latlngs[0][2].lat)
        })
        var idx;
        if (selectedBox) {
            idx = boxdata.findIndex(function (x) {
                return x.polyid == selectedBox.polyid;
            });
        } else {
            idx = 0;
        } boxdata.splice(idx + 1, 0, newbb);
        initializeSlider();
        fillAndFocusRect(newbb);
    });


    $('#nextBB').on('click', getNextAndFill);
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
    displayMessage({
        message: 'Downloaded ' + imageFileName + fileExtension,
        type: 'success'
    });
    boxdataIsDirty = false;
}

function showCharInfoPopup(e) { // prevent modifier keys from triggering popup
    if (e.ctrlKey || e.altKey || e.metaKey || e.keyCode == 13) {
        return;
    }
    if (e.keyCode == 13) {
        $('#updateTxt').popup('hide');
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
    // TODO: replace max length with a programmatic solution
    if (results.length == 0 || results.length > 15) {
        $('#updateTxt').popup('hide');
        return;
    } else {
        formatted = formatForPopup(results);
        // apply style to popup
        // max-height: 40em;overflow: scroll;
        $('#updateTxt').popup('get popup').css('max-height', '20em');
        $('#updateTxt').popup('get popup').css('overflow', 'scroll');
        $('#updateTxt').popup('get popup').css('scrollbar-width', 'none');
        $('#updateTxt').popup('get popup').css('scrollbar-width', 'none');
        $('#updateTxt').popup('get popup').css('-ms-overflow-style', 'none');
        // apply popup scrollbar for webkit
        $('#updateTxt').popup('get popup').css('scrollbar-width', 'none');

        if ($('#updateTxt').popup('is visible')) {
            $('#updateTxt').popup('change content (html)', formatted)
        } else if ($('#updateTxt').popup('is hidden')) {
            $('#updateTxt').popup({ on: 'manual', 'html': formatted }).popup('show')
        } else {
            console.log('error with char info popup');
        }
    }
}
