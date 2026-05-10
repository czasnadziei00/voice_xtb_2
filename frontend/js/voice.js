// ====== USTAWIENIA ======
const LIVE_BACKEND = "https://voice-xtb-2.onrender.com/voice-parse";
const TOMORROW_BACKEND = "https://voice-xtb-2.onrender.com/parse";

// ====== STAN GLOBALNY (OPCJA A: jeden ticker na raz) ======
let activeMode = "live"; // "live" albo "tomorrow"
let activeTicker = null;
let activeInterval = null;
let activeTime = null;

// LIVE: aktualny wiersz
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

// NA JUTRO: aktualne D1/H1
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

// ====== ROZPOZNAWANIE MOWY (szkielet) ======
let recognition = null;

function initRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Brak wsparcia dla rozpoznawania mowy.");
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "pl-PL";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    handleTranscript(transcript);
  };

  recognition.onerror = (event) => {
    console.error("Speech error:", event.error);
  };

  recognition.onend = () => {
    // nic — ręcznie włączasz ponownie
  };
}

function startMic() {
  if (!recognition) initRecognition();
  if (recognition) recognition.start();
}

function stopMic() {
  if (recognition) recognition.stop();
}

// ====== OBSŁUGA TEKSTU Z MIKROFONU ======

function handleTranscript(text) {
  // tu możesz wpisać do "Rozpoznano:"
  const recognizedDiv = document.getElementById("recognizedText");
  if (recognizedDiv) recognizedDiv.textContent = text;

  if (activeMode === "live") {
    sendToLiveBackend(text);
  } else {
    sendToTomorrowBackend(text);
  }
}

// ====== LIVE BACKEND ======

async function sendToLiveBackend(text) {
  try {
    const res = await fetch(LIVE_BACKEND, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, mode: "live" })
    });

    const data = await res.json();

    // data: { ticker, interval, time, row, signal, comment }
    mergeLiveData(data);
    updateLivePreview();
    maybeAskAddToLive();
  } catch (e) {
    console.error("LIVE backend error:", e);
  }
}

function mergeLiveData(data) {
  // ticker / interval / time
  if (!activeTicker || activeTicker === "UNKNOWN") {
    activeTicker = data.ticker;
  }
  if (!activeInterval && data.interval) {
    activeInterval = data.interval;
  }
  if (!activeTime && data.time) {
    activeTime = data.time;
  }

  // scalanie danych
  const row = data.row || {};
  for (const key of Object.keys(activeLiveRow)) {
    if (key in row && row[key] != null) {
      activeLiveRow[key] = row[key];
    }
  }

  // sygnał z backendu
  if (data.signal) activeLiveRow.signal = data.signal;
  if (data.comment) activeLiveRow.comment = data.comment;
}

function updateLivePreview() {
  // tu możesz zaktualizować jakiś podgląd, np. div z JSON
  const liveResultDiv = document.getElementById("liveResult");
  if (!liveResultDiv) return;

  liveResultDiv.textContent = JSON.stringify({
    ticker: activeTicker,
    interval: activeInterval,
    time: activeTime,
    ...activeLiveRow
  }, null, 2);
}

function liveDataIsComplete() {
  // minimalny zestaw, który uznajemy za "warto pytać o dodanie"
  return (
    activeTicker &&
    activeInterval &&
    (activeLiveRow.open != null || activeLiveRow.close != null) &&
    activeLiveRow.low != null &&
    activeLiveRow.high != null
  );
}

function maybeAskAddToLive() {
  if (!liveDataIsComplete()) return;

  const ok = confirm(`Dodać ${activeTicker} ${activeInterval} ${activeTime} do LIVE?`);
  if (ok) {
    addLiveRowToTable();
    resetLiveContext(); // po dodaniu możesz wyczyścić kontekst
  }
}

