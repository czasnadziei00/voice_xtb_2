const backend = "https://voice-xtb.onrender.com/voice-parse";

let recognition;
let isListening = false;

if ('webkitSpeechRecognition' in window) {
  recognition = new webkitSpeechRecognition();
} else if ('SpeechRecognition' in window) {
  recognition = new SpeechRecognition();
}

let lastTicker = null;

// ANALIZA 4.5+ PRO
function analiza45PRO(d) {
  return `
📌 TICKER: ${d.ticker}
⏱ INTERWAŁ: ${d.interval}
🕒 CZAS: ${d.time}

────────────────────────
📊 ŚWIECA
O: ${d.open}
L: ${d.low}
H: ${d.high}
C: ${d.close}

────────────────────────
📘 ŚREDNIE
MA20: ${d.ma20}
DEMA9: ${d.dema9}
RSI: ${d.rsi}
Wolumen: ${d.volume}

────────────────────────
🔥 TREND / MOMENTUM / SIŁA
${trendMomentumSil(d)}

────────────────────────
🎯 WIDEŁKI (20–35%)
${calcWidełki(d)}

🎯 TP1/TP2/TP3
${calcTP(d).tp1}
${calcTP(d).tp2}
${calcTP(d).tp3}

────────────────────────
🎬 SYGNAŁ
${d.signal ?? "BRAK"}

💬 KOMENTARZ
${d.comment}
`;
}

function trendMomentumSil(d) {
  const close = parseFloat(d.close);
  const ma20 = parseFloat(d.ma20);
  const dema9 = parseFloat(d.dema9);
  const rsi = parseFloat(d.rsi);

  let trend = "";
  let momentum = "";
  let sila = "";

  if (!isNaN(close) && !isNaN(ma20) && !isNaN(dema9)) {
    if (close > ma20 && close > dema9) trend = "Trend: WZROSTOWY 📈";
    else if (close < ma20 && close < dema9) trend = "Trend: SPADKOWY 📉";
    else trend = "Trend: NEUTRALNY ➖";

    if (dema9 > ma20) momentum = "Momentum: SILNE 📗";
    else if (dema9 < ma20) momentum = "Momentum: SŁABE 📕";
    else momentum = "Momentum: NEUTRALNE ➖";
  } else {
    trend = "Trend: brak danych";
    momentum = "Momentum: brak danych";
  }

  if (!isNaN(rsi)) {
    if (rsi > 60) sila = "Siła: PRZEWAGA BYKÓW 🟢";
    else if (rsi < 40) sila = "Siła: PRZEWAGA NIEDŹWIEDZI 🔴";
    else sila = "Siła: RÓWNOWAGA ⚪";
  } else {
    sila = "Siła: brak danych";
  }

  return `${trend}\n${momentum}\n${sila}`;
}

// WIDEŁKI 20–35% + dynamiczne BUY/SELL
function calcWidełki(d) {
  const low = parseFloat(d.low);
  const high = parseFloat(d.high);
  const signal = d.signal;

  if (isNaN(low) || isNaN(high)) return "";

  const range = high - low;

  let dol, gor;

  if (signal === "SELL") {
    dol = high - range * 0.35;
    gor = high - range * 0.20;
  } else {
    dol = low + range * 0.20;
    gor = low + range * 0.35;
  }

  return `${dol.toFixed(2)} – ${gor.toFixed(2)}`;
}

// TP1/TP2/TP3
function calcTP(d) {
  const low = parseFloat(d.low);
  const high = parseFloat(d.high);
  const close = parseFloat(d.close);
  const signal = d.signal;

  if (isNaN(low) || isNaN(high) || isNaN(close))
    return { tp1: "", tp2: "", tp3: "" };

  const range = Math.abs(high - low);

  let tp1, tp2, tp3;

  if (signal === "SELL") {
    tp1 = close - range * 0.5;
    tp2 = close - range * 1.0;
    tp3 = close - range * 1.5;
  } else {
    tp1 = close + range * 0.5;
    tp2 = close + range * 1.0;
    tp3 = close + range * 1.5;
  }

  return {
    tp1: tp1.toFixed(2),
    tp2: tp2.toFixed(2),
    tp3: tp3.toFixed(2)
  };
}

