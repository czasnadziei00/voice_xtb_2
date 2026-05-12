// VOICE XTB 6.5 PRO MULTI-TF (M5/M15/H1, wariant 1C + popup)

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

// pamięć: ticker -> { M5: analysis, M15: analysis, H1: analysis }
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
  const iv = interval.toUpperCase();
  if (iv === "M5") return "M5";
  if (iv === "M15") return "M15";
  if (iv === "H1" || iv === "1H") return "H1";
  return null; // inne TF ignorujemy
}

function handleBackendData(d) {
  // backend zwraca: ticker, interval, time, open, low, high, close, volume, ma20, dema9, rsi, entry, signal, comment
  const tf = normalizeInterval(d.interval || "");
  if (!tf) {
    document.getElementById("comment").textContent =
      "⚠️ Interwał inny niż M5/M15/H1 — pomijam";
    return;
  }

  const t = (d.ticker || "").toUpperCase();
  if (!t) return;

  if (!tickers[t]) {
    tickers[t] = { M5: null, M15: null, H1: null };
  }

  // widełki tylko dla BUY / PRAWIE BUY / CZEKAJ DO
  let widełki = "";
  if (["BUY", "PRAWIE BUY", "CZEKAJ DO"].includes((d.signal || "").toUpperCase())) {
    const low = parseFloat(d.low);
    const high = parseFloat(d.high);
    if (!isNaN(low) && !isNaN(high)) {
      const range = high - low;
      const dol = low + range * 0.20;
      const gor = low + range * 0.35;
      widełki = `${dol.toFixed(2)} – ${gor.toFixed(2)}`;
    }
  }

  // TP
  let tpStr = "";
  const low = parseFloat(d.low);
  const high = parseFloat(d.high);
  const close = parseFloat(d.close);
  if (!isNaN(low) && !isNaN(high) && !isNaN(close)) {
    const range = Math.abs(high - low);
    let tp1, tp2, tp3;
    if ((d.signal || "").toUpperCase() === "SELL") {
      tp1 = close - range * 0.5;
      tp2 = close - range * 1.0;
      tp3 = close - range * 1.5;
    } else {
      tp1 = close + range * 0.5;
      tp2 = close + range * 1.0;
      tp3 = close + range * 1.5;
    }
    tpStr = `${tp1.toFixed(2)} / ${tp2.toFixed(2)} / ${tp3.toFixed(2)}`;
  }

  const analysis = {
    ticker: t,
    interval: tf,
    time: d.time,
    entry: d.entry,
    signal: d.signal,
    widełki: widełki,
    tp: tpStr,
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

  updateTable();
}

// ====== TABELA ======

function updateTable() {
  const tbody = document.querySelector("#tfTable tbody");
  tbody.innerHTML = "";

  Object.keys(tickers).forEach(ticker => {
    const rowData = tickers[ticker];
    const tr = document.createElement("tr");

    // kolumna Ticker
    const tdTicker = document.createElement("td");
    tdTicker.textContent = ticker;
    tr.appendChild(tdTicker);

    ["M5", "M15", "H1"].forEach(tf => {
      const td = document.createElement("td");
      td.classList.add("tf-cell");
      td.dataset.ticker = ticker;
      td.dataset.tf = tf;

      const a = rowData[tf];
      if (a && a.signal) {
        const sigSpan = document.createElement("span");
        sigSpan.classList.add("tf-signal");
        sigSpan.textContent = a.signal.toUpperCase();

        const sigClass = "signal-" + a.signal.toUpperCase().replace(/\s+/g, "");
        sigSpan.classList.add(sigClass);

        const hint = document.createElement("span");
        hint.classList.add("tf-hint");
        hint.textContent = "kliknij, aby zobaczyć szczegóły";

        td.appendChild(sigSpan);
        td.appendChild(hint);
      } else {
        td.textContent = "—";
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

// ====== POPUP ======

const popup = document.getElementById("popup");
const popupClose = document.getElementById("popupClose");
const popupTitle = document.getElementById("popupTitle");
const popupData = document.getElementById("popupData");

popupClose.onclick = () => popup.style.display = "none";
window.onclick = (e) => { if (e.target === popup) popup.style.display = "none"; };

document.querySelector("#tfTable tbody").addEventListener("click", (e) => {
  const cell = e.target.closest(".tf-cell");
  if (!cell) return;

  const ticker = cell.dataset.ticker;
  const tf = cell.dataset.tf;
  if (!ticker || !tf) return;

  const a = tickers[ticker][tf];
  if (!a) return;

  popupTitle.textContent = `${ticker} — ${tf}`;
  popupData.textContent = JSON.stringify(a, null, 2);
  popup.style.display = "block";
});
