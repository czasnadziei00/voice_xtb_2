// ======================================================
//  KONFIGURACJA
// ======================================================

const backend = "https://voice-xtb.onrender.com/voice-parse";

let recognition = null;
let recognizing = false;
let recognitionMode = "SEQUENCE"; // SEQUENCE | AD_HOC
let adHocCallback = null;

let currentStep = 0;
let tempRecord = {};

const steps = [
  "Podaj ticker",
  "Podaj interwał",
  "Podaj open",
  "Podaj low",
  "Podaj high",
  "Podaj close",
  "Podaj wolumen",
  "Podaj MA20",
  "Podaj DEMA9",
  "Podaj RSI"
];

// ======================================================
//  FINALIZACJA — WYSYŁKA DO BACKENDU
// ======================================================

function finalizeRecord() {
  tempRecord.time = new Date().toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit"
  });

  fetch(backend, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tempRecord)
  })
    .then(res => res.json())
    .then(data => {
      handleBackendData(data);
      document.getElementById("comment").textContent = "✔️ Dodano rekord";
    })
    .catch(() => {
      document.getElementById("comment").textContent = "❌ Błąd backendu";
    });
}

// ======================================================
//  INICJALIZACJA MASTER MICROPHONE
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

    if (recognitionMode === "SEQUENCE") {
      handleRecognized(text);
    } else if (recognitionMode === "AD_HOC" && adHocCallback) {
      adHocCallback(text);
      adHocCallback = null;
      recognitionMode = "SEQUENCE";
      recognizing = false;
    }

    try { rec.stop(); } catch {}
  };

  rec.onend = () => {
    if (!recognizing) return;

    if (recognitionMode === "SEQUENCE" && currentStep < steps.length) {
      sayStep();
    }
  };

  return rec;
}

recognition = initRecognition();

// ======================================================
//  UTILITY
// ======================================================

