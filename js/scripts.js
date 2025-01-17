// VARIABLES

var cropWidth = 0.8;
var numOfPixelsInHeightToAvg = 200;

var plotData = {};
var flatFieldData = [];
var acquired = [];
var flatfields = [];
var loadedCount = 0;
var flatFieldLoadedCount = 0;
var filterData = null;
var fov = 0;

var ctfPlot = [];

$(document).ready(function () {

    setInterval(function(){
        percMem=100*(window.performance.memory.totalJSHeapSize/window.performance.memory.jsHeapSizeLimit).toFixed(2);;
        $(".memory").html(`Memory: ${percMem}%`);
    },10000)

    $.get("README.md").done(function (data) {
        $(".content[content='description']").html(marked.parse(data));
        $(".content[content='description']").show();
    });

    $(".tabs li").click(function () {
        $(".tabs li").removeClass("active");
        $(this).addClass("active");
        tab = $(this).attr("content");
        console.log(tab);
        $(".content").hide();
        $(".content[content='" + tab + "']").show();
    });

    initializePlot();

    $("#start-plot").click(function () {
        initializePlot();
        flatFieldLoadedCount = 0;
        flatfields = $('#flatfield').prop('files');
        flatFieldData = []

        fov = $("input[name=fov]").val();

        $(".right").addClass("loading");
        setProgress(1);

        if($("input[name=direction]:checked").val()=="horizontal"){
            // TODO: CHECK THESE VALUES
            NumOfPixelsPerDegree = plotData[0][0][0].length / fov;
            fov = plotData[0][0].length / NumOfPixelsPerDegree;
        }

        $.each(flatfields, function (i, e) {
            var fr = new FileReader();
            fr.onload = flatfieldLoaded;
            //fr.readAsText(file);
            //fr.readAsBinaryString(file); //as bit work with base64 for example upload to server
            // console.log(e);
            fr.readAsDataURL(e);
            path = e.webkitRelativePath.split("/");
            fr.num = i;
            fr.imageNumber = path[path.length - 2]
        });
        // console.log(acquired);
    });
});

function initializePlot() {
    Plotly.newPlot("plot", [{
        // x: output["keV"],
        // y: output["normFluence"],
        // name:"Inherent Fluence"
    },
    {
        // x: output["keV"],
        // y: output["fluence"],
        // name:"Filtered Fluence"
    }],
        {
            height: 350,
            margin: { t: 0 },
            // title: "fluence",
            yaxis: {
                // automargin: true,
                title: {
                    text: "CTF",
                    standoff: 30
                },
                linecolor: "white",
                range: [0, 1.1]
            },
            xaxis: {
                title: "Spatial Frequency (cycle/deg)",
                range: [-0.1, 6],
                linecolor: "black"
            },
            legend: {
                xanchor: 'right',
                y: .9
            },
            font: {
                size: 15,
                color: 'black'
            },
            plot_bgcolor: 'white',
            paper_bgcolor: 'white'
        }
    );
}

async function flatfieldLoaded(f) {
    let image = await IJS.Image.load(f.srcElement.result);
    flatFieldData.push(image.getMatrix({ channel: 1 }));
    flatFieldLoadedCount += 1;
    if (flatFieldLoadedCount == flatfields.length) {
        filterData = fourier_trans(fov, averageOfMatrices(flatFieldData));
        loadAcquiredImages();
    }
}

async function loadAcquiredImages() {
    acquired = $('#images').prop('files');
    plotData = [];
    loadedCount = 0;
    $.each(acquired, function (i, e) {
        var fr = new FileReader();
        fr.onload = fileLoaded;
        //fr.readAsText(file);
        //fr.readAsBinaryString(file); //as bit work with base64 for example upload to server
        // console.log(e);
        fr.readAsDataURL(e);
        path = e.webkitRelativePath.split("/");
        fr.num = i;
        fr.imageNumber = path[path.length - 2]
    });
}

