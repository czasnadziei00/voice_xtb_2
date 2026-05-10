/* ============================================================
   TURBO MOBILE 6.2 — voice.js FULL
   Najlepsza jakość PL + filtry OLHC/DEMA + auto-restart
   ============================================================ */

const LIVE_BACKEND = "https://voice-xtb.onrender.com/voice-parse";
const TOMORROW_BACKEND = "https://voice-xtb.onrender.com/parse";

let recognition = null;

/* ============================================================
   🔥 FILTR MOWY 6.2 — poprawia błędy Chrome PL
   ============================================================ */
function fixSpeech(text) {
  let t = text.toLowerCase();

  // --- DEMA / BEMA / BMA / DEMA dziewięć ---
  t = t.replace(/\bbema\b/g, "dema");
  t = t.replace(/\bbma\b/g, "dema");
  t = t.replace(/\bdema dziewięć\b/g, "dema9");
  t = t.replace(/\bdema 9\b/g, "dema9");

  // --- MA / EMA ---
  t = t.replace(/\bema 20\b/g, "ma20");
  t = t.replace(/\bema\b/g, "ma");

  // --- LOW (wszystkie warianty Chrome) ---
  t = t.replace(/\blo\b/g, "low");
  t = t.replace(/\blou\b/g, "low");
  t = t.replace(/\bło\b/g, "low");
  t = t.replace(/\blowe\b/g, "low");

  // --- HIGH ---
  t = t.replace(/\bhaj\b/g, "high");

  // --- OPEN ---
  t = t.replace(/\bopen\b/g, "o");

  // --- CLOSE ---
  t = t.replace(/\bklous\b/g, "close");

  // --- liczby słowne ---
  const nums = {
    "jeden": "1", "dwa": "2", "trzy": "3", "cztery": "4", "pięć": "5",
    "sześć": "6", "siedem": "7", "osiem": "8", "dziewięć": "9",
    "dziesięć": "10", "jedenaście": "11", "dwanaście": "12",
    "trzynaście": "13", "czternaście": "14", "piętnaście": "15",
    "szesnaście": "16", "siedemnaście": "17", "osiemnaście": "18",
    "dziewiętnaście": "19", "dwadzieścia": "20", "trzydzieści": "30",
    "czterdzieści": "40", "pięćdziesiąt": "50", "sześćdziesiąt": "60",
    "siedemdziesiąt": "70", "osiemdziesiąt": "80", "dziewięćdziesiąt": "90",
    "sto": "100"
  };

  for (const [k, v] of Object.entries(nums)) {
    t = t.replace(new RegExp("\\b" + k + "\\b", "g"), v);
  }

  return t;
}

/* ============================================================
   MIKROFON LIVE — WERSJA 6.2
   ============================================================ */
if (!("webkitSpeechRecognition" in window)) {
  alert("Brak wsparcia rozpoznawania mowy.");
} else {
  recognition = new webkitSpeechRecognition();
  recognition.lang = "pl-PL";

  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 3;

  recognition.onresult = async (e) => {
    let text = e.results[e.results.length - 1][0].transcript.trim();
    text = fixSpeech(text);

    document.getElementById("raw").innerText = text;

    try {
      const res = await fetch(LIVE_BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      const data = await res.json();

      document.getElementById("parsed").innerText = JSON.stringify(data, null, 2);
      document.getElementById("comment").innerText = data.comment || "";

      if (data.ticker) upsertRowFromBackend(data);

    } catch (err) {
      document.getElementById("parsed").innerText = "Błąd backendu: " + err;
    }
  };

  // 🔥 AUTO-RESTART
  recognition.onend = () => {
    if (recognition._forceActive) {
      setTimeout(() => recognition.start(), 150);
    }
  };

  document.getElementById("micStart").onclick = () => {
    recognition._forceActive = true;
    recognition.start();
  };

  document.getElementById("micStop").onclick = () => {
    recognition._forceActive = false;
    recognition.stop();
  };
}

/* ============================================================
   TRYB NA JUTRO
   ============================================================ */
let tomorrowRec = null;
let tomorrowTicker = "";

document.getElementById("startTomorrow")?.addEventListener("click", () => {
  tomorrowRec = new webkitSpeechRecognition();
  tomorrowRec.lang = "pl-PL";
  tomorrowRec.interimResults = true;
  tomorrowRec.continuous = false;

  tomorrowRec.onresult = async (e) => {
    let text = e.results[e.results.length - 1][0].transcript.trim();
    text = fixSpeech(text);

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
  tomorrowRec?.stop();
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
  r.insertCell(15).innerHTML = `<button onclick="deleteRow(this)">🗑</button>`;

  saveTable();
  document.getElementById("tomorrowDecision").style.display = "none";
});

document.getElementById("tomorrowNo")?.addEventListener("click", () => {
  document.getElementById("tomorrowDecision").style.display = "none";
});

/* ============================================================
   PRZEŁĄCZANIE ZAKŁADEK
   ============================================================ */
document.getElementById("tabLive")?.addEventListener("click", () => {
  document.getElementById("liveView").style.display = "block";
  document.getElementById("tomorrowView").style.display = "none";
});

document.getElementById("tabTomorrow")?.addEventListener("click", () => {
  document.getElementById("liveView").style.display = "none";
  document.getElementById("tomorrowView").style.display = "block";
});
