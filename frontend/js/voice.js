// ======================================================
//  VOICE XTB 8.1 HYBRID - AGGRESSIVE BALANCED EDITION
//  60-65% AGRESYWNY / 35-40% KONSERWATYWNY
// ======================================================

const backend = "https://voice-xtb.onrender.com/voice-parse";
const STORAGE_KEY = "xtbtablememoryv2multitf";

// ======================================================
// NOWE PARAMETRY SYSTEMU HYBRYDOWEGO
// ======================================================

const SYSTEM_MODE = {
  aggression: 0.65,
  conservative: 0.35,

  allowFastEntry: true,
  allowMomentumSignals: true,
  allowEarlyBreakouts: true,

  strictExitConfirmation: true,
  strongerSellFilter: true,

  confidenceThresholdBuy: 52,
  confidenceThresholdSell: 60
};

// ======================================================

let recognition = null;
let recognizing = false;
let currentStep = 0;
let tempRecord = {};
let isFetching = false;

const steps = [
  "Podaj ticker",
  "Podaj interwał",
  "Podaj czas lub dzień",
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

function initRecognition() {

  const SR = window.webkitSpeechRecognition || window.SpeechRecognition;

  if (!SR) {
    alert("Przeglądarka nie wspiera rozpoznawania mowy");
    return null;
  }

  const rec = new SR();

  rec.lang = "pl-PL";
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onresult = (e) => {

    const text = e.results[0][0].transcript.trim();

    document.getElementById("recognized").textContent =
      `Rozpoznano: ${text}`;

    handleRecognized(text);
  };

  rec.onend = () => {

    if (!recognizing) return;

    if (currentStep < steps.length) {

      setTimeout(() => {
        sayStep();
      }, 300);

    } else {

      recognizing = false;
      finalizeRecord();
    }
  };

  rec.onerror = (e) => {

    console.log("Speech error:", e.error);

    if (!recognizing) return;

    setTimeout(() => {

      try {
        recognition.start();
      } catch (err) {
        console.log("Restart mic error:", err);
      }

    }, 500);
  };

  return rec;
}

recognition = initRecognition();

// ======================================================
// SPEECH
// ======================================================

function sayStep() {

  if (currentStep >= steps.length || !recognizing) return;

  speechSynthesis.cancel();

  const msg = new SpeechSynthesisUtterance(steps[currentStep]);

  msg.lang = "pl-PL";
  msg.rate = 1.08;
  msg.pitch = 1;

  msg.onend = () => {

    if (!recognizing) return;

    setTimeout(() => {

      try {
        recognition.start();
      } catch (e) {

        console.log("Mic restart retry...");

        setTimeout(() => {

          try {
            recognition.start();
          } catch {}

        }, 400);
      }

    }, 200);
  };

  speechSynthesis.speak(msg);
}

// ======================================================
// TIME PARSER
// ======================================================

function parseAndAlignTime(rawText, intervalStr) {

  const now = new Date();

  if (intervalStr === "D1") {

    let dayNum = parseInt(
      rawText.toString().replace(/[^0-9]/g, ""),
      10
    );

    if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
      dayNum = now.getDate();
    }

    let year = now.getFullYear();
    let month = now.getMonth() + 1;

    if (dayNum > now.getDate() && now.getDate() < 7) {

      month--;

      if (month === 0) {
        month = 12;
        year--;
      }
    }

    return `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  }

  let hours = 0;
  let minutes = 0;

  let cleanText = rawText
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[.:\-]/g, " ");

  let parts = cleanText
    .split(/\s+/)
    .filter(p => p.length > 0);

  if (parts.length >= 2) {

    hours = parseInt(parts[0], 10) || 0;
    minutes = parseInt(parts[1], 10) || 0;

  } else if (parts.length === 1 && !isNaN(parts[0])) {

    let num = parts[0];

    if (num.length === 3) {

      hours = parseInt(num.substring(0, 1), 10);
      minutes = parseInt(num.substring(1), 10);

    } else if (num.length === 4) {

      hours = parseInt(num.substring(0, 2), 10);
      minutes = parseInt(num.substring(2), 10);

    } else {

      hours = parseInt(num, 10) || 0;
      minutes = 0;
    }

  } else {

    hours = now.getHours();
    minutes = now.getMinutes();
  }

  hours = Math.min(Math.max(hours, 0), 23);
  minutes = Math.min(Math.max(minutes, 0), 59);

  if (intervalStr === "M5") {
    minutes = Math.floor(minutes / 5) * 5;
  }

  if (intervalStr === "M15") {
    minutes = Math.floor(minutes / 15) * 15;
  }

  if (intervalStr === "H1") {
    minutes = 0;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// ======================================================
// HANDLE RECOGNIZED
// ======================================================

function handleRecognized(text) {

  switch (currentStep) {

    case 0:
      tempRecord.ticker =
        text.toUpperCase().replace(/\s+/g, "");
      break;

    case 1:
      tempRecord.interval =
        normalizeInterval(text);
      break;

    case 2:
      tempRecord.time =
        parseAndAlignTime(
          text,
          tempRecord.interval
        );
      break;

    case 3:
      tempRecord.open =
        extractNumber(text);
      break;

    case 4:
      tempRecord.high =
        extractNumber(text);
      break;

    case 5:
      tempRecord.low =
        extractNumber(text);
      break;

    case 6:
      tempRecord.close =
        extractNumber(text);
      break;

    case 7:
      tempRecord.volume =
        extractNumber(text);
      break;

    case 8:
      tempRecord.ma20 =
        extractNumber(text);
      break;

    case 9:
      tempRecord.dema9 =
        extractNumber(text);
      break;

    case 10:
      tempRecord.rsi =
        extractNumber(text);
      break;
  }

  currentStep++;
}

// ======================================================
// NUMBER PARSER
// ======================================================

function extractNumber(text) {

  if (!text) return 0;

  text = text
    .toString()
    .trim()
    .toLowerCase()
    .replaceAll("kropka", ".")
    .replaceAll("przecinek", ".");

  text = text.replace(/\s+/g, "");

  const num = parseFloat(text);

  return isFinite(num) ? num : 0;
}

// ======================================================
// INTERVAL NORMALIZER
// ======================================================

function normalizeInterval(tf) {

  tf = tf.toUpperCase().trim();

  if (tf === "5" || tf === "M5") return "M5";

  if (tf === "15" || tf === "M15") return "M15";

  if (
    tf === "H1" ||
    tf === "1H" ||
    tf === "60"
  ) return "H1";

  if (
    tf === "D1" ||
    tf === "D" ||
    tf === "1D" ||
    tf === "DZIENNY"
  ) return "D1";

  return tf;
}

// ======================================================
// FINALIZE RECORD
// ======================================================

async function finalizeRecord() {

  if (isFetching) return;

  isFetching = true;

  if (!tempRecord.time) {

    tempRecord.time =
      parseAndAlignTime(
        "",
        tempRecord.interval
      );
  }

  const t = tempRecord.ticker;

  if (
    tickers[t] &&
    tickers[t].globalEntry
  ) {

    tempRecord.entry =
      parseFloat(
        tickers[t].globalEntry
      );

  } else {

    tempRecord.entry = null;
  }

  // ======================================================
  // AGRESYWNY BOOST
  // ======================================================

  tempRecord.hybridMode = "BALANCED_AGGRESSIVE";

  tempRecord.systemConfig = {

    aggression:
      SYSTEM_MODE.aggression,

    conservative:
      SYSTEM_MODE.conservative,

    fastEntry:
      SYSTEM_MODE.allowFastEntry,

    momentum:
      SYSTEM_MODE.allowMomentumSignals,

    breakout:
      SYSTEM_MODE.allowEarlyBreakouts,

    strictExit:
      SYSTEM_MODE.strictExitConfirmation
  };

  // ======================================================

  document.getElementById("comment").textContent =
    "⏳ Analiza 8.1 Hybrid...";

  document.getElementById("parsed").textContent =
    `Bufor JSON: ${JSON.stringify(tempRecord)}`;

  try {

    const response = await fetch(
      `${backend}?t=${Date.now()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(tempRecord)
      }
    );

    const data = await response.json();

    handleBackendData(data);

    document.getElementById("comment").textContent =
      "✔️ Analiza gotowa";

  } catch (err) {

    console.log(err);

    document.getElementById("comment").textContent =
      "❌ Błąd połączenia";

  } finally {

    tempRecord = {};
    currentStep = 0;
    isFetching = false;
  }
}