function extractNumber(text) {
  text = text.replace(",", ".").replace(/\s+/g, "");
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

// ======================================================
//  WIDEŁKI — LICZONE TYLKO Z M15
// ======================================================

function computeWidelki(rec) {
  const L = rec.low;
  const H = rec.high;

  const dol = L + (H - L) * 0.20;
  const gor = L + (H - L) * 0.35;

  return `${dol.toFixed(2)} - ${gor.toFixed(2)}`;
}

// ======================================================
//  TP1 / TP2 — STAŁE
// ======================================================

function computeTP12(rec, widDol, widGor) {
  const L = rec.low;
  const H = rec.high;
  const R = H - L;
  const s = rec.signal;

  if (!s) return { tp1: "—", tp2: "—" };

  if (s.includes("BUY")) {
    return {
      tp1: (widGor + 0.50 * R).toFixed(2),
      tp2: (widGor + 1.00 * R).toFixed(2)
    };
  }

  if (s.includes("SELL")) {
    return {
      tp1: (widDol - 0.50 * R).toFixed(2),
      tp2: (widDol - 1.00 * R).toFixed(2)
    };
  }

  return { tp1: "—", tp2: "—" };
}

// ======================================================
//  TP3 — DYNAMICZNE MOMENTUM
// ======================================================

function computeTP3(rec) {
  const c = rec.close;
  const ma = rec.ma20;
  const de = rec.dema9;
  const s = rec.signal;

  if (!s || s === "CZEKAJ" || s === "CZEKAJ DO") return "—";

  const trend_strength = Math.abs(ma - de);
  const mid = (ma + de) / 2;
  const distance = Math.abs(c - mid);

  const tp = distance + trend_strength;

  if (s.includes("BUY")) return (c + tp).toFixed(2);
  if (s.includes("SELL")) return (c - tp).toFixed(2);

  return "—";
}

// ======================================================
//  SYGNAŁ WSPÓLNY
// ======================================================

function consensusSignal(tData) {
  const sigs = [];

  ["M5", "M15", "H1"].forEach(tf => {
    const a = tData[tf];
    if (a && a.signal) sigs.push(a.signal);
  });

  if (sigs.includes("BUY")) return "BUY";
  if (sigs.includes("SELL")) return "SELL";
  if (sigs.includes("PRAWIE BUY")) return "PRAWIE BUY";
  if (sigs.includes("CZEKAJ DO")) return "CZEKAJ DO";

  return "CZEKAJ";
}

// ======================================================
//  KOLOROWANIE WIERSZY
// ======================================================

function getRowClass(signal) {
  if (!signal) return "row-czekaj";

  if (signal === "BUY") return "row-buy";
  if (signal === "SELL") return "row-sell";
  if (signal === "PRAWIE BUY") return "row-prawie";
  if (signal === "CZEKAJ DO") return "row-czekajdo";

  return "row-czekaj";
}

// ======================================================
//  KOLOROWANIE TP
// ======================================================

function tpColor(price, tp, signal) {
  if (!tp || tp === "—") return "";

  const p = parseFloat(price);
  const t = parseFloat(tp);

  if (isNaN(p) || isNaN(t)) return "";

  if (signal.includes("BUY")) {
    if (p >= t) return "tp-hit";
    if (p <= t * 0.97) return "tp-fail";
    if (p >= t * 0.90) return "tp-close";
  }

  if (signal.includes("SELL")) {
    if (p <= t) return "tp-hit";
    if (p >= t * 1.03) return "tp-fail";
    if (p <= t * 1.10) return "tp-close";
  }

  return "";
}
// ======================================================
//  TABELA
// ======================================================

const tickers = {};

function handleBackendData(d) {
  const tf = normalizeInterval(d.interval);
  const t = d.ticker;

  if (tf === "M15") {
    d.widelki = computeWidelki(d);

    const [dol, gor] = d.widelki.split(" - ").map(Number);

    const tp12 = computeTP12(d, dol, gor);
    d.tp1 = tp12.tp1;
    d.tp2 = tp12.tp2;

    d.tp3 = computeTP3(d);
  }

  if (!tickers[t]) tickers[t] = {};
  tickers[t][tf] = d;

  updateTable();
}

function updateTable() {
  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";

  Object.keys(tickers).forEach(t => {
    const tData = tickers[t];

    const M5 = tData["M5"];
    const M15 = tData["M15"];
    const H1 = tData["H1"];

    const rec = M15 || M5 || H1;
    if (!rec) return;

    const entry = rec.entry ?? "—";
    const signal = consensusSignal(tData);

    const row = document.createElement("tr");
    row.className = getRowClass(signal);

    row.innerHTML = `
      <td class="ticker-cell">${t}</td>
      <td class="price-cell">${rec.close.toFixed(2)}</td>

      <td>${rec.interval}</td>

      <td class="entry-cell">${entry}</td>

      <td>
        <span style="font-size:16px; font-weight:700;">${signal}</span>
      </td>

      <td>${M15?.widelki ?? "—"}</td>

      <td class="${tpColor(rec.close, M15?.tp1, signal)}">${M15?.tp1 ?? "—"}</td>
      <td class="${tpColor(rec.close, M15?.tp2, signal)}">${M15?.tp2 ?? "—"}</td>
      <td class="${tpColor(rec.close, M15?.tp3, signal)}">${M15?.tp3 ?? "—"}</td>

      <td class="delete-cell">🗑️</td>
    `;

    tbody.appendChild(row);
  });

  saveTable(); // <—— pamięć tabeli
}

// ======================================================
//  PAMIĘĆ TABELI — LOCALSTORAGE
// ======================================================

const STORAGE_KEY = "xtb_table_memory_v1";

function saveTable() {
  const data = JSON.stringify(tickers);
  localStorage.setItem(STORAGE_KEY, data);
}

function loadTable() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    Object.keys(parsed).forEach(t => {
      tickers[t] = parsed[t];
    });
    updateTable();
  } catch (e) {
    console.error("Błąd wczytywania tabeli:", e);
  }
}

// ======================================================
//  DYNAMICZNY KOMENTARZ PRO
// ======================================================

