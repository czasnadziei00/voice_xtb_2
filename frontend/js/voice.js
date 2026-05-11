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
        console.log("SpeechRecognition API niedostępne");
        return null;
    }

    const rec = new SpeechRecognition();
    rec.lang = "pl-PL";
    rec.continuous = true;
    rec.interimResults = false;

    rec.onstart = () => {
        console.log("Mikrofon wystartował (onstart)");
    };

    rec.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        const text = last[0].transcript.trim();
        console.log("Rozpoznano:", text);
        handleRecognizedText(text);
    };

    rec.onerror = (e) => {
        console.error("Speech error:", e);
    };

    // 🔥 KLUCZOWE NA ANDROIDZIE: auto‑restart
    rec.onend = () => {
        console.log("onend wywołane, recognizing =", recognizing);
        if (recognizing) {
            // Android często ubija sesję po chwili – restartujemy
            try {
                console.log("Próba restartu mikrofonu…");
                rec.start();
            } catch (e) {
                console.warn("Błąd przy restarcie:", e);
            }
        } else {
            console.log("Mikrofon zatrzymany ręcznie (stopMic)");
        }
    };

    return rec;
}

// ----------------------------------------
//  START / STOP MIKROFONU
// ----------------------------------------
function startMic() {
    console.log("startMic() wywołane");
    if (!recognition) {
        recognition = initRecognition();
        if (!recognition) {
            console.log("Brak recognition po initRecognition");
            return;
        }
    }
    if (!recognizing) {
        try {
            recognition.start();
            recognizing = true;
            console.log("Wywołano recognition.start()");
        } catch (e) {
            console.error("Błąd przy start():", e);
        }
    } else {
        console.log("Mikrofon już działa");
    }
}

function stopMic() {
    console.log("stopMic() wywołane");
    if (recognition && recognizing) {
        recognizing = false; // ważne: ustaw przed stop, żeby onend wiedział, że to ręczne
        try {
            recognition.stop();
            console.log("Wywołano recognition.stop()");
        } catch (e) {
            console.error("Błąd przy stop():", e);
        }
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
        console.log("W trybie after_price, wysyłam:", sendText);
    }

    fetch("/voice-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sendText })
    })
    .then(r => r.json())
    .then(data => {
        console.log("Odpowiedź backendu:", data);
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