async function fileLoaded(f) {
    // console.log(f);
    let image = await IJS.Image.load(f.srcElement.result);

    if($("input[name=direction]:checked").val()=="horizontal"){
        image = image.rotate(90);
    }

    array = image.crop({
        x: Math.floor(image.width / 2 - image.width * cropWidth / 2),
        y: Math.floor(image.height / 2 - numOfPixelsInHeightToAvg / 2),
        width: image.width * cropWidth,
        height: numOfPixelsInHeightToAvg
    });

    // for (col = 0; col < image.width; col++) {
    //     array.push(image.getPixelXY(col, center)[0]);
    // }

    if (!(f.srcElement.imageNumber in plotData)) {
        plotData[f.srcElement.imageNumber] = []
    }

    loadedCount += 1;
    plotData[f.srcElement.imageNumber].push(array.getMatrix({ channel: 1 }));

    $(".loaded .progress").html(loadedCount + "/" + acquired.length);
    $(".loaded .progress").css("right", (100 - 100 * loadedCount / acquired.length) + "%");

    setProgress(100 * loadedCount / acquired.length);

    if (loadedCount == acquired.length) {
        $(".right").removeClass("loading");

        $.when(
            $.each(plotData, function (i, e) {
                if (e) {
                    // console.log(e);
                    avg = averageOfMatrixColumns(averageOfMatrices(e));
                    avg = avg.map(float => Math.round(float));
                    ret = processCTF(avg);
                    ctfPlot[i] = ret;

                    // Plotly.addTraces("plot", [
                    //     {
                    //         x: ret["smooth"].length,
                    //         y: ret["smooth"],
                    //         name: "Smooth " + i
                    //     },
                    //     {
                    //         x: ret["interp"].length,
                    //         y: ret["interp"],
                    //         name: "Interp " + i
                    //     }
                    // ]
                    // );
                }
            })
        ).then(function () {
            Plotly.addTraces("plot", [{
                    x: ctfPlot.map(x => x["ctf"]["x"]),
                    y: ctfPlot.map(x => x["ctf"]["y"]),
                    name: "CTF",
                    marker: {
                        size: 12 // Set the marker size (in pixels)
                    },
                    line: {
                        width: 4 // Set the line width here
                    }
                }
                ]
            );
            Plotly.relayout("plot", {
                'xaxis.autorange': true
              });
        });
        $(".loaded .progress").html("All images loaded!");
    }
}

function setProgress(percent) {
    const circle = document.querySelector('.progress-circle .circle');
    const circumference = circle.getTotalLength();
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDashoffset = offset;
}

function range(size, startAt = 0) {
    return [...Array(size).keys()].map(i => i + startAt);
}

function averageOfMatrices(matrices) {
    if (matrices.length === 0) {
        return [];
    }

    const rows = matrices[0].length;
    const cols = matrices[0][0].length;

    const result = [];
    for (let i = 0; i < rows; i++) {
        result[i] = [];
        for (let j = 0; j < cols; j++) {
            let sum = 0;
            for (let k = 0; k < matrices.length; k++) {
                sum += matrices[k][i][j];
            }
            result[i][j] = sum / matrices.length;
        }
    }

    return result;
}

function averageOfMatrixColumns(matrix) {
    if (matrix.length === 0 || matrix[0].length === 0) {
        return [];
    }

    const numRows = matrix.length;
    const numCols = matrix[0].length;
    const columnAverages = [];

    for (let col = 0; col < numCols; col++) {
        let sum = 0;
        for (let row = 0; row < numRows; row++) {
            sum += matrix[row][col];
        }
        columnAverages.push(sum / numRows);
    }

    return columnAverages;
}

function graythresh(grayImage) {
    const histData = new Array(256).fill(0);
    const totalPixels = grayImage.length;

    // Compute histogram
    for (let i = 0; i < totalPixels; i++) {
        histData[grayImage[i]]++;
    }

    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * histData[t];

    let sumB = 0;
    let wB = 0;
    let wF = 0;

    let varMax = 0;
    let threshold = 0;

    for (let t = 0; t < 256; t++) {
        wB += histData[t];               // Weight Background
        if (wB == 0) continue;

        wF = totalPixels - wB;                 // Weight Foreground
        if (wF == 0) break;

        sumB += t * histData[t];

        let mB = sumB / wB;            // Mean Background
        let mF = (sum - sumB) / wF;    // Mean Foreground

        // Calculate Between Class Variance
        let varBetween = wB * wF * (mB - mF) * (mB - mF);

        // Check if new maximum found
        if (varBetween > varMax) {
            varMax = varBetween;
            threshold = t;
        }
    }

    return threshold;

}