function buildDynamicComment(rec) {
  const c = rec.close;
  const o = rec.open;
  const L = rec.low;
  const H = rec.high;
  const R = H - L;

  const ma = rec.ma20;
  const de = rec.dema9;
  const rsi = rec.rsi;

  const mid = (ma + de) / 2;

  const isKapitulacja = (c < o && rsi <= 28 && c < de && R > (ma * 0.004));
  const isWybicie = (c > H - R * 0.15 && c > ma && c > de);
  const isPullback = (c > o && o < ma && c < ma && c > de);
  const isOdrzucenie = (c > o && L < de && c > de);
  const isSilnaSwieca = (c > o && (c - o) > R * 0.6);
  const isSlabaSwieca = (o > c && (o - c) > R * 0.6);

  let TREND = "";

  if (isKapitulacja) {
    TREND = "Trend wzrostowy, ale świeca kapitulacyjna wprowadza mocną korektę. Struktura nadal trzyma, dopóki cena jest powyżej " 
      + (mid - R*0.20).toFixed(0) + "–" + (mid - R*0.05).toFixed(0) + ".";
  }
  else if (c > ma && ma > de) {
    TREND = "Trend wzrostowy, struktura jest zdrowa i trzyma kierunek.";
  }
  else if (c < ma && ma < de) {
    TREND = "Trend spadkowy, struktura spadkowa aktywna.";
  }
  else {
    TREND = "Rynek w konsolidacji — brak jednoznacznego kierunku.";
  }

  let MOM = "";

  if (rsi <= 20) MOM = `RSI ${rsi} = ekstremalne wyprzedanie. To sygnał paniki i często punkt zwrotny.`;
  else if (rsi <= 30) MOM = `RSI ${rsi} = skrajne wyprzedanie. Rynek statystycznie odbija z takich poziomów.`;
  else if (rsi >= 75) MOM = `RSI ${rsi} = ekstremalne wykupienie. Rynek może potrzebować korekty.`;
  else if (rsi >= 65) MOM = `RSI ${rsi} = wykupienie, momentum silne, ale kruche.`;
  else MOM = `RSI ${rsi} = neutralne momentum.`;

  let SS = "";

  if (isSilnaSwieca) SS = "Silna świeca wzrostowa — przewaga kupujących.";
  else if (isSlabaSwieca) SS = "Silna świeca spadkowa — przewaga sprzedających.";
  else if (c > de) SS = "Cena powyżej DEMA9 = krótkoterminowa siła.";
  else SS = "Cena poniżej DEMA9 = krótkoterminowa słabość.";

  if (isOdrzucenie) SS += " Odrzucenie poziomu — popyt aktywny.";

  const ws1 = (L + R * 0.10).toFixed(2);
  const ws2 = (L + R * 0.20).toFixed(2);

  const op1 = (H - R * 0.20).toFixed(2);
  const op2 = (H - R * 0.35).toFixed(2);

  let INTER = "";

  if (isKapitulacja) {
    INTER = "To nie jest odwrócenie trendu. To kapitulacja po wybiciu. Rynek często wraca do średnich lub VWAP po takim ruchu.";
  }
  else if (isWybicie) {
    INTER = "Silne wybicie górą — rynek może kontynuować, ale korekta jest prawdopodobna.";
  }
  else if (isPullback) {
    INTER = "To wygląda jak klasyczny pullback do średnich — rynek może kontynuować trend.";
  }
  else if (isOdrzucenie) {
    INTER = "Odrzucenie poziomu sugeruje aktywny popyt i możliwe odbicie.";
  }
  else {
    INTER = "Neutralna sytuacja — rynek czeka na kierunek.";
  }

  let RISK = "";

  if (isKapitulacja) RISK = "Ryzyko rośnie tylko przy zamknięciu poniżej " + ws1 + ".";
  else if (c < ws1) RISK = "Ryzyko podwyższone — cena blisko kluczowego wsparcia.";
  else RISK = "Ryzyko umiarkowane — struktura nadal trzyma.";

  return `
TREND: ${TREND}

MOMENTUM: ${MOM}

SIŁA/SŁABOŚĆ: ${SS}

WSPARCIA: ${ws1}–${ws2}
OPORY: ${op2}–${op1}

INTERPRETACJA: ${INTER}

RYZYKO: ${RISK}
  `;
}
// ======================================================
//  OBSŁUGA ROZPOZNAWANIA — MASTER MIC
// ======================================================

