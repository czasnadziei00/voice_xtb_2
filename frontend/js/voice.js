// ======================================================
//  VOICE XTB 8.1 HYBRID - INTERFEJS GŁOSOWY
// ======================================================

const backend = "https://voice-xtb.onrender.com/voice-parse";
const STORAGE_KEY = "xtbtablememoryv2multitf";

let recognition = null;
let recognizing = false;
let recognitionMode = "SEQUENCE";
let adHocCallback = null;
let currentStep = 0;
let tempRecord = {};
let isFetching = false;

const steps = [
  "Podaj ticker",
  "Podaj interwał",
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
const HISTORY_LIMITS = { M5: 14, M15: 7, H1: 3 };

// ======================================================
//  SPEECH ENGINE (POPRAWIONY)
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
    document.getElementById("recognized").textContent = `Rozpoznano: ${text}`;
    
    if (recognitionMode === "SEQUENCE") {
      handleRecognized(text);
    } else if (recognitionMode === "AD_HOC" && adHocCallback) {
      adHocCallback(text);
      adHocCallback = null;
      recognitionMode = "SEQUENCE";
      recognizing = false;
    }
  };

  rec.onerror = (e) => { console.log("Speech error:", e.error); };
  return rec;
}

recognition = initRecognition();

function sayStep() {
  if (currentStep >= steps.length || !recognizing) return;

  // 1. Czyścimy kolejkę mowy
  speechSynthesis.cancel();

  const msg = new SpeechSynthesisUtterance(steps[currentStep]);
  msg.lang = "pl-PL";
  msg.rate = 1.1;

  msg.onend = () => {
    // 2. Mikrofon startuje dopiero GDY system skończy mówić
    if (recognizing) {
      setTimeout(() => {
        try {
          recognition.start();
        } catch (e) { console.log("Mic restart error"); }
      }, 200);
    }
  };

  speechSynthesis.speak(msg);
}

function handleRecognized(text) {
  // Mapowanie danych
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

  // 3. Zatrzymujemy mikrofon jawnie, aby nie blokował głosu w następnym kroku
  try { recognition.stop(); } catch(e) {}

  currentStep++;

  if (currentStep < steps.length) {
    setTimeout(() => { sayStep(); }, 400);
  } else {
    recognizing = false;
    finalizeRecord();
  }
}

// ======================================================
//  UTILS & LOGIC
// ======================================================

function extractNumber(text) {
  if (!text) return 0;
  text = text.toString().trim().toLowerCase()
    .replaceAll("kropka", ".").replaceAll("przecinek", ".");
  text = text.replace(/\s+/g, "");
  const num = parseFloat(text);
  return isFinite(num) ? num : 0;
}

function normalizeInterval(tf) {
  tf = tf.toUpperCase().trim();
  if (tf === "5" || tf === "M5") return "M5";
  if (tf === "15" || tf === "M15") return "M15";
  if (tf === "H1" || tf === "1H" || tf === "60") return "H1";
  return tf;
}

async function finalizeRecord() {
  if (isFetching) return;
  isFetching = true;
  tempRecord.time = new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  
  document.getElementById("comment").textContent = "⏳ Analiza 8.1 Hybrid...";
  
  try {
    const response = await fetch(`${backend}?t=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tempRecord)
    });
    const data = await response.json();
    handleBackendData(data);
    document.getElementById("comment").textContent = "✔️ Analiza gotowa";
  } catch (err) {
    document.getElementById("comment").textContent = "❌ Błąd połączenia";
  } finally {
    tempRecord = {};
    currentStep = 0;
    isFetching = false;
  }
}

// ======================================================
//  TABLE & STORAGE
// ======================================================

function handleBackendData(d) {
  const tf = normalizeInterval(d.interval);
  const ticker = d.ticker;
  if (!tickers[ticker]) tickers[ticker] = { globalEntry: "", updatedAt: 0 };
  
  tickers[ticker].updatedAt = Date.now();
  tickers[ticker].lastTF = tf;
  if (d.entry) tickers[ticker].globalEntry = d.entry;

  if (!tickers[ticker][tf]) tickers[ticker][tf] = { history: [] };
  tickers[ticker][tf].last = d;
  
  updateTable();
}

function updateTable() {
  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";
  const sortedTickers = Object.keys(tickers).sort((a, b) => tickers[b].updatedAt - tickers[a].updatedAt);

  sortedTickers.forEach(ticker => {
    const tData = tickers[ticker];
    const rec = tData[tData.lastTF]?.last;
    if (!rec) return;

    const row = document.createElement("tr");
    row.className = getRowClass(rec.signal);
    row.innerHTML = `
      <td class="ticker-cell">${ticker}</td>
      <td class="price-cell">${Number(rec.close).toFixed(2)}</td>
      <td>${rec.interval} <br><small>${rec.time}</small></td>
      <td class="entry-cell">${tData.globalEntry || "—"}</td>
      <td><div class="signal-box">${rec.signal}</div></td>
      <td>${rec.widelki || "—"}</td>
      <td class="tp-cell">${rec.tp1 || "—"}</td>
      <td class="tp-cell">${rec.tp2 || "—"}</td>
      <td class="tp-cell">${rec.tp3 || "—"}</td>
      <td class="delete-cell">🗑️</td>
    `;
    tbody.appendChild(row);
  });
  saveTable();
}

function getRowClass(sig) {
  if (sig?.includes("PREMIUM")) return "row-buy-premium"; // Dodaj te klasy do CSS
  if (sig?.includes("BUY")) return "row-buy";
  if (sig?.includes("SELL")) return "row-sell";
  return "row-czekaj";
}

// ======================================================
//  CONTROLS
// ======================================================

function startSequence() {
  if (recognizing) return;
  
  // Reset mowy (wymagane przez przeglądarkę)
  speechSynthesis.cancel();
  const wakeUp = new SpeechSynthesisUtterance("");
  speechSynthesis.speak(wakeUp);

  tempRecord = {};
  currentStep = 0;
  recognizing = true;
  sayStep();
}

function startVoiceInput(callback) {
  recognitionMode = "AD_HOC";
  adHocCallback = (spoken) => callback(spoken);
  recognizing = true;
  try { recognition.start(); } catch(e) {}
}

document.addEventListener("click", (e) => {
  const cell = e.target.closest("td");
  const row = e.target.closest("tr");
  if (!cell || !row) return;

  const ticker = row.querySelector(".ticker-cell")?.textContent.trim();
  if (cell.classList.contains("delete-cell")) {
    delete tickers[ticker];
    updateTable();
  }
  if (cell.classList.contains("ticker-cell")) {
    const rec = tickers[ticker][tickers[ticker].lastTF]?.last;
    alert(rec?.comment || "Brak danych");
  }
});

function saveTable() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers)); }
function loadTable() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) { Object.assign(tickers, JSON.parse(raw)); updateTable(); }
}

document.addEventListener("DOMContentLoaded", loadTable);
