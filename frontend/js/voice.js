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

  if (!text) return 0;

  text = text
    .toString()
    .trim()
    .toLowerCase();

  // tylko zamiana słowna → znak
  text = text
    .replace("kropka", ".")
    .replace("przecinek", ".")
    .replace(/\s+/g, "");

  const num = Number(text);

  return isFinite(num) ? num : 0;
}


function normalizeInterval(tf) {
  tf = tf.toUpperCase().trim();

  if (tf === "M5" || tf === "5") return "M5";
  if (tf === "M15" || tf === "15") return "M15";
  if (tf === "H1" || tf === "1H" || tf === "60") return "H1";

  return tf;
}

function validateCandle(c) {

  // brak danych
  if (
    !isFinite(c.open) ||
    !isFinite(c.high) ||
    !isFinite(c.low) ||
    !isFinite(c.close)
  ) {
    return false;
  }

  // absurdalne wartości
  if (
    c.open <= 0 ||
    c.high <= 0 ||
    c.low <= 0 ||
    c.close <= 0
  ) {
    return false;
  }

  // AUTO FIX HIGH / LOW
  // jeśli voice pomylił kolejność

  if (c.low > c.high) {
    const tmp = c.low;
    c.low = c.high;
    c.high = tmp;
  }

  // tolerancja 5%
  const tolerance =
    Math.abs(c.high - c.low) * 0.05;

  // OPEN poza zakresem
  if (c.open < c.low - tolerance) {
    c.open = c.low;
  }

  if (c.open > c.high + tolerance) {
    c.open = c.high;
  }

  // CLOSE poza zakresem
  if (c.close < c.low - tolerance) {
    c.close = c.low;
  }

  if (c.close > c.high + tolerance) {
    c.close = c.high;
  }

  return true;
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
      "⚠ Skorygowano świecę OHLC";
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

    if (!data.time)
      data.time = tempRecord.time;

    try {

      handleBackendData(data);

      document.getElementById("comment").textContent =
        "✔️ Dodano świecę";

    } catch(err) {

      console.error("HANDLE ERROR:", err);

      document.getElementById("comment").textContent =
        "❌ FRONT ERROR: " + err.message;
    }

  })
  .catch((err) => {

    console.error("FETCH ERROR:", err);

    document.getElementById("comment").textContent =
      "❌ BACKEND/FETCH ERROR: " + err.message;
  });

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

  // ======================================================
  // KOLEJNOŚĆ SYGNAŁÓW
  // ======================================================

  const priority = {
    "ENTRY": 0,
    "BUY": 1,
    "PRAWIE BUY": 2,
    "CZEKAJ DO": 3,
    "CZEKAJ": 4,
    "PRAWIE SELL": 5,
    "SELL": 6
  };

  // ======================================================
  // ZAMIANA NA TABLICĘ
  // ======================================================

  const rows = [];

  Object.keys(tickers).forEach((t) => {

    const tData = tickers[t];

    const M5 =
      tData["M5"]?.last;

    const M15 =
      tData["M15"]?.last;

    const H1 =
      tData["H1"]?.last;

    const rec =
      M15 || H1 || M5;

    if (!rec) return;

    const signal =
      consensusSignalFromStore(tData);

    const hasEntry =
      rec.entry !== undefined &&
      rec.entry !== "" &&
      rec.entry !== "—";

    rows.push({
      ticker: t,
      tData,
      rec,
      signal,
      priority:
        hasEntry
          ? priority["ENTRY"]
          : priority[signal] ?? 999
    });

  });

  // ======================================================
  // SORTOWANIE
  // ======================================================

  rows.sort((a, b) => {

    // ENTRY zawsze na górze
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    // dodatkowo BUY wyżej jeśli większy RSI
    if (
      a.signal === "BUY" &&
      b.signal === "BUY"
    ) {
      return b.rec.rsi - a.rec.rsi;
    }

    // SELL niżej jeśli mocniejszy SELL
    if (
      a.signal === "SELL" &&
      b.signal === "SELL"
    ) {
      return a.rec.rsi - b.rec.rsi;
    }

    return 0;

  });

  // ======================================================
  // RENDER
  // ======================================================

  rows.forEach((item) => {

    const {
      ticker,
      tData,
      rec,
      signal
    } = item;

    const M15 =
      tData["M15"]?.last;

    const row =
      document.createElement("tr");

    row.className =
      getRowClass(signal);

    row.innerHTML = `
    
      <td class="ticker-cell">
        ${ticker}
      </td>

      <td class="price-cell">
        ${rec.close.toFixed(2)}
      </td>

      <td>
        ${rec.interval}<br>

        <span style="
          font-size:11px;
          opacity:0.7;
        ">
          ${rec.time ?? ""}
        </span>
      </td>

      <td class="entry-cell">

        ${
          rec.entry
            ? `<span style="
                 color:#ffd166;
                 font-weight:700;
               ">
                 ${rec.entry}
               </span>`
            : "—"
        }

      </td>

      <td>

  <div class="signal-box">
    ${signal}
  </div>

  <div class="time-mini">
    ${rec.time ?? ""}
  </div>

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

      <td class="delete-cell">
        🗑️
      </td>

    `;

    tbody.appendChild(row);

  });

  // ======================================================
  // PUSTA TABELA
  // ======================================================

  if (rows.length === 0) {

    tbody.innerHTML = `
      <tr>
        <td colspan="10">
          Brak danych...
        </td>
      </tr>
    `;

  }

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

