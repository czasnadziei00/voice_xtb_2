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
  "Podaj high",
  "Podaj low",
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
      if (!data.time) data.time = tempRecord.time;
      handleBackendData(data);
      document.getElementById("comment").textContent = "✔️ Dodano świecę do historii";
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

  // 🔥 kluczowa flaga — kontroluje, czy można startować
  let safeToStart = true;

  rec.onstart = () => {
    safeToStart = false;
  };

  rec.onend = () => {
    safeToStart = true;

    if (recognizing && recognitionMode === "SEQUENCE" && currentStep < steps.length) {
      setTimeout(() => {
        try { rec.start(); } catch {}
      }, 150);
    }
  };

  rec.onerror = () => {
    safeToStart = true;
  };

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

  // 🔥 bezpieczny start — jedyny sposób, żeby Chrome nie zabił mic
  rec.safeStart = () => {
    if (safeToStart) {
      try { rec.start(); } catch {}
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
//  WIELO-ŚWIECOWY SILNIK SYGNAŁU
// ======================================================

const HISTORY_LIMITS = {
  "M5": 14,
  "M15": 7,
  "H1": 3
};

function pushToHistory(store, tf, candle) {
  if (!store[tf]) store[tf] = { history: [] };
  if (!store[tf].history) store[tf].history = [];
  store[tf].history.push(candle);
  const limit = HISTORY_LIMITS[tf] || 5;
  if (store[tf].history.length > limit) {
    store[tf].history = store[tf].history.slice(-limit);
  }
}

function trendDirectionFromHistory(history) {
  if (!history || history.length < 2) return "NEUTRAL";

  const first = history[0];
  const last = history[history.length - 1];

  const up = last.close > first.close;
  const down = last.close < first.close;

  if (up && Math.abs(last.close - first.close) / first.close > 0.01) return "UP";
  if (down && Math.abs(last.close - first.close) / first.close > 0.01) return "DOWN";
  return "NEUTRAL";
}

function trendStrengthFromHistory(history) {
  if (!history || history.length === 0) return 0;

  const last = history[history.length - 1];
  const prev = history[Math.max(0, history.length - 2)];

  const spread = Math.abs(last.ma20 - last.dema9);
  const slope = last.ma20 - prev.ma20;

  return spread + Math.abs(slope);
}

function computeSignalForTF(history, tf) {
  if (!history || history.length === 0) return "CZEKAJ";

  const last = history[history.length - 1];
  const dir = trendDirectionFromHistory(history);
  const strength = trendStrengthFromHistory(history);
  const rsi = last.rsi;
  const c = last.close;
  const ma = last.ma20;
  const de = last.dema9;

  const aboveMA = c > ma && ma > de;
  const belowMA = c < ma && ma < de;

  let base = "CZEKAJ";
  if (dir === "UP" && aboveMA) base = "BUY";
  else if (dir === "DOWN" && belowMA) base = "SELL";
  else if (dir === "UP") base = "PRAWIE BUY";
  else if (dir === "DOWN") base = "PRAWIE SELL";

  if (base.includes("BUY") && rsi > 75) base = "CZEKAJ DO";
  if (base.includes("SELL") && rsi < 25) base = "CZEKAJ DO";

  if (strength < 0.05) base = "CZEKAJ";

  return base;
}

// ======================================================
//  KONSENSUS Z M5 / M15 / H1
// ======================================================

function consensusSignalFromStore(tData) {
  const sigs = [];

  ["M5", "M15", "H1"].forEach(tf => {
    const tfData = tData[tf];
    if (tfData && tfData.signal) sigs.push(tfData.signal);
  });

  if (sigs.includes("BUY")) return "BUY";
  if (sigs.includes("SELL")) return "SELL";
  if (sigs.includes("PRAWIE BUY")) return "PRAWIE BUY";
  if (sigs.includes("PRAWIE SELL")) return "PRAWIE SELL";
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
  if (signal === "PRAWIE SELL") return "row-prawie";
  if (signal === "CZEKAJ DO") return "row-czekajdo";

  return "row-czekaj";
    }
// ======================================================
//  PAMIĘĆ TABELI — LOCALSTORAGE
// ======================================================

const STORAGE_KEY = "xtb_table_memory_v2_multi_tf";

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

      ["M5", "M15", "H1"].forEach(tf => {
        const tfData = tickers[t][tf];
        if (!tfData) return;

        // dopilnuj, żeby była historia jako tablica
        if (!Array.isArray(tfData.history)) {
          if (tfData.last) {
            tfData.history = [tfData.last];
          } else {
            tfData.history = [];
          }
        }

        // uzupełnij brakującą godzinę
        tfData.history.forEach(c => {
          if (!c.time) {
            c.time = new Date().toLocaleTimeString("pl-PL", {
              hour: "2-digit",
              minute: "2-digit"
            });
          }
        });

        // odtwórz last + signal
        if (tfData.history.length > 0) {
          tfData.last = tfData.history[tfData.history.length - 1];
          tfData.signal = computeSignalForTF(tfData.history, tf);
        }
      });
    });

    updateTable();
  } catch (e) {
    console.error("Błąd wczytywania tabeli:", e);
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

  const tData = tickers[ticker];
  if (!tData) return;

  const rec = tData["M15"]?.last || tData["H1"]?.last || tData["M5"]?.last;
  if (!rec) return;

  // POPUP — klik w nazwę tickera
  if (e.target.classList.contains("ticker-cell")) {
    const popup = document.getElementById("popup");
    const body = document.getElementById("popupBody");

    body.innerHTML = `
      <h2>${ticker} — ${rec.interval} — ${rec.time}</h2>
      <pre style="white-space: pre-wrap; font-family: inherit; font-size: 14px; line-height: 1.4;">
${buildDynamicComment(rec, tData)}
      </pre>
    `;

    popup.style.display = "block";
  }

  // GŁOSOWA CENA
  if (e.target.classList.contains("price-cell")) {
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
//  OBSŁUGA ROZPOZNAWANIA — MASTER MIC
// ======================================================

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
//  POPRAWIONY updateTable() — WERSJA PRO (początek)
// ======================================================

function updateTable() {
  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";

  Object.keys(tickers).forEach(t => {
    const tData = tickers[t];

    const M5 = tData["M5"]?.last;
    const M15 = tData["M15"]?.last;
    const H1 = tData["H1"]?.last;

    const rec = M15 || H1 || M5;
    if (!rec) return;

    const entry = rec.entry ?? "—";

    // 🔥 CZYSTY SYGNAŁ
    const signal = consensusSignalFromStore(tData);

    // 🔥 WIDEŁKI (tylko z M15)
    const widelki = M15?.widelki ?? "—";

    // 🔥 OPIS POD SYGNAŁEM
    let signalDetail = "";

    if (signal === "CZEKAJ DO") {
      signalDetail = `prawie buy — widełki ${widelki}`;
    }
    else if (signal === "PRAWIE BUY") {
      signalDetail = `buy — widełki ${widelki}`;
    }
    else if (signal === "BUY") {
      signalDetail = `najlepsza cena wejścia: ${widelki}`;
    }
    else if (signal === "PRAWIE SELL") {
      signalDetail = `sell — widełki ${widelki}`;
    }
    else if (signal === "SELL") {
      signalDetail = `najlepsza cena wyjścia: ${widelki}`;
    }

    const row = document.createElement("tr");
    row.className = getRowClass(signal);

    row.innerHTML = `
      <td class="ticker-cell">${t}</td>

      <td class="price-cell">
        ${rec.close.toFixed(2)}
      </td>

      <td>
        ${rec.interval}<br>
        <span style="font-size:11px; opacity:0.7;">${rec.time ?? ""}</span>
      </td>

      <td class="entry-cell">${entry}</td>

      <td>
        <div style="font-size:16px; font-weight:700;">${signal}</div>
        <div style="font-size:11px; opacity:0.7;">${signalDetail}</div>
      </td>
    `;
    <td>${widelki}</td>

      <td class="${tpColor(rec.close, M15?.tp1, signal)}">
        ${M15?.tp1 ?? "—"}
      </td>

      <td class="${tpColor(rec.close, M15?.tp2, signal)}">
        ${M15?.tp2 ?? "—"}
      </td>

      <td class="${tpColor(rec.close, M15?.tp3, signal)}">
        ${M15?.tp3 ?? "—"}
      </td>

      <td class="delete-cell">🗑️</td>
    `;

    tbody.appendChild(row);
  });

  saveTable();
}

// ======================================================
//  AUTO-LOAD TABELI PRZY STARCIU
// ======================================================

document.addEventListener("DOMContentLoaded", loadTable);
