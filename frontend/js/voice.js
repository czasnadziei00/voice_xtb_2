// VOICE XTB 6.5 PRO MULTI-TF (M5/M15/H1, tabela PRO)

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

// pamięć: ticker -> { M5: analysis, M15: analysis, H1: analysis, meta: {...} }
const tickers = {};

// ====== SPEECH ======

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
}

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
    .catch(() => {
      document.getElementById("comment").textContent = "❌ Błąd backendu";
    });
}

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

function extractNumber(text) {
  text = text.replace(",", ".").replace(/\s+/g, "");
  const num = parseFloat(text);
  return isNaN(num) ? null : num;
}

// ====== LOGIKA MULTI-TF ======

function normalizeInterval(interval) {
  const iv = (interval || "").toUpperCase();
  if (iv === "M5") return "M5";
  if (iv === "M15") return "M15";
  if (iv === "H1" || iv === "1H") return "H1";
  return null;
}

// prosta logika sygnału wspólnego M5/M15/H1
function consensusSignal(tData) {
  const sigs = [];
  ["M5", "M15", "H1"].forEach(tf => {
    const a = tData[tf];
    if (a && a.signal) sigs.push(a.signal.toUpperCase());
  });
  if (sigs.length === 0) return "RESET";

  const hasBUY = sigs.some(s => s === "BUY");
  const hasSELL = sigs.some(s => s === "SELL");
  const hasCZKDO = sigs.some(s => s === "CZEKAJ DO");
  const hasPRAWIE = sigs.some(s => s === "PRAWIE BUY");

  if (hasSELL && !hasBUY) return "SELL";
  if (hasBUY && !hasSELL && !hasCZKDO && !hasPRAWIE) return "BUY";
  if (hasBUY && (hasCZKDO || hasPRAWIE)) return "PRAWIE BUY";
  if (hasCZKDO && !hasBUY) return "CZEKAJ DO";

  return "CZEKAJ";
}

function handleBackendData(d) {
  // backend: ticker, interval, time, open, low, high, close, volume, ma20, dema9, rsi, entry, signal, comment
  const tf = normalizeInterval(d.interval || "");
  if (!tf) {
    document.getElementById("comment").textContent =
      "⚠️ Interwał inny niż M5/M15/H1 — pomijam";
    return;
  }

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

  // meta: ostatnia cena, TF, czas
  const meta = tickers[t].meta;
  if (!isNaN(close)) meta.price = close;
  meta.lastInterval = tf;
  meta.lastTime = analysis.time || "";

  // widełki tylko dla BUY / PRAWIE BUY / CZEKAJ DO
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

// ====== TABELA PRO ======

function updateTable() {
  const tbody = document.querySelector("#proTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  Object.keys(tickers).forEach(ticker => {
    const data = tickers[ticker];
    const meta = data.meta || {};
    const tr = document.createElement("tr");

    // Ticker (klik → popup)
    const tdTicker = document.createElement("td");
    tdTicker.textContent = ticker;
    tdTicker.classList.add("ticker-cell");
    tdTicker.dataset.ticker = ticker;
    tr.appendChild(tdTicker);

    // Cena (ostatnie close)
    const tdPrice = document.createElement("td");
    tdPrice.classList.add("price-cell");
    tdPrice.dataset.ticker = ticker;
    tdPrice.textContent =
      meta.price != null ? meta.price.toFixed(2) : "—";
    tr.appendChild(tdPrice);

    // Interwał (ostatni TF + czas)
    const tdInterval = document.createElement("td");
    const tf = meta.lastInterval || "—";
    const tm = meta.lastTime || "";
    tdInterval.textContent = tf + (tm ? "  " + tm : "");
    tr.appendChild(tdInterval);

    // Entry (na razie z backendu / meta)
    const tdEntry = document.createElement("td");
    tdEntry.classList.add("entry-cell");
    tdEntry.dataset.ticker = ticker;
    if (meta.entry != null) {
      tdEntry.textContent = meta.entry.toFixed
        ? meta.entry.toFixed(2)
        : meta.entry;
    } else {
      tdEntry.textContent = "—";
    }
    tr.appendChild(tdEntry);

    // Sygnał wspólny
    const tdSignal = document.createElement("td");
    const sig = consensusSignal(data);
    const spanSig = document.createElement("span");
    spanSig.classList.add("signal-text");
    spanSig.textContent = sig;
    const sigClass = "signal-" + sig.toUpperCase().replace(/\s+/g, "");
    spanSig.classList.add(sigClass);
    tdSignal.appendChild(spanSig);
    tr.appendChild(tdSignal);

    // Widełki
    const tdWidełki = document.createElement("td");
    tdWidełki.textContent = meta.widełki || "—";
    tr.appendChild(tdWidełki);

    // TP1 / TP2 / TP3
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

// ====== POPUP ======

const popup = document.getElementById("popup");
const popupClose = document.getElementById("popupClose");
const popupTitle = document.getElementById("popupTitle");
const popupData = document.getElementById("popupData");

if (popupClose) {
  popupClose.onclick = () => popup.style.display = "none";
}
window.onclick = (e) => {
  if (e.target === popup) popup.style.display = "none";
};

// delegacja zdarzeń na tabeli PRO
const proTbody = document.querySelector("#proTable tbody");
if (proTbody) {
  proTbody.addEventListener("click", (e) => {
    const tickerCell = e.target.closest(".ticker-cell");
    const delCell = e.target.closest(".delete-cell");
    const priceCell = e.target.closest(".price-cell");
    const entryCell = e.target.closest(".entry-cell");

    // usuń wiersz
    if (delCell) {
      const t = delCell.dataset.ticker;
      if (t && tickers[t]) {
        delete tickers[t];
        updateTable();
      }
      return;
    }

    // klik w ticker → popup z analizą 3×TF
    if (tickerCell) {
      const t = tickerCell.dataset.ticker;
      const d = tickers[t];
      if (!d) return;

      const sig = consensusSignal(d);
      const payload = {
        ticker: t,
        sygnał_wspólny: sig,
        meta: d.meta,
        M5: d.M5,
        M15: d.M15,
        H1: d.H1
      };

      popupTitle.textContent = `${t} — analiza M5/M15/H1`;
      popupData.textContent = JSON.stringify(payload, null, 2);
      popup.style.display = "block";
      return;
    }

    // klik w cenę / entry — na razie tylko placeholder (można później podpiąć osobną sekwencję głosową)
    if (priceCell) {
      const t = priceCell.dataset.ticker;
      document.getElementById("comment").textContent =
        `ℹ️ Cena ${t} pochodzi z ostatniego close (backend).`;
      return;
    }

    if (entryCell) {
      const t = entryCell.dataset.ticker;
      document.getElementById("comment").textContent =
        `ℹ️ Entry dla ${t} na razie z backendu / meta (możemy dodać osobne nagrywanie).`;
      return;
    }
  });
}
