let recognition = null;
let recognizing = false;

// tryb oczekiwania na cenę
let awaitingPrice = null;

// pamięć wierszy
let rows = {}; // key: "TICKER|INTERVAL"

// ----------------------------------------
// INIT ROZPOZNAWANIA MOWY
// ----------------------------------------
function initRecognition() {

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    if (!SpeechRecognition) {

        alert("Twoja przeglądarka nie wspiera rozpoznawania mowy.");
        console.log("SpeechRecognition API niedostępne");

        return null;
    }

    const rec = new SpeechRecognition();

    rec.lang = "pl-PL";

    // stabilniejsze na Android/Chrome
    rec.continuous = false;

    rec.interimResults = false;

    rec.maxAlternatives = 1;

    // ----------------------------------------
    // START
    // ----------------------------------------
    rec.onstart = () => {

        console.log("Mikrofon wystartował");

        const comment = document.getElementById("comment");

        if (comment) {
            comment.textContent = "🎤 Mikrofon aktywny";
        }
    };

    // ----------------------------------------
    // WYNIK
    // ----------------------------------------
    rec.onresult = (event) => {

        const last =
            event.results[event.results.length - 1];

        const text =
            last[0].transcript.trim();

        console.log("Rozpoznano:", text);

        handleRecognizedText(text);
    };

    // ----------------------------------------
    // ERROR
    // ----------------------------------------
    rec.onerror = (e) => {

        console.error("SpeechRecognition ERROR:", e);

        const comment =
            document.getElementById("comment");

        if (comment) {

            comment.textContent =
                "❌ Błąd mikrofonu: " + e.error;
        }
    };

    // ----------------------------------------
    // END
    // ----------------------------------------
    rec.onend = () => {

        console.log("onend");

        const comment =
            document.getElementById("comment");

        if (recognizing) {

            console.log("Restart mikrofonu...");

            if (comment) {

                comment.textContent =
                    "🔄 Restart mikrofonu...";
            }

            setTimeout(() => {

                try {

                    rec.start();

                    console.log("Mikrofon wznowiony");

                } catch (e) {

                    console.warn(
                        "Błąd restartu:",
                        e
                    );
                }

            }, 300);

        } else {

            console.log("Mikrofon zatrzymany");

            if (comment) {

                comment.textContent =
                    "⛔ Mikrofon zatrzymany";
            }
        }
    };

    return rec;
}

// ----------------------------------------
// START MIKROFONU
// ----------------------------------------
function startMic() {

    console.log("startMic()");

    const comment =
        document.getElementById("comment");

    if (!recognition) {

        recognition = initRecognition();

        if (!recognition) {

            console.log("Brak recognition");

            return;
        }
    }

    if (!recognizing) {

        recognizing = true;

        try {

            recognition.start();

            console.log("recognition.start() OK");

            if (comment) {

                comment.textContent =
                    "🎤 Uruchamianie mikrofonu...";
            }

        } catch (e) {

            console.error(
                "Błąd recognition.start():",
                e
            );

            recognizing = false;
        }

    } else {

        console.log("Mikrofon już działa");

        if (comment) {

            comment.textContent =
                "🎤 Mikrofon już aktywny";
        }
    }
}

// ----------------------------------------
// STOP MIKROFONU
// ----------------------------------------
function stopMic() {

    console.log("stopMic()");

    recognizing = false;

    const comment =
        document.getElementById("comment");

    if (recognition) {

        try {

            recognition.stop();

            console.log("recognition.stop() OK");

        } catch (e) {

            console.error(
                "Błąd recognition.stop():",
                e
            );
        }
    }

    if (comment) {

        comment.textContent =
            "⛔ Mikrofon zatrzymany";
    }
}

