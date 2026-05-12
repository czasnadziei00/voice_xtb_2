/* ---------------------------------------------------------
   VOICE XTB 8.4 PRO — AUTO SEKWENCJA
   --------------------------------------------------------- */

let recognition = null;
let recognizing = false;

let rows = {}; 
const STORAGE_KEY = "voicextb84tabela";

/* ---------------------------------------------------------
   AUTO-SEKWENCJA (zgodna z backendem)
   --------------------------------------------------------- */

const steps = [
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
            setTimeout(() => {
                try { rec.start(); } catch {}
            }, 200);
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
    if (recognition) {
        try { recognition.stop(); } catch {}
    }
}

/* ---------------------------------------------------------
   KOMUNIKATY KROKÓW
   --------------------------------------------------------- */

function sayStep() {
    const step = steps[currentStep];
    const comment = document.getElementById("comment");

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

    comment.textContent = "➡️ " + map[step];
}

/* ---------------------------------------------------------
   WYCIĄGANIE LICZBY — WERSJA 8.4 PRO
   --------------------------------------------------------- */

function extractNumber(text, step = "") {
    text = text.toLowerCase();

    // 🔥 Zamiana słów na cyfry
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

    for (const [word, digit] of Object.entries(map)) {
        text = text.replace(new RegExp(word, "g"), digit);
    }

    text = text.replace("przecinek", ".").replace("kropka", ".");

    // 🔥 RSI zachowuje przecinek
    if (step === "rsi") {
        const m = text.match(/(\d+[.,]?\d*)/);
        if (!m) return NaN;
        return parseFloat(m[1].replace(",", "."));
    }

    // 🔥 Reszta → tylko cyfry
    const digits = text.replace(/[^0-9]/g, "");
    if (!digits) return NaN;

    return parseFloat(digits);
}

/* ---------------------------------------------------------
   HANDLE RECOGNIZED
   --------------------------------------------------------- */

function handleRecognized(text) {
    document.getElementById("recognized").textContent = text;

    const step = steps[currentStep];

    if (step === "ticker") {
        tempRecord.ticker = text.toUpperCase().replace(/\s+/g, "");
    }
    else if (step === "interval") {
        tempRecord.interval = text.toUpperCase().replace(/\s+/g, "");
    }
    else {
        const num = extractNumber(text, step);
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
   FINALIZE RECORD — z pełnym debugiem
   --------------------------------------------------------- */

function finalizeRecord() {
    const key = tempRecord.ticker + "|" + tempRecord.interval;

    const payloadText =
        `${tempRecord.ticker} ${tempRecord.interval} ` +
        `open ${tempRecord.open} ` +
        `high ${tempRecord.high} ` +
        `low ${tempRecord.low} ` +
        `close ${tempRecord.close} ` +
        `ma20 ${tempRecord.ma20} ` +
        `dema9 ${tempRecord.dema9 ?? ""} ` +
        `volume ${tempRecord.volume} ` +
        `rsi ${tempRecord.rsi}`;

    const parsedEl = document.getElementById("parsed");
    if (parsedEl) {
        parsedEl.textContent = "WYSŁANO:\n" + payloadText;
    }

    document.getElementById("comment").textContent =
        "⏳ Wysyłanie do backendu...";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    fetch("https://voice-xtb.onrender.com/voice-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: payloadText }),
        signal: controller.signal
    })
        .then(r => r.json())
        .then(data => {
            clearTimeout(timeout);

            if (parsedEl) {
                parsedEl.textContent =
                    "WYSŁANO:\n" + payloadText +
                    "\n\nODPOWIEDŹ BACKENDU:\n" +
                    JSON.stringify(data, null, 2);
            }

            rows[key] = data;
            saveTable();
            renderTable();

            document.getElementById("comment").textContent =
                `✅ Zapisano rekord ${data.ticker} ${data.interval}`;
        })
        .catch(err => {
            clearTimeout(timeout);

            document.getElementById("comment").textContent =
                err.name === "AbortError"
                    ? "❌ Timeout backendu"
                    : "❌ Błąd połączenia z backendem";
        });

    recognizing = false;
    try { recognition.stop(); } catch {}
}
/* ---------------------------------------------------------
   TABELA
   --------------------------------------------------------- */

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

function renderTable() {
    const tbody = document.getElementById("voiceTableBody");
    tbody.innerHTML = "";

    const list = Object.values(rows);

    list.sort((a, b) => signalPriority(a.signal) - signalPriority(b.signal));

    list.forEach(row => {
        const key = row.ticker + "|" + row.interval;

        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${row.ticker}</td>
            <td>${row.interval}</td>
            <td>${row.close ?? ""}</td>
            <td>${row.entry ?? ""}</td>
            <td>${row.signal || ""}</td>
            <td>${row.tp3 ?? ""}</td>
            <td>${row.low != null && row.high != null ? row.low + " – " + row.high : ""}</td>
            <td><button onclick="openPopup('${key}')">📊</button></td>
            <td><button onclick="deleteRow('${key}')">🗑</button></td>
        `;

        applySignalColor(tr, row.signal, row.entry != null);
        tbody.appendChild(tr);
    });
}

/* ---------------------------------------------------------
   POPUP
   --------------------------------------------------------- */

function openPopup(key) {
    const row = rows[key];
    if (!row) return;

    document.getElementById("popupData").textContent =
        `Sygnał: ${row.signal}\n` +
        `DEMA9: ${row.dema9}\n` +
        `TP3: ${row.tp3}\n` +
        `Widełki: ${row.low} – ${row.high}`;

    document.getElementById("popupGeneral").textContent =
        row.comment || "Brak komentarza";

    document.getElementById("popup45").style.display = "block";
}

document.addEventListener("DOMContentLoaded", () => {
    const closeBtn = document.getElementById("popupClose");
    if (closeBtn) {
        closeBtn.onclick = () =>
            document.getElementById("popup45").style.display = "none";
    }
});

/* ---------------------------------------------------------
   SYGNAŁY
   --------------------------------------------------------- */

function signalPriority(sig) {
    if (!sig) return 99;
    const s = sig.toUpperCase();

    if (s === "BUY") return 1;
    if (s === "PRAWIE BUY") return 2;
    if (s === "CZEKAJ DO BUY" || s === "CZEKAJ DO SELL") return 3;
    if (s === "CZEKAJ") return 4;
    if (s === "PRAWIE RESET") return 5;
    if (s === "RESET") return 6;
    if (s === "PRAWIE SELL") return 7;
    if (s === "SELL") return 8;

    return 99;
}

function applySignalColor(row, signal, hasEntry) {
    row.className = "";

    if (hasEntry) {
        row.classList.add("signal-entry");
        return;
    }

    if (!signal) return;

    const s = signal.toLowerCase();

    if (s === "buy") row.classList.add("signal-buy");
    else if (s === "prawie buy") row.classList.add("signal-prawie-buy");
    else if (s === "sell") row.classList.add("signal-sell");
    else if (s === "prawie sell") row.classList.add("signal-prawie-sell");
    else if (s === "reset") row.classList.add("signal-reset");
    else if (s === "prawie reset") row.classList.add("signal-prawie-reset");
    else if (s === "czekaj") row.classList.add("signal-czekaj");
}

console.log("VOICE XTB 8.4 PRO — ZAŁADOWANA");
