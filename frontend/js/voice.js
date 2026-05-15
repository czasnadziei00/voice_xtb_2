
// ======================================================
//  KONFIGURACJA
// ======================================================
const backend = "https://voice-xtb.onrender.com/voice-parse";
const STORAGE_KEY = "xtbtablememoryv2multitf";

// ======================================================
//  SPEECH STATE
// ======================================================
let recognition = null;
let recognizing = false;
let recognitionMode = "SEQUENCE";
let adHocCallback = null;

// ======================================================
//  FLOW
// ======================================================
let currentStep = 0;
let tempRecord = {};
let isFetching = false;

// ======================================================
//  STEPS
// ======================================================
const steps = [
  "Podaj ticker",
  "Podaj interwał",
  "Podaj open",
  "Podaj high",
  "Podaj low",
  "Podaj close",
  "Podaj wolumen",
  "Podaj MA20",
  "Podaj DEMA9",
  "Podaj RSI"
];

// ======================================================
//  STORAGE
// ======================================================
const tickers = {};

// ======================================================
//  HISTORY LIMITS
// ======================================================
const HISTORY_LIMITS = {
  M5: 14,
  M15: 7,
  H1: 3
};

// ======================================================
//  UTILS
// ======================================================
function extractNumber(text) {
  if (!text) return 0;
  text = text.toString().trim().toLowerCase();
  text = text.replaceAll("kropka", ".").replaceAll("przecinek", ".").replace(/\s+/g, "");
  const num = Number(text);
  return isFinite(num) ? num : 0;
}

function normalizeInterval(tf) {
  tf = tf.toUpperCase().trim();
  if (tf === "5" || tf === "M5") return "M5";
  if (tf === "15" || tf === "M15") return "M15";
  if (tf === "H1" || tf === "1H" || tf === "60") return "H1";
  return tf;
}

// ======================================================
//  VALIDATE
// ======================================================
function validateCandle(c) {
  if (!isFinite(c.open) || !isFinite(c.high) || !isFinite(c.low) || !isFinite(c.close)) return false;
  if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) return false;
  return (c.high >= c.low && c.open >= c.low && c.open <= c.high && c.close >= c.low && c.close <= c.high);
}

// ======================================================
//  HISTORY
// ======================================================
function pushToHistory(store, tf, candle) {
  if (!store[tf]) {
    store[tf] = { history: [] };
  }
  if (!store[tf].history) {
    store[tf].history = [];
  }
  store[tf].history.push(candle);
  const limit = HISTORY_LIMITS[tf] || 5;
  if (store[tf].history.length > limit) {
    store[tf].history = store[tf].history.slice(-limit);
  }
}

// ======================================================
//  HANDLE BACKEND
// ======================================================
function handleBackendData(d) {
  const tf = normalizeInterval(d.interval);
  const t = d.ticker;

  if (!tickers[t]) {
    tickers[t] = { globalEntry: "" };
  }

  tickers[t].lastTF = tf;
  tickers[t].lastTime = d.time;

  if (d.entry !== undefined) {
    tickers[t].globalEntry = d.entry;
  }

  pushToHistory(tickers[t], tf, d);

  const tfStore = tickers[t][tf];
  tfStore.last = d;
  tfStore.signal = d.signal;
  tfStore.comment = d.comment;
  tfStore.last.entry = tickers[t].globalEntry;

  updateTable();
}

// ======================================================
//  UPDATE TABLE
// ======================================================
function updateTable() {
  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";
  const rows = [];

  Object.keys(tickers).forEach((ticker) => {
    const tData = tickers[ticker];
    const lastTF = tData.lastTF;
    if (!lastTF) return;
    const rec = tData[lastTF]?.last;
    if (!rec) return;

    rows.push({ ticker, tData, rec, signal: rec.signal || "CZEKAJ" });
  });

  rows.forEach((item) => {
    const { ticker, tData, rec, signal } = item;
    const M15 = tData["M15"]?.last;
    const row = document.createElement("tr");
    row.className = getRowClass(signal);

    row.innerHTML = `
      <td class="ticker-cell">${ticker}</td>
      <td class="price-cell-static">${rec.close.toFixed(2)}</td>
      <td>${tData.lastTF}<br><span class="time-mini">${tData.lastTime ?? ""}</span></td>
      <td class="entry-cell">${(rec.entry && rec.entry !== "0" && rec.entry !== "") ? rec.entry : "—"}</td>
      <td><div class="signal-box">${signal}</div></td>
      <td>${M15?.widelki ?? "—"}</td>
      <td class="${tpColor(rec.close, M15?.tp1, signal)}">${M15?.tp1 ?? "—"}</td>
      <td class="${tpColor(rec.close, M15?.tp2, signal)}">${M15?.tp2 ?? "—"}</td>
      <td class="${tpColor(rec.close, M15?.tp3, signal)}">${M15?.tp3 ?? "—"}</td>
      <td class="delete-cell">🗑️</td>
    `;
    tbody.appendChild(row);
  });

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10">Brak danych...</td></tr>';
  }
  saveTable();
}

// ======================================================
//  UTILS (ROW/TP COLORS)
// ======================================================
function getRowClass(signal) {
  if (!signal) return "row-czekaj";
  if (signal === "BUY") return "row-buy";
  if (signal === "SELL") return "row-sell";
  if (signal === "PRAWIE BUY" || signal === "PRAWIE SELL") return "row-prawie";
  if (signal === "CZEKAJ DO") return "row-czekajdo";
  return "row-czekaj";
}

