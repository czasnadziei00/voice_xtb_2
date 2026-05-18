// ======================================================
//  VOICE XTB 9.0 STRUCTURE ENGINE
//  STABILIZED MULTI-TF CONSENSUS FRONTEND (ZINTEGROWANY)
// ======================================================

const backend = "https://voice-xtb.onrender.com/voice-parse";
const STORAGE_KEY = "xtbtablememoryv4structure";

// ======================================================
// SYSTEM CONFIG
// ======================================================

const SYSTEM_MODE = {
  confidenceThresholdBuy: 65,  
  confidenceThresholdHold: 48
};

let recognition = null;
let recognizing = false;
let currentStep = 0;
let tempRecord = {};
let isFetching = false;

// ======================================================
// FLOW
// ======================================================

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
// SPEECH INIT
// ======================================================

function initRecognition() {
  const SR = window.webkitSpeechRecognition || window.SpeechRecognition;

  if (!SR) {
    alert("Brak obsługi mowy w tej przeglądarce.");
    return null;
  }

  const rec = new SR();
  rec.lang = "pl-PL";
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onresult = (e) => {
    const text = e.results[0][0].transcript.trim();
    document.getElementById("recognized").textContent = `Rozpoznano: ${text}`;
    handleRecognized(text);
  };

  rec.onend = () => {
    if (!recognizing) return;

    if (currentStep < steps.length) {
      setTimeout(() => {
        sayStep();
      }, 250);
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
      } catch(err) {}
    }, 400);
  };

  return rec;
}

recognition = initRecognition();

// ======================================================
// VOICE OUTPUT
// ======================================================

function sayStep() {
  if (!recognizing) return;

  speechSynthesis.cancel();
  const msg = new SpeechSynthesisUtterance(steps[currentStep]);
  msg.lang = "pl-PL";
  msg.rate = 1.08;

  msg.onend = () => {
    if (!recognizing) return;
    setTimeout(() => {
      try {
        recognition.start();
      } catch(err) {
        setTimeout(() => {
          if (recognizing) {
            recognition.start();
          }
        }, 300);
      }
    }, 180);
  };

  speechSynthesis.speak(msg);
}

// ======================================================
// TIME ALIGNMENT
// ======================================================

