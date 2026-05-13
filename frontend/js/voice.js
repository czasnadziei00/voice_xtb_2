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
//  INICJALIZACJA RECOGNITION
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
    handleRecognized(text);
    try { recognition.stop(); } catch {}
  };

  rec.onend = () => {
    if (!recognizing) return;
    if (currentStep < steps.length) sayStep();
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
//  TABELA
// ======================================================

const tickers = {};

function handleBackendData(d) {
  const tf = normalizeInterval(d.interval);
  const t = d.ticker;

  if (tf === "M15") {
    d.widelki = computeWidelki(d);
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

    row.innerHTML = `
      <td class="ticker-cell">${t}</td>
      <td class="price-cell">${rec.close.toFixed(2)}</td>

      <td>${rec.interval}</td>

      <td class="entry-cell">${entry}</td>

      <td>
        <span style="font-size:16px; font-weight:700;">${signal}</span><br>
        <span style="font-size:12px; opacity:0.7;">
          ${
            signal === "CZEKAJ DO"
              ? (rec.close > rec.ma20 ? "BUY" : "SELL")
              : signal
          }
        </span>
      </td>

      <td>${M15?.widelki ?? "—"}</td>
      <td>—</td>
      <td>—</td>

      <td class="delete-cell">🗑️</td>
    `;

    tbody.appendChild(row);
  });
}

// ======================================================
//  OBSŁUGA ROZPOZNAWANIA
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
  recognizing = true;
  sayStep();
}

function stopSequence() {
  recognizing = false;
  try { recognition.stop(); } catch {}
}

// ======================================================
//  POPUP + ENTRY + CENA
// ======================================================

document.addEventListener("click", (e) => {
  const row = e.target.parentElement;
  if (!row) return;

  const ticker = row.children[0]?.textContent.trim();
  if (!ticker) return;

  if (e.target.classList.contains("ticker-cell")) {
    const rec = tickers[ticker]["M15"] || tickers[ticker]["M5"] || tickers[ticker]["H1"];
    const popup = document.getElementById("popup");
    const body = document.getElementById("popupBody");

    body.innerHTML = `<h2>${ticker}</h2><p>${rec.comment}</p>`;
    popup.style.display = "block";
  }

  if (e.target.classList.contains("price-cell")) {
    const value = prompt("Podaj cenę aktualną:");
    if (!value) return;
    const rec = tickers[ticker]["M15"] || tickers[ticker]["M5"] || tickers[ticker]["H1"];
    rec.close = parseFloat(value.replace(",", "."));
    updateTable();
  }

  if (e.target.classList.contains("entry-cell")) {
    const value = prompt("Podaj entry:");
    if (!value) return;
    const rec = tickers[ticker]["M15"] || tickers[ticker]["M5"] || tickers[ticker]["H1"];
    rec.entry = parseFloat(value.replace(",", "."));
    updateTable();
  }

  if (e.target.classList.contains("delete-cell")) {
    delete tickers[ticker];
    updateTable();
  }
});

document.getElementById("popupClose").onclick = () => {
  document.getElementById("popup").style.display = "none";
};
