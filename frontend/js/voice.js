// ======================================================
//  KONFIGURACJA
// ======================================================

const backend = "https://voice-xtb.onrender.com/voice-parse";
const STORAGE_KEY = "xtbtablememoryv2multitf";

let recognition = null;
let recognizing = false;
let recognitionMode = "SEQUENCE";
let adHocCallback = null;

let currentStep = 0;
let tempRecord = {};

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
//  UTILITY
// ======================================================

function extractNumber(text) {
  text = text
    .toLowerCase()
    .replace(/przecinek/g, ".")
    .replace(/kropka/g, ".")
    .replace(",", ".")
    .replace(/\s+/g, "");

  const num = parseFloat(text);
  return isNaN(num) ? 0 : num;
}

function normalizeInterval(tf) {
  tf = tf.toUpperCase().trim();

  if (tf === "M5" || tf === "5") return "M5";
  if (tf === "M15" || tf === "15") return "M15";
  if (tf === "H1" || tf === "1H" || tf === "60") return "H1";

  return tf;
}

function validateCandle(c) {
  return (
    c.high >= c.low &&
    c.open >= c.low &&
    c.open <= c.high &&
    c.close >= c.low &&
    c.close <= c.high
  );
}

// ======================================================
//  FINALIZACJA
// ======================================================

function finalizeRecord() {
  tempRecord.time = new Date().toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit"
  });

  if (!validateCandle(tempRecord)) {
    document.getElementById("comment").textContent =
      "❌ Nieprawidłowa świeca OHLC";
    return;
  }

  fetch(backend, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(tempRecord)
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.time) data.time = tempRecord.time;

      handleBackendData(data);

      document.getElementById("comment").textContent =
        "✔️ Dodano świecę";
    })
    .catch((err) => {
      console.error(err);

      document.getElementById("comment").textContent =
        "❌ Błąd backendu";
    });
}

// ======================================================
//  SPEECH RECOGNITION
// ======================================================

function initRecognition() {
  const SR =
    window.webkitSpeechRecognition ||
    window.SpeechRecognition;

  if (!SR) return null;

  const rec = new SR();

  rec.lang = "pl-PL";
  rec.continuous = false;
  rec.interimResults = false;

  rec.onresult = (e) => {
    const text = e.results[0][0].transcript.trim();

    document.getElementById("recognized").textContent =
      `Rozpoznano: ${text}`;

    if (recognitionMode === "SEQUENCE") {
      handleRecognized(text);
    } else if (
      recognitionMode === "AD_HOC" &&
      adHocCallback
    ) {
      adHocCallback(text);

      adHocCallback = null;
      recognitionMode = "SEQUENCE";
      recognizing = false;
    }

    try {
      rec.stop();
    } catch {}
  };

  rec.onend = () => {
    if (!recognizing) return;

    if (
      recognitionMode === "SEQUENCE" &&
      currentStep < steps.length
    ) {
      sayStep();
    }
  };

  rec.onerror = (e) => {
    console.log("Speech error:", e);
  };

  return rec;
}

recognition = initRecognition();

// ======================================================
//  WIDEŁKI
// ======================================================

function computeWidelki(rec) {
  const L = rec.low;
  const H = rec.high;

  const dol = L + (H - L) * 0.2;
  const gor = L + (H - L) * 0.35;

  return `${dol.toFixed(2)} - ${gor.toFixed(2)}`;
}

// ======================================================
//  TP1 / TP2
// ======================================================

function computeTP12(rec, widDol, widGor) {
  const L = rec.low;
  const H = rec.high;

  const R = H - L;

  const s = rec.signal;

  if (!s) {
    return {
      tp1: "—",
      tp2: "—"
    };
  }

  if (s.includes("BUY")) {
    return {
      tp1: (widGor + 0.5 * R).toFixed(2),
      tp2: (widGor + 1.0 * R).toFixed(2)
    };
  }

  if (s.includes("SELL")) {
    return {
      tp1: (widDol - 0.5 * R).toFixed(2),
      tp2: (widDol - 1.0 * R).toFixed(2)
    };
  }

  return {
    tp1: "—",
    tp2: "—"
  };
}

// ======================================================
//  TP3
// ======================================================