// ======================================================
// BACKEND DATA
// ======================================================

function handleBackendData(d) {

  const ticker = d.ticker;
  const tf = normalizeInterval(d.interval);

  if (!tickers[ticker]) {

    tickers[ticker] = {
      globalEntry: "",
      updatedAt: 0
    };
  }

  tickers[ticker].updatedAt = Date.now();
  tickers[ticker].lastTF = tf;

  if (
    d.entry !== undefined &&
    d.entry !== null &&
    d.entry !== ""
  ) {

    tickers[ticker].globalEntry =
      d.entry.toString();

  } else {

    tickers[ticker].globalEntry = "";
  }

  if (!tickers[ticker][tf]) {
    tickers[ticker][tf] = {
      history: []
    };
  }

  tickers[ticker][tf].last = d;

  updateTable();
}

// ======================================================
// UPDATE TABLE
// ======================================================

function updateTable() {

  const tbody =
    document.getElementById("table-body");

  tbody.innerHTML = "";

  const sortedTickers =
    Object.keys(tickers).sort(
      (a, b) =>
        tickers[b].updatedAt -
        tickers[a].updatedAt
    );

  if (sortedTickers.length === 0) {

    tbody.innerHTML =
      `<tr><td colspan="10">Oczekiwanie na dane z bazy...</td></tr>`;

    saveTable();

    return;
  }

  sortedTickers.forEach(ticker => {

    const tData = tickers[ticker];

    const tf =
      tData.lastTF || "M5";

    const rec =
      tData[tf]?.last;

    if (!rec) return;

    const displayEntry =
      (
        tData.globalEntry &&
        parseFloat(
          tData.globalEntry
        ) > 0
      )
      ? tData.globalEntry
      : "—";

    const row =
      document.createElement("tr");

    row.className =
      getRowClass(rec.signal);

    row.innerHTML = `
      <td class="ticker-cell">${ticker}</td>

      <td class="price-cell">
        ${Number(rec.close).toFixed(2)}
      </td>

      <td>
        ${rec.interval}
        <br>
        <small>${rec.time}</small>
      </td>

      <td class="entry-cell">
        ${displayEntry}
      </td>

      <td>
        <div class="signal-box">
          ${rec.signal}
        </div>
      </td>

      <td>
        ${rec.widelki || "—"}
      </td>

      <td class="tp-cell">
        ${rec.tp1 || "—"}
      </td>

      <td class="tp-cell">
        ${rec.tp2 || "—"}
      </td>

      <td class="tp-cell">
        ${rec.tp3 || "—"}
      </td>

      <td class="delete-cell">
        🗑️
      </td>
    `;

    tbody.appendChild(row);
  });

  saveTable();
}