function tpColor(price, tp, signal) {
  if (!tp || tp === "—") return "";
  const p = parseFloat(price);
  const t = parseFloat(tp);
  if (isNaN(p) || isNaN(t)) return "";
  if (signal?.includes("BUY")) {
    if (p >= t) return "tp-hit";
    if (p >= t * 0.99) return "tp-close";
    return "tp-fail";
  }
  if (signal?.includes("SELL")) {
    if (p <= t) return "tp-hit";
    if (p <= t * 1.01) return "tp-close";
    return "tp-fail";
  }
  return "";
}

// ======================================================
//  STORAGE
// ======================================================
function saveTable() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
}

function loadTable() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    Object.assign(tickers, parsed);
    updateTable();
  } catch (e) {
    console.error(e);
  }
}

// ======================================================
//  SPEECH
// ======================================================
function initRecognition() {
  const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = "pl-PL";
  rec.continuous = false;
  rec.interimResults = false;
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript.trim();
    document.getElementById("recognized").textContent = `Rozpoznano: \${text}`;
    if (recognitionMode === "SEQUENCE") handleRecognized(text);
    else if (recognitionMode === "AD_HOC" && adHocCallback) {
      adHocCallback(text);
      adHocCallback = null;
      recognitionMode = "SEQUENCE";
      recognizing = false;
    }
    try { rec.stop(); } catch {}
  };
  return rec;
}
recognition = initRecognition();

function handleRecognized(text) {
  switch (currentStep) {
    case 0: tempRecord.ticker = text.toUpperCase(); break;
    case 1: tempRecord.interval = normalizeInterval(text); break;
    case 2: tempRecord.open = extractNumber(text); break;
    case 3: tempRecord.high = extractNumber(text); break;
    case 4: tempRecord.low = extractNumber(text); break;
    case 5: tempRecord.close = extractNumber(text); break;
    case 6: tempRecord.volume = extractNumber(text); break;
    case 7: tempRecord.ma20 = extractNumber(text); break;
    case 8: tempRecord.dema9 = extractNumber(text); break;
    case 9: tempRecord.rsi = extractNumber(text); break;
  }
  currentStep++;
  if (currentStep < steps.length) {
    setTimeout(() => { sayStep(); }, 300);
    return;
  }
  recognizing = false;
  try {
    recognition.stop();
    speechSynthesis.cancel();
  } catch {}
  finalizeRecord();
}

function sayStep() {
  if (currentStep >= steps.length) return;
  const msg = new SpeechSynthesisUtterance(steps[currentStep]);
  msg.lang = "pl-PL";
  msg.onend = () => {
    setTimeout(() => {
      try { if (recognizing) recognition.start(); } catch (e) { console.log(e); }
    }, 250);
  };
  speechSynthesis.cancel();
  speechSynthesis.speak(msg);
}

async function finalizeRecord() {
  if (isFetching) return;
  isFetching = true;
  tempRecord.time = new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  document.getElementById("comment").textContent = "⏳ Analiza...";
  try {
    const response = await fetch(`\${backend}?t=\${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tempRecord)
    });
    if (!response.ok) throw new Error(`HTTP \${response.status}`);
    const data = await response.json();
    handleBackendData(data);
    document.getElementById("comment").textContent = "✔️ Dodano świecę";
  } catch (err) {
    console.error(err);
    document.getElementById("comment").textContent = "❌ BACKEND ERROR";
  } finally {
    tempRecord = {};
    currentStep = 0;
    isFetching = false;
  }
}

function startSequence() {
  if (recognizing) return;
  tempRecord = {};
  currentStep = 0;
  recognitionMode = "SEQUENCE";
  recognizing = true;
  sayStep();
}

function stopSequence() {
  recognizing = false;
  speechSynthesis.cancel();
  try { recognition?.stop(); } catch {}
}

function startVoiceInput(callback) {
  if (recognizing) return;
  if (!recognition) recognition = initRecognition();
  recognitionMode = "AD_HOC";
  adHocCallback = (spoken) => { callback(spoken.trim()); };
  recognizing = true;
  try { recognition.start(); } catch (e) { console.log(e); }
}

// ======================================================
//  CLICK EVENTS
// ======================================================
document.addEventListener("click", (e) => {
  const cell = e.target.closest("td");
  const row = e.target.closest("tr");
  if (!cell || !row) return;

  const ticker = row.querySelector(".ticker-cell")?.textContent?.trim();
  if (!ticker) return;
  const tData = tickers[ticker];
  if (!tData) return;
  const rec = tData[tData.lastTF]?.last;
  if (!rec) return;

  if (cell.classList.contains("ticker-cell")) {
    const popup = document.getElementById("popup");
    const body = document.getElementById("popupBody");
    body.innerHTML = `<h2>\${ticker}</h2><pre style="white-space:pre-wrap;font-family:inherit;line-height:1.5;">\${rec.comment || "Brak komentarza"}</pre>`;
    popup.style.display = "block";
    return;
  }

  if (cell.classList.contains("entry-cell")) {
    document.getElementById("comment").textContent = "🎤 Podaj entry";
    startVoiceInput(async (spoken) => {
      const value = extractNumber(spoken);
      const updateData = { ...rec, entry: value };
      try {
        const res = await fetch(backend, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateData)
        });
        const updated = await res.json();
        handleBackendData(updated);
        document.getElementById("comment").textContent = "✔️ Entry ustawione";
      } catch (err) { console.error(err); }
    });
    return;
  }

  if (cell.classList.contains("delete-cell")) {
    delete tickers[ticker];
    updateTable();
    return;
  }
});

document.getElementById("popupClose").onclick = () => {
  document.getElementById("popup").style.display = "none";
};

window.onbeforeunload = () => {
  speechSynthesis.cancel();
  try { recognition?.stop(); } catch {}
};

document.addEventListener("DOMContentLoaded", loadTable);
