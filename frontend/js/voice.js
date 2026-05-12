/* ---------------------------------------------------------
   VOICE XTB 7.9 PRO — AUTO SEKWENCJA + SŁOWA → LICZBY
   --------------------------------------------------------- */

let recognition = null;
let recognizing = false;

let rows = {}; // TICKER|INTERVAL → rekord
const STORAGE_KEY = "voicextb78tabela";

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
        // 🔥 KLUCZOWE — pokazuje aktualny krok po każdym restarcie Chrome
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

function extractNumber(text) {
    return text
        .toLowerCase()
        .replace("przecinek", ".")
        .replace("kropka", ".")
        .replace(/[^0-9\.]/g, "")
        .replace(/\.{2,}/g, ".")
        .trim();
}

function handleRecognized(text) {
   console.log("STEP:", step, "TEXT:", text);
    document.getElementById("recognized").textContent = text;

    const step = steps[currentStep];

    if (step === "ticker") {
        tempRecord.ticker = text.toUpperCase();
    }
    else if (step === "interval") {
        tempRecord.interval = text.toUpperCase();
    }
    else {
        // 🔥 KLUCZ: czyścimy tekst z "dema", "ema", "bema", itp.
        let cleaned = extractNumber(text);
        let num = parseFloat(cleaned);

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
   ZAPIS REKORDU
   --------------------------------------------------------- */

function finalizeRecord() {

    console.log("FINAL RECORD:", tempRecord);

    const key = tempRecord.ticker + "|" + tempRecord.interval;

    const payloadText =
        `${tempRecord.ticker} ${tempRecord.interval} ` +
        `open ${tempRecord.open} ` +
        `low ${tempRecord.low} ` +
        `high ${tempRecord.high} ` +
        `close ${tempRecord.close} ` +
        `ma20 ${tempRecord.ma20} ` +
        `dema9 ${tempRecord.dema9 ?? ""} ` +
        `volume ${tempRecord.volume} ` +
        `rsi ${tempRecord.rsi}`;

    console.log("PAYLOAD:", payloadText);

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

            console.log("BACKEND RESPONSE:", data);

            rows[key] = data;
            saveTable();
            renderTable();

            document.getElementById("comment").textContent =
                `✅ Zapisano rekord ${data.ticker} ${data.interval}`;
        })
        .catch(err => {
            clearTimeout(timeout);

            console.log(err);

            if (err.name === "AbortError") {
                document.getElementById("comment").textContent =
                    "❌ Timeout backendu";
                return;
            }

            document.getElementById("comment").textContent =
                "❌ Błąd połączenia z backendem";
        });

    recognizing = false;

    try { recognition.stop(); } catch (err) {
        console.log(err);
    }
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

    list.sort((a, b) => {
        const pa = signalPriority(a.signal);
        const pb = signalPriority(b.signal);
        return pa - pb;
    });

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

    document.getElementById("popupData").textContent =
        `Sygnał: ${row.signal}\nTP3: ${row.tp3}\nWidełki: ${row.low} – ${row.high}`;

    document.getElementById("popupGeneral").textContent =
        row.comment || "Brak komentarza";

    document.getElementById("popup45").style.display = "block";
}

document.getElementById("popupClose").onclick = () =>
    document.getElementById("popup45").style.display = "none";

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

console.log("VOICE XTB 7.9 PRO — AUTO SEKWENCJA + SŁOWA→LICZBY ZAŁADOWANA");
