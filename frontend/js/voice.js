// ======================================================
//  VOICE XTB 6.5 PRO — FINAL VERSION
// ======================================================

const backend = "https://voice-xtb.onrender.com/voice-parse";

let recognition = null;
let recognizing = false;
let currentStep = 0;
let tempRecord = {};

const steps = [
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

// struktura danych: ticker → { M5, M15, H1, meta }
const tickers = {};


// ======================================================
//  START / STOP
// ======================================================

function startFullMic() {
  recognizing = true;
  currentStep = 0;

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  tempRecord = { time: `${hh}:${mm}` };

  sayStep();
  try { recognition.start(); } catch {}
}

function stopMic() {
  recognizing = false;
  try { recognition.stop(); } catch {}
  document.getElementById("comment").textContent = "⛔ Mikrofon zatrzymany";
}


// ======================================================
//  PROMPTY
// ======================================================

function sayStep() {
  const step = steps[currentStep];
  const map = {
    ticker: "Powiedz ticker",
    interval: "Powiedz interwał (M5, M15, H1)",
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

  // ======================================================
//  RECOGNITION — PRZETWARZANIE
// ======================================================

function handleRecognized(text) {
  document.getElementById("recognized").textContent = text;
  const step = steps[currentStep];

  if (step === "ticker" || step === "interval") {
    tempRecord[step] = text.toUpperCase().replace(/\s+/g, "");
  } else {
    const num = extractNumber(text);
    if (!isNaN(num)) tempRecord[step] = num;
  }

  currentStep++;

  if (currentStep >= steps.length) {
    finalizeRecord();
    recognizing = false;
    return;
  }
}

// ======================================================
//  FINALIZACJA — WYSYŁKA DO BACKENDU
// ======================================================
function finalizeRecord() {
  document.getElementById("parsed").textContent =
    JSON.stringify(tempRecord, null, 2);

  document.getElementById("comment").textContent =
    "✔️ Wysyłam do backendu 6.5 PRO";

  fetch(backend, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tempRecord)
  })
    .then(res => res.json())
    .then(data => handleBackendData(data))
    .catch(err => {
      console.error("FRONTEND ERROR:", err);
      document.getElementById("comment").textContent =
        "❌ Błąd frontendu: " + err.message;
    });
}

    


// ======================================================
//  INICJALIZACJA RECOGNITION
// ======================================================

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

  rec.onresult = (e) => {
    const text = e.results[0][0].transcript.trim();
    handleRecognized(text);
    try { recognition.stop(); } catch {}
  };

  rec.onend = () => {
    if (!recognizing) return;
    if (currentStep < steps.length) {
      sayStep();
      setTimeout(() => { try { recognition.start(); } catch {} }, 300);
    }
  };

  return rec;
}

recognition = initRecognition();


// ===============================================
// UTILITY
// ===============================================

function extractNumber(text) {
  text = text.replace(",", ".").replace(/\s+/g, "");
  const num = parseFloat(text);
  return isNaN(num) ? null : num;
}

function normalizeInterval(tf) {
  tf = tf.toUpperCase().trim();
  if (tf === "M5" || tf === "5") return "M5";
  if (tf === "M15" || tf === "15") return "M15";
  if (tf === "H1" || tf === "1H" || tf === "60") return "H1";
  return tf;
}
// ======================================================
//  SYGNAŁ WSPÓLNY (M5 + M15 + H1)
// ======================================================

function consensusSignal(tData) {
  const sigs = [];
  ["M5", "M15", "H1"].forEach(tf => {
    const a = tData[tf];
    if (a && a.signal) sigs.push(a.signal.toUpperCase());
  });

  if (sigs.length === 0) return "RESET";

  const hasBUY = sigs.includes("BUY");
  const hasSELL = sigs.includes("SELL");
  const hasPRAWIE = sigs.includes("PRAWIE BUY");
  const hasCZKDO = sigs.includes("CZEKAJ DO");

  if (hasSELL && !hasBUY) return "SELL";
  if (hasBUY && !hasSELL && !hasCZKDO && !hasPRAWIE) return "BUY";
  if (hasBUY && (hasPRAWIE || hasCZKDO)) return "PRAWIE BUY";
  if (hasCZKDO && !hasBUY) return "CZEKAJ DO";

  return "CZEKAJ";
}


// ======================================================
//  BACKEND → TICKER
// ======================================================

