/* ---------------------------------------------------------
   VOICE XTB 4.6 FINAL — jeden wiersz na ticker
   backend: https://voice-xtb.onrender.com/voice-parse
   --------------------------------------------------------- */

let recognition = null;
let recognizing = false;

let rows = {};
const STORAGE_KEY = "voicextb46_tabela";

/* ---------------------------------------------------------
   AUTO-SEKWENCJA PEŁNA (do pierwszego wprowadzenia tickera)
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
let mode = "FULL"; // FULL albo CLOSE_ONLY
let activeKeyForClose = null; // ticker|interval dla trybu CLOSE_ONLY

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
            // w trybie sekwencji pełnej możemy restartować
            if (mode === "FULL") {
                setTimeout(() => {
                    try { rec.start(); } catch {}
                }, 200);
            } else {
                document.getElementById("comment").textContent = "⛔ Mikrofon zatrzymany";
            }
        } else {
            document.getElementById("comment").textContent = "⛔ Mikrofon zatrzymany";
        }
    };

    return rec;
}

function startFullMic() {
    if (!recognition) recognition = initRecognition();
    if (!recognition) return;

    recognizing = true;
    mode = "FULL";
    currentStep = 0;
    tempRecord = {};
    activeKeyForClose = null;

    sayStep();
    try { recognition.start(); } catch {}
}

function startCloseOnlyMic(key) {
    if (!recognition) recognition = initRecognition();
    if (!recognition) return;

    recognizing = true;
    mode = "CLOSE_ONLY";
    activeKeyForClose = key;
    tempRecord = {};

    document.getElementById("comment").textContent = "➡️ Powiedz cenę bieżącą (close)";
    try { recognition.start(); } catch {}
}

function stopMic() {
    recognizing = false;
    if (recognition) try { recognition.stop(); } catch {}
}

/* ---------------------------------------------------------
   KOMUNIKATY KROKÓW (FULL)
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
    document.getElementById("comment").textContent = "➡️ " + (map[step] || "");
}

/* ---------------------------------------------------------
   WYCIĄGANIE LICZBY — 4.6 FINAL
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

    if (step === "rsi") {
        const m = text.match(/(\d+[.,]?\d*)/);
        if (!m) return NaN;
        return parseFloat(m[1].replace(",", "."));
    }

    if (["open", "high", "low", "close", "ma20", "dema9"].includes(step)) {
        const m = text.match(/(\d+[.,]?\d*)/);
        if (!m) return NaN;
        let val = parseFloat(m[1].replace(",", "."));
        if (val > 2000) val = val / 100;
        return val;
    }

    const digits = text.replace(/[^0-9]/g, "");
    if (!digits) return NaN;
    return parseFloat(digits);
}

/* ---------------------------------------------------------
   HANDLE RECOGNIZED
   --------------------------------------------------------- */

