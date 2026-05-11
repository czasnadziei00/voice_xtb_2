let recognition = null;
let recognizing = false;

// tryb oczekiwania na cenę po godzinie
let awaitingAfterPrice = null;

// pamięć wierszy (frontend)
let rows = {}; // key: "TICKER|INTERVAL" -> state

// ----------------------------------------
//  INIT ROZPOZNAWANIA MOWY
// ----------------------------------------
function initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Twoja przeglądarka nie wspiera rozpoznawania mowy.");
        return null;
    }

    const rec = new SpeechRecognition();
    rec.lang = "pl-PL";
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        const text = last[0].transcript.trim();
        handleRecognizedText(text);
    };

    rec.onerror = (e) => {
        console.error("Speech error:", e);
    };

    rec.onend = () => {
        recognizing = false;
    };

    return rec;
}

// ----------------------------------------
//  START / STOP MIKROFONU
// ----------------------------------------
function startMic() {
    if (!recognition) {
        recognition = initRecognition();
        if (!recognition) return;
    }
    if (!recognizing) {
        recognition.start();
        recognizing = true;
    }
}

function stopMic() {
    if (recognition && recognizing) {
        recognition.stop();
        recognizing = false;
    }
}

// ----------------------------------------
//  OBSŁUGA ROZPOZNANEGO TEKSTU
// ----------------------------------------
function handleRecognizedText(text) {
    document.getElementById("recognized").textContent = text;

    let sendText = text;

    // jeśli kliknięto kolumnę Cena → wymuszamy kontekst "after"
    if (awaitingAfterPrice) {
        sendText = "after " + text;
    }

    fetch("/voice-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sendText })
    })
    .then(r => r.json())
    .then(data => {
        document.getElementById("parsed").textContent = JSON.stringify(data, null, 2);

        if (data.comment) {
            document.getElementById("comment").textContent = data.comment;
        }

        if (data.ticker && data.interval) {
            const key = data.ticker + "|" + data.interval;
            rows[key] = data;
            renderTable();
        }

        // reset trybu ceny po godzinie
        awaitingAfterPrice = null;
    })
    .catch(err => console.error(err));
}

// ----------------------------------------
//  RENDEROWANIE TABELI
// ----------------------------------------
function renderTable() {
    const tbody = document.getElementById("voiceTableBody");
    tbody.innerHTML = "";

    Object.keys(rows).forEach(key => {
        const row = rows[key];
        const tr = document.createElement("tr");

        // Ticker
        const tdTicker = document.createElement("td");
        tdTicker.textContent = row.ticker || "";
        tr.appendChild(tdTicker);

        // Interwał
        const tdInterval = document.createElement("td");
        tdInterval.textContent = row.interval || "";
        tr.appendChild(tdInterval);

        // Godzina
        const tdTime = document.createElement("td");
        tdTime.textContent = row.time || "";
        tr.appendChild(tdTime);

        // Cena (klikana)
        const tdAfter = document.createElement("td");
        tdAfter.className = "afterprice";
        tdAfter.textContent = row.after_price != null ? row.after_price : "";
        tdAfter.onclick = () => startAfterPrice(row.ticker, row.interval);
        tr.appendChild(tdAfter);

        // Entry
        const tdEntry = document.createElement("td");
        tdEntry.textContent = row.entry != null ? row.entry : "";
        tr.appendChild(tdEntry);

        // Sygnał
        const tdSignal = document.createElement("td");
        tdSignal.textContent = row.signal || "";
        tr.appendChild(tdSignal);

        // Widełki (LOW – HIGH)
        const tdRange = document.createElement("td");
        if (row.low != null && row.high != null) {
            tdRange.textContent = row.low + " – " + row.high;
        } else {
            tdRange.textContent = "";
        }
        tr.appendChild(tdRange);

        tbody.appendChild(tr);
    });
}

// ----------------------------------------
//  TRYB WPROWADZANIA CENY PO GODZINIE
// ----------------------------------------
function startAfterPrice(ticker, interval) {
    awaitingAfterPrice = { ticker, interval };
    console.log("Oczekuję na cenę po godzinie dla:", ticker, interval);
}