function handleBackendData(d) {
  const tf = normalizeInterval(d.interval || "");
  if (!tf) return;

  const t = (d.ticker || "").toUpperCase();
  if (!t) return;

  if (!tickers[t]) {
    tickers[t] = {
      M5: null,
      M15: null,
      H1: null,
      meta: {
        price: null,
        entry: null,
        lastInterval: null,
        lastTime: null,
        widełki: null,
        tp1: null,
        tp2: null,
        tp3: null
      }
    };
  }

  const low = parseFloat(d.low);
  const high = parseFloat(d.high);
  const close = parseFloat(d.close);

  const analysis = {
    ticker: t,
    interval: tf,
    time: d.time || tempRecord.time,
    entry: d.entry,
    signal: d.signal,
    rsi: d.rsi,
    ma20: d.ma20,
    dema9: d.dema9,
    open: d.open,
    low: d.low,
    high: d.high,
    close: d.close,
    volume: d.volume,
    comment: d.comment
  };

  tickers[t][tf] = analysis;

  const meta = tickers[t].meta;
  if (!isNaN(close)) meta.price = close;
  meta.lastInterval = tf;
  meta.lastTime = analysis.time || "";

  // widełki
  let widełki = null;
  const sigUpper = (d.signal || "").toUpperCase();
  if (["BUY", "PRAWIE BUY", "CZEKAJ DO"].includes(sigUpper)) {
    if (!isNaN(low) && !isNaN(high)) {
      const range = high - low;
      const dol = low + range * 0.20;
      const gor = low + range * 0.35;
      widełki = `${dol.toFixed(2)} – ${gor.toFixed(2)}`;
    }
  }
  meta.widełki = widełki;

  // TP
  let tp1 = null, tp2 = null, tp3 = null;
  if (!isNaN(low) && !isNaN(high) && !isNaN(close)) {
    const range = Math.abs(high - low);
    if (sigUpper === "SELL") {
      tp1 = close - range * 0.5;
      tp2 = close - range * 1.0;
      tp3 = close - range * 1.5;
    } else {
      tp1 = close + range * 0.5;
      tp2 = close + range * 1.0;
      tp3 = close + range * 1.5;
    }
  }
  meta.tp1 = tp1;
  meta.tp2 = tp2;
  meta.tp3 = tp3;

  updateTable();
}

// ======================================================
//  TABELA PRO
// ======================================================

function updateTable() {
  const tbody = document.querySelector("#proTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  Object.keys(tickers).forEach(ticker => {
    const data = tickers[ticker];
    const meta = data.meta || {};
    const tr = document.createElement("tr");

    // Ticker
    const tdTicker = document.createElement("td");
    tdTicker.textContent = ticker;
    tdTicker.classList.add("ticker-cell");
    tdTicker.dataset.ticker = ticker;
    tr.appendChild(tdTicker);

    // Cena
    const tdPrice = document.createElement("td");
    tdPrice.classList.add("price-cell");
    tdPrice.dataset.ticker = ticker;
    tdPrice.textContent =
      meta.price != null ? meta.price.toFixed(2) : "—";
    tr.appendChild(tdPrice);

    // Interwał
    const tdInterval = document.createElement("td");
    tdInterval.textContent =
      (meta.lastInterval || "—") + "  " + (meta.lastTime || "");
    tr.appendChild(tdInterval);

    // Entry
    const tdEntry = document.createElement("td");
    tdEntry.classList.add("entry-cell");
    tdEntry.dataset.ticker = ticker;
    tdEntry.textContent =
      meta.entry != null ? meta.entry.toFixed(2) : "—";
    tr.appendChild(tdEntry);

    // Sygnał
    const tdSignal = document.createElement("td");
    const sig = consensusSignal(data);
    const spanSig = document.createElement("span");
    spanSig.classList.add("signal-text");
    spanSig.textContent = sig;
    spanSig.classList.add("signal-" + sig.toUpperCase().replace(/\s+/g, ""));
    tdSignal.appendChild(spanSig);
    tr.appendChild(tdSignal);

    // Widełki
    const tdWidełki = document.createElement("td");
    tdWidełki.textContent = meta.widełki || "—";
    tr.appendChild(tdWidełki);

    // TP1/TP2/TP3
    const tdTP1 = document.createElement("td");
    tdTP1.textContent =
      meta.tp1 != null ? meta.tp1.toFixed(2) : "—";
    tr.appendChild(tdTP1);

    const tdTP2 = document.createElement("td");
    tdTP2.textContent =
      meta.tp2 != null ? meta.tp2.toFixed(2) : "—";
    tr.appendChild(tdTP2);

    const tdTP3 = document.createElement("td");
    tdTP3.textContent =
      meta.tp3 != null ? meta.tp3.toFixed(2) : "—";
    tr.appendChild(tdTP3);

    // Usuń
    const tdDel = document.createElement("td");
    tdDel.textContent = "🗑️";
    tdDel.classList.add("delete-cell");
    tdDel.dataset.ticker = ticker;
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  });
}


// ======================================================
//  POPUP PREMIUM
// ======================================================

const popup = document.getElementById("popup");
const popupClose = document.getElementById("popupClose");

if (popupClose) {
  popupClose.onclick = () => popup.style.display = "none";
}

window.onclick = (e) => {
  if (e.target === popup) popup.style.display = "none";
};


// ======================================================
//  GENERATOR POPUP PREMIUM
// ======================================================