function colorForSignal(signal) {
  if (signal === "BUY") return "#00c853";
  if (signal === "SELL") return "#d50000";
  return "#616161";
}

function updateStatus(data) {
  const required = [
    "ticker","interval","time",
    "open","high","low","close",
    "ma20","dema9","rsi","volume"
  ];

  const missing = required.filter(k => data[k] === null);
  document.getElementById("status").textContent =
    missing.length === 0 ? "Komplet danych — zapisano." : "Brakuje: " + missing.join(", ");
}

function createRow(data) {
  const tbody = document.querySelector("#voiceTable tbody");
  const tr = document.createElement("tr");
  tr.dataset.ticker = data.ticker;

  const cols = [
    "ticker","interval","time",
    "open","low","high","close",
    "ma20","dema9","rsi","volume","signal",
    "widełki","tp"
  ];

  cols.forEach(key => {
    const td = document.createElement("td");
    td.classList.add(key);
    td.textContent = data[key] ?? "";
    tr.appendChild(td);
  });

  const tdIcon = document.createElement("td");
  tdIcon.classList.add("popupIcon");
  tdIcon.textContent = "📊";
  tdIcon.style.cursor = "pointer";
  tr.appendChild(tdIcon);

  tbody.appendChild(tr);
  return tr;
}

function updateRow(tr, data) {
  Object.keys(data).forEach(key => {
    const td = tr.querySelector("." + key);
    if (td) td.textContent = data[key] ?? "";
  });

  // widełki
  const w = calcWidełki(data);
  tr.querySelector(".widełki").textContent = w;

  // TP
  const tp = calcTP(data);
  tr.querySelector(".tp").textContent = `${tp.tp1} / ${tp.tp2} / ${tp.tp3}`;

  if (data.signal) {
    tr.style.backgroundColor = colorForSignal(data.signal);
    tr.style.color = "white";
  }
}

function handleParsedData(data) {
  document.getElementById("parsed").textContent =
    JSON.stringify(data, null, 2);

  updateStatus(data);
  document.getElementById("comment").textContent = data.comment;

  if (!data.ticker) return;

  const tbody = document.querySelector("#voiceTable tbody");

  if (data.ticker !== lastTicker) {
    lastTicker = data.ticker;
    const tr = createRow(data);
    updateRow(tr, data);
    return;
  }

  const rows = tbody.querySelectorAll("tr");
  if (rows.length > 0) {
    const tr = rows[rows.length - 1];
    updateRow(tr, data);
  }
}

if (recognition) {
  recognition.lang = "pl-PL";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = async (event) => {
    const text = event.results[event.results.length - 1][0].transcript;
    document.getElementById("raw").textContent = text;

    const res = await fetch(backend, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    const data = await res.json();
    handleParsedData(data);
  };

  recognition.onerror = (event) => {
    console.warn("Błąd mikrofonu:", event.error);
  };

  recognition.onend = () => {
    if (isListening) recognition.start();
  };

  document.getElementById("micStart").onclick = () => {
    isListening = true;
    recognition.start();
  };

  document.getElementById("micStop").onclick = () => {
    isListening = false;
    recognition.stop();
  };
}

// POPUP
const popup = document.getElementById("popup45");
const popupClose = document.getElementById("popupClose");
const popupData = document.getElementById("popupData");

popupClose.onclick = () => popup.style.display = "none";
window.onclick = (e) => { if (e.target === popup) popup.style.display = "none"; };

document.querySelector("#voiceTable tbody").addEventListener("click", (e) => {
  if (!e.target.classList.contains("popupIcon")) return;

  const tr = e.target.closest("tr");
  const d = {};

  tr.querySelectorAll("td").forEach(td => {
    if (td.classList.length > 0 && td.classList[0] !== "popupIcon") {
      d[td.classList[0]] = td.textContent;
    }
  });

  popupData.textContent = analiza45PRO(d);
  popup.style.display = "block";
});
