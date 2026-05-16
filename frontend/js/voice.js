// ======================================================
//  VOICE XTB 8.1 HYBRID - INTERFEJS GŁOSOWY + RĘCZNE ENTRY
// ======================================================

const backend = "https://voice-xtb.onrender.com/voice-parse";
const STORAGE_KEY = "xtbtablememoryv2multitf";

let recognition = null;
let recognizing = false;
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
const HISTORY_LIMITS = { M5: 14, M15: 7, H1: 3, D1: 2 };

// ======================================================
//  SPEECH ENGINE
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
    handleRecognized(text);
  };

  rec.onend = () => {
    if (recognizing) {
      currentStep++;
      if (currentStep < steps.length) {
        setTimeout(() => { sayStep(); }, 300);
      } else {
        recognizing = false;
        finalizeRecord();
      }
    }
  };

  rec.onerror = (e) => { 
    console.log("Speech error:", e.error); 
    if (e.error === "no-speech" && recognizing) {
      setTimeout(() => { sayStep(); }, 300);
    }
  };
  return rec;
}

recognition = initRecognition();

function sayStep() {
  if (currentStep >= steps.length || !recognizing) return;

  speechSynthesis.cancel();

  const msg = new SpeechSynthesisUtterance(steps[currentStep]);
  msg.lang = "pl-PL";
  msg.rate = 1.1;

  msg.onend = () => {
    if (recognizing) {
      setTimeout(() => {
        try {
          recognition.start();
        } catch (e) { 
          console.log("Mic restart error, retrying..."); 
          setTimeout(() => { if (recognizing) recognition.start(); }, 400);
        }
      }, 200);
    }
  };

  speechSynthesis.speak(msg);
}