function buildPopupHTML(ticker, data) {
  const meta = data.meta || {};
  const M5 = data.M5;
  const M15 = data.M15;
  const H1 = data.H1;

  const sig = consensusSignal(data);

  const trend = (() => {
    if (!M15 || !M5) return "Brak danych do oceny trendu.";
    if (M15.close > M15.ma20) return "Trend wzrostowy, korekta świecą spadkową.";
    if (M15.close < M15.ma20) return "Trend spadkowy, ale pojawia się reakcja popytowa.";
    return "Trend neutralny.";
  })();

  const momentum = (() => {
    if (!M5) return "Brak danych.";
    if (M5.rsi < 30) return `RSI ${M5.rsi} = skrajne wyprzedanie.`;
    if (M5.rsi > 70) return `RSI ${M5.rsi} = wykupienie.`;
    return `RSI ${M5.rsi} = neutralne momentum.`;
  })();

  const strength = (() => {
    if (!M5) return "Brak danych.";
    const range = M5.high - M5.low;
    if (range > (M15?.high - M15?.low) * 0.8)
      return "Duży zasięg świecy = wysoka zmienność.";
    return "Średnia zmienność, struktura stabilna.";
  })();

  const supports = (() => {
    if (!M15) return "Brak danych.";
    return `${(M15.low - 2).toFixed(2)}–${(M15.low + 1).toFixed(2)} (lokalne), ${(M15.low - 5).toFixed(2)}–${(M15.low - 3).toFixed(2)} (kluczowe).`;
  })();

  const resistances = (() => {
    if (!M15) return "Brak danych.";
    return `${(M15.high + 3).toFixed(2)}–${(M15.high + 5).toFixed(2)} (VWAP), ${(M15.high + 8).toFixed(2)}–${(M15.high + 10).toFixed(2)} (DEMA9).`;
  })();

  const interpretation = (() => {
    if (sig === "SELL") return "Struktura słaba, przewaga podaży.";
    if (sig === "BUY") return "Struktura wzrostowa, korekty naturalne.";
    if (sig === "PRAWIE BUY") return "Popyt wraca, ale brakuje potwierdzenia.";
    if (sig === "CZEKAJ DO") return "Rynek w punkcie decyzyjnym.";
    return "Neutralnie. Rynek szuka kierunku.";
  })();

  const risk = (() => {
    if (!M15) return "Brak danych.";
    return `Ryzyko rośnie przy zamknięciu M15 poniżej ${(M15.low - 3).toFixed(2)}.`;
  })();

  return `
    <div class="popup-title">${ticker} — analiza M5/M15/H1</div>

    <div class="popup-section">
        <div class="popup-label">TREND</div>
        <div class="popup-text">${trend}</div>
    </div>

    <div class="popup-section">
        <div class="popup-label">MOMENTUM</div>
        <div class="popup-text">${momentum}</div>
    </div>

    <div class="popup-section">
        <div class="popup-label">SIŁA / SŁABOŚĆ</div>
        <div class="popup-text">${strength}</div>
    </div>

    <div class="popup-section">
        <div class="popup-label">WSPARCIA</div>
        <div class="popup-text">${supports}</div>
    </div>

    <div class="popup-section">
        <div class="popup-label">OPORY</div>
        <div class="popup-text">${resistances}</div>
    </div>

    <div class="popup-section">
        <div class="popup-label">INTERPRETACJA</div>
        <div class="popup-text">${interpretation}</div>
    </div>

    <div class="popup-section">
        <div class="popup-label">RYZYKO</div>
        <div class="popup-text">${risk}</div>
    </div>
  `;
}


// ======================================================
//  DELEGACJA KLIKNIĘĆ
// ======================================================

const proTbody = document.querySelector("#proTable tbody");

if (proTbody) {
  proTbody.addEventListener("click", (e) => {

    const tickerCell = e.target.closest(".ticker-cell");
    const delCell = e.target.closest(".delete-cell");
    const priceCell = e.target.closest(".price-cell");
    const entryCell = e.target.closest(".entry-cell");

    // usuń
    if (delCell) {
      const t = delCell.dataset.ticker;
      delete tickers[t];
      updateTable();
      return;
    }

    // popup
    if (tickerCell) {
      const t = tickerCell.dataset.ticker;
      const d = tickers[t];
      if (!d) return;

      document.getElementById("popupBody").innerHTML =
        buildPopupHTML(t, d);

      popup.style.display = "block";
      return;
    }

    // klik w cenę
    if (priceCell) {
      const t = priceCell.dataset.ticker;
      document.getElementById("comment").textContent =
        `ℹ️ Cena ${t} pochodzi z ostatniego close (backend).`;
      return;
    }

    // klik w entry
    if (entryCell) {
      const t = entryCell.dataset.ticker;
      document.getElementById("comment").textContent =
        `ℹ️ Entry dla ${t} na razie z backendu / meta.`;
      return;
    }
  });
  }