function binarizeSignal(data) {
    // threshold = graythresh(data);
    threshold = Math.round(Math.max(...data) / 2);
    // console.log(threshold, data);
    binary = data.map(value => (value >= threshold ? 1 : 0));
    return binary;
}

function fourier_trans(FoV, img) {
    const Nx = img[0].length; // Number of columns (width)
    const Ny = img.length; // Number of rows (height)
    const ax = FoV / Nx; // Camera pixel pitch in degrees

    // Create x-axis in degrees
    let x = Array.from({ length: Nx }, (_, i) => i);
    x = x.map(val => (val - (Nx - 1) / 2) * ax);

    // Create fx-axis (spatial frequency)
    let fx = Array.from({ length: Nx }, (_, i) => i);
    fx = fx.map(val => (val - (Nx - 1) / 2) / Nx / ax);

    const L = Array.from({ length: 200 }, () => Array(Nx).fill(0));
    const fft_L = Array.from({ length: 200 }, () => Array(Nx).fill(0));

    for (let i2 = 0; i2 < 200; i2++) {
        // Extract a row from the image
        const L_temp = img[Math.floor(Ny / 2) - 100 + i2].slice(0, 2048);
        L[i2] = [...L_temp]; // Copy the row

        // Calculate FFT and shift the spectrum
        var out = [];
        Fourier.transform(L_temp, out);
        out = out.map(val => val.magnitude());

        fft_L[i2] = Fourier.shift(out, [1, out.length]);
    }
    // console.log(fft_L);

    // Calculate the mean of the log of the FFT
    log_fft_L = fft_L.map(row => row.map(val => Math.log(val)));

    // console.log(log_fft_L);

    log_fft_L = averageOfMatrixColumns(log_fft_L);

    // Set low frequencies to 0
    for (let i = 0; i < Nx; i++) {
        if (fx[i] < 2) {
            log_fft_L[i] = 0;
        }
    }

    // console.log(log_fft_L);

    // Find the index of the maximum value in log_fft_L
    const N_fc = argmax(log_fft_L);

    // Calculate fc, HMD_pixel_pitch, and HMD_pixel_pitch_NumImgPix
    const fc = fx[N_fc];
    const HMD_pixel_pitch = 1 / fc;
    const HMD_pixel_pitch_NumImgPix = HMD_pixel_pitch / ax;

    return { x, L, fx, fft_L, fc, HMD_pixel_pitch, HMD_pixel_pitch_NumImgPix };
}

function mean(arr) {
    // Calculate the mean of a 2D array
    if (arr.length === 0) {
        return 0; // Or throw an error: "Cannot calculate mean of an empty array"
    }

    const sum = arr.reduce((acc, curr) => acc + curr, 0);
    return sum / arr.length;
}

function argmax(arr) {
    // Find the index of the maximum value in an array
    if (arr.length === 0) {
        return NaN; // Or throw an error: "Cannot find argmax of an empty array"
    }

    let maxIndex = 0;
    let maxValue = arr[0];

    for (let i = 1; i < arr.length; i++) {
        if (arr[i] > maxValue) {
            maxValue = arr[i];
            maxIndex = i;
        }
    }

    return maxIndex;
}

function oddFilterSize(FilterSize) {
    // Round FilterSize to the nearest integer
    FilterSize = Math.round(FilterSize);

    // Check if FilterSize is odd
    const isOdd = FilterSize % 2 === 1;

    // If FilterSize is even, increment it by 1
    if (!isOdd) {
        FilterSize++;
    }

    return FilterSize;
}