function handleRecognized(text) {
  switch (currentStep) {
    case 0: tempRecord.ticker = text.toUpperCase().replace(/\s+/g, ""); break;
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
  if (tf === "D1" || tf === "D" || tf === "1D" || tf === "DZIENNY") return "D1";
  return tf;
}

async function finalizeRecord() {
  if (isFetching) return;
  isFetching = true;
  tempRecord.time = new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  
  const t = tempRecord.ticker;
  if (tickers[t] && tickers[t].globalEntry) {
    tempRecord.entry = parseFloat(tickers[t].globalEntry);
  } else {
    tempRecord.entry = 0;
  }

  document.getElementById("comment").textContent = "⏳ Analiza 8.1 Hybrid...";
  document.getElementById("parsed").textContent = `Bufor JSON: ${JSON.stringify(tempRecord)}`;
  
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
  const ticker = d.ticker;
  const tf = normalizeInterval(d.interval);
  
  if (!tickers[ticker]) tickers[ticker] = { globalEntry: "", updatedAt: 0 };
  
  tickers[ticker].updatedAt = Date.now();
  tickers[ticker].lastTF = tf;

  if (d.entry !== undefined && d.entry !== null && d.entry !== "") {
    tickers[ticker].globalEntry = d.entry.toString();
  }

  if (!tickers[ticker][tf]) tickers[ticker][tf] = { history: [] };
  tickers[ticker][tf].last = d;
  
  updateTable();
}

function updateTable() {
  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";
  const sortedTickers = Object.keys(tickers).sort((a, b) => tickers[b].updatedAt - tickers[a].updatedAt);

  if (sortedTickers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10">Oczekiwanie na dane...</td></tr>`;
    return;
  }

  sortedTickers.forEach(ticker => {
    const tData = tickers[ticker];
    const tf = tData.lastTF || "M5";
    const rec = tData[tf]?.last;
    if (!rec) return;

    const displayEntry = (tData.globalEntry && parseFloat(tData.globalEntry) > 0) ? tData.globalEntry : "—";

    const row = document.createElement("tr");
    row.className = getRowClass(rec.signal);
    row.innerHTML = `
      <td class="ticker-cell" style="cursor:pointer; font-weight:bold; color:#ffd166;">${ticker}</td>
      <td class="price-cell">${Number(rec.close).toFixed(2)}</td>
      <td>${rec.interval} <br><small>${rec.time}</small></td>
      <td class="entry-cell" style="border: 1px dashed #ffd166; border-radius: 4px; cursor: pointer;">${displayEntry}</td>
      <td><div class="signal-box">${rec.signal}</div></td>
      <td>${rec.widelki || "—"}</td>
      <td class="tp-cell">${rec.tp1 || "—"}</td>
      <td class="tp-cell">${rec.tp2 || "—"}</td>
      <td class="tp-cell">${rec.tp3 || "—"}</td>
      <td class="delete-cell" style="cursor: pointer;">🗑️</td>
    `;
    tbody.appendChild(row);
  });
  saveTable();
}

function getRowClass(sig) {
  if (sig?.includes("PREMIUM")) return "row-buy-premium";
  if (sig?.includes("BUY") || sig?.includes("ACCEL")) return "row-buy";
  if (sig?.includes("EXIT") || sig?.includes("REDUKUJ")) return "row-sell";
  return "row-czekaj";
}

// ======================================================
//  CONTROLS
// ======================================================

function startSequence() {
  if (recognizing) return;
  
  speechSynthesis.cancel();
  const wakeUp = new SpeechSynthesisUtterance("");
  speechSynthesis.speak(wakeUp);

  tempRecord = {};
  currentStep = 0;
  recognizing = true;
  sayStep();
}

function stopSequence() {
  recognizing = false;
  currentStep = 0;
  tempRecord = {};
  try { recognition.stop(); } catch(e) {}
  document.getElementById("comment").textContent = "⛔ Sekwencja zatrzymana.";
}

document.addEventListener("click", async (e) => {
  const cell = e.target.closest("td");
  const row = e.target.closest("tr");
  if (!cell || !row) return;

  const ticker = row.querySelector(".ticker-cell")?.textContent.trim();
  
  if (cell.classList.contains("delete-cell")) {
    delete tickers[ticker];
    updateTable();
    return;
  }
  
  if (cell.classList.contains("entry-cell")) {
    if (cell.querySelector("input")) return;

    const currentVal = tickers[ticker].globalEntry || "";
    
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.inputMode = "decimal";
    input.value = currentVal;
    
    input.style.width = "80px";
    input.style.background = "#222";
    input.style.color = "#ffd166";
    input.style.border = "1px solid #ffd166";
    input.style.borderRadius = "4px";
    input.style.padding = "4px";
    input.style.textAlign = "center";
    input.style.fontSize = "16px";

    cell.textContent = "";
    cell.appendChild(input);
    input.focus();
    input.select();

    const saveData = async () => {
      const manual = input.value;
      const numVal = extractNumber(manual);
      
      if (numVal > 0) {
        tickers[ticker].globalEntry = numVal.toString();
      } else {
        tickers[ticker].globalEntry = "";
      }
      
      const tf = tickers[ticker].lastTF;
      if (tf && tickers[ticker][tf]?.last) {
        const lastRec = tickers[ticker][tf].last;
        const updatePayload = {
          ticker: ticker,
          interval: tf,
          time: lastRec.time,
          open: lastRec.open,
          high: lastRec.high,
          low: lastRec.low,
          close: lastRec.close,
          volume: lastRec.volume,
          ma20: lastRec.ma20,
          dema9: lastRec.dema9,
          rsi: lastRec.rsi,
          entry: numVal
        };
        
        try {
          const response = await fetch(`${backend}?t=${Date.now()}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatePayload)
          });
          const data = await response.json();
          handleBackendData(data);
        } catch (err) {
          console.log("Błąd synchronizacji entry z serwerem, odświeżam lokalnie.");
          updateTable();
        }
      } else {
        updateTable();
      }
    };

    input.addEventListener("blur", saveData);
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        input.blur();
      }
    });
    return;
  }

  if (cell.classList.contains("ticker-cell")) {
    const tf = tickers[ticker].lastTF;
    const rec = tickers[ticker][tf]?.last;
    if (rec && rec.comment) {
      document.getElementById("popupBody").innerHTML = `<pre>${rec.comment}</pre>`;
      document.getElementById("popup").style.display = "block";
      document.getElementById("popupOverlay").style.display = "block";
    } else {
      alert("Brak danych komentarza");
    }
  }
});

function saveTable() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers)); }
function loadTable() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) { Object.assign(tickers, JSON.parse(raw)); updateTable(); }
}

document.addEventListener("DOMContentLoaded", loadTable);