// ======================================================
// LOGIKA HYBRYDOWA
// ======================================================

function getRowClass(sig) {

  if (!sig) return "row-czekaj";

  sig = sig.toUpperCase();

  // PREMIUM BUY
  if (
    sig.includes("PREMIUM") &&
    sig.includes("BUY")
  ) {
    return "row-buy-premium";
  }

  // AGRESYWNE BUY
  if (
    sig.includes("BUY") ||
    (
      sig.includes("ACCEL") &&
      !sig.includes("REDUKUJ")
    ) ||
    sig.includes("MOMENTUM") ||
    sig.includes("BREAKOUT") ||
    sig.includes("KOREKTA")
  ) {
    return "row-buy";
  }

  // SELL / EXIT
  if (
    sig.includes("EXIT") ||
    sig.includes("REDUKUJ") ||
    sig.includes("SŁABNIE") ||
    sig.includes("REALIZUJ") ||
    sig.includes("SELL")
  ) {
    return "row-sell";
  }

  return "row-czekaj";
}

// ======================================================
// START
// ======================================================

function startSequence() {

  if (recognizing) return;

  speechSynthesis.cancel();

  const wakeUp =
    new SpeechSynthesisUtterance("");

  speechSynthesis.speak(wakeUp);

  tempRecord = {};
  currentStep = 0;
  recognizing = true;

  sayStep();
}

// ======================================================
// STOP
// ======================================================

function stopSequence() {

  recognizing = false;
  currentStep = 0;
  tempRecord = {};

  try {
    recognition.stop();
  } catch {}

  document.getElementById("comment").textContent =
    "⛔ Sekwencja zatrzymana.";
}

// ======================================================
// EVENTS
// ======================================================

