/* ---------------------------------------------------------
   VOICE XTB 4.6 FINAL — FIX MICROPHONE VERSION
   --------------------------------------------------------- */

let recognition = null;
let recognizing = false;

let rows = {};
const STORAGE_KEY = "voicextb46_tabela";

/* ---------------------------------------------------------
   AUTO-SEKWENCJA PEŁNA
   --------------------------------------------------------- */

const fullSteps = [
    "ticker",
    "interval",
    "open",
    "high",
    "low",
    "close",
    "ma20",
    "dema9",
    "volume",
    "rsi"
];

let currentStep = 0;
let tempRecord = {};
let mode = "FULL";
let activeKeyForClose = null;

/* ---------------------------------------------------------
   MIKROFON
   --------------------------------------------------------- */

function initRecognition() {

    const SR =
        window.webkitSpeechRecognition ||
        window.SpeechRecognition;

    console.log("SpeechRecognition =", SR);

    if (!SR) {

        alert("❌ Twoja przeglądarka nie wspiera rozpoznawania mowy.");
        return null;
    }

    const rec = new SR();

    rec.lang = "pl-PL";

    // KLUCZOWE
    rec.continuous = false;

    rec.interimResults = false;
    rec.maxAlternatives = 1;

    /* ---------------------------------------------------------
       DEBUG
       --------------------------------------------------------- */

    rec.onstart = () => {

        console.log("🎤 MICROPHONE START");

        document.getElementById("comment").textContent =
            "🎤 Mikrofon aktywny";
    };

    rec.onaudiostart = () => {
        console.log("AUDIO START");
    };

    rec.onsoundstart = () => {
        console.log("SOUND START");
    };

    rec.onspeechstart = () => {
        console.log("SPEECH START");
    };

    rec.onresult = (e) => {

        console.log("RESULT EVENT", e);

        const text =
            e.results[0][0].transcript.trim();

        handleRecognized(text);
    };

    rec.onerror = (e) => {

        console.error("MIC ERROR:", e);

        document.getElementById("comment").textContent =
            "❌ Błąd mikrofonu: " + e.error;
    };

    rec.onend = () => {

        console.log("🎤 MICROPHONE END");

        if (recognizing && mode === "FULL") {

            setTimeout(() => {

                try {

                    recognition.start();

                } catch (e) {

                    console.error("RESTART ERROR:", e);
                }

            }, 300);

        } else {

            document.getElementById("comment").textContent =
                "⛔ Mikrofon zatrzymany";
        }
    };

    return rec;
}

/* ---------------------------------------------------------
   START FULL
   --------------------------------------------------------- */

async function startFullMic() {

    console.log("START FULL MIC");

    if (!recognition)
        recognition = initRecognition();

    if (!recognition)
        return;

    try {

        // WAŻNE:
        // wymusza permission prompt

        await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        recognizing = true;

        mode = "FULL";

        currentStep = 0;

        tempRecord = {};

        activeKeyForClose = null;

        sayStep();

        recognition.start();

    } catch (e) {

        console.error("START ERROR:", e);

        document.getElementById("comment").textContent =
            "❌ Nie można uruchomić mikrofonu";
    }
}

/* ---------------------------------------------------------
   START CLOSE ONLY
   --------------------------------------------------------- */

async function startCloseOnlyMic(key) {

    console.log("START CLOSE MIC");

    if (!recognition)
        recognition = initRecognition();

    if (!recognition)
        return;

    try {

        await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        recognizing = true;

        mode = "CLOSE_ONLY";

        activeKeyForClose = key;

        tempRecord = {};

        document.getElementById("comment").textContent =
            "➡️ Powiedz cenę close";

        recognition.start();

    } catch (e) {

        console.error("START CLOSE ERROR:", e);

        document.getElementById("comment").textContent =
            "❌ Mikrofon zablokowany";
    }
}

/* ---------------------------------------------------------
   STOP
   --------------------------------------------------------- */