function parseAndAlignTime(rawText, intervalStr) {
  const now = new Date();

  if (intervalStr === "D1") {
    let dayNum = parseInt(rawText.toString().replace(/[^0-9]/g, ""), 10);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
      dayNum = now.getDate();
    }
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  }

  let hours = now.getHours();
  let minutes = now.getMinutes();

  let clean = rawText.toString().trim().replace(/[.:\-]/g, " ");
  const parts = clean.split(/\s+/);

  if (parts.length >= 2) {
    hours = parseInt(parts[0], 10) || 0;
    minutes = parseInt(parts[1], 10) || 0;
  }

  if (intervalStr === "M5") {
    minutes = Math.floor(minutes / 5) * 5;
  }
  if (intervalStr === "M15") {
    minutes = Math.floor(minutes / 15) * 15;
  }
  if (intervalStr === "H1") {
    minutes = 0;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// ======================================================
// INPUT ENGINE
// ======================================================

function handleRecognized(text) {
  switch(currentStep) {
    case 0:
      tempRecord.ticker = text.toUpperCase().replace(/\s+/g, "");
      break;
    case 1:
      tempRecord.interval = normalizeInterval(text);
      break;
    case 2:
      tempRecord.time = parseAndAlignTime(text, tempRecord.interval);
      break;
    case 3:
      tempRecord.open = extractNumber(text);
      break;
    case 4:
      tempRecord.high = extractNumber(text);
      break;
    case 5:
      tempRecord.low = extractNumber(text);
      break;
    case 6:
      tempRecord.close = extractNumber(text);
      break;
    case 7:
      tempRecord.volume = extractNumber(text);
      break;
    case 8:
      tempRecord.ma20 = extractNumber(text);
      break;
    case 9:
      tempRecord.dema9 = extractNumber(text);
      break;
    case 10:
      tempRecord.rsi = extractNumber(text);
      break;
  }
  currentStep++;
}

// ======================================================
// HELPERS
// ======================================================

function extractNumber(text) {
  if (!text) return 0;

  text = text.toString()
    .toLowerCase()
    .replaceAll("kropka", ".")
    .replaceAll("przecinek", ".");

  const num = parseFloat(text.replace(/\s+/g, ""));
  return isFinite(num) ? num : 0;
}

function normalizeInterval(tf) {
  tf = tf.toUpperCase().trim();
  if (tf === "5" || tf === "M5") return "M5";
  if (tf === "15" || tf === "M15") return "M15";
  if (tf === "H1" || tf === "1H" || tf === "60") return "H1";
  if (tf === "D1" || tf === "D") return "D1";
  return tf;
}

// ======================================================
// FETCH TO BACKEND
// ======================================================

async function finalizeRecord() {
  if (isFetching) return;
  isFetching = true;

  if (!tempRecord.time) {
    tempRecord.time = parseAndAlignTime("", tempRecord.interval);
  }

  const ticker = tempRecord.ticker;
  tempRecord.entry = (tickers[ticker] && tickers[ticker].globalEntry)
    ? parseFloat(tickers[ticker].globalEntry)
    : null;

  document.getElementById("comment").textContent = "⏳ Analiza strukturalna konsensusu...";

  try {
    const response = await fetch(`${backend}?t=${Date.now()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(tempRecord)
    });

    const data = await response.json();
    handleBackendData(data);
    
    if (data.comment) {
      document.getElementById("comment").textContent = data.comment;
    } else {
      document.getElementById("comment").textContent = "✔️ Analiza zakończona sukcesem";
    }

  } catch(err) {
    document.getElementById("comment").textContent = "❌ Błąd połączenia z silnikiem struktury";
    console.error(err);
  } finally {
    tempRecord = {};
    currentStep = 0;
    isFetching = false;
  }
}

// ======================================================
// BACKEND SYNC
// ======================================================

function handleBackendData(d) {
  const ticker = d.ticker;
  const tf = normalizeInterval(d.interval);

  if (!tickers[ticker]) {
    tickers[ticker] = {
      globalEntry: "",
      updatedAt: 0,
      lastTF: tf
    };
  }

  tickers[ticker].updatedAt = Date.now();

  if (d.entry !== undefined && d.entry !== null && d.entry !== "") {
    tickers[ticker].globalEntry = d.entry.toString();
  }

  if (!tickers[ticker][tf]) {
    tickers[ticker][tf] = {
      history: []
    };
  }

  tickers[ticker][tf].last = d;
  tickers[ticker].lastTF = chooseBestTimeframe(tickers[ticker]);
  updateTable();
}

// ======================================================
// STRUCTURE PRIORITY ENGINE
// ======================================================

function chooseBestTimeframe(tData) {
  if (tData["M15"]?.last) return "M15";
  if (tData["H1"]?.last) return "H1";
  if (tData["M5"]?.last) return "M5";
  if (tData["D1"]?.last) return "D1";
  return "M5";
}

// ======================================================
// TABLE RENDERING (Z UWZGLĘDNIENIEM NOWYCH KOLUMN)
// ======================================================

function updateTable() {
  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";

  const sortedTickers = Object.keys(tickers).sort(
    (a, b) => tickers[b].updatedAt - tickers[a].updatedAt
  );

  if (sortedTickers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11">Oczekiwanie na dane ze struktury...</td>
      </tr>
    `;
    saveTable();
    return;
  }

  sortedTickers.forEach(ticker => {
    const tData = tickers[ticker];
    const tf = chooseBestTimeframe(tData);
    const rec = tData[tf]?.last;

    if (!rec) return;

    const row = document.createElement("tr");
    row.className = getRowClass(rec.signal);

    const confidenceStr = rec.confidence !== undefined ? ` (${rec.confidence}%)` : "";

    // POPRAWIONE: Pełna synchronizacja kolumn z backendem wraz z nową komórką Trailing SL
    row.innerHTML = `
      <td class="ticker-cell" onclick="showReport('${ticker}', '${tf}')" style="cursor:pointer; font-weight:bold; color:#2196F3;">${ticker} 📋</td>
      <td class="price-cell">${Number(rec.close).toFixed(2)}</td>
      <td>
        ${rec.interval}
        <br>
        <small>${rec.time}</small>
      </td>
      <td class="entry-cell" onclick="manualEditEntry('${ticker}')" style="cursor:pointer; text-decoration:underline;">${tData.globalEntry || "—"}</td>
      <td>
        <div class="signal-box">
          ${rec.signal}${confidenceStr}
        </div>
      </td>
      <td>${rec.widelki || "—"}</td>
      <td style="color: #4CAF50; font-weight: bold;">${rec.tp1 || "—"}</td>
      <td style="color: #FF9800; font-weight: bold;">${rec.tp2 || "—"}</td>
      <td style="color: #E91E63; font-weight: bold;">${rec.tp3 || "—"}</td>
      <td class="tsl-cell" style="color: #f44336; font-weight: bold; background: rgba(244,67,54,0.05);">${rec.trailing_sl || "—"}</td>
      <td class="delete-cell" onclick="event.stopPropagation(); deleteTickerData('${ticker}')" style="cursor:pointer; text-align:center;">🗑️</td>
    `;

    tbody.appendChild(row);
  });

  saveTable();
}

// ======================================================
// DYNAMIC ROWS COLOR EXTENSION
// ======================================================

function getRowClass(sig) {
  sig = (sig || "").toUpperCase();
  if (sig.includes("BUY")) return "row-buy";
  if (sig.includes("HOLD")) return "row-hold";
  if (sig.includes("REDUKUJ")) return "row-reduce";
  if (sig.includes("SELL")) return "row-sell";
  return "row-wait";
}

// ======================================================
// MANUAL DELETE TRIGGER (POPRAWIONY CRASH .STRIP)
// ======================================================

async function deleteTickerData(tickerName) {
  const baseEndpoint = backend.replace("/voice-parse", "");
  const cleanName = tickerName.toUpperCase().trim(); // POPRAWIONE: .trim() zamiast .strip()
  
  try {
    const response = await fetch(`${baseEndpoint}/voice-parse/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: cleanName })
    });
    if (response.ok) {
      delete tickers[cleanName];
      updateTable();
    }
  } catch(err) {
    console.error("Błąd usuwania rekordu z pamięci serwera:", err);
  }
}

// ======================================================
// MANUAL ENTRY QUICK EDIT
// ======================================================

function manualEditEntry(ticker) {
  const current = tickers[ticker]?.globalEntry || "";
  const val = prompt(`Wpisz lub zmień cenę wejścia (Entry) dla ${ticker}:`, current);
  if (val !== null) {
    const num = parseFloat(val.replace(",", "."));
    if (!isNaN(num) && num > 0) {
      tickers[ticker].globalEntry = num.toFixed(2);
    } else {
      tickers[ticker].globalEntry = "";
    }
    updateTable();
  }
}

// ======================================================
// SHOW COMPLEX ENGINE REPORT
// ======================================================

function showReport(ticker, tf) {
  const rec = tickers[ticker]?.[tf]?.last;
  if (rec && rec.comment) {
    alert(rec.comment);
  } else {
    alert(`Brak szczegółowego raportu dla ${ticker} [${tf}].`);
  }
}

// ======================================================
// START / STOP SEQUENCE
// ======================================================

function startSequence() {
  if (recognizing) return;

  speechSynthesis.cancel();
  tempRecord = {};
  currentStep = 0;
  recognizing = true;
  sayStep();
}

function stopSequence() {
  recognizing = false;
  currentStep = 0;
  tempRecord = {};

  try {
    recognition.stop();
  } catch(err) {}

  document.getElementById("comment").textContent = "⛔ System zatrzymany";
}

// ======================================================
// LOCAL STORAGE PERSISTENCE
// ======================================================

function saveTable() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
}

async function loadTable() {
  const baseEndpoint = backend.replace("/voice-parse", "");

  try {
    const response = await fetch(`${baseEndpoint}/memory?t=${Date.now()}`);
    if (response.ok) {
      const data = await response.json();

      if (data && Object.keys(data).length > 0) {
        for (let member in tickers) {
          delete tickers[member];
        }

        Object.keys(data).forEach(ticker => {
          tickers[ticker] = {
            globalEntry: data[ticker].global_entry || "",
            updatedAt: data[ticker].updated_at || Date.now()
          };

          ["M5", "M15", "H1", "D1"].forEach(tf => {
            if (data[ticker][tf] && data[ticker][tf].last_data) {
              if (!tickers[ticker][tf]) {
                tickers[ticker][tf] = { history: [] };
              }
              // Mapowanie pełnej struktury zwrotnej z backendu
              tickers[ticker][tf].last = data[ticker][tf].last_data;
            }
          });

          tickers[ticker].lastTF = chooseBestTimeframe(tickers[ticker]);
        });

        updateTable();
        return;
      }
    }
  } catch(err) {
    console.log("Praca offline lub brak odpowiedzi z pamięci serwera -> localStorage fallback");
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    Object.assign(tickers, JSON.parse(raw));
    updateTable();
  }
}

// ======================================================
// AUTO INIT
// ======================================================

window.onload = () => {
  loadTable();
};