// ----------------------------------------
// OBSŁUGA TEKSTU
// ----------------------------------------
function handleRecognizedText(text) {

    const recognized =
        document.getElementById("recognized");

    if (recognized) {

        recognized.textContent = text;
    }

    let sendText = text;

    // tryb podawania ceny
    if (awaitingPrice) {

        sendText = "price " + text;

        console.log(
            "Tryb ceny:",
            sendText
        );
    }

    // ----------------------------------------
    // BACKEND
    // ----------------------------------------
    fetch("/voice-parse", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            text: sendText
        })

    })
    .then(r => r.json())

    .then(data => {

        console.log(
            "Backend response:",
            data
        );

        const parsed =
            document.getElementById("parsed");

        if (parsed) {

            parsed.textContent =
                JSON.stringify(data, null, 2);
        }

        const comment =
            document.getElementById("comment");

        if (data.comment && comment) {

            comment.textContent =
                data.comment;
        }

        // zapis wiersza
        if (data.ticker && data.interval) {

            const key =
                data.ticker +
                "|" +
                data.interval;

            rows[key] = data;

            renderTable();
        }

        awaitingPrice = null;
    })

    .catch(err => {

        console.error(
            "FETCH ERROR:",
            err
        );

        const comment =
            document.getElementById("comment");

        if (comment) {

            comment.textContent =
                "❌ Błąd połączenia z backendem";
        }
    });
}

// ----------------------------------------
// RENDER TABLE
// ----------------------------------------
function renderTable() {

    const tbody =
        document.getElementById("voiceTableBody");

    if (!tbody) return;

    tbody.innerHTML = "";

    Object.keys(rows).forEach(key => {

        const row = rows[key];

        const tr =
            document.createElement("tr");

        // ----------------------------------------
        // TICKER
        // ----------------------------------------
        const tdTicker =
            document.createElement("td");

        tdTicker.textContent =
            row.ticker || "";

        tr.appendChild(tdTicker);

        // ----------------------------------------
        // INTERVAL
        // ----------------------------------------
        const tdInterval =
            document.createElement("td");

        tdInterval.textContent =
            row.interval || "";

        tr.appendChild(tdInterval);

        // ----------------------------------------
        // TIME
        // ----------------------------------------
        const tdTime =
            document.createElement("td");

        tdTime.textContent =
            row.time || "";

        tr.appendChild(tdTime);

        // ----------------------------------------
        // PRICE
        // ----------------------------------------
        const tdPrice =
            document.createElement("td");

        tdPrice.className = "price";

        tdPrice.textContent =
            row.price != null
                ? row.price
                : "";

        tdPrice.style.cursor =
            "pointer";

        tdPrice.title =
            "Kliknij aby podać cenę";

        tdPrice.onclick = () =>
            startPrice(
                row.ticker,
                row.interval
            );

        tr.appendChild(tdPrice);

        // ----------------------------------------
        // ENTRY
        // ----------------------------------------
        const tdEntry =
            document.createElement("td");

        tdEntry.textContent =
            row.entry != null
                ? row.entry
                : "";

        tr.appendChild(tdEntry);

        // ----------------------------------------
        // SIGNAL
        // ----------------------------------------
        const tdSignal =
            document.createElement("td");

        tdSignal.textContent =
            row.signal || "";

        tr.appendChild(tdSignal);

        // ----------------------------------------
        // RANGE
        // ----------------------------------------
        const tdRange =
            document.createElement("td");

        if (
            row.low != null &&
            row.high != null
        ) {

            tdRange.textContent =
                row.low +
                " – " +
                row.high;

        } else {

            tdRange.textContent = "";
        }

        tr.appendChild(tdRange);

        tbody.appendChild(tr);
    });
}

// ----------------------------------------
// TRYB PODAWANIA CENY
// ----------------------------------------
function startPrice(ticker, interval) {

    awaitingPrice = {
        ticker,
        interval
    };

    console.log(
        "Oczekuję na cenę:",
        ticker,
        interval
    );

    const comment =
        document.getElementById("comment");

    if (comment) {

        comment.textContent =
            `🎯 Podaj cenę dla ${ticker} ${interval}`;
    }
}

// ----------------------------------------
// DEBUG
// ----------------------------------------
console.log(
    "VOICE.JS ZAŁADOWANY POPRAWNIE"
);