function stopMic() {

    console.log("STOP MIC");

    recognizing = false;

    if (recognition) {

        try {

            recognition.stop();

        } catch (e) {

            console.error("STOP ERROR:", e);
        }
    }
}

/* ---------------------------------------------------------
   KROKI
   --------------------------------------------------------- */

function sayStep() {

    const step = fullSteps[currentStep];

    const map = {

        ticker: "Powiedz ticker",
        interval: "Powiedz interwał",
        open: "Powiedz open",
        high: "Powiedz high",
        low: "Powiedz low",
        close: "Powiedz close",
        ma20: "Powiedz ma20",
        dema9: "Powiedz dema9",
        volume: "Powiedz wolumen",
        rsi: "Powiedz rsi"
    };

    document.getElementById("comment").textContent =
        "➡️ " + (map[step] || "");
}

/* ---------------------------------------------------------
   EXTRACT NUMBER
   --------------------------------------------------------- */

function extractNumber(text, step = "") {

    text = text.toLowerCase();

    const map = {

        "zero": "0",
        "jeden": "1",
        "dwa": "2",
        "trzy": "3",
        "cztery": "4",
        "piec": "5",
        "pięć": "5",
        "szesc": "6",
        "sześć": "6",
        "siedem": "7",
        "osiem": "8",
        "dziewiec": "9",
        "dziewięć": "9"
    };

    for (const [w, d] of Object.entries(map)) {

        text =
            text.replace(new RegExp(w, "g"), d);
    }

    text =
        text.replace("przecinek", ".")
            .replace("kropka", ".");

    const m =
        text.match(/(\d+[.,]?\d*)/);

    if (!m)
        return NaN;

    let val =
        parseFloat(m[1].replace(",", "."));

    if (
        ["open", "high", "low", "close", "ma20", "dema9"]
            .includes(step)
    ) {

        if (val > 2000)
            val = val / 100;
    }

    return val;
}

/* ---------------------------------------------------------
   HANDLE RECOGNIZED
   --------------------------------------------------------- */

function handleRecognized(text) {

    console.log("RECOGNIZED:", text);

    const recEl =
        document.getElementById("recognized");

    if (recEl)
        recEl.textContent = text;

    if (mode === "CLOSE_ONLY") {

        handleCloseOnly(text);
        return;
    }

    const step =
        fullSteps[currentStep];

    if (step === "ticker") {

        tempRecord.ticker =
            text.toUpperCase()
                .replace(/\s+/g, "");

    } else if (step === "interval") {

        tempRecord.interval =
            text.toUpperCase()
                .replace(/\s+/g, "");

    } else {

        const num =
            extractNumber(text, step);

        if (!isNaN(num))
            tempRecord[step] = num;
    }

    currentStep++;

    if (currentStep >= fullSteps.length) {

        finalizeFullRecord();
        return;
    }

    sayStep();
}

/* ---------------------------------------------------------
   CLOSE ONLY
   --------------------------------------------------------- */

function handleCloseOnly(text) {

    console.log("CLOSE ONLY:", text);

    recognizing = false;

    try {

        recognition.stop();

    } catch (e) {

        console.error(e);
    }
}

/* ---------------------------------------------------------
   FINALIZE
   --------------------------------------------------------- */

function finalizeFullRecord() {

    console.log("FINAL RECORD:", tempRecord);

    recognizing = false;

    try {

        recognition.stop();

    } catch (e) {

        console.error(e);
    }

    document.getElementById("comment").textContent =
        "✅ Dane odebrane";
}

/* ---------------------------------------------------------
   STORAGE
   --------------------------------------------------------- */

function saveTable() {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(rows)
    );
}

function loadTable() {

    rows =
        JSON.parse(
            localStorage.getItem(STORAGE_KEY) || "{}"
        );
}

document.addEventListener(
    "DOMContentLoaded",
    loadTable
);

console.log("VOICE XTB 4.6 FIX LOADED");
