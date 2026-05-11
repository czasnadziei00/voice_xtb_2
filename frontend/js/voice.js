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
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
        console.log("Mikrofon wystartował");
        const comment = document.getElementById("comment");
        if (comment) comment.textContent = "🎤 Mikrofon aktywny";
    };

    rec.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        const text = last[0].transcript.trim();
        console.log("Rozpoznano:", text);
        handleRecognizedText(text);
    };

    rec.onerror = (e) => {
        console.error("SpeechRecognition ERROR:", e);
        const comment = document.getElementById("comment");
        if (comment) comment.textContent = "❌ Błąd mikrofonu: " + e.error;
    };

    rec.onend = () => {
        console.log("onend");
        const comment = document.getElementById("comment");

        if (recognizing) {
            console.log("Restart mikrofonu...");
            if (comment) comment.textContent = "🔄 Restart mikrofonu...";

            setTimeout(() => {
                try {
                    rec.start();
                    console.log("Mikrofon wznowiony");
                } catch (e) {
                    console.warn("Błąd restartu:", e);
                }
            }, 300);
        } else {
            console.log("Mikrofon zatrzymany");
            if (comment) comment.textContent = "⛔ Mikrofon zatrzymany";
        }
    };

    return rec;
}

// ----------------------------------------
// START MIKROFONU
// ----------------------------------------
function startMic() {
    console.log("startMic()");
    const comment = document.getElementById("comment");

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
            if (comment) comment.textContent = "🎤 Uruchamianie mikrofonu...";
        } catch (e) {
            console.error("Błąd recognition.start():", e);
            recognizing = false;
        }
    } else {
        console.log("Mikrofon już działa");
        if (comment) comment.textContent = "🎤 Mikrofon już aktywny";
    }
}

// ----------------------------------------
// STOP MIKROFONU
// ----------------------------------------
function stopMic() {
    console.log("stopMic()");
    recognizing = false;
    const comment = document.getElementById("comment");

    if (recognition) {
        try {
            recognition.stop();
            console.log("recognition.stop() OK");
        } catch (e) {
            console.error("Błąd recognition.stop():", e);
        }
    }

    if (comment) comment.textContent = "⛔ Mikrofon zatrzymany";
}

// ----------------------------------------
// OBSŁUGA TEKSTU
// ----------------------------------------
function handleRecognizedText(text) {
    const recognized = document.getElementById("recognized");
    if (recognized) recognized.textContent = text;

    let sendText = text;

    // tryb podawania ceny -> dokładnie wskazany ticker + interval + close
    if (awaitingPrice) {
        sendText =
            awaitingPrice.ticker +
            " " +
            awaitingPrice.interval +
            " close " +
            text;

        console.log("Tryb ceny:", sendText);
    }

    fetch("https://voice-xtb.onrender.com/voice-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sendText })
    })
        .then(r => r.json())
        .then(data => {
            console.log("Backend response:", data);

            const parsed = document.getElementById("parsed");
            if (parsed) parsed.textContent = JSON.stringify(data, null, 2);

            const comment = document.getElementById("comment");
            if (data.comment && comment) comment.textContent = data.comment;

            if (data.ticker && data.interval) {
                const key = data.ticker + "|" + data.interval;
                rows[key] = data;
                renderTable();
            }

            awaitingPrice = null;
        })
        .catch(err => {
            console.error("FETCH ERROR:", err);
            const comment = document.getElementById("comment");
            if (comment) comment.textContent = "❌ Błąd połączenia z backendem";
        });
}

// ----------------------------------------
// PRIORYTET SYGNAŁÓW DO SORTOWANIA
// ----------------------------------------
function signalPriority(sig) {
    if (!sig) return 99;
    const s = sig.toUpperCase();

    if (s === "BUY") return 2;
    if (s === "PRAWIE BUY") return 3;
    if (s === "CZEKAJ DO") return 4; // rezerwa na przyszłość
    if (s === "CZEKAJ") return 5;
    if (s === "PRAWIE RESET") return 6;
    if (s === "RESET") return 7;
    if (s === "PRAWIE SELL") return 8;
    if (s === "SELL") return 9;

    return 99;
}

