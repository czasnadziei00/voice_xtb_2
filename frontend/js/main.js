// =========================
//  BACKEND 6.5 PRO
// =========================
const backend = "https://voice-xtb.onrender.com/voice-parse";

let lastTicker = null;


// =========================
–  KOLORY SYGNAŁÓW
// =========================
function colorForSignal(signal) {
  if (signal === "BUY") return "#00c853";
  if (signal === "SELL") return "#d50000";
  return "#616161";
}


// =========================
//  WIDEŁKI 20–35%
// =========================
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


// =========================
//  TP1 / TP2 / TP3
// =========================
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


// =========================
//  TWORZENIE WIERSZA 6.5
// =========================
function createRow(data) {
  const tbody = document.querySelector("#voiceTable tbody");
  const tr = document.createElement("tr");
  tr.dataset.ticker = data.ticker;

  const visibleCols = [
    "ticker",
    "interval",
    "time",
    "entry",
    "signal",
    "widełki",
    "tp"
  ];

  visibleCols.forEach(key => {
    const td = document.createElement("td");
    td.classList.add(key);
    td.textContent = data[key] ?? "";
    tr.appendChild(td);
  });

  // popup
  const tdIcon = document.createElement("td");
  tdIcon.classList.add("popupIcon");
  tdIcon.textContent = "📊";
  tdIcon.style.cursor = "pointer";
  tr.appendChild(tdIcon);

  // usuń
  const del = document.createElement("td");
  del.classList.add("deleteRow");
  del.textContent = "🗑";
  del.style.cursor = "pointer";
  tr.appendChild(del);

  tbody.appendChild(tr);
  return tr;
}


// =========================
//  AKTUALIZACJA WIERSZA 6.5
// =========================
function updateRow(tr, data) {
  ["ticker","interval","time","signal"].forEach(key => {
    const td = tr.querySelector("." + key);
    if (td && data[key] != null) td.textContent = data[key];
  });

  const w = calcWidełki(data);
  const wTd = tr.querySelector(".widełki");
  if (wTd) wTd.textContent = w;

  const tp = calcTP(data);
  const tpTd = tr.querySelector(".tp");
  if (tpTd) tpTd.textContent = `${tp.tp1} / ${tp.tp2} / ${tp.tp3}`;

  if (data.signal) {
    tr.style.backgroundColor = colorForSignal(data.signal);
    tr.style.color = "white";
  }

  tr.dataset.signal = data.signal;

  if (data.entry !== undefined) {
    const td = tr.querySelector(".entry");
    if (td) td.textContent = data.entry ?? "";
  }
}


// =========================
//  STATUS BUFORA
// =========================
function updateStatus(data) {
  const required = [
    "ticker","interval","time",
    "open","high","low","close",
    "ma20","dema9","rsi","volume"
  ];

  const missing = required.filter(k => data[k] === null || data[k] === undefined);
  document.getElementById("status").textContent =
    missing.length === 0 ? "Komplet danych — zapisano." : "Brakuje: " + missing.join(", ");
}


// =========================
//  GŁÓWNA FUNKCJA 6.5
// =========================
function handleParsedData(data) {
  document.getElementById("parsed").textContent =
    JSON.stringify(data, null, 2);

  updateStatus(data);
  document.getElementById("comment").textContent = data.comment ?? "";

  if (!data.ticker) return;

  const tbody = document.querySelector("#voiceTable tbody");

  if (data.deleted) {
    const tr = tbody.querySelector(`tr[data-ticker="${data.ticker}"]`);
    if (tr) tr.remove();
    return;
  }

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


// =========================
//  POPUP 4.5+ (PRO)
// =========================
const popup = document.getElementById("popup45");
const popupClose = document.getElementById("popupClose");
const popupData = document.getElementById("popupData");

popupClose.onclick = () => popup.style.display = "none";
window.onclick = (e) => { if (e.target === popup) popup.style.display = "none"; };

document.querySelector("#voiceTable tbody").addEventListener("click", (e) => {
  if (e.target.classList.contains("popupIcon")) {
    const tr = e.target.closest("tr");
    const d = {};

    tr.querySelectorAll("td").forEach(td => {
      if (td.classList.length > 0 &&
          td.classList[0] !== "popupIcon" &&
          td.classList[0] !== "deleteRow") {
        d[td.classList[0]] = td.textContent;
      }
    });

    // tu możesz podpiąć swoją analiza45PRO(d)
    popupData.textContent = JSON.stringify(d, null, 2);
    popup.style.display = "block";
  }

  if (e.target.classList.contains("deleteRow")) {
    const tr = e.target.closest("tr");
    const ticker = tr.dataset.ticker;

    tr.remove();

    fetch(backend + "/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker })
    });
  }
});