function computeTP3(rec) {
  const c = rec.close;
  const ma = rec.ma20;
  const de = rec.dema9;

  const s = rec.signal;

  if (
    !s ||
    s === "CZEKAJ" ||
    s === "CZEKAJ DO"
  ) {
    return "—";
  }

  const trendStrength = Math.abs(ma - de);

  const mid = (ma + de) / 2;

  const distance = Math.abs(c - mid);

  const tp = distance + trendStrength;

  if (s.includes("BUY")) {
    return (c + tp).toFixed(2);
  }

  if (s.includes("SELL")) {
    return (c - tp).toFixed(2);
  }

  return "—";
}

// ======================================================
//  HISTORIA
// ======================================================

const HISTORY_LIMITS = {
  M5: 14,
  M15: 7,
  H1: 3
};

function pushToHistory(store, tf, candle) {
  if (!store[tf]) {
    store[tf] = {
      history: []
    };
  }

  if (!store[tf].history) {
    store[tf].history = [];
  }

  store[tf].history.push(candle);

  const limit = HISTORY_LIMITS[tf] || 5;

  if (store[tf].history.length > limit) {
    store[tf].history =
      store[tf].history.slice(-limit);
  }
}

function trendDirectionFromHistory(history) {
  if (!history || history.length < 2) {
    return "NEUTRAL";
  }

  const first = history[0];
  const last = history[history.length - 1];

  const diff =
    Math.abs(last.close - first.close) /
    first.close;

  if (last.close > first.close && diff > 0.01) {
    return "UP";
  }

  if (last.close < first.close && diff > 0.01) {
    return "DOWN";
  }

  return "NEUTRAL";
}

function trendStrengthFromHistory(history) {
  if (!history || history.length === 0) {
    return 0;
  }

  const last = history[history.length - 1];
  const prev =
    history[Math.max(0, history.length - 2)];

  const spread =
    Math.abs(last.ma20 - last.dema9);

  const slope =
    Math.abs(last.ma20 - prev.ma20);

  return spread + slope;
}

// ======================================================
//  SIGNAL ENGINE
// ======================================================

function computeSignalForTF(history) {
  if (!history || history.length === 0) {
    return "CZEKAJ";
  }

  const last = history[history.length - 1];

  const dir =
    trendDirectionFromHistory(history);

  const strength =
    trendStrengthFromHistory(history);

  const rsi = last.rsi;

  const c = last.close;
  const ma = last.ma20;
  const de = last.dema9;

  const aboveMA =
    c > de && de > ma;

  const belowMA =
    c < de && de < ma;

  let base = "CZEKAJ";

  if (dir === "UP" && aboveMA) {
    base = "BUY";
  } else if (dir === "DOWN" && belowMA) {
    base = "SELL";
  } else if (dir === "UP") {
    base = "PRAWIE BUY";
  } else if (dir === "DOWN") {
    base = "PRAWIE SELL";
  }

  if (
    base.includes("BUY") &&
    rsi > 75
  ) {
    base = "CZEKAJ DO";
  }

  if (
    base.includes("SELL") &&
    rsi < 25
  ) {
    base = "CZEKAJ DO";
  }

  if (strength < 0.05) {
    base = "CZEKAJ";
  }

  return base;
}

function consensusSignalFromStore(tData) {
  const sigs = [];

  ["M5", "M15", "H1"].forEach((tf) => {
    const tfData = tData[tf];

    if (tfData?.signal) {
      sigs.push(tfData.signal);
    }
  });

  const buyCount =
    sigs.filter((s) => s === "BUY").length;

  const sellCount =
    sigs.filter((s) => s === "SELL").length;

  if (buyCount >= 2) return "BUY";
  if (sellCount >= 2) return "SELL";

  if (sigs.includes("PRAWIE BUY")) {
    return "PRAWIE BUY";
  }

  if (sigs.includes("PRAWIE SELL")) {
    return "PRAWIE SELL";
  }

  if (sigs.includes("CZEKAJ DO")) {
    return "CZEKAJ DO";
  }

  return "CZEKAJ";
}

// ======================================================
//  ROW COLOR
// ======================================================

function getRowClass(signal) {
  if (!signal) return "row-czekaj";

  if (signal === "BUY") return "row-buy";
  if (signal === "SELL") return "row-sell";

  if (
    signal === "PRAWIE BUY" ||
    signal === "PRAWIE SELL"
  ) {
    return "row-prawie";
  }

  if (signal === "CZEKAJ DO") {
    return "row-czekajdo";
  }

  return "row-czekaj";
}

