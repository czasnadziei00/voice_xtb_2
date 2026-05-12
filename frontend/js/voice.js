/* ---------------------------------------------------------
   VOICE XTB 4.7 MOBILE — FULL + CLOSE
--------------------------------------------------------- */

let recognition = null;
let recognizing = false;

let rows = {};
const STORAGE_KEY = "voicextb46_tabela";

/* ---------------------------------------------------------
   FULL FLOW
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
let mode = "FULL";          // "FULL" | "CLOSE_ONLY"
let activeKeyForClose = null;

/* ---------------------------------------------------------
   INIT RECOGNITION (ANDROID SAFE)
--------------------------------------------------------- */

function initRecognition() {
    const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
    console.log("SpeechRecognition =", SR);

    if (!SR) {
        alert("❌ Twoja przeglądarka nie wspiera rozpoznawania mowy.");
        return null;
    }

    const rec = new SR();
    rec.lang = "pl-PL";

    // ANDROID SAFE: continuous = false
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
        console.log("🎤 START");
        document.getElementById("comment").textContent = "🎤 Mikrofon aktywny";
    };

    rec.onresult = (e) => {
        const text = e.results[0][0].transcript.trim();
        console.log("RESULT:", text);
        handleRecognized(text);
        // UWAGA: NIE zatrzymujemy tu mikrofonu
    };

    rec.onerror = (e) => {
        console.log("MIC ERROR:", e);
        document.getElementById("comment").textContent = "❌ " + e.error;
        recognizing = false;
    };

    rec.onend = () => {
        console.log("🎤 END");

        if (recognizing) {
            // AUTO-RESTART — tylko gdy dalej jesteśmy w trybie nasłuchu
            setTimeout(() => {
                try {
                    recognition.start();
                } catch (e) {
                    console.log("RESTART ERROR:", e);
                    recognizing = false;
                    document.getElementById("comment").textContent = "⛔ Mikrofon zatrzymany";
                }
            }, 350);
        } else {
            document.getElementById("comment").textContent = "⛔ Mikrofon zatrzymany";
        }
    };

    return rec;
}

/* ---------------------------------------------------------
   SAFE START (WYMUSZA UPRAWNIENIA)
--------------------------------------------------------- */

async function safeStartRecognition() {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });

        if (!recognition) recognition = initRecognition();
        if (!recognition) return;

        recognition.start();
    } catch (e) {
        console.log("GETUSERMEDIA ERROR:", e);
        document.getElementById("comment").textContent = "❌ Brak dostępu do mikrofonu";
        recognizing = false;
    }
}

/* ---------------------------------------------------------
   START FULL
--------------------------------------------------------- */

async function startFullMic() {
    console.log("START FULL MIC");

    recognizing = true;
    mode = "FULL";
    currentStep = 0;
    tempRecord = {};
    activeKeyForClose = null;

    sayStep();
    await safeStartRecognition();
}

/* ---------------------------------------------------------
   START CLOSE ONLY
--------------------------------------------------------- */

async function startCloseOnlyMic(key) {
    console.log("START CLOSE MIC", key);

    recognizing = true;
    mode = "CLOSE_ONLY";
    activeKeyForClose = key;
    tempRecord = {};

    document.getElementById("comment").textContent = "➡️ Powiedz cenę close";
    await safeStartRecognition();
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
            console.log("STOP ERROR:", e);
        }
    }
}

/* ---------------------------------------------------------
   STEP LABELS
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
        volume: "Powiedz volume",
        rsi: "Powiedz rsi"
    };

    document.getElementById("comment").textContent = "➡️ " + (map[step] || "");
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
        text = text.replace(new RegExp(w, "g"), d);
    }

    text = text.replace("przecinek", ".").replace("kropka", ".");

    const m = text.match(/(\d+[.,]?\d*)/);
    if (!m) return NaN;

    let val = parseFloat(m[1].replace(",", "."));

    if (["open", "high", "low", "close", "ma20", "dema9"].includes(step)) {
        if (val > 2000) val = val / 100;
    }

    return val;
}

/* ---------------------------------------------------------
   HANDLE RECOGNIZED
--------------------------------------------------------- */

