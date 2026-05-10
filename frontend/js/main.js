/* ============================================================
   TURBO MOBILE 6.1 — main.js
   ============================================================ */

const STORAGE_KEY = "tm6_voice_table";

/* ============================
   PAMIĘĆ TABELI
   ============================ */
function saveTable() {
  const rows = [...document.querySelector("#voiceTable tbody").rows].map(r => ({
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
    tp: r.cells[13].innerText,
    comment: r.dataset.comment || ""
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function loadTable() {
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  const tbody = document.querySelector("#voiceTable tbody");
  tbody.innerHTML = "";
  data.forEach(d => addRowFromMemory(d));
}

/* ============================
   USUŃ WIERSZ
   ============================ */
function deleteRow(btn) {
  const r = btn.closest("tr");
  r.remove();
  saveTable();
}

/* ============================
   EDYCJA ENTRY (C)
   ============================ */
function editEntry(btn) {
  const r = btn.closest("tr");
  const ticker = r.dataset.ticker;
  const price = prompt("Podaj ENTRY dla " + ticker);

  if (price === null) return;

  if (price === "0") {
    r.cells[6].innerText = "";
    r.cells[11].innerText = "CZEKAJ";
    r.dataset.comment = "Pozycja zamknięta (ENTRY=0)";
    saveTable();
    return;
  }

  r.cells[6].innerText = price;
  saveTable();
}

/* ============================
   EDYCJA CENY (O)
   ============================ */
function editPrice(btn) {
  const r = btn.closest("tr");
  const ticker = r.dataset.ticker;
  const price = prompt("Podaj AKTUALNĄ CENĘ dla " + ticker);

  if (price !== null) {
    r.cells[3].innerText = price;
    saveTable();
  }
}

/* ============================
   DODAWANIE WIERSZA Z PAMIĘCI
   ============================ */
function addRowFromMemory(d) {
  const tbody = document.querySelector("#voiceTable tbody");
  const r = tbody.insertRow(-1);

  r.dataset.ticker = d.ticker;
  r.dataset.comment = d.comment || "";

  r.insertCell(0).innerText = d.ticker;
  r.insertCell(1).innerText = d.interval;
  r.insertCell(2).innerText = d.time;
  r.insertCell(3).innerHTML = `<span onclick="editPrice(this)">${d.O}</span>`;
  r.insertCell(4).innerText = d.L;
  r.insertCell(5).innerText = d.H;
  r.insertCell(6).innerHTML = `<span onclick="editEntry(this)">${d.C}</span>`;
  r.insertCell(7).innerText = d.MA20;
  r.insertCell(8).innerText = d.DEMA9;
  r.insertCell(9).innerText = d.RSI;
  r.insertCell(10).innerText = d.VOL;
  r.insertCell(11).innerText = d.signal;
  r.insertCell(12).innerText = d.range;
  r.insertCell(13).innerText = d.tp;
  r.insertCell(14).innerHTML = `<button onclick="openPopup(this)">📊</button>`;
  r.insertCell(15).innerHTML = `<button onclick="deleteRow(this)">🗑</button>`;

  colorSignal(r, d.signal);
}

/* ============================
   DODAWANIE WIERSZA Z BACKENDU
   ============================ */
function upsertRowFromBackend(d) {
  const tbody = document.querySelector("#voiceTable tbody");

  let r = [...tbody.rows].find(x => x.dataset.ticker === d.ticker);
  if (!r) {
    r = tbody.insertRow(-1);
    r.dataset.ticker = d.ticker;
    r.dataset.comment = d.comment || "";
    for (let i = 0; i < 16; i++) r.insertCell(i);
    r.cells[14].innerHTML = `<button onclick="openPopup(this)">📊</button>`;
    r.cells[15].innerHTML = `<button onclick="deleteRow(this)">🗑</button>`;
  }

  r.cells[0].innerText = d.ticker || "";
  r.cells[1].innerText = d.interval || "";
  r.cells[2].innerText = d.time || "";
  r.cells[3].innerHTML = `<span onclick="editPrice(this)">${d.open ?? ""}</span>`;
  r.cells[4].innerText = d.low ?? "";
  r.cells[5].innerText = d.high ?? "";
  r.cells[6].innerHTML = `<span onclick="editEntry(this)">${d.close ?? ""}</span>`;
  r.cells[7].innerText = d.ma20 ?? "";
  r.cells[8].innerText = d.dema9 ?? "";
  r.cells[9].innerText = d.rsi ?? "";
  r.cells[10].innerText = d.volume ?? "";
  r.cells[11].innerText = d.signal ?? "";
  r.cells[12].innerText = d.widełki ?? "";
  r.cells[13].innerText = d.tp ?? "";
  r.dataset.comment = d.comment || "";

  colorSignal(r, d.signal);
  saveTable();
}

/* ============================
   KOLORY SYGNAŁÓW
   ============================ */
function colorSignal(r, s) {
  const cell = r.cells[11];
  cell.className = "";
  if (!s) return;
  s = s.toUpperCase();
  cell.classList.add(
    s === "BUY" ? "signal-buy" :
    s === "PRAWIE BUY" ? "signal-prawiebuy" :
    s === "CZEKAJ" ? "signal-czekaj" :
    s === "CZEKAJ DO" ? "signal-czekajdo" :
    s === "UWAGA RESET" ? "signal-uwagarese" :
    s === "RESET" ? "signal-reset" : ""
  );
}

/* ============================
   POPUP 4.5+
   ============================ */
function openPopup(btn) {
  const r = btn.closest("tr");
  const d = {
    ticker: r.cells[0].innerText,
    interval: r.cells[1].innerText,
    time: r.cells[2].innerText,
    open: r.cells[3].innerText,
    low: r.cells[4].innerText,
    high: r.cells[5].innerText,
    close: r.cells[6].innerText,
    ma20: r.cells[7].innerText,
    dema9: r.cells[8].innerText,
    rsi: r.cells[9].innerText,
    volume: r.cells[10].innerText,
    signal: r.cells[11].innerText,
    widełki: r.cells[12].innerText,
    tp: r.cells[13].innerText,
    comment: r.dataset.comment || ""
  };
  document.getElementById("popupData").innerText = analiza45PRO(d);
  document.getElementById("popup45").style.display = "block";
}

document.getElementById("popupClose").onclick = () => {
  document.getElementById("popup45").style.display = "none";
};
window.addEventListener("click", (e) => {
  if (e.target.id === "popup45") document.getElementById("popup45").style.display = "none";
});

/* ============================
   RESET 6.1
   ============================ */
document.getElementById("resetTable")?.addEventListener("click", () => {
  document.querySelectorAll("#voiceTable tbody tr").forEach(r => {
    const entry = r.cells[6].innerText;
    r.cells[3].innerText = "";
    r.cells[4].innerText = "";
    r.cells[5].innerText = "";
    r.cells[6].innerText = entry;
    r.cells[7].innerText = "";
    r.cells[8].innerText = "";
    r.cells[9].innerText = "";
    r.cells[10].innerText = "";
    r.cells[11].innerText = "CZEKAJ";
    r.cells[12].innerText = "";
    r.cells[13].innerText = "";
    r.dataset.comment = r.dataset.comment || "";
  });
  saveTable();
});

/* ============================
   START
   ============================ */
document.addEventListener("DOMContentLoaded", loadTable);