// ======================================================
//  TP COLOR
// ======================================================

function tpColor(price, tp, signal) {
  if (!tp || tp === "—") return "";

  const p = parseFloat(price);
  const t = parseFloat(tp);

  if (isNaN(p) || isNaN(t)) return "";

  if (signal?.includes("BUY")) {
    if (p >= t) return "tp-hit";
    if (p <= t * 0.97) return "tp-fail";
    if (p >= t * 0.9) return "tp-close";
  }

  if (signal?.includes("SELL")) {
    if (p <= t) return "tp-hit";
    if (p >= t * 1.03) return "tp-fail";
    if (p <= t * 1.1) return "tp-close";
  }

  return "";
}

// ======================================================
//  TICKERS
// ======================================================

const tickers = {};

function handleBackendData(d) {
  const tf = normalizeInterval(d.interval);
  const t = d.ticker;

  if (!tickers[t]) {
    tickers[t] = {};
  }

  pushToHistory(tickers[t], tf, d);

  const tfStore = tickers[t][tf];

  const history = tfStore.history;

  const last =
    history[history.length - 1];

  const tfSignal =
    computeSignalForTF(history);

  tfStore.signal = tfSignal;
  tfStore.last = last;

  last.signal = tfSignal;

  if (tf === "M15") {
    last.widelki =
      computeWidelki(last);

    const [dol, gor] =
      last.widelki
        .split(" - ")
        .map(Number);

    const tp12 =
      computeTP12(last, dol, gor);

    last.tp1 = tp12.tp1;
    last.tp2 = tp12.tp2;
    last.tp3 = computeTP3(last);
  }

  updateTable();
}

function updateTable() {
  const tbody =
    document.getElementById("table-body");

  tbody.innerHTML = "";

  Object.keys(tickers).forEach((t) => {
    const tData = tickers[t];

    const M5 = tData["M5"]?.last;
    const M15 = tData["M15"]?.last;
    const H1 = tData["H1"]?.last;

    const rec = M15 || H1 || M5;

    if (!rec) return;

    const signal =
      consensusSignalFromStore(tData);

    const row =
      document.createElement("tr");

    row.className =
      getRowClass(signal);

    row.innerHTML = `
      <td class="ticker-cell">${t}</td>

      <td class="price-cell">
        ${rec.close.toFixed(2)}
      </td>

      <td>
        ${rec.interval}<br>
        <span style="font-size:11px;opacity:0.7;">
          ${rec.time ?? ""}
        </span>
      </td>

      <td class="entry-cell">
        ${rec.entry ?? "—"}
      </td>

      <td>
        <span style="font-size:16px;font-weight:700;">
          ${signal}
        </span>
      </td>

      <td>
        ${M15?.widelki ?? "—"}
      </td>

      <td class="${tpColor(
        rec.close,
        M15?.tp1,
        signal
      )}">
        ${M15?.tp1 ?? "—"}
      </td>

      <td class="${tpColor(
        rec.close,
        M15?.tp2,
        signal
      )}">
        ${M15?.tp2 ?? "—"}
      </td>

      <td class="${tpColor(
        rec.close,
        M15?.tp3,
        signal
      )}">
        ${M15?.tp3 ?? "—"}
      </td>

      <td class="delete-cell">🗑️</td>
    `;

    tbody.appendChild(row);
  });

  saveTable();
}

// ======================================================
//  LOCAL STORAGE
// ======================================================

function saveTable() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(tickers)
  );
}