// ----------------------------------------
// KOLOROWANIE WIERSZA
// ----------------------------------------
function applySignalColor(row, signal, hasEntry) {
    row.classList.remove(
        "signal-buy",
        "signal-prawie-buy",
        "signal-sell",
        "signal-prawie-sell",
        "signal-reset",
        "signal-prawie-reset",
        "signal-czekaj",
        "signal-entry"
    );

    if (hasEntry) {
        row.classList.add("signal-entry");
        return;
    }

    if (!signal) return;
    const s = signal.toLowerCase();

    if (s === "buy") row.classList.add("signal-buy");
    else if (s === "prawie buy") row.classList.add("signal-prawie-buy");
    else if (s === "sell") row.classList.add("signal-sell");
    else if (s === "prawie sell") row.classList.add("signal-prawie-sell");
    else if (s === "reset") row.classList.add("signal-reset");
    else if (s === "prawie reset") row.classList.add("signal-prawie-reset");
    else if (s === "czekaj") row.classList.add("signal-czekaj");
}

// ----------------------------------------
// RENDER TABLE (z sortowaniem + TP3)
// ----------------------------------------
function renderTable() {
    const tbody = document.getElementById("voiceTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const list = Object.keys(rows).map(k => rows[k]);

    // sortowanie:
    // 1) entry != null na górze
    // 2) potem wg priorytetu sygnału
    // 3) potem alfabetycznie po tickerze
    list.sort((a, b) => {
        const aEntry = a.entry != null;
        const bEntry = b.entry != null;

        if (aEntry && !bEntry) return -1;
        if (!aEntry && bEntry) return 1;

        const pa = signalPriority(a.signal);
        const pb = signalPriority(b.signal);
        if (pa < pb) return -1;
        if (pa > pb) return 1;

        const ta = (a.ticker || "").localeCompare(b.ticker || "");
        if (ta !== 0) return ta;

        return (a.interval || "").localeCompare(b.interval || "");
    });

    list.forEach(row => {
        const tr = document.createElement("tr");

        // Ticker
        const tdTicker = document.createElement("td");
        tdTicker.textContent = row.ticker || "";
        tr.appendChild(tdTicker);

        // Interval
        const tdInterval = document.createElement("td");
        tdInterval.textContent = row.interval || "";
        tr.appendChild(tdInterval);

        // Time
        const tdTime = document.createElement("td");
        tdTime.textContent = row.time || "";
        tr.appendChild(tdTime);

        // Close (klik do ceny)
        const tdClose = document.createElement("td");
        tdClose.className = "price";
        tdClose.textContent =
            row.close != null ? row.close : "";
        tdClose.style.cursor = "pointer";
        tdClose.title = "Kliknij aby podać cenę";
        tdClose.onclick = () =>
            startPrice(row.ticker, row.interval);
        tr.appendChild(tdClose);

        // Entry
        const tdEntry = document.createElement("td");
        tdEntry.textContent =
            row.entry != null ? row.entry : "";
        tr.appendChild(tdEntry);

        // Signal
        const tdSignal = document.createElement("td");
        tdSignal.textContent = row.signal || "";
        tr.appendChild(tdSignal);

        // TP3
        const tdTp3 = document.createElement("td");
        tdTp3.textContent =
            row.tp3 != null ? row.tp3 : "";
        tr.appendChild(tdTp3);

        // Range (low–high)
        const tdRange = document.createElement("td");
        if (row.low != null && row.high != null) {
            tdRange.textContent = row.low + " – " + row.high;
        } else {
            tdRange.textContent = "";
        }
        tr.appendChild(tdRange);

        applySignalColor(tr, row.signal, row.entry != null);

        tbody.appendChild(tr);
    });
}

// ----------------------------------------
// TRYB PODAWANIA CENY
// ----------------------------------------
function startPrice(ticker, interval) {
    awaitingPrice = { ticker, interval };
    console.log("Oczekuję na cenę:", ticker, interval);

    const comment = document.getElementById("comment");
    if (comment) {
        comment.textContent = `🎯 Podaj cenę dla ${ticker} ${interval}`;
    }
}

// ----------------------------------------
// DEBUG
// ----------------------------------------
console.log("VOICE.JS ZAŁADOWANY POPRAWNIE");