function addLiveRowToTable() {
  const table = document.getElementById("liveTableBody");
  if (!table) return;

  const tr = document.createElement("tr");

  function td(text) {
    const cell = document.createElement("td");
    cell.textContent = text;
    return cell;
  }

  tr.appendChild(td(activeTicker || "???"));
  tr.appendChild(td(activeInterval || "M15"));
  tr.appendChild(td(activeTime || "--:--"));
  tr.appendChild(td(activeLiveRow.open ?? ""));
  tr.appendChild(td(activeLiveRow.low ?? ""));
  tr.appendChild(td(activeLiveRow.high ?? ""));
  tr.appendChild(td(activeLiveRow.close ?? ""));
  tr.appendChild(td(activeLiveRow.ma20 ?? ""));
  tr.appendChild(td(activeLiveRow.dema9 ?? ""));
  tr.appendChild(td(activeLiveRow.rsi ?? ""));
  tr.appendChild(td(activeLiveRow.volume ?? ""));
  tr.appendChild(td(activeLiveRow.signal || ""));
  tr.appendChild(td("")); // widełki/TP jeśli chcesz

  table.appendChild(tr);
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

// ====== NA JUTRO BACKEND ======

async function sendToTomorrowBackend(text) {
  try {
    const res = await fetch(TOMORROW_BACKEND, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, mode: "tomorrow" })
    });

    const data = await res.json();
    // data: { ticker, d1, h1, final, signal, widełki, tp, good_for_tomorrow, comment }
    mergeTomorrowData(data);
    updateTomorrowPreview();
    maybeAskAddToTomorrow();
  } catch (e) {
    console.error("TOMORROW backend error:", e);
  }
}

function mergeTomorrowData(data) {
  if (!activeTicker || activeTicker === "UNKNOWN") {
    activeTicker = data.ticker;
  }

  if (data.d1) {
    for (const key of Object.keys(activeD1)) {
      if (data.d1[key] != null) {
        activeD1[key] = data.d1[key];
      }
    }
  }

  if (data.h1) {
    for (const key of Object.keys(activeH1)) {
      if (data.h1[key] != null) {
        activeH1[key] = data.h1[key];
      }
    }
  }
}

function updateTomorrowPreview() {
  const tomorrowResultDiv = document.getElementById("tomorrowResult");
  if (!tomorrowResultDiv) return;

  tomorrowResultDiv.textContent = JSON.stringify({
    ticker: activeTicker,
    d1: activeD1,
    h1: activeH1
  }, null, 2);
}

function tomorrowDataIsComplete() {
  // minimalny zestaw dla NA JUTRO
  return (
    activeTicker &&
    (activeD1.close != null || activeD1.open != null) &&
    activeD1.low != null &&
    activeD1.high != null &&
    activeD1.rsi != null
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
  const table = document.getElementById("tomorrowTableBody");
  if (!table) return;

  const tr = document.createElement("tr");

  function td(text) {
    const cell = document.createElement("td");
    cell.textContent = text;
    return cell;
  }

  tr.appendChild(td(activeTicker || "???"));
  tr.appendChild(td("D1/H1"));
  tr.appendChild(td(activeD1.open ?? ""));
  tr.appendChild(td(activeD1.low ?? ""));
  tr.appendChild(td(activeD1.high ?? ""));
  tr.appendChild(td(activeD1.close ?? ""));
  tr.appendChild(td(activeD1.ma20 ?? ""));
  tr.appendChild(td(activeD1.dema9 ?? ""));
  tr.appendChild(td(activeD1.rsi ?? ""));
  tr.appendChild(td(activeD1.volume ?? ""));
  // możesz dodać kolumny: TAK/NIE, TP, widełki itd.

  table.appendChild(tr);
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

// ====== PRZYCISKI / TRYBY ======

document.addEventListener("DOMContentLoaded", () => {
  initRecognition();

  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const liveBtn = document.getElementById("liveBtn");
  const tomorrowBtn = document.getElementById("tomorrowBtn");

  if (startBtn) startBtn.onclick = startMic;
  if (stopBtn) stopBtn.onclick = stopMic;

  if (liveBtn) {
    liveBtn.onclick = () => {
      activeMode = "live";
    };
  }

  if (tomorrowBtn) {
    tomorrowBtn.onclick = () => {
      activeMode = "tomorrow";
    };
  }
});
