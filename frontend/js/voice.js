// ======================================================
//  KONFIGURACJA
// ======================================================

const backend = "https://voice-xtb.onrender.com/voice-parse";

let recognition = null;
let recognizing = false;
let currentStep = 0;
let tempRecord = {};

const steps = [
  "Podaj ticker",
  "Podaj interwał",
  "Podaj godzinę",
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
  document.getElementById("parsed").textContent =
    JSON.stringify(tempRecord, null, 2);

  document.getElementById("comment").textContent =
    "✔️ Wysyłam do backendu 6.5 PRO";

  fetch(backend, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tempRecord)
  })
    .then(res => res.json())
    .then(data => {
      try {
        handleBackendData(data);
      } catch (err) {
        console.error("FRONTEND ERROR:", err);
        document.getElementById("comment").textContent =
          "❌ Błąd frontendu: " + err.message;
      }
    })
    .catch(err => {
      console.error("FETCH ERROR:", err);
      document.getElementById("comment").textContent =
        "❌ Błąd backend/fetch: " + err.message;
    });
  
}// ======================================================
//  INICJALIZACJA RECOGNITION
// ======================================================

function initRecognition() {
  const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
  if (!SR) {
    alert("❌ Brak wsparcia SpeechRecognition");
    return null;
  }

  const rec = new SR();
  rec.lang = "pl-PL";
  rec.continuous = false;
  rec.interimResults = false;

  rec.onresult = (e) => {
    const text = e.results[0][0].transcript.trim();
    handleRecognized(text);
    try { recognition.stop(); } catch {}
  };

  rec.onend = () => {
    if (!recognizing) return;
    if (currentStep < steps.length) {
      sayStep();
      setTimeout(() => { try { recognition.start(); } catch {} }, 300);
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
  return isNaN(num) ? null : num;
}

function normalizeInterval(tf) {
  tf = tf.toUpperCase().trim();
  if (tf === "M5" || tf === "5") return "M5";
  if (tf === "M15" || tf === "15") return "M15";
  if (tf === "H1" || tf === "1H" || tf === "60") return "H1";
  return tf;
}
// ======================================================
//  SYGNAŁ WSPÓLNY (M5 + M15 + H1)
// ======================================================

function consensusSignal(tData) {
  const sigs = [];
  ["M5", "M15", "H1"].forEach(tf => {
    const a = tData[tf];
    if (a && a.signal) sigs.push(a.signal);
  });

  if (sigs.length === 0) return "RESET";

  const hasBUY = sigs.includes("BUY");
  const hasSELL = sigs.includes("SELL");
  const hasPRAWIE = sigs.includes("PRAWIE BUY");
  const hasCZK = sigs.includes("CZEKAJ");

  if (hasBUY) return "BUY";
  if (hasSELL) return "SELL";
  if (hasPRAWIE) return "PRAWIE BUY";
  if (hasCZK) return "CZEKAJ";

  return "RESET";
}

// ======================================================
//  AKTUALIZACJA TABELI
// ======================================================

const tickers = {};

function handleBackendData(d) {
  const tf = normalizeInterval(d.interval);
  const t = d.ticker;

  if (!tickers[t]) tickers[t] = {};
  tickers[t][tf] = d;

  updateTable();
}

function updateTable() {
  const tbody = document.getElementById("table-body");
  tbody.innerHTML = "";

  Object.keys(tickers).forEach(t => {
    const tData = tickers[t];
    const M15 = tData["M15"];
    if (!M15) return;

    const row = document.createElement("tr");

    const entry = M15.entry ?? M15.close;
    const signal = consensusSignal(tData);

    row.innerHTML = `
      <td>${t}</td>
      <td>${M15.close.toFixed(2)}</td>
      <td>${M15.interval}</td>
      <td>${entry.toFixed(2)}</td>
      <td>${signal}</td>
      <td>—</td>
      <td>—</td>
      <td>—</td>
    `;

    tbody.appendChild(row);
  });
}
// ======================================================
//  OBSŁUGA ROZPOZNAWANIA
// ======================================================

function handleRecognized(text) {
  const step = steps[currentStep];

  switch (currentStep) {
    case 0: tempRecord.ticker = text.toUpperCase(); break;
    case 1: tempRecord.interval = normalizeInterval(text); break;
    case 2: tempRecord.time = text; break;
    case 3: tempRecord.open = extractNumber(text); break;
    case 4: tempRecord.low = extractNumber(text); break;
    case 5: tempRecord.high = extractNumber(text); break;
    case 6: tempRecord.close = extractNumber(text); break;
    case 7: tempRecord.volume = extractNumber(text); break;
    case 8: tempRecord.ma20 = extractNumber(text); break;
    case 9: tempRecord.dema9 = extractNumber(text); break;
    case 10: tempRecord.rsi = extractNumber(text); break;
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
  speechSynthesis.speak(msg);
}

function startSequence() {
  tempRecord = {};
  currentStep = 0;
  recognizing = true;
  sayStep();
  try { recognition.start(); } catch {}
}

function stopSequence() {
  recognizing = false;
  try { recognition.stop(); } catch {}
}