function movingAverageFilter(Signal, filterSize) {
    // 1-D filter accept only odd number as a filter size
    if (filterSize % 2 === 0) {
        throw new Error("Cannot use the filter size as an even number.");
    }

    const sizeSignal = Signal.length;
    const padSignal = (filterSize - 1) / 2;
    const Pad = Array(padSignal).fill(0);
    const newSignal = Pad.concat(Signal).concat(Pad);

    const Out = [];
    for (let i = 0; i < sizeSignal; i++) {
        let temp = 0;
        for (let j = 0; j < filterSize; j++) {
            temp += newSignal[i + j];
        }
        Out.push(temp / filterSize);
    }

    return Out;
}

function processCTF(data) {
    pixelsPerDegree = Math.round(data.length / fov);

    // ftSize = fourier_trans(FOV, Img);
    // console.log(filterData);
    filterSize = oddFilterSize(Math.abs(filterData["HMD_pixel_pitch_NumImgPix"]));

    smoothSignal = movingAverageFilter(data, filterSize);

    // console.log(smoothSignal);

    binary = binarizeSignal(smoothSignal);

    difference = binary.reduce(function (a, e, i, arr) {
        if (i < arr.length - 1) {
            a.push(arr[i + 1] - arr[i])
        }
        return a;
    }, []);

    peaks = binary.reduce(function (a, e, i, arr) {
        if (i < arr.length - 1 && arr[i] == 0 & arr[i + 1] == 1) {
            a.push(i);
        }
        return a;
    }, []);

    valleys = binary.reduce(function (a, e, i, arr) {
        if (i < arr.length - 1 && arr[i] == 1 & arr[i + 1] == 0) {
            a.push(i);
        }
        return a;
    }, []);

    numberOfPeaks = peaks.length

    if (standardDeviation(difference) < 10 && numberOfPeaks >= 3) {
        sizeOfFilter = (peaks[peaks.length - 1] - peaks[0]) / (numberOfPeaks - 1) / 2;
        if (peaks[0] < valleys[0]) {
            firstPeak = peaks[0];
            lastPeak = peaks[peaks.length - 1]
        } else {
            firstPeak = valleys[0];
            lastPeak = valleys[valleys.length - 1]
        }
    } else {
        valleys = 0;
        peaks = 0;
        numberOfPeaks = 0;
        firstPeak = 0;
        lastPeak = 0;
    }

    filterSize = computeFilterSize(firstPeak, sizeOfFilter);

    // console.log(filterSize);

    envelope = dataEnvelope(filterSize["Signal_period"], data.length, smoothSignal);

    // console.log(envelope);

    interp = interpolation(data.length, envelope["X_axis_max"], envelope["Collect_Data_envelope"], envelope["X_axis_min"]);
    // sortData(filterSize["FilterSize"])

    points = errorBar(interp, pixelsPerDegree);

    ctf = 1 / (filterSize["Signal_period"][0] * fov / data.length);

    // console.log(ctf);
    return {
        "signal": data,
        "smooth": smoothSignal,
        "binary": binary,
        "interp": interp, //ctf
        "ctf": {
            "x": ctf,
            "y": points[0],
            "std": points[1]
        }
    };
}


const standardDeviation = (arr, usePopulation = false) => {
    const mean = arr.reduce((acc, val) => acc + val, 0) / arr.length;
    return Math.sqrt(
        arr.reduce((acc, val) => acc.concat((val - mean) ** 2), []).reduce((acc, val) => acc + val, 0) /
        (arr.length - (usePopulation ? 0 : 1))
    );
};

function computeFilterSize(firstPeaklocation, SizeofFilter) {
    // Compute filter size which is the half of pixels of a cycle
    let FilterSize = SizeofFilter;
    let Signal_period = [Math.round(2 * FilterSize), firstPeaklocation];

    // Odd filter size
    FilterSize = Math.round(FilterSize);

    // Ensure odd filter size
    if (FilterSize % 2 === 0) {
        FilterSize -= 1;
    }

    return { FilterSize, Signal_period };
}

