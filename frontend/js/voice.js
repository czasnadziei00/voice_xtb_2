// ===============================
// USTAWIENIA BACKENDU
// ===============================
const LIVE_BACKEND = "https://voice-xtb.onrender.com/voice-parse";
const TOMORROW_BACKEND = "https://voice-xtb.onrender.com/parse";

// ===============================
// STAN GLOBALNY (OPCJA A — jeden ticker na raz)
// ===============================
let activeMode = "live"; // "live" albo "tomorrow"
let activeTicker = null;
let activeInterval = null;
let activeTime = null;

// LIVE — aktualny wiersz
let activeLiveRow = {
  open: null,
  low: null,
  high: null,
  close: null,
  ma20: null,
  dema9: null,
  rsi: null,
  vwap: null,
  volume: null,
  signal: "CZEKAJ",
  comment: ""
};

// NA JUTRO — D1 i H1
let activeD1 = {
  open: null,
  low: null,
  high: null,
  close: null,
  ma20: null,
  dema9: null,
  rsi: null,
  vwap: null,
  volume: null
};

let activeH1 = {
  open: null,
  low: null,
  high: null,
  close: null,
  ma20: null,
  dema9: null,
  rsi: null,
  vwap: null,
  volume: null
};

// ===============================
// ROZPOZNAWANIE MOWY
// ===============================
let recognition = null;

function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert("Twoja przeglądarka nie obsługuje rozpoznawania mowy.");
    return;
  }

  recognition = new SR();
  recognition.lang = "pl-PL";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    document.getElementById("recognizedText").textContent = text;
    handleTranscript(text);
  };

  recognition.onerror = (e) => console.error("Speech error:", e.error);
}

function startMic() {
  if (!recognition) initRecognition();
  recognition.start();
}

function stopMic() {
  if (recognition) recognition.stop();
}

// ===============================
// OBSŁUGA TEKSTU
// ===============================
function handleTranscript(text) {
  if (activeMode === "live") {
    sendToLiveBackend(text);
  } else {
    sendToTomorrowBackend(text);
  }
}

