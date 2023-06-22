const BoxFileType = Object.freeze({ "WORDSTR": 1, "CHAR_OR_LINE": 2 })
const IgnoreEOFBox = true
var worker = null;

var appSettings = {
    interface: {
        appearance: "match-device",
        toolbarActions: {
            detectAllLines: false,
            detectSelectedBox: true,
            detectAllBoxes: false,
            showInvisibleChars: false,
        },
        imageView: "medium",
    },
    behavior: {
        onImageLoad: {
            detectAllLines: true,
            includeTextForDetectedLines: true,
        },
        alerting: {
            enableWarrningMessagesForDifferentFileNames: true,
            enableWarrningMessagesForUncommittedChanges: true,
        },
    },
};

// Function to update the cookie with the current settings
function updateCookie() {
    Cookies.set("appSettings", JSON.stringify(appSettings));
}

// Update appSettings based on user modifications
function updateAppSettings({ path, value, cookie }) {

    if (cookie) {
        appSettings = { ...appSettings, ...cookie };
    } else {
        const pathArray = path.split(".");
        let obj = appSettings;
        for (let i = 0; i < pathArray.length - 1; i++) {
            obj = obj[pathArray[i]];
        }
        // displayMessage({ title: "Settings updated!", type: "info", message: `Path: ${path}, value: ${value}, previous value: ${obj[pathArray[pathArray.length - 1]]}.` });
        obj[pathArray[pathArray.length - 1]] = value;
        updateCookie();

        // wait 1 second before continuing to the next line
        setTimeout(() => {
            $("#settingsModalStatus")[0].innerHTML = "Settings saved!"
            // $("#settingsModalStatus .loader").addClass("active")
        }, 100)
        $("#settingsModalStatus")[0].innerHTML = "<div class='ui mini active fast inline loader'></div>"
        // $("#settingsModalStatus .loader").addClass("active")
        // $("#settingsModalStatus")[0].innerText = "Settings saved!"
        // $("#settingsModalStatus .loader").removeClass("active")
    }
    updateSettingsModal();
}



// Update settings modal to reflect the current settings
function updateSettingsModal() {
    // Toolbar actions
    for (const [key, value] of Object.entries(appSettings.interface.toolbarActions)) {
        const path = `interface.toolbarActions.${key}`;
        document.querySelector(`input[name='${path}']`).checked = value;
    }
    // Appearance
    const appearancePath = "interface.appearance";
    document.querySelector(`input[name='${appearancePath}'][value='${appSettings.interface.appearance}']`).checked = true;
    setClassForAppearance(appSettings.interface.appearance);
    // Image view
    const imageViewPath = "interface.imageView";
    document.querySelector(`input[name='${imageViewPath}'][value='${appSettings.interface.imageView}']`).checked = true;
    setMapSize({ height: appSettings.interface.imageView })
    // On image load
    for (const [key, value] of Object.entries(appSettings.behavior.onImageLoad)) {
        const path = `behavior.onImageLoad.${key}`;
        document.querySelector(`input[name='${path}']`).checked = value;
    }
    // Alerting
    for (const [key, value] of Object.entries(appSettings.behavior.alerting)) {
        const path = `behavior.alerting.${key}`;
        document.querySelector(`input[name='${path}']`).checked = value;
    }
}

// Listen for changes to the settings and update the appSettings object and the cookie accordingly
document.addEventListener("change", function (event) {
    // const inputs = document.querySelectorAll("input[type='checkbox'], input[type='radio'], input[type='text']");
    // inputs.forEach((input) => {
    //     input.addEventListener("change", (event) => {
    const path = event.target.name;
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    updateAppSettings({ path: path, value: value });
});

function setClassForAppearance(value) {
    const appearance = appSettings.interface.appearance;
    // eliminate all classes
    document.documentElement.classList.remove(...document.documentElement.classList);
    document.documentElement.classList.toggle(value);
}
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
var image;
var imageHeight;
var imageWidth;
var mapHeight;
var mapDeletingState = false;
var mapEditingState = false;
var currentSliderPosition = -1;
var showInvisibles = false;