function dataEnvelope(Signal_period, Crop_X, ResultedSignal) {
    // Initialize variables
    let counter1 = 0;
    let X_axis_max = [];
    let X_axis_min = [];
    let Collect_Data_envelope = [];

    // Loop through the signal with the given period
    let i = Signal_period[1];
    for (; i <= Crop_X - Signal_period[0] - 1; i += Signal_period[0]) {
        counter1++;
        const Signal = ResultedSignal.slice(i, i + Signal_period[0] - 1);
        const [Contrast, Imin, Imax] = michelsonContrast(Signal);
        Collect_Data_envelope.push([Contrast, Imin, Imax]);

        const MaxIndex = ResultedSignal.indexOf(Imax) + i - 1;
        const MinIndex = ResultedSignal.indexOf(Imin) + i - 1;

        X_axis_max.push(MaxIndex);
        X_axis_min.push(MinIndex);
    }

    // Handle the remaining part of the signal
    counter1++;
    const Signal = ResultedSignal.slice(i - 1);
    const [Contrast, Imin, Imax] = michelsonContrast(Signal);
    Collect_Data_envelope.push([Contrast, Imin, Imax]);

    const MaxIndex = ResultedSignal.slice(i - 1).indexOf(Imax) + i - 1;
    const MinIndex = ResultedSignal.slice(i - 1).indexOf(Imin) + i - 1;

    X_axis_max.push(MaxIndex);
    X_axis_min.push(MinIndex);

    return { X_axis_max, X_axis_min, Collect_Data_envelope };
}

function michelsonContrast(Signal) {
    // Find the maximum and minimum values in the signal
    const Imax = Math.max(...Signal);
    const Imin = Math.min(...Signal);

    // Calculate the Michelson Contrast
    const Contrast = (Imax - Imin) / (Imax + Imin);

    return [Contrast, Imin, Imax];
}

function interpolation(Crop_X, X_axis_max, Collect_Data_envelope, X_axis_min) {
    // Linear interpolation for maximum values
    const ImgIntervalmax = Array.from({ length: Crop_X }, (_, i) => i + 1);
    let MaxOut = interp1(X_axis_max, Collect_Data_envelope.map(row => row[2]), ImgIntervalmax, 'linear');
    MaxOut = MaxOut.map(value => isNaN(value) ? 0 : value);

    // Linear interpolation for minimum values
    const ImgIntervalmin = Array.from({ length: Crop_X }, (_, i) => i + 1); //= X_axis_min[0]:1:X_axis_min[X_axis_min.length - 1]; 
    let MinOut = interp1(X_axis_min, Collect_Data_envelope.map(row => row[1]), ImgIntervalmin, 'linear');
    MinOut = MinOut.map(value => isNaN(value) ? 1 : value);

    const sizeData = Math.min(MaxOut.length, MinOut.length);
    const interpolationValue = new Array(sizeData).fill(0);

    for (let i = 0; i < sizeData; i++) {
        const Check = MinOut[i] + MaxOut[i];
        interpolationValue[i] = Check > 0 ? (MaxOut[i] - MinOut[i]) / Check : 0;
    }

    return interpolationValue;
}

function interp1(x, y, xi, method = 'linear') {
    if (method !== 'linear') {
        console.warn("Only 'linear' interpolation is currently supported.");
    }

    const result = [];
    for (let i = 0; i < xi.length; i++) {
        const xq = xi[i];
        let j = 0;
        while (j < x.length - 1 && xq > x[j + 1]) {
            j++;
        }

        if (j === x.length - 1) {
            result.push(y[j]); // Extrapolation: Use the last value
        } else if (xq === x[j]) {
            result.push(y[j]);
        } else {
            const slope = (y[j + 1] - y[j]) / (x[j + 1] - x[j]);
            result.push(y[j] + slope * (xq - x[j]));
        }
    }

    return result;
}

function errorBar(interpolationValue, NumOfPixelsPerDegree) {
    const WindowDegrees = 2;
    const BeginRange = Math.round(interpolationValue.length / 2 - (NumOfPixelsPerDegree * (WindowDegrees / 2)));
    const EndRange = Math.round(interpolationValue.length / 2 + (NumOfPixelsPerDegree * (WindowDegrees / 2)));

    const Contrastvalues = interpolationValue.slice(BeginRange, EndRange + 1);

    const S = standardDeviation(Contrastvalues); // Replace with your standard deviation function
    const ContrastValue = mean(Contrastvalues); // Replace with your mean function

    return [ContrastValue, S, -S];
}