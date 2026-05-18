// ======================================================
//  VOICE XTB 8.1 HYBRID - SIMPLE GPW EDITION
//  DAYTRADING / KRÓTKI SWING / LONG ONLY
// ======================================================

const backend = "https://voice-xtb.onrender.com/voice-parse";
const STORAGE_KEY = "xtbtablememoryv2multitf";

// ======================================================
// SYSTEM
// ======================================================

const SYSTEM_MODE = {
  aggression: 0.65,
  conservative: 0.35,

  allowFastEntry: true,
  allowMomentumSignals: true,
  allowEarlyBreakouts: true,

  strictExitConfirmation: true,
  strongerSellFilter: true,

  confidenceThresholdBuy: 52,
  confidenceThresholdSell: 60
};

// ======================================================

let recognition = null;
let recognizing = false;
let currentStep = 0;
let tempRecord = {};
let isFetching = false;

const steps = [
  "Podaj ticker",
  "Podaj interwał",
  "Podaj czas lub dzień",
  "Podaj cenę open",
  "Podaj cenę high",
  "Podaj cenę low",
  "Podaj cenę close",
  "Podaj wolumen",
  "Podaj MA 20",
  "Podaj DEMA 9",
  "Podaj RSI"
];

const tickers = {};

// ======================================================
// MIC
// ======================================================

function initRecognition() {

  const SR =
    window.webkitSpeechRecognition ||
    window.SpeechRecognition;

  if (!SR) {
    alert("Brak obsługi mowy");
    return null;
  }

  const rec = new SR();

  rec.lang = "pl-PL";
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onresult = (e) => {

    const text =
      e.results[0][0].transcript.trim();

    document.getElementById("recognized").textContent =
      `Rozpoznano: ${text}`;

    handleRecognized(text);
  };

  rec.onend = () => {

    if (!recognizing) return;

    if (currentStep < steps.length) {

      setTimeout(() => {
        sayStep();
      }, 300);

    } else {

      recognizing = false;
      finalizeRecord();
    }
  };

  rec.onerror = () => {

    if (!recognizing) return;

    setTimeout(() => {

      try {
        recognition.start();
      } catch {}

    }, 500);
  };

  return rec;
}

recognition = initRecognition();

// ======================================================
// SPEECH
// ======================================================

function sayStep() {

  if (!recognizing) return;

  speechSynthesis.cancel();

  const msg =
    new SpeechSynthesisUtterance(
      steps[currentStep]
    );

  msg.lang = "pl-PL";
  msg.rate = 1.05;

  msg.onend = () => {

    if (!recognizing) return;

    setTimeout(() => {

      try {
        recognition.start();
      } catch {}

    }, 200);
  };

  speechSynthesis.speak(msg);
}

// ======================================================
// TIME
// ======================================================