function handleRecognized(text) {
  switch (currentStep) {
    case 0: tempRecord.ticker = text.toUpperCase(); break;
    case 1: tempRecord.interval = normalizeInterval(text); break;
    case 2: tempRecord.open = extractNumber(text); break;
    case 3: tempRecord.low = extractNumber(text); break;
    case 4: tempRecord.high = extractNumber(text); break;
    case 5: tempRecord.close = extractNumber(text); break;
    case 6: tempRecord.volume = extractNumber(text); break;
    case 7: tempRecord.ma20 = extractNumber(text); break;
    case 8: tempRecord.dema9 = extractNumber(text); break;
    case 9: tempRecord.rsi = extractNumber(text); break;
  }

  currentStep++;

  if (currentStep >= steps.length) {
    recognizing = false;
    finalizeRecord();
  }
}

function sayStep() {
  const msg = new SpeechSynthesisUtterance(steps[currentStep]);
  msg.lang = "pl-PL";

  msg.onend = () => {
    setTimeout(() => {
      try { recognition.start(); } catch {}
    }, 200);
  };

  speechSynthesis.cancel();
  speechSynthesis.speak(msg);
}

// ======================================================
//  START / STOP
// ======================================================

function startSequence() {
  tempRecord = {};
  currentStep = 0;
  recognitionMode = "SEQUENCE";
  recognizing = true;
  sayStep();
}

function stopSequence() {
  recognizing = false;
  recognitionMode = "SEQUENCE";
  try { recognition && recognition.stop(); } catch {}
}

// ======================================================
//  GŁOSOWE USTAWIANIE CENY / ENTRY — MASTER MIC
// ======================================================

function startVoiceInput(callback) {
  const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
  if (!SR) {
    alert("Brak wsparcia dla rozpoznawania mowy.");
    return;
  }

  if (!recognition) recognition = initRecognition();

  recognitionMode = "AD_HOC";
  adHocCallback = (spoken) => {
    callback(spoken.trim());
  };

  recognizing = true;

  try { recognition.start(); } catch (e) {
    console.log("Błąd startVoiceInput:", e);
  }
}

// ======================================================
//  POPUP + ENTRY + CENA
// ======================================================

document.addEventListener("click", (e) => {
  const row = e.target.parentElement;
  if (!row) return;

  const ticker = row.children[0]?.textContent.trim();
  if (!ticker) return;

  // POPUP
  if (e.target.classList.contains("ticker-cell")) {
    const rec = tickers[ticker]["M15"] || tickers[ticker]["M5"] || tickers[ticker]["H1"];
    const popup = document.getElementById("popup");
    const body = document.getElementById("popupBody");

    body.innerHTML = `
      <h2>${ticker}</h2>
      <pre style="white-space: pre-wrap; font-family: inherit; font-size: 14px; line-height: 1.4;">
${buildDynamicComment(rec)}
      </pre>
    `;

    popup.style.display = "block";
  }

  // GŁOSOWA CENA
  if (e.target.classList.contains("price-cell")) {
    const rec = tickers[ticker]["M15"] || tickers[ticker]["M5"] || tickers[ticker]["H1"];

    document.getElementById("comment").textContent = "🎤 Mów: podaj cenę...";

    startVoiceInput((spoken) => {
      const value = parseFloat(spoken.replace(",", "."));
      if (!isNaN(value)) {
        rec.close = value;
        updateTable();
        document.getElementById("comment").textContent = "✔️ Cena ustawiona głosowo";
      } else {
        document.getElementById("comment").textContent = "❌ Nie rozpoznano liczby";
      }
    });
  }

  // GŁOSOWE ENTRY
  if (e.target.classList.contains("entry-cell")) {
    const rec = tickers[ticker]["M15"] || tickers[ticker]["M5"] || tickers[ticker]["H1"];

    document.getElementById("comment").textContent = "🎤 Mów: podaj entry...";

    startVoiceInput((spoken) => {
      const value = parseFloat(spoken.replace(",", "."));
      if (!isNaN(value)) {
        rec.entry = value;
        updateTable();
        document.getElementById("comment").textContent = "✔️ Entry ustawione głosowo";
      } else {
        document.getElementById("comment").textContent = "❌ Nie rozpoznano liczby";
      }
    });
  }

  // DELETE
  if (e.target.classList.contains("delete-cell")) {
    delete tickers[ticker];
    updateTable();
  }
});

document.getElementById("popupClose").onclick = () => {
  document.getElementById("popup").style.display = "none";
};

// ======================================================
//  AUTO-LOAD TABELI PRZY STARCIU
// ======================================================

document.addEventListener("DOMContentLoaded", loadTable);
