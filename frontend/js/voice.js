// ======================================================
//  KONFIGURACJA
// ======================================================

const backend =
  "https://voice-xtb.onrender.com/voice-parse";

const STORAGE_KEY =
  "xtbtablememoryv2multitf";

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

  text = text
    .toString()
    .trim()
    .toLowerCase();

  text = text
    .replaceAll("kropka", ".")
    .replaceAll("przecinek", ".")
    .replace(/\s+/g, "");

  const num = Number(text);

  return isFinite(num)
    ? num
    : 0;
}

function normalizeInterval(tf) {

  tf = tf
    .toUpperCase()
    .trim();

  if (tf === "5" || tf === "M5") {
    return "M5";
  }

  if (tf === "15" || tf === "M15") {
    return "M15";
  }

  if (
    tf === "H1" ||
    tf === "1H" ||
    tf === "60"
  ) {
    return "H1";
  }

  return tf;
}

// ======================================================
//  VALIDATE
// ======================================================

function validateCandle(c) {

  if (
    !isFinite(c.open) ||
    !isFinite(c.high) ||
    !isFinite(c.low) ||
    !isFinite(c.close)
  ) {
    return false;
  }

  if (
    c.open <= 0 ||
    c.high <= 0 ||
    c.low <= 0 ||
    c.close <= 0
  ) {
    return false;
  }

  return (
    c.high >= c.low &&
    c.open >= c.low &&
    c.open <= c.high &&
    c.close >= c.low &&
    c.close <= c.high
  );
}

// ======================================================
//  HISTORY
// ======================================================

function pushToHistory(
  store,
  tf,
  candle
) {

  if (!store[tf]) {

    store[tf] = {
      history: []
    };

  }

  if (!store[tf].history) {
    store[tf].history = [];
  }

  store[tf].history.push(candle);

  const limit =
    HISTORY_LIMITS[tf] || 5;

  if (
    store[tf].history.length > limit
  ) {

    store[tf].history =
      store[tf].history.slice(
        -limit
      );

  }

}

// ======================================================
//  TREND
// ======================================================

function trendDirectionFromHistory(
  history
) {

  if (
    !history ||
    history.length < 2
  ) {
    return "NEUTRAL";
  }

  const first =
    history[0];

  const last =
    history[
      history.length - 1
    ];

  const diff =
    Math.abs(
      last.close - first.close
    ) / first.close;

  if (
    last.close > first.close &&
    diff > 0.01
  ) {
    return "UP";
  }

  if (
    last.close < first.close &&
    diff > 0.01
  ) {
    return "DOWN";
  }

  return "NEUTRAL";
}

function trendStrengthFromHistory(
  history
) {

  if (
    !history ||
    history.length === 0
  ) {
    return 0;
  }

  const last =
    history[
      history.length - 1
    ];

  const prev =
    history[
      Math.max(
        0,
        history.length - 2
      )
    ];

  const spread =
    Math.abs(
      last.ma20 - last.dema9
    );

  const slope =
    Math.abs(
      last.ma20 - prev.ma20
    );

  return spread + slope;
}

// ======================================================
//  SIGNAL ENGINE
// ======================================================