function parseAndAlignTime(rawText, intervalStr) {

  const now = new Date();

  if (intervalStr === "D1") {

    let dayNum = parseInt(
      rawText.toString().replace(/[^0-9]/g, ""),
      10
    );

    if (
      isNaN(dayNum) ||
      dayNum < 1 ||
      dayNum > 31
    ) {
      dayNum = now.getDate();
    }

    let year = now.getFullYear();
    let month = now.getMonth() + 1;

    return `${year}-${String(month).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
  }

  let hours = 0;
  let minutes = 0;

  let clean =
    rawText
      .toString()
      .trim()
      .replace(/[.:\-]/g, " ");

  const parts =
    clean.split(/\s+/);

  if (parts.length >= 2) {

    hours =
      parseInt(parts[0], 10) || 0;

    minutes =
      parseInt(parts[1], 10) || 0;

  } else {

    hours = now.getHours();
    minutes = now.getMinutes();
  }

  if (intervalStr === "M5") {
    minutes =
      Math.floor(minutes / 5) * 5;
  }

  if (intervalStr === "M15") {
    minutes =
      Math.floor(minutes / 15) * 15;
  }

  if (intervalStr === "H1") {
    minutes = 0;
  }

  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
}

// ======================================================
// HANDLE VOICE
// ======================================================

function handleRecognized(text) {

  switch (currentStep) {

    case 0:
      tempRecord.ticker =
        text.toUpperCase()
          .replace(/\s+/g, "");
      break;

    case 1:
      tempRecord.interval =
        normalizeInterval(text);
      break;

    case 2:
      tempRecord.time =
        parseAndAlignTime(
          text,
          tempRecord.interval
        );
      break;

    case 3:
      tempRecord.open =
        extractNumber(text);
      break;

    case 4:
      tempRecord.high =
        extractNumber(text);
      break;

    case 5:
      tempRecord.low =
        extractNumber(text);
      break;

    case 6:
      tempRecord.close =
        extractNumber(text);
      break;

    case 7:
      tempRecord.volume =
        extractNumber(text);
      break;

    case 8:
      tempRecord.ma20 =
        extractNumber(text);
      break;

    case 9:
      tempRecord.dema9 =
        extractNumber(text);
      break;

    case 10:
      tempRecord.rsi =
        extractNumber(text);
      break;
  }

  currentStep++;
}

// ======================================================
// NUMBERS
// ======================================================

function extractNumber(text) {

  if (!text) return 0;

  text = text
    .toString()
    .toLowerCase()
    .replaceAll("kropka", ".")
    .replaceAll("przecinek", ".");

  const num =
    parseFloat(
      text.replace(/\s+/g, "")
    );

  return isFinite(num)
    ? num
    : 0;
}

// ======================================================
// TF
// ======================================================

function normalizeInterval(tf) {

  tf = tf.toUpperCase().trim();

  if (tf === "5" || tf === "M5")
    return "M5";

  if (tf === "15" || tf === "M15")
    return "M15";

  if (
    tf === "H1" ||
    tf === "1H" ||
    tf === "60"
  )
    return "H1";

  if (
    tf === "D1" ||
    tf === "D"
  )
    return "D1";

  return tf;
}

// ======================================================
// FINALIZE
// ======================================================

async function finalizeRecord() {

  if (isFetching) return;

  isFetching = true;

  if (!tempRecord.time) {

    tempRecord.time =
      parseAndAlignTime(
        "",
        tempRecord.interval
      );
  }

  const t =
    tempRecord.ticker;

  if (
    tickers[t] &&
    tickers[t].globalEntry
  ) {

    tempRecord.entry =
      parseFloat(
        tickers[t].globalEntry
      );

  } else {

    tempRecord.entry = null;
  }

  document.getElementById("comment").textContent =
    "⏳ Analiza...";

  try {

    const response =
      await fetch(
        `${backend}?t=${Date.now()}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify(tempRecord)
        }
      );

    const data =
      await response.json();

    // ==================================================
    // PROSTA LOGIKA SYGNAŁÓW
    // ==================================================

    data.signal =
      simplifySignal(
        data.signal,
        data.confidence
      );

    handleBackendData(data);

    document.getElementById("comment").textContent =
      "✔️ Gotowe";

  } catch {

    document.getElementById("comment").textContent =
      "❌ Błąd backendu";

  } finally {

    tempRecord = {};
    currentStep = 0;
    isFetching = false;
  }
}

// ======================================================
// SIMPLE SIGNALS
// ======================================================

function simplifySignal(signal, confidence) {

  signal =
    (signal || "")
      .toUpperCase();

  // SELL

  if (
    signal.includes("EXIT") ||
    signal.includes("REDUKUJ") ||
    signal.includes("SELL") ||
    signal.includes("REALIZUJ")
  ) {
    return "SELL";
  }

  // HOLD

  if (
    signal.includes("ACCEL") ||
    signal.includes("MOMENTUM") ||
    signal.includes("STRONG")
  ) {
    return "HOLD";
  }

  // BUY

  if (
    signal.includes("BUY") &&
    confidence >= 52
  ) {
    return "BUY";
  }

  // PRAWIE BUY

  if (
    signal.includes("BUY") ||
    confidence >= 40
  ) {
    return "PRAWIE BUY";
  }

  // REDUKUJ

  if (
    confidence < 40 &&
    signal !== "SELL"
  ) {
    return "REDUKUJ";
  }

  return "HOLD";
}

// ======================================================
// HANDLE BACKEND
// ======================================================

