// ======================================================
//  VOICE XTB 8.3 HYBRID - PURE SIGNAL EDITION
//  DAYTRADING / KRÓTKI SWING / LONG ONLY
// ======================================================

const backend = "https://voice-xtb.onrender.com/voice-parse";
const STORAGE_KEY = "xtbtablememoryv2multitf";

// ======================================================
// SYSTEM CONFIGURATION
// ======================================================
const SYSTEM_MODE = {
  aggression: 0.625,
  conservative: 0.375,
  allowMomentumSignals: true,
  confidenceThresholdBuy: 52,
  confidenceThresholdSell: 20
};

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
// SPEECH RECOGNITION INITIALIZATION
// ======================================================
function initRecognition() {
  const SR = window.webkitSpeechRecognition || window.SpeechRecognition;

  if (!SR) {
    alert("Brak obsługi mowy w tej przeglądarce. Użyj Chrome lub Safari.");
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
      setTimeout(() => { sayStep(); }, 250);
    } else {
      recognizing = false;
      finalizeRecord();
    }
  };

  rec.onerror = () => {
    if (!recognizing) return;
    setTimeout(() => {
      try { recognition.start(); } catch(err) {}
    }, 400);
  };

  return rec;
}

recognition = initRecognition();

// ======================================================
// SPEECH SYNTHESIS ENGINE
// ======================================================
function sayStep() {
  if (!recognizing) return;

  speechSynthesis.cancel();
  const msg = new SpeechSynthesisUtterance(steps[currentStep]);
  msg.lang = "pl-PL";
  msg.rate = 1.08; // Lekko przyspieszony, bokserski krok lektora

  msg.onend = () => {
    if (!recognizing) return;
    setTimeout(() => {
      try {
        recognition.start();
      } catch(err) {
        // Ponowna próba w razie chwilowej blokady mikrofonu
        setTimeout(() => { if (recognizing) recognition.start(); }, 300);
      }
    }, 180);
  };

  speechSynthesis.speak(msg);
}

// ======================================================
// DATA TIME ALIGNMENT ENGINE
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

  // Zaokrąglanie matematyczne kroków czasowych dla giełdy
  if (intervalStr === "M5") minutes = Math.floor(minutes / 5) * 5;
  if (intervalStr === "M15") minutes = Math.floor(minutes / 15) * 15;
  if (intervalStr === "H1") minutes = 0;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// ======================================================
// STATE MACHINE FOR VOICE SEQUENCING
// ======================================================
function handleRecognized(text) {
  switch (currentStep) {
    case 0: tempRecord.ticker = text.toUpperCase().replace(/\s+/g, ""); break;
    case 1: tempRecord.interval = normalizeInterval(text); break;
    case 2: tempRecord.time = parseAndAlignTime(text, tempRecord.interval); break;
    case 3: tempRecord.open = extractNumber(text); break;
    case 4: tempRecord.high = extractNumber(text); break;
    case 5: tempRecord.low = extractNumber(text); break;
    case 6: tempRecord.close = extractNumber(text); break;
    case 7: tempRecord.volume = extractNumber(text); break;
    case 8: tempRecord.ma20 = extractNumber(text); break;
    case 9: tempRecord.dema9 = extractNumber(text); break;
    case 10: tempRecord.rsi = extractNumber(text); break;
  }
  currentStep++;
}

