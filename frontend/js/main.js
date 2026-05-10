/* ============================================================
   TURBO MOBILE 6.0 — main.js
   ============================================================ */

/* ============================
   PAMIĘĆ TABELI
   ============================ */
const STORAGE_KEY = "tm6_voice_table";

function saveTable() {
  const rows = [...document.querySelector("#voiceTable tbody").rows].map(r => {
    return {
      ticker: r.dataset.ticker || "",
      interval: r.cells[1].innerText,
      time: r.cells[2].innerText,
      O: r.cells[3].innerText,
      L: r.cells[4].innerText,
      H: r.cells[5].innerText,
      C: r.cells[6].innerText,
      MA20: r.cells[7].innerText,
      DEMA9: r.cells[8].innerText,
      RSI: r.cells[9].innerText,
      VOL: r.cells[10].innerText,
      signal: r.cells[11].innerText,
      range: r.cells[12].innerText,
      tp: r.cells[13].innerText
    };
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function loadTable() {
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  const tbody = document.querySelector("#voiceTable tbody");
  tbody.innerHTML = "";
  data.forEach(addRowFromMemory);
}

function addRowFromMemory(d) {
  const tbody = document.querySelector("#voiceTable tbody");
  const r = tbody.insertRow(-1);

  r.dataset.ticker = d.ticker;

  r.insertCell(0).innerText = d.ticker;
  r.insertCell(1).innerText = d.interval;
  r.insertCell(2).innerText = d.time;
  r.insertCell(3).innerText = d.O;
  r.insertCell(4).innerText = d.L;
  r.insertCell(5).innerText = d.H;
  r.insertCell(6).innerText = d.C;
  r.insertCell(7).innerText = d.MA20;
  r.insertCell(8).innerText = d.DEMA9;
  r.insertCell(9).innerText = d.RSI;
  r.insertCell(10).innerText = d.VOL;
  r.insertCell(11).innerText = d.signal;
  r.insertCell(12).innerText = d.range;
  r.insertCell(13).innerText = d.tp;
  r.insertCell(14).innerHTML = `<button onclick="openPopup(this)">📊</button>`;

  colorSignal(r, d.signal);
}

/* ============================
   DODAWANIE WIERSZA Z GŁOSU
   ============================ */
function addParsedRow(d) {
  const tbody = document.querySelector("#voiceTable tbody");

  let r = [...tbody.rows].find(x => x.dataset.ticker === d.ticker);
  if (!r) {
    r = tbody.insertRow(-1);
    r.dataset.ticker = d.ticker;

    for (let i = 0; i < 15; i++) r.insertCell(i);
    r.cells[14].innerHTML = `<button onclick="openPopup(this)">📊</button>`;
  }

  r.cells[0].innerText = d.ticker;
  r.cells[1].innerText = d.interval;
  r.cells[2].innerText = d.time;
  r.cells[3].innerText = d.O;
  r.cells[4].innerText = d.L;
  r.cells[5].innerText = d.H;
  r.cells[6].innerText = d.C;
  r.cells[7].innerText = d.MA20;
  r.cells[8].innerText = d.DEMA9;
  r.cells[9].innerText = d.RSI;
  r.cells[10].innerText = d.VOL;

  computeSignal(r);
  saveTable();
}

/* ============================
   SYGNAŁ 6.0
   ============================ */
function computeSignal(r) {
  const C = parseFloat(r.cells[6].innerText);
  const L = parseFloat(r.cells[4].innerText);
  const H = parseFloat(r.cells[5].innerText);
  const MA20 = parseFloat(r.cells[7].innerText);
  const DEMA9 = parseFloat(r.cells[8].innerText);
  const RSI = parseFloat(r.cells[9].innerText);
  const VOL = parseFloat(r.cells[10].innerText);

  if (!isFinite(C) || !isFinite(L) || !isFinite(H)) return;

  const dol = L + (H - L) * 0.20;
  const gor = L + (H - L) * 0.35;
  r.cells[12].innerText = `${dol.toFixed(2)}–${gor.toFixed(2)}`;

  let momentum = (DEMA9 && C > DEMA9) ? "MOCNE" : "SŁABE";
  let bias = (MA20 && C > MA20) ? "UP" : "DOWN";
  let rsiPower = RSI >= 55 ? "MOCNE" : RSI >= 50 ? "OK" : "SŁABE";
  let volPower = VOL >= 1500 ? "MOCNE" : VOL >= 500 ? "OK" : "SŁABE";

  let s = "CZEKAJ";

  if (C < dol) s = "CZEKAJ DO";
  if (C >= dol && C <= gor && (momentum === "SŁABE" || rsiPower === "SŁABE")) s = "PRAWIE BUY";
  if (C >= dol && C <= gor && momentum === "MOCNE" && bias === "UP" && rsiPower !== "SŁABE" && volPower !== "SŁABE") s = "BUY";
  if (C > gor) s = "CZEKAJ";
  if (C < dol * 0.995 && momentum === "SŁABE" && rsiPower === "SŁABE") s = "UWAGA RESET";
  if (C < L && momentum === "SŁABE" && rsiPower === "SŁABE") s = "RESET";

  r.cells[11].innerText = s;
  colorSignal(r, s);

  computeTP(r, C);
}

/* ============================
   TP1 / TP2 / TP3
   ============================ */
function computeTP(r, C) {
  const entry = parseFloat(r.cells[6].innerText);
  if (!isFinite(entry)) return;

  const range = Math.abs(C - entry) || entry * 0.01;
  const tp1 = entry + range * 0.5;
  const tp2 = entry + range * 1.0;
  const tp3 = entry + range * 1.5;

  r.cells[13].innerText = `${tp1.toFixed(2)} / ${tp2.toFixed(2)} / ${tp3.toFixed(2)}`;
}

/* ============================
   KOLORY
   ============================ */
function colorSignal(r, s) {
  r.cells[11].className = "";
  r.cells[11].classList.add(
    s === "BUY" ? "signal-buy" :
    s === "PRAWIE BUY" ? "signal-prawiebuy" :
    s === "CZEKAJ" ? "signal-czekaj" :
    s === "CZEKAJ DO" ? "signal-czekajdo" :
    s === "UWAGA RESET" ? "signal-uwagarese" :
    s === "RESET" ? "signal-reset" : ""
  );
}

/* ============================
   POPUP
   ============================ */
function openPopup(btn) {
  const r = btn.closest("tr");
  const data = [...r.cells].map(td => td.innerText).join("\n");
  document.getElementById("popupData").innerText = data;
  document.getElementById("popup45").style.display = "block";
}

document.getElementById("popupClose").onclick = () => {
  document.getElementById("popup45").style.display = "none";
};

/* ============================
   START
   ============================ */
document.addEventListener("DOMContentLoaded", loadTable);