function buildDynamicComment(rec, tData) {

  const c = rec.close;
  const o = rec.open;
  const h = rec.high;
  const l = rec.low;

  const ma = rec.ma20;
  const de = rec.dema9;
  const rsi = rec.rsi;

  const range = h - l;

  const body = Math.abs(c - o);

  const upperWick = h - Math.max(c, o);
  const lowerWick = Math.min(c, o) - l;

  const dirM15 = tData["M15"]
    ? trendDirectionFromHistory(
        tData["M15"].history
      )
    : "NEUTRAL";

  const dirH1 = tData["H1"]
    ? trendDirectionFromHistory(
        tData["H1"].history
      )
    : "NEUTRAL";

  // ======================================================
  // TREND
  // ======================================================

  let TREND = "";

  const keyLow1 = (ma - range * 0.35).toFixed(0);
  const keyLow2 = (ma - range * 0.15).toFixed(0);

  if (
    (dirH1 === "UP" || dirM15 === "UP") &&
    c < o
  ) {

    TREND =
      `Trend wzrostowy, ale świeca spadkowa ` +
      `wprowadza mocną korektę. ` +
      `Struktura nadal trzyma, dopóki cena ` +
      `jest powyżej ${keyLow1}–${keyLow2}.`;

  }

  else if (
    (dirH1 === "DOWN" || dirM15 === "DOWN") &&
    c > o
  ) {

    TREND =
      `Trend spadkowy, ale pojawiło się ` +
      `kontrujące odbicie. ` +
      `Presja podaży nadal dominuje.`;

  }

  else if (
    dirH1 === "UP" ||
    dirM15 === "UP"
  ) {

    TREND =
      `Trend wzrostowy. ` +
      `Cena utrzymuje strukturę wyższych dołków ` +
      `i nadal kontrolowana jest przez popyt.`;

  }

  else if (
    dirH1 === "DOWN" ||
    dirM15 === "DOWN"
  ) {

    TREND =
      `Trend spadkowy. ` +
      `Rynek pozostaje pod presją podaży ` +
      `i każda próba odbicia jest gaszona.`;

  }

  else {

    TREND =
      `Rynek znajduje się w konsolidacji ` +
      `i nadal nie ma dominującego kierunku.`;

  }

  // ======================================================
  // MOMENTUM
  // ======================================================

  let MOM = "";

  if (rsi <= 25) {

    MOM =
      `RSI ${rsi} = skrajne wyprzedanie. ` +
      `To sygnał paniki, nie trendu spadkowego. ` +
      `Statystycznie rynek odbija z takich poziomów.`;

  }

  else if (rsi <= 35) {

    MOM =
      `RSI ${rsi} = wyprzedanie rynku. ` +
      `Momentum spadkowe słabnie i może pojawić się odbicie.`;

  }

  else if (rsi >= 75) {

    MOM =
      `RSI ${rsi} = ekstremalne wykupienie. ` +
      `Rynek jest rozgrzany i podatny na korektę.`;

  }

  else if (rsi >= 65) {

    MOM =
      `RSI ${rsi} = silne momentum wzrostowe, ` +
      `ale rynek zaczyna być wykupiony.`;

  }

  else {

    MOM =
      `RSI ${rsi} = neutralne momentum. ` +
      `Rynek nadal szuka kierunku.`;

  }

  // ======================================================
  // SIŁA / SŁABOŚĆ
  // ======================================================

  let SS = "";

  const bigRange =
    range > (ma * 0.012);

  const strongBull =
    c > o &&
    body > range * 0.6;

  const strongBear =
    o > c &&
    body > range * 0.6;

  if (
    bigRange &&
    c < de
  ) {

    SS +=
      `Duży zasięg świecy i zejście pod DEMA9 ` +
      `= słabość krótkoterminowa. `;

  }

  if (
    lowerWick > body * 0.8
  ) {

    SS +=
      `Długi dolny knot sugeruje obecność popytu ` +
      `i aktywne bronienie poziomów. `;

  }

  if (
    upperWick > body * 0.8
  ) {

    SS +=
      `Długi górny knot pokazuje aktywną podaż ` +
      `i odrzucenie wyższych poziomów. `;

  }

  if (strongBull) {

    SS +=
      `Silna świeca wzrostowa wskazuje ` +
      `na przewagę kupujących.`;

  }

  if (strongBear) {

    SS +=
      `Silna świeca spadkowa wskazuje ` +
      `na dominację sprzedających.`;

  }

  if (SS === "") {

    SS =
      `Brak dominującej strony rynku. ` +
      `Cena porusza się neutralnie względem średnich.`;

  }

  // ======================================================
  // WSPARCIA / OPORY
  // ======================================================

  const ws1a = (l + range * 0.10).toFixed(0);
  const ws1b = (l + range * 0.20).toFixed(0);

  const ws2a = (l + range * 0.00).toFixed(0);
  const ws2b = (l + range * 0.10).toFixed(0);

  const op1a = (h - range * 0.20).toFixed(0);
  const op1b = (h).toFixed(0);

  const op2a = (de).toFixed(0);
  const op2b = (de + range * 0.20).toFixed(0);

  const op3a = (ma + range * 0.60).toFixed(0);
  const op3b = (ma + range * 0.90).toFixed(0);

  // ======================================================
  // INTERPRETACJA
  // ======================================================

  let INTER = "";

  const capitulation =
    rsi <= 28 &&
    strongBear &&
    lowerWick > body * 0.5;

  const breakout =
    c > h - range * 0.15;

  const pullback =
    c > de &&
    c < ma;

  if (capitulation) {

    INTER =
      `To nie jest odwrócenie trendu. ` +
      `To kapitulacja i mocna korekta po wybiciu. ` +
      `Rynek często wraca do VWAP po takim ruchu.`;

  }

  else if (breakout) {

    INTER =
      `Rynek próbuje wybicia górą. ` +
      `Momentum jest silne, ale po takim ruchu ` +
      `często pojawia się cofnięcie do średnich.`;

  }

  else if (pullback) {

    INTER =
      `To wygląda jak klasyczny pullback ` +
      `do średnich w aktywnym trendzie.`;

  }

  else {

    INTER =
      `Sytuacja nadal pozostaje neutralna ` +
      `i rynek nie pokazał pełnej dominacji żadnej strony.`;

  }

  // ======================================================
  // RYZYKO
  // ======================================================

  let RISK = "";

  const riskLevel =
    (l + range * 0.05).toFixed(0);

  if (
    dirH1 === "UP" ||
    dirM15 === "UP"
  ) {

    RISK =
      `Realne ryzyko pojawia się dopiero ` +
      `przy zamknięciu M15 poniżej ${riskLevel}.`;

  }

  else if (
    dirH1 === "DOWN" ||
    dirM15 === "DOWN"
  ) {

    RISK =
      `Rynek pozostaje ryzykowny ` +
      `dopóki cena nie wróci powyżej ${op1a}.`;

  }

  else {

    RISK =
      `Ryzyko neutralne — brak aktywnego trendu.`;

  }

  // ======================================================
  // FINAL
  // ======================================================

  return `
TREND: ${TREND}

MOMENTUM: ${MOM}

SIŁA/SŁABOŚĆ: ${SS}

WSPARCIA:
• ${ws1a}–${ws1b} (lokalne)
• ${ws2a}–${ws2b} (kluczowe)

OPORY:
• ${op1a}–${op1b} (lokalne)
• ${op2a}–${op2b} (DEMA9)
• ${op3a}–${op3b} (normalizacja)

INTERPRETACJA:
${INTER}

RYZYKO:
${RISK}
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

  const cell = e.target.closest("td");
  const row = e.target.closest("tr");

  if (!cell || !row) return;

  const ticker =
    row.querySelector(".ticker-cell")
      ?.textContent
      ?.trim();

  if (!ticker) return;

  const tData = tickers[ticker];

  if (!tData) return;

  const rec =
    tData["M15"]?.last ||
    tData["H1"]?.last ||
    tData["M5"]?.last;

  if (!rec) return;

  // ======================================================
  // POPUP — TYLKO TICKER
  // ======================================================

  if (cell.classList.contains("ticker-cell")) {

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
        line-height:1.5;
      ">
${buildDynamicComment(rec, tData)}
      </pre>
    `;

    popup.style.display = "block";

    return;
  }

  // ======================================================
  // PRICE
  // ======================================================

  if (cell.classList.contains("price-cell")) {

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

    return;
  }

  // ======================================================
  // ENTRY
  // ======================================================

  if (cell.classList.contains("entry-cell")) {

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

    return;
  }

  // ======================================================
  // DELETE
  // ======================================================

  if (cell.classList.contains("delete-cell")) {

    delete tickers[ticker];

    updateTable();

    return;
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