function extractNumber(text) {
  if (!text) return 0;
  text = text.toString().toLowerCase()
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
// COMMUNICATING WITH FASTAPI BACKEND (FINALIZE)
// ======================================================
async function finalizeRecord() {
  if (isFetching) return;
  isFetching = true;

  if (!tempRecord.time) {
    tempRecord.time = parseAndAlignTime("", tempRecord.interval);
  }

  const t = tempRecord.ticker;
  tempRecord.entry = (tickers[t] && tickers[t].globalEntry) ? parseFloat(tickers[t].globalEntry) : null;

  document.getElementById("comment").textContent = "⏳ Analiza matematyczna w chmurze...";

  try {
    const response = await fetch(`${backend}?t=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tempRecord)
    });

    const data = await response.json();
    
    // Pobieramy natywny, nienaruszony sygnał oraz komentarz wprost z silnika FastAPI
    handleBackendData(data);
    document.getElementById("comment").textContent = "✔️ Gotowe. Kliknij ticker, aby otworzyć raport.";

  } catch (err) {
    document.getElementById("comment").textContent = "❌ Błąd synchronizacji z backendem";
    console.error("Fetch error: ", err);
  } finally {
    tempRecord = {};
    currentStep = 0;
    isFetching = false;
  }
}

// ======================================================
// SYNCHRONIZING ENGINE AND BUFFER DATA
// ======================================================
function handleBackendData(d) {
  const ticker = d.ticker;
  const tf = normalizeInterval(d.interval);

  if (!tickers[ticker]) {
    tickers[ticker] = {
      globalEntry: "",
      updatedAt: 0
    };
  }

  tickers[ticker].updatedAt = Date.now();
  tickers[ticker].lastTF = tf;

  if (d.entry !== undefined && d.entry !== null && d.entry !== "") {
    tickers[ticker].globalEntry = d.entry.toString();
  } else {
    tickers[ticker].globalEntry = "";
  }

  if (!tickers[ticker][tf]) {
    tickers[ticker][tf] = { history: [] };
  }

  // Przypisanie kompletnych danych z komentarzem strukturalnym Markdown
  tickers[ticker][tf].last = d;

  updateTable();
}

// ======================================================
// ADVANCED TABLE RENDERING
// ======================================================
function updateTable() {
  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";

  const sortedTickers = Object.keys(tickers).sort(
    (a, b) => tickers[b].updatedAt - tickers[a].updatedAt
  );

  if (sortedTickers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10">Oczekiwanie na dane...</td></tr>`;
    saveTable();
    return;
  }

  sortedTickers.forEach(ticker => {
    const tData = tickers[ticker];
    const tf = tData.lastTF || "M5";
    const rec = tData[tf]?.last;

    if (!rec) return;

    const row = document.createElement("tr");
    row.className = getRowClass(rec.signal);

    row.innerHTML = `
      <td class="ticker-cell">${ticker}</td>
      <td class="price-cell">${Number(rec.close).toFixed(2)}</td>
      <td>
        ${rec.interval}
        <br>
        <small>${rec.time}</small>
      </td>
      <td class="entry-cell">${tData.globalEntry || "—"}</td>
      <td>
        <div class="signal-box">
          ${rec.signal}
        </div>
      </td>
      <td>${rec.widelki || "—"}</td>
      <td>${rec.tp1 || "—"}</td>
      <td>${rec.tp2 || "—"}</td>
      <td>${rec.tp3 || "—"}</td>
      <td class="delete-cell">🗑️</td>
    `;

    tbody.appendChild(row);
  });

  saveTable();
}

// ======================================================
// MATRIX OF CSS CLASS COLORS FOR THE SIGNALS
// ======================================================
function getRowClass(sig) {
  sig = (sig || "").toUpperCase();

  if (sig === "BUY") return "row-buy";
  if (sig === "HOLD") return "row-hold";
  if (sig === "REDUKUJ") return "row-reduce";
  if (sig === "SELL") return "row-sell";
  
  return "row-wait";
}

// ======================================================
// INTERACTION TRIGGERS (START / STOP)
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

  document.getElementById("comment").textContent = "⛔ System zatrzymany poleceniem manualnym";
}

// ======================================================
// MEMORY PERSISTENCE (LOCAL STORAGE & CLOUD RESYNC)
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
        // Czyszczenie starej pamięci podręcznej przed pełną synchronizacją z chmury
        for (let member in tickers) { delete tickers[member]; }

        Object.keys(data).forEach(ticker => {
          tickers[ticker] = {
            globalEntry: data[ticker].global_entry || "",
            updatedAt: Date.now()
          };

          ["M5", "M15", "H1", "D1"].forEach(tf => {
            if (data[ticker][tf] && data[ticker][tf].last_data) {
              if (!tickers[ticker][tf]) {
                tickers[ticker][tf] = { history: [] };
              }
              tickers[ticker][tf].last = data[ticker][tf].last_data;
              tickers[ticker].lastTF = tf;
            }
          });
        });

        updateTable();
        return; // Synchronizacja udana, pomijamy localStorage
      }
    }
  } catch (err) {
    console.log("Informacja: Serwer offline lub brak bazy w chmurze, ładuję pamięć lokalną.");
  }

  // Awaryjne ładowanie z przeglądarki (LocalStorage)
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    Object.assign(tickers, JSON.parse(raw));
    updateTable();
  }
}
