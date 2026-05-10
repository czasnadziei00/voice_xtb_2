/* ============================================================
   TURBO MOBILE 6.0 — voice.js
   ============================================================ */

let rec = null;

/* ============================
   START / STOP
   ============================ */
document.getElementById("micStart").onclick = () => startMic();
document.getElementById("micStop").onclick = () => stopMic();

function startMic() {
  if (!("webkitSpeechRecognition" in window)) {
    alert("Brak wsparcia rozpoznawania mowy.");
    return;
  }

  rec = new webkitSpeechRecognition();
  rec.lang = "pl-PL";
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    document.getElementById("raw").innerText = text;

    const parsed = parseVoice(text);
    document.getElementById("parsed").innerText = JSON.stringify(parsed, null, 2);

    addParsedRow(parsed);
  };

  rec.start();
}

function stopMic() {
  if (rec) rec.stop();
}

/* ============================
   PARSER 6.0
   ============================ */
function parseVoice(t) {
  t = t.toLowerCase();

  const ticker = extractTicker(t);
  const interval = extractInterval(t);
  const time = extractTime(t);

  return {
    ticker,
    interval,
    time,
    O: extractNumber(t, "o"),
    L: extractNumber(t, "l"),
    H: extractNumber(t, "h"),
    C: extractNumber(t, "c"),
    MA20: extractNumber(t, "ma20"),
    DEMA9: extractNumber(t, "dema9") || extractNumber(t, "bema9"),
    RSI: extractNumber(t, "rsi"),
    VOL: extractNumber(t, "wolumen")
  };
}

/* ============================
   TICKERY
   ============================ */
function extractTicker(t) {
  const list = ["kghm","orlen","pzu","pko","peo","mbank","jsw","cd projekt","allegro","dino","lpp","xtb"];
  for (let x of list) if (t.includes(x)) return x.toUpperCase();
  return "???";
}

/* ============================
   INTERWAŁ
   ============================ */
function extractInterval(t) {
  if (t.includes("m15")) return "M15";
  if (t.includes("h1")) return "H1";
  if (t.includes("d1")) return "D1";
  return "M15";
}

/* ============================
   GODZINA
   ============================ */
function extractTime(t) {
  const m = t.match(/(\d{1,2}[:\.]\d{2})/);
  return m ? m[1].replace(".", ":") : "--:--";
}

/* ============================
   LICZBY
   ============================ */
function extractNumber(t, key) {
  const m = t.match(new RegExp(key + "\\s*(\\d+[\\.,]?\\d*)"));
  return m ? parseFloat(m[1].replace(",", ".")) : "";
}
