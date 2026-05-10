/* ============================================================
   TURBO MOBILE 6.0+ — voice.js
   ============================================================ */

const LIVE_BACKEND = "https://voice-xtb.onrender.com/voice-parse";
const TOMORROW_BACKEND = "https://voice-xtb.onrender.com/parse";

let recognition = null;

/* ============================
   ANALIZA 4.5+ (popup)
   ============================ */
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
${d.widełki || ""}

🎯 TP1/TP2/TP3
${d.tp || ""}

────────────────────────
🎬 SYGNAŁ
${d.signal ?? "BRAK"}

💬 KOMENTARZ
${d.comment || ""}
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

/* ============================
   PARSER FRONT (lekki)
   ============================ */
function updateStatusFromBackend(d) {
  const required = [
    "ticker","interval","time",
    "open","high","low","close",
    "ma20","dema9","rsi","volume"
  ];
  const missing = required.filter(k => d[k] == null);
  document.getElementById("status").textContent =
    missing.length === 0 ? "Komplet danych — zapisano." : "Brakuje: " + missing.join(", ");
}

/* ============================
   MIKROFON LIVE
   ============================ */
if (!("webkitSpeechRecognition" in window)) {
  alert("Brak wsparcia rozpoznawania mowy.");
} else {
  recognition = new webkitSpeechRecognition();
  recognition.lang = "pl-PL";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = async (e) => {
    const text = e.results[0][0].transcript;
    document.getElementById("raw").innerText = text;

    try {
      const res = await fetch(LIVE_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const data = await res.json();

      document.getElementById("parsed").innerText = JSON.stringify(data, null, 2);
      updateStatusFromBackend(data);
      document.getElementById("comment").innerText = data.comment || "";

      if (data.ticker) {
        upsertRowFromBackend(data);
      }
    } catch (err) {
      document.getElementById("parsed").innerText = "Błąd backendu: " + err;
    }
  };

  recognition.onerror = (e) => console.warn("Błąd mikrofonu:", e.error);

  document.getElementById("micStart").onclick = () => recognition.start();
  document.getElementById("micStop").onclick = () => recognition.stop();
}

/* ============================
   NA JUTRO — VWAP ONLY
   ============================ */
let tomorrowRec = null;
let tomorrowTicker = "";

document.getElementById("startTomorrow")?.addEventListener("click", () => {
  if (!("webkitSpeechRecognition" in window)) {
    alert("Brak wsparcia rozpoznawania mowy.");
    return;
  }
  tomorrowRec = new webkitSpeechRecognition();
  tomorrowRec.lang = "pl-PL";
  tomorrowRec.interimResults = false;

  tomorrowRec.onresult = async (e) => {
    const text = e.results[0][0].transcript;
    document.getElementById("tomorrowRaw").innerText = text;

    try {
      const res = await fetch(TOMORROW_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      document.getElementById("tomorrowResult").innerText = JSON.stringify(data, null, 2);

      tomorrowTicker = data.ticker || "";
      if (data.good_for_tomorrow) {
        document.getElementById("tomorrowDecision").style.display = "block";
      } else {
        document.getElementById("tomorrowDecision").style.display = "none";
      }
    } catch (err) {
      document.getElementById("tomorrowResult").innerText = "Błąd backendu: " + err;
    }
  };

  tomorrowRec.start();
});

document.getElementById("stopTomorrow")?.addEventListener("click", () => {
  if (tomorrowRec) tomorrowRec.stop();
});

document.getElementById("tomorrowYes")?.addEventListener("click", () => {
  if (!tomorrowTicker) return;
  const tbody = document.querySelector("#voiceTable tbody");
  const r = tbody.insertRow(-1);

  r.dataset.ticker = tomorrowTicker;
  r.dataset.comment = "Dobry na jutro (D1/H1 + VWAP).";

  r.insertCell(0).innerText = tomorrowTicker;
  r.insertCell(1).innerText = "D1/H1";
  r.insertCell(2).innerText = "--:--";
  r.insertCell(3).innerText = "";
  r.insertCell(4).innerText = "";
  r.insertCell(5).innerText = "";
  r.insertCell(6).innerText = "0";
  r.insertCell(7).innerText = "";
  r.insertCell(8).innerText = "";
  r.insertCell(9).innerText = "";
  r.insertCell(10).innerText = "";
  r.insertCell(11).innerText = "CZEKAJ";
  r.insertCell(12).innerText = "";
  r.insertCell(13).innerText = "";
  r.insertCell(14).innerHTML = `<button onclick="openPopup(this)">📊</button>`;

  saveTable();
  document.getElementById("tomorrowDecision").style.display = "none";
});

document.getElementById("tomorrowNo")?.addEventListener("click", () => {
  document.getElementById("tomorrowDecision").style.display = "none";
});

/* ============================
   ZAKŁADKI LIVE / NA JUTRO
   ============================ */
document.getElementById("tabLive")?.addEventListener("click", () => {
  document.getElementById("voiceTable").style.display = "table";
  document.getElementById("tomorrowView").style.display = "none";
});

document.getElementById("tabTomorrow")?.addEventListener("click", () => {
  document.getElementById("voiceTable").style.display = "table";
  document.getElementById("tomorrowView").style.display = "block";
});