// ===============================
// LIVE — BACKEND
// ===============================
async function sendToLiveBackend(text) {
  try {
    const res = await fetch(LIVE_BACKEND, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    const data = await res.json();
    mergeLiveData(data);
    updateLivePreview();
    maybeAskAddToLive();
  } catch (e) {
    console.error("LIVE backend error:", e);
  }
}

function mergeLiveData(data) {
  if (!activeTicker || activeTicker === "UNKNOWN") activeTicker = data.ticker;
  if (!activeInterval && data.interval) activeInterval = data.interval;
  if (!activeTime && data.time) activeTime = data.time;

  const row = data.row || {};
  for (const key of Object.keys(activeLiveRow)) {
    if (row[key] != null) activeLiveRow[key] = row[key];
  }

  if (data.signal) activeLiveRow.signal = data.signal;
  if (data.comment) activeLiveRow.comment = data.comment;
}

function updateLivePreview() {
  document.getElementById("liveResult").textContent = JSON.stringify({
    ticker: activeTicker,
    interval: activeInterval,
    time: activeTime,
    ...activeLiveRow
  }, null, 2);
}

function liveDataIsComplete() {
  return (
    activeTicker &&
    activeInterval &&
    activeLiveRow.low != null &&
    activeLiveRow.high != null &&
    (activeLiveRow.open != null || activeLiveRow.close != null)
  );
}

function maybeAskAddToLive() {
  if (!liveDataIsComplete()) return;

  const ok = confirm(`Dodać ${activeTicker} ${activeInterval} ${activeTime} do LIVE?`);
  if (ok) {
    addLiveRowToTable();
    resetLiveContext();
  }
}

function addLiveRowToTable() {
  const tbody = document.getElementById("liveTableBody");
  const tr = document.createElement("tr");

  function td(v) {
    const c = document.createElement("td");
    c.textContent = v;
    return c;
  }

  tr.appendChild(td(activeTicker));
  tr.appendChild(td(activeInterval));
  tr.appendChild(td(activeTime));
  tr.appendChild(td(activeLiveRow.open ?? ""));
  tr.appendChild(td(activeLiveRow.low ?? ""));
  tr.appendChild(td(activeLiveRow.high ?? ""));
  tr.appendChild(td(activeLiveRow.close ?? ""));
  tr.appendChild(td(activeLiveRow.ma20 ?? ""));
  tr.appendChild(td(activeLiveRow.dema9 ?? ""));
  tr.appendChild(td(activeLiveRow.rsi ?? ""));
  tr.appendChild(td(activeLiveRow.volume ?? ""));
  tr.appendChild(td(activeLiveRow.signal ?? ""));
  tr.appendChild(td("")); // widełki
  tr.appendChild(td("")); // TP

  const chartBtn = document.createElement("td");
  chartBtn.innerHTML = `<button class="chartBtn">📊</button>`;
  tr.appendChild(chartBtn);

  const delBtn = document.createElement("td");
  delBtn.innerHTML = `<button class="delete-row">🗑</button>`;
  tr.appendChild(delBtn);

  tbody.appendChild(tr);
}

function resetLiveContext() {
  activeTicker = null;
  activeInterval = null;
  activeTime = null;

  activeLiveRow = {
    open: null,
    low: null,
    high: null,
    close: null,
    ma20: null,
    dema9: null,
    rsi: null,
    vwap: null,
    volume: null,
    signal: "CZEKAJ",
    comment: ""
  };
}

// ===============================
// NA JUTRO — BACKEND
// ===============================
async function sendToTomorrowBackend(text) {
  try {
    const res = await fetch(TOMORROW_BACKEND, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    const data = await res.json();
    mergeTomorrowData(data);
    updateTomorrowPreview();
    maybeAskAddToTomorrow();
  } catch (e) {
    console.error("TOMORROW backend error:", e);
  }
}

function mergeTomorrowData(data) {
  if (!activeTicker || activeTicker === "UNKNOWN") activeTicker = data.ticker;

  if (data.d1) {
    for (const k of Object.keys(activeD1)) {
      if (data.d1[k] != null) activeD1[k] = data.d1[k];
    }
  }

  if (data.h1) {
    for (const k of Object.keys(activeH1)) {
      if (data.h1[k] != null) activeH1[k] = data.h1[k];
    }
  }
}

function updateTomorrowPreview() {
  document.getElementById("tomorrowResult").textContent = JSON.stringify({
    ticker: activeTicker,
    d1: activeD1,
    h1: activeH1
  }, null, 2);
}

function tomorrowDataIsComplete() {
  return (
    activeTicker &&
    activeD1.low != null &&
    activeD1.high != null &&
    activeD1.rsi != null &&
    (activeD1.open != null || activeD1.close != null)
  );
}

function maybeAskAddToTomorrow() {
  if (!tomorrowDataIsComplete()) return;

  const ok = confirm(`Dodać ${activeTicker} do NA JUTRO?`);
  if (ok) {
    addTomorrowRowToTable();
    resetTomorrowContext();
  }
}

function addTomorrowRowToTable() {
  const tbody = document.getElementById("tomorrowTableBody");
  const tr = document.createElement("tr");

  function td(v) {
    const c = document.createElement("td");
    c.textContent = v;
    return c;
  }

  tr.appendChild(td(activeTicker));
  tr.appendChild(td("D1/H1"));
  tr.appendChild(td(activeD1.open ?? ""));
  tr.appendChild(td(activeD1.low ?? ""));
  tr.appendChild(td(activeD1.high ?? ""));
  tr.appendChild(td(activeD1.close ?? ""));
  tr.appendChild(td(activeD1.ma20 ?? ""));
  tr.appendChild(td(activeD1.dema9 ?? ""));
  tr.appendChild(td(activeD1.rsi ?? ""));
  tr.appendChild(td(activeD1.volume ?? ""));
  tr.appendChild(td("")); // TAK/NIE
  tr.appendChild(td("")); // TP

  const delBtn = document.createElement("td");
  delBtn.innerHTML = `<button class="delete-row">🗑</button>`;
  tr.appendChild(delBtn);

  tbody.appendChild(tr);
}

function resetTomorrowContext() {
  activeTicker = null;

  activeD1 = {
    open: null,
    low: null,
    high: null,
    close: null,
    ma20: null,
    dema9: null,
    rsi: null,
    vwap: null,
    volume: null
  };

  activeH1 = {
    open: null,
    low: null,
    high: null,
    close: null,
    ma20: null,
    dema9: null,
    rsi: null,
    vwap: null,
    volume: null
  };
}

// ===============================
// START
// ===============================
document.addEventListener("DOMContentLoaded", initRecognition);