function handleRecognized(text) {
    console.log("RECOGNIZED:", text);

    const recEl = document.getElementById("recognized");
    if (recEl) recEl.textContent = text;

    if (mode === "CLOSE_ONLY") {
        handleCloseOnly(text);
        return;
    }

    const step = fullSteps[currentStep];

    if (step === "ticker") {
        tempRecord.ticker = text.toUpperCase().replace(/\s+/g, "");
    } else if (step === "interval") {
        tempRecord.interval = text.toUpperCase().replace(/\s+/g, "");
    } else {
        const num = extractNumber(text, step);
        if (!isNaN(num)) tempRecord[step] = num;
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

    const num = extractNumber(text, "close");
    if (isNaN(num)) {
        document.getElementById("comment").textContent = "❌ Nie rozpoznano liczby";
        recognizing = false;
        return;
    }

    const row = rows[activeKeyForClose];
    if (!row) {
        recognizing = false;
        return;
    }

    const payloadText = `${row.ticker} ${row.interval || "M5"} close ${num}`;
    sendToBackend(payloadText);
    recognizing = false;
}

/* ---------------------------------------------------------
   FINALIZE FULL
--------------------------------------------------------- */

function finalizeFullRecord() {
    console.log("FINAL RECORD:", tempRecord);

    recognizing = false;

    const payloadText =
        `${tempRecord.ticker} ${tempRecord.interval} ` +
        `open ${tempRecord.open} ` +
        `high ${tempRecord.high} ` +
        `low ${tempRecord.low} ` +
        `close ${tempRecord.close} ` +
        `ma20 ${tempRecord.ma20} ` +
        `dema9 ${tempRecord.dema9} ` +
        `volume ${tempRecord.volume} ` +
        `rsi ${tempRecord.rsi}`;

    sendToBackend(payloadText);
}

/* ---------------------------------------------------------
   SEND BACKEND
--------------------------------------------------------- */

async function sendToBackend(payloadText) {
    document.getElementById("parsed").textContent = payloadText;
    document.getElementById("comment").textContent = "⏳ Backend...";

    try {
        const r = await fetch("https://voice-xtb.onrender.com/voice-parse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: payloadText })
        });

        const data = await r.json();

        const key = data.ticker + "|" + (data.interval || "M5");
        rows[key] = data;

        saveTable();
        renderTable();

        document.getElementById("comment").textContent = "✅ OK";
    } catch (e) {
        console.log("BACKEND ERROR:", e);
        document.getElementById("comment").textContent = "❌ Backend error";
    }
}

/* ---------------------------------------------------------
   STORAGE
--------------------------------------------------------- */

function saveTable() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function loadTable() {
    rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    renderTable();
}

document.addEventListener("DOMContentLoaded", loadTable);

/* ---------------------------------------------------------
   DELETE
--------------------------------------------------------- */

function deleteRow(key) {
    delete rows[key];
    saveTable();
    renderTable();
}

/* ---------------------------------------------------------
   SIGNAL COLORS
--------------------------------------------------------- */

function applySignalColor(row, signal) {
    row.className = "";
    if (!signal) return;

    const s = signal.toLowerCase();

    if (s === "buy") row.classList.add("signal-buy");
    else if (s === "prawie buy") row.classList.add("signal-prawie-buy");
    else if (s === "sell") row.classList.add("signal-sell");
    else if (s === "prawie sell") row.classList.add("signal-prawie-sell");
    else if (s === "reset") row.classList.add("signal-reset");
    else if (s === "czekaj") row.classList.add("signal-czekaj");
}

/* ---------------------------------------------------------
   TABLE
--------------------------------------------------------- */

function renderTable() {
    const tbody = document.getElementById("voiceTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    Object.values(rows).forEach(row => {
        const key = row.ticker + "|" + (row.interval || "M5");

        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${row.ticker}</td>
            <td>${row.final_signal || ""}</td>
            <td class="clickable-close" onclick="startCloseOnlyMic('${key}')">
                ${row.close ?? ""}
            </td>
            <td>${row.tp3 ?? ""}</td>
            <td>${row.low ?? ""} - ${row.high ?? ""}</td>
            <td>
                <button onclick="deleteRow('${key}')">🗑</button>
            </td>
        `;

        applySignalColor(tr, row.final_signal);
        tbody.appendChild(tr);
    });
}

console.log("VOICE XTB 4.7 MOBILE — LOADED");