function loadTable() {
  const raw =
    localStorage.getItem(STORAGE_KEY);

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
//  COMMENT ENGINE
// ======================================================

function buildDynamicComment(rec) {
  return `
INTERWAŁ: ${rec.interval}
CZAS: ${rec.time}

CLOSE: ${rec.close}
RSI: ${rec.rsi}

MA20: ${rec.ma20}
DEMA9: ${rec.dema9}

ANALIZA:
Rynek analizowany wielointerwałowo.
`;
}

// ======================================================
//  HANDLE SPEECH
// ======================================================

function handleRecognized(text) {
  switch (currentStep) {
    case 0:
      tempRecord.ticker =
        text.toUpperCase();
      break;

    case 1:
      tempRecord.interval =
        normalizeInterval(text);
      break;

    case 2:
      tempRecord.open =
        extractNumber(text);
      break;

    case 3:
      tempRecord.high =
        extractNumber(text);
      break;

    case 4:
      tempRecord.low =
        extractNumber(text);
      break;

    case 5:
      tempRecord.close =
        extractNumber(text);
      break;

    case 6:
      tempRecord.volume =
        extractNumber(text);
      break;

    case 7:
      tempRecord.ma20 =
        extractNumber(text);
      break;

    case 8:
      tempRecord.dema9 =
        extractNumber(text);
      break;

    case 9:
      tempRecord.rsi =
        extractNumber(text);
      break;
  }

  currentStep++;

  if (currentStep >= steps.length) {
    recognizing = false;
    finalizeRecord();
  }
}

function sayStep() {
  const msg =
    new SpeechSynthesisUtterance(
      steps[currentStep]
    );

  msg.lang = "pl-PL";

  msg.onend = () => {
    setTimeout(() => {
      try {
        recognition.start();
      } catch {}
    }, 200);
  };

  speechSynthesis.cancel();
  speechSynthesis.speak(msg);
}

// ======================================================
//  START / STOP
// ======================================================

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

  recognitionMode = "SEQUENCE";

  try {
    recognition?.stop();
  } catch {}
}

// ======================================================
//  AD-HOC INPUT
// ======================================================

function startVoiceInput(callback) {
  if (recognizing) return;

  const SR =
    window.webkitSpeechRecognition ||
    window.SpeechRecognition;

  if (!SR) {
    alert(
      "Brak wsparcia dla rozpoznawania mowy."
    );

    return;
  }

  if (!recognition) {
    recognition = initRecognition();
  }

  recognitionMode = "AD_HOC";

  adHocCallback = (spoken) => {
    callback(spoken.trim());
  };

  recognizing = true;

  try {
    recognition.start();
  } catch (e) {
    console.log(e);
  }
}

// ======================================================
//  CLICK EVENTS
// ======================================================

document.addEventListener("click", (e) => {
  const row = e.target.parentElement;

  if (!row) return;

  const ticker =
    row.children[0]?.textContent.trim();

  if (!ticker) return;

  const tData = tickers[ticker];

  if (!tData) return;

  const rec =
    tData["M15"]?.last ||
    tData["H1"]?.last ||
    tData["M5"]?.last;

  if (!rec) return;

  // POPUP

  if (
    e.target.classList.contains(
      "ticker-cell"
    )
  ) {
    const popup =
      document.getElementById("popup");

    const body =
      document.getElementById("popupBody");

    body.innerHTML = `
      <h2>
        ${ticker}
      </h2>

      <pre style="
        white-space:pre-wrap;
        font-family:inherit;
      ">
${buildDynamicComment(rec)}
      </pre>
    `;

    popup.style.display = "block";
  }

  // PRICE

  if (
    e.target.classList.contains(
      "price-cell"
    )
  ) {
    document.getElementById(
      "comment"
    ).textContent =
      "🎤 Podaj nową cenę";

    startVoiceInput((spoken) => {
      const value =
        parseFloat(
          spoken.replace(",", ".")
        );

      if (!isNaN(value)) {
        rec.close = value;

        updateTable();

        document.getElementById(
          "comment"
        ).textContent =
          "✔️ Cena ustawiona";
      }
    });
  }

  // ENTRY

  if (
    e.target.classList.contains(
      "entry-cell"
    )
  ) {
    document.getElementById(
      "comment"
    ).textContent =
      "🎤 Podaj entry";

    startVoiceInput((spoken) => {
      const value =
        parseFloat(
          spoken.replace(",", ".")
        );

      if (!isNaN(value)) {
        rec.entry = value;

        updateTable();

        document.getElementById(
          "comment"
        ).textContent =
          "✔️ Entry ustawione";
      }
    });
  }

  // DELETE

  if (
    e.target.classList.contains(
      "delete-cell"
    )
  ) {
    delete tickers[ticker];

    updateTable();
  }
});

// ======================================================
//  POPUP CLOSE
// ======================================================

document.getElementById(
  "popupClose"
).onclick = () => {
  document.getElementById(
    "popup"
  ).style.display = "none";
};

// ======================================================
//  CLEANUP
// ======================================================

window.onbeforeunload = () => {
  speechSynthesis.cancel();

  try {
    recognition?.stop();
  } catch {}
};

// ======================================================
//  AUTO LOAD
// ======================================================

document.addEventListener(
  "DOMContentLoaded",
  loadTable
);
