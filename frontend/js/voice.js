// =========================
//   VOICE XTB 6.5 PRO
//   MA20 + VOLUME + SYSTEM 8
//   backend: voice-parse (6.5 PRO)
// =========================

let recognition = null;
let recognizing = false;
let mode = null;

let currentStep = 0;
let tempRecord = {};

// KROKI GŁOSOWE – Z WOLUMENEM
const fullSteps = [
    "ticker",
    "interval",
    "open",
    "low",
    "high",
    "close",
    "volume",
    "ma20",
    "dema9",
    "rsi"
];

// =========================
//   START FULL
// =========================
function startFullMic() {
    mode = "FULL";
    recognizing = true;
    currentStep = 0;

    // time automatycznie (HH:MM)
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");

    tempRecord = {
        time: `${hh}:${mm}`
    };

    sayStep();

    try { recognition.start(); } catch {}
}

// =========================
//   STOP
// =========================
function stopMic() {
    recognizing = false;
    try { recognition.stop(); } catch {}
    document.getElementById("comment").textContent = "⛔ Mikrofon zatrzymany";
}

// =========================
//   SAY STEP
// =========================
function sayStep() {
    const step = fullSteps[currentStep];
    const map = {
        ticker: "Powiedz ticker",
        interval: "Powiedz interwał",
        open: "Powiedz open",
        low: "Powiedz low",
        high: "Powiedz high",
        close: "Powiedz close",
        volume: "Powiedz wolumen",
        ma20: "Powiedz MA20",
        dema9: "Powiedz DEMA9",
        rsi: "Powiedz RSI"
    };

    document.getElementById("comment").textContent = "➡️ " + map[step];
}

// =========================
//   HANDLE RECOGNIZED
// =========================
function handleRecognized(text) {
    document.getElementById("recognized").textContent = text;

    const step = fullSteps[currentStep];

    if (step === "ticker") {
        tempRecord.ticker = text.toUpperCase().replace(/\s+/g, "");
    } else if (step === "interval") {
        tempRecord.interval = text.toUpperCase().replace(/\s+/g, "");
    } else {
        const num = extractNumber(text);
        if (!isNaN(num)) tempRecord[step] = num;
    }

    currentStep++;

    if (currentStep >= fullSteps.length) {
        finalizeFullRecord();
        recognizing = false;
        return;
    }
}

// =========================
//   FINALIZE
// =========================
function finalizeFullRecord() {
    document.getElementById("parsed").textContent = JSON.stringify(tempRecord, null, 2);
    document.getElementById("comment").textContent =
        "✔️ Zakończono sekwencję — wysyłam do backendu 6.5 PRO";

    // `backend` jest zdefiniowany w main.js 6.5 PRO
    fetch(backend, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tempRecord)
    })
    .then(res => res.json())
    .then(data => {
        handleParsedData(data);   // główna funkcja 6.5 PRO
    })
    .catch(err => {
        console.error(err);
        document.getElementById("comment").textContent = "❌ Błąd backendu 6.5 PRO";
    });
}

// =========================
//   INIT RECOGNITION
// =========================
function initRecognition() {
    const SR = window.webkitSpeechRecognition || window.SpeechRecognition;

    if (!SR) {
        alert("❌ Brak wsparcia SpeechRecognition");
        return null;
    }

    const rec = new SR();
    rec.lang = "pl-PL";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {};

    rec.onresult = (e) => {
        const text = e.results[0][0].transcript.trim();
        handleRecognized(text);

        try { recognition.stop(); } catch {}
    };

    rec.onerror = (e) => {
        document.getElementById("comment").textContent = "❌ " + e.error;
        recognizing = false;
    };

    rec.onend = () => {
        if (!recognizing) {
            document.getElementById("comment").textContent = "⛔ Mikrofon zatrzymany";
            return;
        }

        if (mode === "FULL" && currentStep < fullSteps.length) {
            sayStep();
            setTimeout(() => {
                try { recognition.start(); } catch {}
            }, 300);
        }
    };

    return rec;
}

recognition = initRecognition();

// =========================
//   EXTRACT NUMBER
// =========================
function extractNumber(text) {
    text = text.replace(",", ".").replace(/\s+/g, "");
    const num = parseFloat(text);
    return isNaN(num) ? null : num;
}