function handleBackendData(d) {

  const ticker = d.ticker;

  const tf =
    normalizeInterval(d.interval);

  if (!tickers[ticker]) {

    tickers[ticker] = {
      globalEntry: "",
      updatedAt: 0
    };
  }

  tickers[ticker].updatedAt =
    Date.now();

  tickers[ticker].lastTF = tf;

  if (
    d.entry !== undefined &&
    d.entry !== null &&
    d.entry !== ""
  ) {

    tickers[ticker].globalEntry =
      d.entry.toString();

  } else {

    tickers[ticker].globalEntry = "";
  }

  if (!tickers[ticker][tf]) {

    tickers[ticker][tf] = {
      history: []
    };
  }

  tickers[ticker][tf].last = d;

  updateTable();
}

// ======================================================
// TABLE
// ======================================================

function updateTable() {

  const tbody =
    document.getElementById("table-body");

  tbody.innerHTML = "";

  const sortedTickers =
    Object.keys(tickers).sort(
      (a, b) =>
        tickers[b].updatedAt -
        tickers[a].updatedAt
    );

  if (sortedTickers.length === 0) {

    tbody.innerHTML =
      `<tr><td colspan="10">Brak danych</td></tr>`;

    saveTable();

    return;
  }

  sortedTickers.forEach(ticker => {

    const tData =
      tickers[ticker];

    const tf =
      tData.lastTF || "M5";

    const rec =
      tData[tf]?.last;

    if (!rec) return;

    const row =
      document.createElement("tr");

    row.className =
      getRowClass(rec.signal);

    row.innerHTML = `
      <td class="ticker-cell">
        ${ticker}
      </td>

      <td>
        ${Number(rec.close).toFixed(2)}
      </td>

      <td>
        ${rec.interval}
        <br>
        <small>${rec.time}</small>
      </td>

      <td class="entry-cell">
        ${tData.globalEntry || "—"}
      </td>

      <td>
        <div class="signal-box">
          ${rec.signal}
        </div>
      </td>

      <td>${rec.widelki || "—"}</td>
      <td>${rec.tp1 || "—"}</td>
      <td>${rec.tp2 || "—"}</td>
      <td>${rec.tp3 || "—"}</td>

      <td class="delete-cell">
        🗑️
      </td>
    `;

    tbody.appendChild(row);
  });

  saveTable();
}

// ======================================================
// COLORS
// ======================================================

function getRowClass(sig) {

  sig = (sig || "").toUpperCase();

  if (sig === "BUY")
    return "row-buy";

  if (sig === "PRAWIE BUY")
    return "row-buy-soft";

  if (sig === "HOLD")
    return "row-czekaj";

  if (
    sig === "REDUKUJ" ||
    sig === "SELL"
  )
    return "row-sell";

  return "row-czekaj";
}

// ======================================================
// START
// ======================================================

function startSequence() {

  if (recognizing) return;

  speechSynthesis.cancel();

  tempRecord = {};
  currentStep = 0;
  recognizing = true;

  sayStep();
}

// ======================================================
// STOP
// ======================================================

function stopSequence() {

  recognizing = false;
  currentStep = 0;
  tempRecord = {};

  try {
    recognition.stop();
  } catch {}

  document.getElementById("comment").textContent =
    "⛔ STOP";
}

// ======================================================
// STORAGE
// ======================================================

function saveTable() {

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(tickers)
  );
}

async function loadTable() {

  const baseEndpoint =
    backend.replace(
      "/voice-parse",
      ""
    );

  try {

    const response =
      await fetch(
        `${baseEndpoint}/memory?t=${Date.now()}`
      );

    if (response.ok) {

      const data =
        await response.json();

      Object.keys(data).forEach(ticker => {

        tickers[ticker] = {
          globalEntry:
            data[ticker].global_entry || "",
          updatedAt: Date.now()
        };

        ["M5","M15","H1","D1"]
          .forEach(tf => {

          if (
            data[ticker][tf] &&
            data[ticker][tf].last_data
          ) {

            if (!tickers[ticker][tf]) {

              tickers[ticker][tf] = {
                history: []
              };
            }

            tickers[ticker][tf].last =
              data[ticker][tf].last_data;

            tickers[ticker].lastTF = tf;
          }
        });
      });

      updateTable();
    }

  } catch {}
}

// ======================================================

document.addEventListener(
  "DOMContentLoaded",
  loadTable
);
