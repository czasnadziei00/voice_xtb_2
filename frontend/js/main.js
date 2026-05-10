// ===============================
// MAIN.JS 6.4 — OBSŁUGA UI + TABS
// ===============================

// DOM ELEMENTY
const liveView = document.getElementById("liveView");
const tomorrowView = document.getElementById("tomorrowView");

const liveBtn = document.getElementById("liveBtn");
const tomorrowBtn = document.getElementById("tomorrowBtn");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

const startTomorrow = document.getElementById("startTomorrow");
const stopTomorrow = document.getElementById("stopTomorrow");

const resetBtn = document.getElementById("resetBtn");


// ===============================
// PRZEŁĄCZANIE ZAKŁADEK
// ===============================

if (liveBtn) {
  liveBtn.onclick = () => {
    liveView.style.display = "block";
    tomorrowView.style.display = "none";
    activeMode = "live";
  };
}

if (tomorrowBtn) {
  tomorrowBtn.onclick = () => {
    liveView.style.display = "none";
    tomorrowView.style.display = "block";
    activeMode = "tomorrow";
  };
}


// ===============================
// RESET TABELI LIVE
// ===============================

if (resetBtn) {
  resetBtn.onclick = () => {
    const tbody = document.getElementById("liveTableBody");
    if (tbody) tbody.innerHTML = "";
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

    document.getElementById("recognizedText").textContent = "";
    document.getElementById("liveResult").textContent = "";
    document.getElementById("comment").textContent = "";
  };
}


// ===============================
// START/STOP mikrofonu (LIVE)
// ===============================

if (startBtn) {
  startBtn.onclick = () => {
    activeMode = "live";
    startMic();
  };
}

if (stopBtn) {
  stopBtn.onclick = () => {
    stopMic();
  };
}


// ===============================
// START/STOP mikrofonu (NA JUTRO)
// ===============================

if (startTomorrow) {
  startTomorrow.onclick = () => {
    activeMode = "tomorrow";
    startMic();
  };
}

if (stopTomorrow) {
  stopTomorrow.onclick = () => {
    stopMic();
  };
}


// ===============================
// USUWANIE WIERSZA Z TABELI (LIVE + NA JUTRO)
// ===============================

document.addEventListener("click", function (e) {
  if (e.target.classList.contains("delete-row")) {
    const row = e.target.closest("tr");
    if (row) row.remove();
  }
});


// ===============================
// POPUP 4.5+ (zamknięcie)
// ===============================

const popup = document.getElementById("popup45");
const popupClose = document.getElementById("popupClose");

if (popupClose) {
  popupClose.onclick = () => {
    popup.style.display = "none";
  };
}

window.onclick = function (event) {
  if (event.target === popup) {
    popup.style.display = "none";
  }
};