function handleRecognized(text) {
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
   TRYB CLOSE_ONLY — tylko aktualna cena
   --------------------------------------------------------- */

function handleCloseOnly(text) {
    if (!activeKeyForClose || !rows[activeKeyForClose]) {
        document.getElementById("comment").textContent =
            "❌ Brak aktywnego rekordu do aktualizacji ceny.";
        recognizing = false;
        try { recognition.stop(); } catch {}
        return;
    }

    const num = extractNumber(text, "close");
    if (isNaN(num)) {
        document.getElementById("comment").textContent =
            "❌ Nie rozpoznano liczby dla ceny bieżącej.";
        recognizing = false;
        try { recognition.stop(); } catch {}
        return;
    }

    const row = rows[activeKeyForClose];
    const ticker = row.ticker;
    const interval = row.interval || "M5";

    const payloadText =
        `${ticker} ${interval} close ${num}`;

    const parsedEl = document.getElementById("parsed");
    if (parsedEl) parsedEl.textContent = "WYSŁANO (CLOSE ONLY):\n" + payloadText;

    document.getElementById("comment").textContent = "⏳ Aktualizacja ceny w backendzie...";

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
                    "WYSŁANO (CLOSE ONLY):\n" + payloadText +
                    "\n\nODPOWIEDŹ BACKENDU:\n" +
                    JSON.stringify(data, null, 2);
            }

            const key = data.ticker + "|" + (data.interval || "M5");
            rows[key] = data;
            saveTable();
            renderTable();

            document.getElementById("comment").textContent =
                `✅ Zaktualizowano cenę ${data.ticker} ${data.interval}`;
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
   FINALIZE RECORD — pełne wprowadzenie tickera
   --------------------------------------------------------- */

function finalizeFullRecord() {
    const key = tempRecord.ticker + "|" + tempRecord.interval;

    if (tempRecord.volume === undefined) tempRecord.volume = 0;

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
    if (parsedEl) parsedEl.textContent = "WYSŁANO:\n" + payloadText;

    document.getElementById("comment").textContent = "⏳ Wysyłanie do backendu...";

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

            const key = data.ticker + "|" + (data.interval || "M5");
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
/* ---------------------------------------------------------
   TABELA — jeden wiersz FINAL na ticker
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

/* ---------------------------------------------------------
   RENDER TABELI — JEDEN WIERSZ FINAL
   --------------------------------------------------------- */

function renderTable() {
    const tbody = document.getElementById("voiceTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const list = Object.values(rows);

    // sortowanie po sygnale FINAL
    list.sort((a, b) => signalPriority(a.final_signal) - signalPriority(b.final_signal));

    list.forEach(row => {
        const key = row.ticker + "|" + (row.interval || "M5");

        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${row.ticker}</td>
            <td>${row.final_signal || ""}</td>
            <td class="clickable-close" onclick="startCloseOnlyMic('${key}')">
                ${row.close ?? ""}
            </td>
            <td>${row.tp3 ?? ""}</td>
            <td>${
                row.low != null && row.high != null
                    ? row.low + " – " + row.high
                    : ""
            }</td>
            <td><button onclick="openPopup('${key}')">📊</button></td>
            <td><button onclick="deleteRow('${key}')">🗑</button></td>
        `;

        applySignalColor(tr, row.final_signal);
        tbody.appendChild(tr);
    });
}

/* ---------------------------------------------------------
   POPUP — pełna analiza FINAL
   --------------------------------------------------------- */

function openPopup(key) {
    const row = rows[key];
    if (!row) return;

    document.getElementById("popupData").textContent =
        `Sygnał FINAL: ${row.final_signal}\n` +
        `Close: ${row.close}\n` +
        `TP3: ${row.tp3}\n` +
        `Widełki: ${row.low} – ${row.high}`;

    document.getElementById("popupGeneral").textContent =
        row.comment || "Brak komentarza (momentum/RSI/korelacja)";

    document.getElementById("popup45").style.display = "block";
}

document.addEventListener("DOMContentLoaded", () => {
    const closeBtn = document.getElementById("popupClose");
    if (closeBtn) {
        closeBtn.onclick = () =>
            (document.getElementById("popup45").style.display = "none");
    }
});

/* ---------------------------------------------------------
   PRIORYTETY SYGNAŁU FINAL
   --------------------------------------------------------- */

function signalPriority(sig) {
    if (!sig) return 99;
    const s = sig.toUpperCase();

    if (s === "BUY") return 1;
    if (s === "PRAWIE BUY") return 2;
    if (s === "CZEKAJ") return 3;
    if (s === "PRAWIE SELL") return 4;
    if (s === "SELL") return 5;
    if (s === "RESET") return 6;

    return 99;
}

/* ---------------------------------------------------------
   KOLORY SYGNAŁÓW FINAL
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

console.log("VOICE XTB 4.6 FINAL — ZAŁADOWANA");
    recognizing = false;
    try { recognition.stop(); } catch {}
}
