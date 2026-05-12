/* ---------------------------------------------------------
   VOICE XTB 4.7 EXACT — SYSTEM 8 STYLE (FULL + CLOSE)
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
let mode = "FULL";
let activeKeyForClose = null;

/* ---------------------------------------------------------
   INIT RECOGNITION — IDENTYCZNE Z SYSTEMEM 8
--------------------------------------------------------- */

function initRecognition() {
    const SR = window.webkitSpeechRecognition || window.SpeechRecognition;

    if (!SR) {
        alert("❌ Brak wsparcia SpeechRecognition");
        return null;
    }

    const rec = new SR();
    rec.lang = "pl-PL";
    rec.continuous = false;      // SYSTEM 8
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
        document.getElementById("comment").textContent = "🎤 Mikrofon aktywny";
    };

    rec.onresult = (e) => {
        const text = e.results[0][0].transcript.trim();
        handleRecognized(text);

        // SYSTEM 8 — zatrzymujemy po rozpoznaniu
        try { recognition.stop(); } catch {}
    };

    rec.onerror = (e) => {
        document.getElementById("comment").textContent = "❌ " + e.error;
        recognizing = false;
    };

    rec.onend = () => {
        if (!recognizing) {
            document.getElementById("comment").textContent = "⛔ Mikrofon zatrzymany";
        }
    };

    return rec;
}

/* ---------------------------------------------------------
   START FULL — SYSTEM 8
--------------------------------------------------------- */

async function startFullMic() {
    recognizing = true;
    mode = "FULL";
    currentStep = 0;
    tempRecord = {};
    activeKeyForClose = null;

    sayStep();

    await navigator.mediaDevices.getUserMedia({ audio: true });

    if (!recognition) recognition = initRecognition();
    if (!recognition) return;

    recognition.start();
}

/* ---------------------------------------------------------
   START CLOSE ONLY — SYSTEM 8
--------------------------------------------------------- */

async function startCloseOnlyMic(key) {
    recognizing = true;
    mode = "CLOSE_ONLY";
    activeKeyForClose = key;

    document.getElementById("comment").textContent = "➡️ Powiedz cenę close";

    await navigator.mediaDevices.getUserMedia({ audio: true });

    if (!recognition) recognition = initRecognition();
    if (!recognition) return;

    recognition.start();
}

/* ---------------------------------------------------------
   STOP — SYSTEM 8
--------------------------------------------------------- */

function stopMic() {
    recognizing = false;
    if (recognition) {
        try { recognition.stop(); } catch {}
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

    document.getElementById("comment").textContent = "➡️ " + map[step];
}

/* ---------------------------------------------------------
   EXTRACT NUMBER — SYSTEM 8
--------------------------------------------------------- */

function extractNumber(text, step = "") {
    text = text.toLowerCase();

    const map = {
        "zero": "0", "jeden": "1", "dwa": "2", "trzy": "3",
        "cztery": "4", "piec": "5", "pięć": "5",
        "szesc": "6", "sześć": "6", "siedem": "7",
        "osiem": "8", "dziewiec": "9", "dziewięć": "9"
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
   HANDLE RECOGNIZED — SYSTEM 8
--------------------------------------------------------- */

function handleRecognized(text) {
    document.getElementById("recognized").textContent = text;

    if (mode === "CLOSE_ONLY") {
        handleCloseOnly(text);
        recognizing = false;
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
        recognizing = false;
        return;
    }

    // SYSTEM 8 — kolejny krok = kolejna sesja mikrofonu
    sayStep();
    setTimeout(() => {
        try { recognition.start(); } catch {}
    }, 300);
}

/* ---------------------------------------------------------
   CLOSE ONLY — SYSTEM 8
--------------------------------------------------------- */

function handleCloseOnly(text) {
    const num = extractNumber(text, "close");
    if (isNaN(num)) {
        document.getElementById("comment").textContent = "❌ Nie rozpoznano liczby";
        return;
    }

    const row = rows[activeKeyForClose];
    if (!row) return;

    const payloadText = `${row.ticker} ${row.interval} close ${num}`;
    sendToBackend(payloadText);
}

/* ---------------------------------------------------------
   FINALIZE FULL — SYSTEM 8
--------------------------------------------------------- */

function finalizeFullRecord() {
    const payloadText =
        `${tempRecord.ticker} ${tempRecord.interval} ` +
        `open ${tempRecord.open} high ${tempRecord.high} ` +
        `low ${tempRecord.low} close ${tempRecord.close} ` +
        `ma20 ${tempRecord.ma20} dema9 ${tempRecord.dema9} ` +
        `volume ${tempRecord.volume} rsi ${tempRecord.rsi}`;

    sendToBackend(payloadText);
}

/* ---------------------------------------------------------
   BACKEND + TABLE (bez zmian)
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
        const key = data.ticker + "|" + data.interval;

        rows[key] = data;
        saveTable();
        renderTable();

        document.getElementById("comment").textContent = "✅ OK";
    } catch (e) {
        document.getElementById("comment").textContent = "❌ Backend error";
    }
}

function saveTable() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function loadTable() {
    rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    renderTable();
}

document.addEventListener("DOMContentLoaded", loadTable);

function deleteRow(key) {
    delete rows[key];
    saveTable();
    renderTable();
}

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

function renderTable() {
    const tbody = document.getElementById("voiceTableBody");
    tbody.innerHTML = "";

    Object.values(rows).forEach(row => {
        const key = row.ticker + "|" + row.interval;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${row.ticker}</td>
            <td>${row.final_signal || ""}</td>
            <td class="clickable-close" onclick="startCloseOnlyMic('${key}')">${row.close || ""}</td>
            <td>${row.tp3 || ""}</td>
            <td>${row.low || ""} - ${row.high || ""}</td>
            <td><button onclick="deleteRow('${key}')">🗑</button></td>
        `;

        applySignalColor(tr, row.final_signal);
        tbody.appendChild(tr);
    });
}

console.log("VOICE XTB 4.7 EXACT — LOADED");