document.addEventListener(
  "click",
  async (e) => {

    const cell =
      e.target.closest("td");

    const row =
      e.target.closest("tr");

    if (!cell || !row) return;

    const ticker =
      row.querySelector(".ticker-cell")
      ?.textContent.trim();

    // ==================================================
    // DELETE
    // ==================================================

    if (
      cell.classList.contains(
        "delete-cell"
      )
    ) {

      document.getElementById("comment").textContent =
        `🗑️ Usuwanie ${ticker}...`;

      delete tickers[ticker];

      updateTable();

      try {

        await fetch(
          `${backend}/delete`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              ticker: ticker
            })
          }
        );

        document.getElementById("comment").textContent =
          "✔️ Usunięto z bazy danych";

      } catch(err) {

        console.log(err);

        document.getElementById("comment").textContent =
          "❌ Błąd czyszczenia bazy";
      }

      return;
    }

    // ==================================================
    // ENTRY EDIT
    // ==================================================

    if (
      cell.classList.contains(
        "entry-cell"
      )
    ) {

      if (cell.querySelector("input"))
        return;

      const currentVal =
        tickers[ticker].globalEntry || "";

      const input =
        document.createElement("input");

      input.type = "number";
      input.step = "any";
      input.inputMode = "decimal";
      input.value = currentVal;

      input.style.width = "80px";
      input.style.background = "#222";
      input.style.color = "#ffd166";
      input.style.border =
        "1px solid #ffd166";
      input.style.borderRadius = "4px";
      input.style.padding = "4px";
      input.style.textAlign = "center";
      input.style.fontSize = "16px";

      cell.textContent = "";
      cell.appendChild(input);

      input.focus();
      input.select();

      const saveData = async () => {

        const manual =
          input.value;

        const numVal =
          extractNumber(manual);

        if (numVal > 0) {

          tickers[ticker].globalEntry =
            numVal.toString();

        } else {

          tickers[ticker].globalEntry =
            "";
        }

        const tf =
          tickers[ticker].lastTF;

        if (
          tf &&
          tickers[ticker][tf]?.last
        ) {

          const lastRec =
            tickers[ticker][tf].last;

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

            entry:
              numVal > 0
              ? numVal
              : 0
          };

          try {

            const response =
              await fetch(
                `${backend}?t=${Date.now()}`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type":
                      "application/json"
                  },
                  body: JSON.stringify(
                    updatePayload
                  )
                }
              );

            const data =
              await response.json();

            handleBackendData(data);

          } catch {

            updateTable();
          }

        } else {

          updateTable();
        }
      };

      input.addEventListener(
        "blur",
        saveData
      );

      input.addEventListener(
        "keydown",
        (evt) => {

          if (evt.key === "Enter") {
            input.blur();
          }
        }
      );

      return;
    }

    // ==================================================
    // POPUP
    // ==================================================

    if (
      cell.classList.contains(
        "ticker-cell"
      )
    ) {

      const tf =
        tickers[ticker].lastTF;

      const rec =
        tickers[ticker][tf]?.last;

      if (rec && rec.comment) {

        document.getElementById(
          "popupBody"
        ).innerHTML =
          `<pre>${rec.comment}</pre>`;

        document.getElementById(
          "popup"
        ).style.display = "block";

        document.getElementById(
          "popupOverlay"
        ).style.display = "block";

      } else {

        alert(
          "Brak danych komentarza"
        );
      }
    }
  }
);

// ======================================================
// STORAGE
// ======================================================

function saveTable() {

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(tickers)
  );
}

async function loadTable() {

  const baseEndpoint = backend.replace("/voice-parse", "");
  
  try {
    const response = await fetch(`${baseEndpoint}/memory?t=${Date.now()}`);
    if (response.ok) {
      const data = await response.json();
      if (data && Object.keys(data).length > 0) {
        for (let member in tickers) {
          delete tickers[member];
        }
        
        Object.keys(data).forEach(ticker => {
          tickers[ticker] = {
            globalEntry: data[ticker].global_entry || "",
            updatedAt: Date.now()
          };
          
          ["M5", "M15", "H1", "D1"].forEach(tf => {
            if (data[ticker][tf] && data[ticker][tf].last_data && Object.keys(data[ticker][tf].last_data).length > 0) {
              if (!tickers[ticker][tf]) {
                tickers[ticker][tf] = { history: [] };
              }
              tickers[ticker][tf].last = data[ticker][tf].last_data;
              tickers[ticker].lastTF = tf;
            }
          });
        });
        
        updateTable();
        return;
      }
    }
  } catch (err) {
    console.log("Blad pobierania pamieci z backendu:", err);
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    for (let member in tickers) {
      delete tickers[member];
    }
    Object.assign(tickers, JSON.parse(raw));
    updateTable();
  }
}

// ======================================================

document.addEventListener(
  "DOMContentLoaded",
  loadTable
);
