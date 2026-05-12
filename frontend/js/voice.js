/* ---------------------------------------------------------
   VOICE XTB 7.9 PRO — AUTO SEKWENCJA + SŁOWA → LICZBY
   --------------------------------------------------------- */

let recognition = null;
let recognizing = false;

let rows = {}; 
const STORAGE_KEY = "voicextb79tabela";

/* ---------------------------------------------------------
   KONWERTER SŁÓW → LICZBY
   --------------------------------------------------------- */

function wordsToNumber(text) {
    text = text.toLowerCase().trim();

    const map = {
        "zero": 0,
        "jeden": 1, "jedna": 1,
        "dwa": 2, "dwie": 2,
        "trzy": 3,
        "cztery": 4,
        "pięć": 5,
        "sześć": 6,
        "siedem": 7,
        "osiem": 8,
        "dziewięć": 9,
        "dziesięć": 10,
        "jedenaście": 11,
        "dwanaście": 12,
        "trzynaście": 13,
        "czternaście": 14,
        "piętnaście": 15,
        "szesnaście": 16,
        "siedemnaście": 17,
        "osiemnaście": 18,
        "dziewiętnaście": 19,
        "dwadzieścia": 20,
        "trzydzieści": 30,
        "czterdzieści": 40,
        "pięćdziesiąt": 50,
        "sześćdziesiąt": 60,
        "siedemdziesiąt": 70,
        "osiemdziesiąt": 80,
        "dziewięćdziesiąt": 90,
        "sto": 100,
        "dwieście": 200,
        "trzysta": 300,
        "czterysta": 400,
        "pięćset": 500,
        "sześćset": 600,
        "siedemset": 700,
        "osiemset": 800,
        "dziewięćset": 900,
        "tysiąc": 1000,
        "tysiące": 1000,
        "tysięcy": 1000
    };

    let parts = text.split(" ");
    let total = 0;
    let current = 0;

    for (let w of parts) {
        if (map[w] >= 1000) {
            current = (current || 1) * map[w];
            total += current;
            current = 0;
        } else if (map[w] >= 100) {
            current += map[w];
        } else if (map[w] >= 0) {
            current += map[w];
        }
    }

    return total + current;
}

/* ---------------------------------------------------------
   AUTO-SEKWENCJA
   --------------------------------------------------------- */

const steps = [
    "ticker",
    "interval",
    "open",
    "low",
    "high",
    "close",
    "ma20",
    "dema9",
    "volume",
    "rsi"
];

let currentStep = 0;
let tempRecord = {};

/* ---------------------------------------------------------
   MIKROFON
   --------------------------------------------------------- */

function initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        alert("Twoja przeglądarka nie wspiera rozpoznawania mowy.");
        return null;
    }

    const rec = new SR();
    rec.lang = "pl-PL";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
        sayStep();
    };

    rec.onresult = (e) => {
        const text = e.results[0][0].transcript.trim();
        handleRecognized(text);
    };

    rec.onerror = (e) => {
        document.getElementById("comment").textContent =
            "❌ Błąd mikrofonu: " + e.error;
    };

    rec.onend = () => {
        if (recognizing) {
            setTimeout(() => { try { rec.start(); } catch {} }, 200);
        } else {
            document.getElementById("comment").textContent =
                "⛔ Mikrofon zatrzymany";
        }
    };

    return rec;
}

function startMic() {
    if (!recognition) recognition = initRecognition();
    if (!recognition) return;

    recognizing = true;
    currentStep = 0;
    tempRecord = {};

    sayStep();
    try { recognition.start(); } catch {}
}

function stopMic() {
    recognizing = false;
    if (recognition) try { recognition.stop(); } catch {}
}

/* ---------------------------------------------------------
   OBSŁUGA AUTO-SEKWENCJI
   --------------------------------------------------------- */

function sayStep() {
    const step = steps[currentStep];
    const comment = document.getElementById("comment");

    const map = {
        ticker: "Powiedz ticker",
        interval: "Powiedz interwał",
        open: "Powiedz open",
        low: "Powiedz low",
        high: "Powiedz high",
        close: "Powiedz close",
        ma20: "Powiedz MA20",
        dema9: "Powiedz DEMA9",
        volume: "Powiedz wolumen",
        rsi: "Powiedz RSI"
    };

    comment.textContent = "➡️ " + map[step];
}

function handleRecognized(text) {
    document.getElementById("recognized").textContent = text;

    const step = steps[currentStep];

    if (step === "ticker") {
        tempRecord.ticker = text.toUpperCase();
    }
    else if (step === "interval") {
        tempRecord.interval = text.toUpperCase();
    }
    else {
        let num = parseFloat(text.replace(",", "."));

        if (isNaN(num)) {
            num = wordsToNumber(text);
        }

        if (!isNaN(num)) {
            tempRecord[step] = num;
        }
    }

    currentStep++;

    if (currentStep >= steps.length) {
        finalizeRecord();
        return;
    }

    sayStep();
}

/* ---------------------------------------------------------
   ZAPIS REKORDU — POPRAWKA DEMA9
   --------------------------------------------------------- */

function finalizeRecord() {
    const key = tempRecord.ticker + "|" + tempRecord.interval;

    const payloadText =
        `${tempRecord.ticker} ${tempRecord.interval} ` +
        `open ${tempRecord.open} low ${tempRecord.low} high ${tempRecord.high} ` +
        `close ${tempRecord.close} ma20 ${tempRecord.ma20} ` +
        `dema9 ${tempRecord.dema9 ?? ""} volume ${tempRecord.volume} rsi ${tempRecord.rsi}`;

    fetch("https://voice-xtb.onrender.com/voice-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: payloadText })
    })
        .then(r => r.json())
        .then(data => {
            rows[key] = data;
            saveTable();
            renderTable();

            document.getElementById("comment").textContent =
                `✅ Zapisano rekord ${data.ticker} ${data.interval}`;
        })
        .catch(() => {
            document.getElementById("comment").textContent =
                "❌ Błąd połączenia z backendem";
        });

    recognizing = false;
    try { recognition.stop(); } catch {}
}

console.log("VOICE XTB 7.9 PRO — DEMA FIX ZAŁADOWANY");