function computeSignalForTF(
  history
) {

  if (
    !history ||
    history.length === 0
  ) {
    return "CZEKAJ";
  }

  const last =
    history[
      history.length - 1
    ];

  const dir =
    trendDirectionFromHistory(
      history
    );

  const strength =
    trendStrengthFromHistory(
      history
    );

  const rsi =
    last.rsi;

  const c =
    last.close;

  const ma =
    last.ma20;

  const de =
    last.dema9;

  const aboveMA =
    c > de && de > ma;

  const belowMA =
    c < de && de < ma;

  let base = "CZEKAJ";

  if (
    dir === "UP" &&
    aboveMA
  ) {

    base = "BUY";

  }

  else if (
    dir === "DOWN" &&
    belowMA
  ) {

    base = "SELL";

  }

  else if (dir === "UP") {

    base = "PRAWIE BUY";

  }

  else if (dir === "DOWN") {

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

function consensusSignalFromStore(
  tData
) {

  const sigs = [];

  [
    "M5",
    "M15",
    "H1"
  ].forEach((tf) => {

    const tfData =
      tData[tf];

    if (tfData?.signal) {
      sigs.push(tfData.signal);
    }

  });

  const buyCount =
    sigs.filter(
      (s) => s === "BUY"
    ).length;

  const sellCount =
    sigs.filter(
      (s) => s === "SELL"
    ).length;

  if (buyCount >= 2) {
    return "BUY";
  }

  if (sellCount >= 2) {
    return "SELL";
  }

  if (
    sigs.includes(
      "PRAWIE BUY"
    )
  ) {
    return "PRAWIE BUY";
  }

  if (
    sigs.includes(
      "PRAWIE SELL"
    )
  ) {
    return "PRAWIE SELL";
  }

  if (
    sigs.includes(
      "CZEKAJ DO"
    )
  ) {
    return "CZEKAJ DO";
  }

  return "CZEKAJ";
}

// ======================================================
//  WIDEŁKI
// ======================================================

function computeWidelki(rec) {

  const L = rec.low;
  const H = rec.high;

  const dol =
    L + (H - L) * 0.2;

  const gor =
    L + (H - L) * 0.35;

  return `
    ${dol.toFixed(2)}
    -
    ${gor.toFixed(2)}
  `;
}

// ======================================================
//  TP1 TP2
// ======================================================

function computeTP12(
  rec,
  widDol,
  widGor
) {

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

  if (
    s.includes("BUY")
  ) {

    return {

      tp1:
        (
          widGor +
          0.5 * R
        ).toFixed(2),

      tp2:
        (
          widGor +
          1.0 * R
        ).toFixed(2)

    };

  }

  if (
    s.includes("SELL")
  ) {

    return {

      tp1:
        (
          widDol -
          0.5 * R
        ).toFixed(2),

      tp2:
        (
          widDol -
          1.0 * R
        ).toFixed(2)

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

  const c =
    rec.close;

  const ma =
    rec.ma20;

  const de =
    rec.dema9;

  const s =
    rec.signal;

  if (
    !s ||
    s === "CZEKAJ" ||
    s === "CZEKAJ DO"
  ) {
    return "—";
  }

  const trendStrength =
    Math.abs(ma - de);

  const mid =
    (ma + de) / 2;

  const distance =
    Math.abs(c - mid);

  const tp =
    distance +
    trendStrength;

  if (
    s.includes("BUY")
  ) {

    return (
      c + tp
    ).toFixed(2);

  }

  if (
    s.includes("SELL")
  ) {

    return (
      c - tp
    ).toFixed(2);

  }

  return "—";
}

// ======================================================
//  COMMENT ENGINE
// ======================================================

function buildDynamicComment(
  rec,
  tData
) {

  const c = rec.close;
  const o = rec.open;
  const h = rec.high;
  const l = rec.low;

  const ma = rec.ma20;
  const de = rec.dema9;
  const rsi = rec.rsi;

  const range = h - l;

  const body =
    Math.abs(c - o);

  const upperWick =
    h - Math.max(c, o);

  const lowerWick =
    Math.min(c, o) - l;

  const dirM15 =
    tData["M15"]
      ? trendDirectionFromHistory(
          tData["M15"].history
        )
      : "NEUTRAL";

  const dirH1 =
    tData["H1"]
      ? trendDirectionFromHistory(
          tData["H1"].history
        )
      : "NEUTRAL";

  let TREND = "";

  if (
    dirH1 === "UP" ||
    dirM15 === "UP"
  ) {

    TREND =
      "Trend wzrostowy. " +
      "Rynek utrzymuje wyższe dołki.";

  }

  else if (
    dirH1 === "DOWN" ||
    dirM15 === "DOWN"
  ) {

    TREND =
      "Trend spadkowy. " +
      "Podaż nadal kontroluje rynek.";

  }

  else {

    TREND =
      "Rynek pozostaje neutralny.";

  }

  let MOM = "";

  if (rsi <= 25) {

    MOM =
      `RSI ${rsi} = skrajne wyprzedanie.`;

  }

  else if (rsi >= 75) {

    MOM =
      `RSI ${rsi} = ekstremalne wykupienie.`;

  }

  else {

    MOM =
      `RSI ${rsi} = neutralne momentum.`;

  }

  let SS = "";

  const strongBull =
    c > o &&
    body > range * 0.6;

  const strongBear =
    o > c &&
    body > range * 0.6;

  if (strongBull) {

    SS =
      "Silna świeca wzrostowa.";

  }

  else if (strongBear) {

    SS =
      "Silna świeca spadkowa.";

  }

  else {

    SS =
      "Brak dominującej strony.";

  }

  const ws1 =
    (l + range * 0.15)
      .toFixed(2);

  const op1 =
    (h - range * 0.15)
      .toFixed(2);

  return `

TREND:
${TREND}

MOMENTUM:
${MOM}

SIŁA:
${SS}

WSPARCIE:
${ws1}

OPÓR:
${op1}

CLOSE:
${c}

MA20:
${ma}

DEMA9:
${de}

RSI:
${rsi}

`;

}

// ======================================================
//  ROW COLOR
// ======================================================

function getRowClass(signal) {

  if (!signal) {
    return "row-czekaj";
  }

  if (signal === "BUY") {
    return "row-buy";
  }

  if (signal === "SELL") {
    return "row-sell";
  }

  if (
    signal === "PRAWIE BUY" ||
    signal === "PRAWIE SELL"
  ) {
    return "row-prawie";
  }

  if (
    signal === "CZEKAJ DO"
  ) {
    return "row-czekajdo";
  }

  return "row-czekaj";
}

// ======================================================
//  TP COLOR
// ======================================================

function tpColor(
  price,
  tp,
  signal
) {

  if (
    !tp ||
    tp === "—"
  ) {
    return "";
  }

  const p =
    parseFloat(price);

  const t =
    parseFloat(tp);

  if (
    isNaN(p) ||
    isNaN(t)
  ) {
    return "";
  }

  if (
    signal?.includes("BUY")
  ) {

    if (p >= t) {
      return "tp-hit";
    }

    if (p >= t * 0.9) {
      return "tp-close";
    }

    return "tp-fail";

  }

  if (
    signal?.includes("SELL")
  ) {

    if (p <= t) {
      return "tp-hit";
    }

    if (p <= t * 1.1) {
      return "tp-close";
    }

    return "tp-fail";

  }

  return "";
}

// ======================================================
//  HANDLE BACKEND
// ======================================================

function handleBackendData(d) {

  const tf =
    normalizeInterval(
      d.interval
    );

  const t =
    d.ticker;

  if (!tickers[t]) {
    tickers[t] = {};
  }

  // ======================================================
  // LAST UPDATE
  // ======================================================

  tickers[t].lastTF = tf;

  tickers[t].lastTime =
    d.time;

  // ======================================================
  // HISTORY
  // ======================================================

  pushToHistory(
    tickers[t],
    tf,
    d
  );

  const tfStore =
    tickers[t][tf];

  const history =
    tfStore.history;

  const last =
    history[
      history.length - 1
    ];

  const tfSignal =
    computeSignalForTF(
      history
    );

  tfStore.signal =
    tfSignal;

  tfStore.last =
    last;

  last.signal =
    tfSignal;

  // ======================================================
  // M15 EXTRA
  // ======================================================

  if (tf === "M15") {

    last.widelki =
      computeWidelki(last);

    const [
      dol,
      gor
    ] =
      last.widelki
        .split("-")
        .map((x) =>
          Number(x.trim())
        );

    const tp12 =
      computeTP12(
        last,
        dol,
        gor
      );

    last.tp1 =
      tp12.tp1;

    last.tp2 =
      tp12.tp2;

    last.tp3 =
      computeTP3(last);

  }

  updateTable();
}

// ======================================================
//  UPDATE TABLE
// ======================================================

function updateTable() {

  const tbody =
    document.getElementById(
      "table-body"
    );

  tbody.innerHTML = "";

  const rows = [];

  Object.keys(tickers)
    .forEach((ticker) => {

      const tData =
        tickers[ticker];

      const lastTF =
        tData.lastTF;

      if (!lastTF) return;

      const rec =
        tData[lastTF]?.last;

      if (!rec) return;

      const signal =
        consensusSignalFromStore(
          tData
        );

      rows.push({
        ticker,
        tData,
        rec,
        signal
      });

    });

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
      document.createElement(
        "tr"
      );

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

  ${tData.lastTF}

  <br>

  <span class="time-mini">
    ${tData.lastTime ?? ""}
  </span>

</td>

<td class="entry-cell">

  ${
    rec.entry
      ? rec.entry
      : "—"
  }

</td>

<td>

  <div class="signal-box">
    ${signal}
  </div>

</td>

<td>
  ${
    M15?.widelki ?? "—"
  }
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

  if (
    rows.length === 0
  ) {

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
//  STORAGE
// ======================================================

function saveTable() {

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(tickers)
  );

}

function loadTable() {

  const raw =
    localStorage.getItem(
      STORAGE_KEY
    );

  if (!raw) return;

  try {

    const parsed =
      JSON.parse(raw);

    Object.assign(
      tickers,
      parsed
    );

    updateTable();

  }

  catch (e) {

    console.error(e);

  }

}

// ======================================================
//  SPEECH
// ======================================================

function initRecognition() {

  const SR =
    window.webkitSpeechRecognition ||
    window.SpeechRecognition;

  if (!SR) {
    return null;
  }

  const rec = new SR();

  rec.lang = "pl-PL";

  rec.continuous = false;

  rec.interimResults = false;

  rec.onresult = (e) => {

    const text =
      e.results[0][0]
        .transcript
        .trim();

    document.getElementById(
      "recognized"
    ).textContent =
      `Rozpoznano: ${text}`;

    if (
      recognitionMode ===
      "SEQUENCE"
    ) {

      handleRecognized(text);

    }

    else if (
      recognitionMode ===
        "AD_HOC" &&
      adHocCallback
    ) {

      adHocCallback(text);

      adHocCallback = null;

      recognitionMode =
        "SEQUENCE";

      recognizing = false;

    }

    try {
      rec.stop();
    } catch {}

  };

  return rec;
}

recognition =
  initRecognition();

// ======================================================
//  RECOGNIZED
// ======================================================


    function handleRecognized(text) {

  switch (currentStep) {
    case 0:
      tempRecord.ticker = text.toUpperCase();
      break;
    case 1:
      tempRecord.interval = normalizeInterval(text);
      break;
    case 2:
      tempRecord.open = extractNumber(text);
      break;
    case 3:
      tempRecord.high = extractNumber(text);
      break;
    case 4:
      tempRecord.low = extractNumber(text);
      break;
    case 5:
      tempRecord.close = extractNumber(text);
      break;
    case 6:
      tempRecord.volume = extractNumber(text);
      break;
    case 7:
      tempRecord.ma20 = extractNumber(text);
      break;
    case 8:
      tempRecord.dema9 = extractNumber(text);
      break;
    case 9:
      tempRecord.rsi = extractNumber(text);
      break;
  }

  currentStep++;

  // 🔴 KLUCZ: jeśli nie koniec → idź dalej
  if (currentStep < steps.length) {

    setTimeout(() => {
      sayStep();   // <<< TO ODPALA NASTĘPNY MIKROFON
    }, 300);

    return;
  }

  // koniec sekwencji
  recognizing = false;

  try {
    recognition.stop();
    speechSynthesis.cancel();
  } catch {}

  finalizeRecord();
}

  

// ======================================================
//  SPEAK STEP
// ======================================================

function sayStep() {

  if (
    currentStep >=
    steps.length
  ) {
    return;
  }

  const msg =
    new SpeechSynthesisUtterance(
      steps[currentStep]
    );

  msg.lang = "pl-PL";

  msg.onend = () => {

    setTimeout(() => {

      try {

        if (recognizing) {
          recognition.start();
        }

      } catch (e) {

        console.log(e);

      }

    }, 250);

  };

  speechSynthesis.cancel();

  speechSynthesis.speak(msg);

}

// ======================================================
//  FINALIZE
// ======================================================

async function finalizeRecord() {

  if (isFetching) {
    return;
  }

  isFetching = true;

  tempRecord.time =
    new Date()
      .toLocaleTimeString(
        "pl-PL",
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      );

  document.getElementById(
    "comment"
  ).textContent =
    "⏳ Analiza...";

  // ======================================================
  // VALIDATE
  // ======================================================

  if (
    !validateCandle(
      tempRecord
    )
  ) {

    console.warn(
      "OHLC WARNING:",
      tempRecord
    );

  }

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
            JSON.stringify(
              tempRecord
            )

        }
      );

    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }

    const data =
      await response.json();

    if (!data.time) {

      data.time =
        tempRecord.time;

    }

    handleBackendData(
      data
    );

    document.getElementById(
      "comment"
    ).textContent =
      "✔️ Dodano świecę";

  }

  catch (err) {

    console.error(err);

    document.getElementById(
      "comment"
    ).textContent =
      "❌ BACKEND ERROR";

  }

  finally {

    tempRecord = {};

    currentStep = 0;

    isFetching = false;

  }

}

// ======================================================
//  START STOP
// ======================================================

function startSequence() {

  if (recognizing) {
    return;
  }

  tempRecord = {};

  currentStep = 0;

  recognitionMode =
    "SEQUENCE";

  recognizing = true;

  sayStep();

}

function stopSequence() {

  recognizing = false;

  speechSynthesis.cancel();

  try {
    recognition?.stop();
  } catch {}

}

// ======================================================
//  VOICE INPUT
// ======================================================

function startVoiceInput(
  callback
) {

  if (recognizing) {
    return;
  }

  const SR =
    window.webkitSpeechRecognition ||
    window.SpeechRecognition;

  if (!SR) {

    alert(
      "Brak SpeechRecognition"
    );

    return;

  }

  if (!recognition) {
    recognition =
      initRecognition();
  }

  recognitionMode =
    "AD_HOC";

  adHocCallback =
    (spoken) => {
      callback(
        spoken.trim()
      );
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

document.addEventListener(
  "click",
  (e) => {

    const cell =
      e.target.closest("td");

    const row =
      e.target.closest("tr");

    if (
      !cell ||
      !row
    ) {
      return;
    }

    const ticker =
      row.querySelector(
        ".ticker-cell"
      )
      ?.textContent
      ?.trim();

    if (!ticker) {
      return;
    }

    const tData =
      tickers[ticker];

    if (!tData) {
      return;
    }

    const rec =
      tData[
        tData.lastTF
      ]?.last;

    if (!rec) {
      return;
    }

    // ======================================================
    // POPUP
    // ======================================================

    if (
      cell.classList.contains(
        "ticker-cell"
      )
    ) {

      const popup =
        document.getElementById(
          "popup"
        );

      const body =
        document.getElementById(
          "popupBody"
        );

      body.innerHTML = `

<h2>
${ticker}
</h2>

<pre style="
white-space:pre-wrap;
font-family:inherit;
line-height:1.5;
">
${buildDynamicComment(
  rec,
  tData
)}
</pre>

`;

      popup.style.display =
        "block";

      return;

    }

    // ======================================================
    // PRICE
    // ======================================================

    if (
      cell.classList.contains(
        "price-cell"
      )
    ) {

      document.getElementById(
        "comment"
      ).textContent =
        "🎤 Podaj cenę";

      startVoiceInput(
        (spoken) => {

          const value =
            parseFloat(
              spoken.replace(
                ",",
                "."
              )
            );

          if (
            !isNaN(value)
          ) {

            rec.close =
              value;

            updateTable();

            document.getElementById(
              "comment"
            ).textContent =
              "✔️ Cena ustawiona";

          }

        }
      );

      return;

    }

    // ======================================================
    // ENTRY
    // ======================================================

    if (
      cell.classList.contains(
        "entry-cell"
      )
    ) {

      document.getElementById(
        "comment"
      ).textContent =
        "🎤 Podaj entry";

      startVoiceInput(
        (spoken) => {

          const value =
            parseFloat(
              spoken.replace(
                ",",
                "."
              )
            );

          if (
            !isNaN(value)
          ) {

            rec.entry =
              value;

            updateTable();

            document.getElementById(
              "comment"
            ).textContent =
              "✔️ Entry ustawione";

          }

        }
      );

      return;

    }

    // ======================================================
    // DELETE
    // ======================================================

    if (
      cell.classList.contains(
        "delete-cell"
      )
    ) {

      delete tickers[
        ticker
      ];

      updateTable();

      return;

    }

  }
);

// ======================================================
//  POPUP CLOSE
// ======================================================

document.getElementById(
  "popupClose"
).onclick = () => {

  document.getElementById(
    "popup"
  ).style.display =
    "none";

};

// ======================================================
//  CLEANUP
// ======================================================

window.onbeforeunload =
  () => {

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