class Box {
    constructor({
        text,
        x1,
        y1,
        x2,
        y2,
        polyid,
        visited = false,
        committed = false,
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
        this.modified = false
    }
    static compare(a, b) {
        // set tolerance to account for vertically overlapping boxes as a percentage of height
        const tolerance = 0.5; // 0.25 = 25%

        // Check if ranges of x-coordinates overlap
        const xOverlap = a.x1 <= b.x2 && b.x1 <= a.x2;

        // Check if line segment a is below line segment b
        const below = a.y1 > b.y2 - tolerance * (b.y2 - b.y1);

        // Check if line segment a is entirely to the left of line segment b
        const left = a.x2 <= b.x1;

        // Check if there exists a line segment c that overlaps both a and b
        const cOverlap = (c) => c.x1 <= a.x2 && a.x1 <= c.x2 && c.x1 <= b.x2 && b.x1 <= c.x2;

        // Check if line segment a overflows to the next line (line segment b)
        const aOverflows = a.y1 === b.y2 && xOverlap;

        // Rule 1: Line segment a comes before line segment b
        // if their ranges of x-coordinates overlap and if a is below b
        if (xOverlap && below) {
            return -1;
        }

        // Rule 2: Line segment a comes before line segment b
        // if a is entirely to the left of b and no line segment c overlaps both a and b
        if (left && !cOverlap(a) && !cOverlap(b)) {
            return -1;
        }

        // Rule 3: Line segment a comes before line segment b
        // if line segment a overflows to the next line (line segment b)
        if (aOverflows) {
            return -1;
        }

        // In all other cases, line segment b comes before line segment a
        return 1;
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
boxComitted = {
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
    zoomMax = 1;

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
        rect.setStyle(boxComitted)
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


        // $('#formrow').removeClass('hidden');
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
    setFromData(newd);

    // new dimensions
    var newDimenstions = [newd.x1, newd.y1, newd.x2, newd.y2];
    // console.log("moved box ", [
    //     box.polyid, box.text
    // ], " from ", oldDimenstions, " to ", newDimenstions);
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
    // console.log(event.target);
    console.log("onRectClick", event.target._leaflet_id);

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
        y2: parseInt($('#y2').val()),
        committed: true,
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
        if (image != undefined) {
            $(image._image).animate({ opacity: .3 }, 200);
        }
    } else {
        $('#mapid').removeClass('loading');
        if (image != undefined) {
            $(image._image).animate({ opacity: 1 }, 500);
        }
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

async function regenerateTextSuggestions() {
    $("#regenerateTextSuggestions").addClass("double loading");
    if (boxdata.length > 0) {
        await redetectText(boxdata);
        // get box by id
        var el = boxdata.findIndex(function (x) {
            return x.polyid == selectedBox.polyid;
        });
        setFromData(boxdata[el]);
        // set styles for all boxes using setStyle(boxInactive);
        for (let box of boxlayer.getLayers()) {
            box.setStyle(boxInactive);
        }
        focusBoxID(selectedBox.polyid);
    }
    $("#regenerateTextSuggestions").removeClass("double loading");
    sortAllBoxes();
}
async function regenerateTextSuggestionForSelectedBox() {
    $("#regenerateTextSuggestionForSelectedBox").addClass("double loading");
    if (boxdata.length > 0) {
        var newValues = await redetectText([selectedBox]);
        // get box by id
        var el = boxdata.findIndex(function (x) {
            return x.polyid == selectedBox.polyid;
        });
        boxdata[el].text = newValues[0].text;
        setFromData(boxdata[el]);
    }
    $("#regenerateTextSuggestionForSelectedBox").removeClass("double loading");
    sortAllBoxes();
}

async function redetectText(rectList) {
    if (rectList.length == 0) {
        rectList = boxdata;
    } else {
        var returnBoxes = true;
    }
    for (i = 0; i < rectList.length; i++) {
        var box = rectList[i];
        // rectangle = { left: box.x1, top: box.y1, width: box.x2 - box.x1, height: box.y2 - box.y1 }
        rectangle = { left: box.x1, top: imageHeight - box.y2, width: box.x2 - box.x1, height: box.y2 - box.y1 }
        // await worker.loadLanguage('RTS_from_Cyrillic');
        // await worker.initialize('RTS_from_Cyrillic');
        // await worker.setParameters({
        //     tessedit_ocr_engine_mode: 1,
        //     tessedit_pageseg_mode: 1,// 12
        // });
        result = await worker.recognize(image._image, { rectangle })
        box.text = result.data.text;
        // remove newlines
        box.text = box.text.replace(/(\r\n|\n|\r)/gm, "");
        box.committed = false;
        box.visited = false;
    }
    if (returnBoxes) {
        return rectList
    }
}

async function generateInitialBoxes(image) {
    boxlayer.clearLayers();
    boxdata = [];
    // const results = await worker.recognize(image, { left: image.width, top: image.height, width: 10, height: 10 });
    // run worker on half of the image
    // const rectangle = { left: 0, top: 0, width: image.width / 2, height: image.height/2 }
    const results = await worker.recognize(image);
    // const results = await worker.recognize(image, { rectangle });
    // await worker.terminate();
    recognizedLinesOfText = results.data.lines;
    if (recognizedLinesOfText.length == 0) {
        setMainLoadingStatus(false);
        return false;
    }
    // remove newlines
    recognizedLinesOfText.forEach(function (line) {
        line.text = line.text.replace(/(\r\n|\n|\r)/gm, "");
    });
    await insertSuggestions();
    // $('#formrow').removeClass('hidden');
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


async function insertSuggestions() {
    // if data is dirty
    if (boxdataIsDirty) {
        // warn user
        var result = await askUser({
            title: 'Warning',
            message: 'Suggestions will be generated from the current lines. Do you want to continue?',
            confirmText: 'Yes',
            denyText: 'No',
            type: 'replacingTextWarning',
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
            text: appSettings.behavior.onImageLoad.includeTextForDetectedLines ? text : '',
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
    // selectClosestBox();
}


async function askUser(object) {
    if ((object.type === 'differentFileNameWarning' && !appSettings.behavior.alerting.enableWarrningMessagesForDifferentFileNames) ||
        (object.type === 'uncommittedChangesWarning' && !appSettings.behavior.alerting.enableWarrningMessagesForUncommittedChanges)) {
        return true;
    }
    setPromptKeyboardControl();
    // if (object.confirmText == undefined) {
    //     object.confirmText = 'OK';
    // }
    // if (object.denyText == undefined) {
    //     object.denyText = 'Cancel';
    // }
    return new Promise((resolve, reject) => {
        $.modal({
            inverted: false,
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
        var result = await askUser({
            message: 'You did not download current progress. Do you want to overwrite existing data?',
            title: 'Unsaved Changes',
            type: 'uncommittedChangesWarning',
            confirmText: 'Yes',
            denyText: 'No',
        });
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
                title: 'Unexpected File Name',
                type: 'differentFileNameWarning',
                confirmText: 'Yes',
                denyText: 'No',
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

async function setButtons({ state }) {
    if (state == 'enabled') {
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
        $('#regenerateTextSuggestions').removeClass('disabled');
        $('#regenerateTextSuggestionsForSelectedBox').removeClass('disabled');

    } else if (state == 'disabled') {
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
        $('#regenerateTextSuggestions').addClass('disabled');
        $('#regenerateTextSuggestionsForSelectedBox').addClass('disabled');
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
        if ($('.ui.slider').slider('get max') != boxdata.length) {
            updateSlider({ value: currentPosition + 1, max: boxdata.length });
        } else {
            updateSlider({ value: currentPosition + 1 });
        }
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
        var result = await askUser({
            message: 'You did not download current progress. Are you sure you want to load a new image?',
            title: 'Unsaved Changes',
            type: 'uncommittedChangesWarning',
            confirmText: 'Yes',
            denyText: 'No',
        });
        if (!result) {
            $('#imageFile').val(imageFileNameForButton);
            return;
        }
    }
    setButtons({ state: 'disabled' });
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
            bounds = [[0, 0], [parseInt(h), parseInt(w)]]
            var bounds2 = [[h - 300, 0], [h, w]]
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
        setMainLoadingStatus(true);
        worker = await Tesseract.createWorker({
            langPath: '../../assets',
            gzip: false,
            logger: m => processWorkerLogMessage(m)
        });
        await worker.loadLanguage('RTS_from_Cyrillic');
        await worker.initialize('RTS_from_Cyrillic');
        await worker.setParameters({
            // tessedit_ocr_engine_mode: OcrEngineMode.OEM_LSTM_ONLY,
            // tessedit_ocr_engine_mode: "OcrEngineMode.OEM_LSTM_ONLY",
            // tessedit_pageseg_mode: "PSM_AUTO_OSD"
            tessedit_ocr_engine_mode: 1,
            tessedit_pageseg_mode: 1,// 12
        });
        if (appSettings.behavior.onImageLoad.detectAllLines) {
            result = await generateInitialBoxes(img)
        }
        setMainLoadingStatus(false);
        setButtons({ state: 'enabled' });
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
    // unbind keydown event from slider
    $('.ui.slider').off('keydown.slider');
    $(document).off('keydown.slider1');
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
    // boxdata.sort(Box.compare);
    // boxdata.sort(Box.compare);
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
    charSpace = showInvisibles ? '·' : '&nbsp;';
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
            span_class = 'space';
            if (current_script == 'space') {
                // current_span += '&nbsp;';
                // replace 'space' with 'space multiple' in current_span
                current_span = current_span.replace('space', 'space multiple');
                current_span += charSpace;
            } else {
                colored_text += '</span>' + current_span;
                // current_span = '<span class="' + span_class + '">' + '&nbsp;';
                current_span = '<span class="' + span_class + '">' + charSpace;
                current_script = span_class;
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
            span_class = 'other';
            if (current_script == span_class) {
                current_span += char;
            } else {
                colored_text += '</span>' + current_span; + char;
                current_span = '<span class="' + span_class + '">' + char;
                current_script = span_class;
            }
        } isCapital = false;
    }
    colored_text += '</span>' + current_span;
    return colored_text;
}

window.onbeforeunload = async function () {
    if (boxdataIsDirty || lineIsDirty) {
        // return 'You have unsaved changes. Are you sure you want to leave?';
        return await askUser({
            message: 'You have unsaved changes. Are you sure you want to continue?',
            title: 'Unsaved Changes',
            type: 'uncommittedChangesWarning',
            confirmText: 'Yes',
            denyText: 'No',
        });
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
        polyline: true,
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

async function setMapSize(options, animate = true) {
    // var imageBounds = map.getBounds();
    // var imageAspectRatio = imageBounds.getEast() - imageBounds.getWest();
    // imageAspectRatio = imageAspectRatio / (imageBounds.getNorth() - imageBounds.getSouth());
    // var mapHeight = $('#mapid').height();
    // var mapWidth = $('#mapid').width();
    // var mapAspectRatio = mapWidth / mapHeight;
    // console.log(imageAspectRatio, mapAspectRatio);
    // if (imageAspectRatio > .5) {
    //     var newHeight = mapWidth * imageAspectRatio;
    //     var newHeight = imageHeight / 2;
    //     await resizeMapTo(newHeight);
    // }
    if (options.height == 'short') {
        var newHeight = 300;
    }
    if (options.height == 'medium') {
        var newHeight = 500;
    }
    if (options.height == 'tall') {
        var newHeight = 700;
    }

    await resizeMapTo(newHeight, animate);
    // fit selected poly
    var bounds = new L.LatLngBounds();
    for (var i = 0; i < selectedPoly.length; i++) {
        bounds.extend(selectedPoly[i].getBounds());
    }
    setTimeout(function () { map.invalidateSize({ pan: true }) }, 500);
}

async function resizeMapTo(height, animate) {
    $('#mapid').animate({ height: height }, animate ? 500 : 0);
}

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

async function toggleInvisibles(e) {
    if (e) {
        e.preventDefault();
    }
    showInvisibles = !showInvisibles;
    // toggle active class for button
    $("#invisiblesToggle").toggleClass('active')
    path = "interface.toolbarActions.showInvisibleChars";
    value = showInvisibles;
    updateAppSettings({ path, value });
    updateBackground();
    $('#formtxt').focus();
    // save cookie for invisibles
    Cookies.set('show-invisibles', showInvisibles);
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
    // remove newlines from text
    $.each(boxdata, function () {
        this.text = this.text.replace(/(\r\n|\n|\r)/gm, "");
    })
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
    // remove newlines from text
    $.each(boxdata, function () {
        this.text = this.text.replace(/(\r\n|\n|\r)/gm, "");
    })
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

// split the box by the intersection of the box and the polyline using turf.js bboxclip
function cutBoxByPoly(box, poly) {
    // split poly into segments
    // var polyFeature = turf.polygon(poly);
    // var multiLine = turf.multiLineString([[[0,0],[10,10]]]);
    // make multilinestring from polyline
    var polyFeature = turf.lineString(poly);
    // var polyFeature = turf.lineToPolygon(poly);
    // convert poly latlngs y component to image height - y
    // polyFeature.geometry.coordinates._latlngs.forEach(function (element) {
    //     element.lat = imageHeight - element.lat;
    // });
    var boxFeature = turf.bboxPolygon([box.x1, box.y1, box.x2, box.y2]);
    // for each segment of the polyline, find the intersection with the box. check if point is inside box. if so, add to list of points
    var splitLines = [];
    for (var i = 0; i < poly._latlngs.length - 1; i++) {
        // var segmentPoints = [poly._latlngs[i], poly._latlngs[i + 1]];
        var segmentPoints = [[poly._latlngs[i].lng, poly._latlngs[i].lat], [poly._latlngs[i + 1].lng, poly._latlngs[i + 1].lat]];
        var j = i + 1;
        // while point is inside box, keep adding points to segment
        while (turf.booleanPointInPolygon([poly._latlngs[j].lng, poly._latlngs[j].lat], boxFeature) && j < poly._latlngs.length - 1) {
            j++;
            segmentPoints.push([poly._latlngs[j].lng, poly._latlngs[j].lat]);
        }
        var segmentFeature = turf.lineString(segmentPoints);
        splitLines.push(segmentFeature);
        i = j - 1;
    }

    // filter all segments that intersect the box
    var intersectingLines = [];
    splitLines.forEach(function (element) {
        if (turf.booleanIntersects(element, boxFeature)) {
            intersectingLines.push(element);
        }
    });

    // for each intersecting segment, split the box
    var boxGaps = [];
    intersectingLines.forEach(function (element) {
        // var intersection = turf.lineIntersect(boxFeature, element);
        // if (element.geometry.coordinates.length == 3) {
        //     intersection.features.push(turf.point(element.geometry.coordinates[1]));
        // }
        // var intersectionBox = turf.bbox(intersection);
        // boxGaps.push(intersectionBox);
        boxGaps.push(turf.envelope(element));
    });

    // for each gap, split the box
    // union all box gaps
    // if (boxGaps.length > 1) {
    //     var gapUnion = turf.union(boxGaps[0], boxGaps[1]);
    //     for (var i = 2; i < boxGaps.length; i++) {
    //         gapUnion = turf.union(gapUnion, boxGaps[i]);
    //     }
    // }

    // var difference = turf.difference(boxFeature, gapUnion);

    var newBoxes = [];
    var newEdges = [];
    newEdges.push(box.x1);
    // push all vertical edges of box gaps
    boxGaps.forEach(function (element) {
        newEdges.push(element.geometry.coordinates[0][0][0]);
        newEdges.push(element.geometry.coordinates[0][2][0]);
    });
    newEdges.push(box.x2);
    // sort edges
    newEdges.sort(function (a, b) { return a - b });
    // for each pair of edges, create a new box
    for (var i = 0; i < newEdges.length - 1; i += 2) {
        var newBox = {
            x1: newEdges[i],
            y1: box.y1,
            x2: newEdges[i + 1],
            y2: box.y2
        };
        newBoxes.push(newBox);
    }
    // round box coordinates
    newBoxes.forEach(function (element) {
        element.x1 = Math.round(element.x1);
        element.y1 = Math.round(element.y1);
        element.x2 = Math.round(element.x2);
        element.y2 = Math.round(element.y2);
    });
    return newBoxes;
}



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
        $('#updateTxt').popup('get popup').css('overflow', 'visible');
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

function settingsPopup() {
    $('.ui.settings.modal')
        .modal('show')
        ;
}

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

    $('.ui.checkbox').checkbox(
        // {
        //     onChecked: function () {
        //         displayMessage({ message: 'onChecked called<br>' });
        //     }
        // }
    );

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
            // insertSuggestions(true);
        },
        onUnchecked: function () {
            Cookies.set('include-suggestions', 'false');
            // insertSuggestions(false);
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
        // await setMapSize({ largeView: true });
    });
    map.on('draw:deletestop', async function (event) {
        // await setMapSize({ largeView: false });
        mapDeletingState = false;
        updateSlider({ max: boxdata.length });
    });
    map.on('draw:drawstart', async function (event) {
        mapEditingState = true;
        // await setMapSize({ largeView: true });
    });
    map.on('draw:drawstop', async function (event) {
        // await setMapSize({ largeView: false });
        // focusRectangle(selectedPoly);
        mapEditingState = false;
    });

    map.on(L.Draw.Event.CREATED, function (event) {
        if (event.layerType === 'rectangle') {

            var layer = event.layer;
            layer.on('edit', editRect);
            layer.on('click', onRectClick);
            layer.setStyle(boxActive)
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
            sortAllBoxes();
            initializeSlider();
            fillAndFocusRect(newbb);
            map.addLayer(boxlayer)
            // return;
        }
        if (event.layerType === 'polyline') {
            setMainLoadingStatus(true);
            setButtons({ state: 'disabled' });
            // if (event.layerType === 'polygon') {
            // cut all boxes by the polygon line
            var poly = event.layer;
            var polybounds = poly.getBounds();
            var newboxes = [];
            // delete set
            var deleteBoxes = [];
            for (var i = 0; i < boxdata.length; i++) {
                var box = boxdata[i];
                var boxbounds = L.latLngBounds([box.y1, box.x1], [box.y2, box.x2]);
                var intersection = polybounds.intersects(boxbounds);
                if (intersection) {
                    var boxes = cutBoxByPoly(box, poly);
                    deleteBoxes.push(box);
                    if (boxes.length > 0) {
                        newboxes = newboxes.concat(boxes);
                    }
                }
            }
            deleteBoxes.forEach(function (box) {
                layer = boxlayer.getLayer(box.polyid);
                boxlayer.removeLayer(layer);
                deleteBox(box);
            });
            // for (var i = 0; i < newboxes.length; i++) {
            // update all newboxes to Box objects in place
            newboxes = newboxes.map(function (box) {
                var newbox = new Box(box);
                return newbox;
            });

            newboxes.forEach(function (newbox) {
                // var newbox = new Box(box);
                var newpoly = L.rectangle([[newbox.y1, newbox.x1], [newbox.y2, newbox.x2]]);
                newpoly.on('edit', editRect);
                newpoly.on('click', onRectClick);
                newpoly.setStyle(boxInactive);
                boxlayer.addLayer(newpoly);
                var polyid = boxlayer.getLayerId(newpoly)
                newbox.polyid = polyid;
                boxdata.push(newbox);
            });

            redetectText(newboxes);
            sortAllBoxes();
            updateProgressBar({ type: 'tagging' });
            updateSlider({ max: boxdata.length });
            setMainLoadingStatus(false);
            setButtons({ state: 'disabled' });
        }
        focusRectangle(selectedPoly);
    });

    setButtons({ state: 'disabled' });
    $('#nextBB').on('click', getNextAndFill);
    $('#previousBB').on('click', getPrevAndFill);
    $("#downloadBoxFileButton").on("click", downloadBoxFile);
    $('#downloadGroundTruthButton').on("click", downloadGroundTruth);
    $('#invisiblesToggle').on("click", toggleInvisibles);
    $('#regenerateTextSuggestions').on("click", regenerateTextSuggestions);
    $('#regenerateTextSuggestionForSelectedBox').on("click", regenerateTextSuggestionForSelectedBox);
    $('#settingsButton').on("click", settingsPopup);

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



    $('#settingsMenu .item')
        .tab()
        ;
    $('.ui.settings.modal')
        .modal({
            inverted: false,
            blurring: true,
            onHidden: function () {
                $("#settingsModalStatus").text("");
            },
        })
    const cookieValue = Cookies.get("appSettings");
    if (cookieValue) {
        cookieSettings = JSON.parse(cookieValue);
        updateAppSettings({ cookie: cookieSettings });
    }
});