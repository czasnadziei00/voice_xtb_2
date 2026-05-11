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
        return null;
    }

    const rec = new SpeechRecognition();
    rec.lang = "pl-PL";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
        const comment = document.getElementById("comment");
        if (comment) comment.textContent = "🎤 Mikrofon aktywny";
    };

    rec.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        const text = last[0].transcript.trim();
        handleRecognizedText(text);
    };

    rec.onerror = (e) => {
        const comment = document.getElementById("comment");
        if (comment) comment.textContent = "❌ Błąd mikrofonu: " + e.error;
    };

    rec.onend = () => {
        const comment = document.getElementById("comment");

        if (recognizing) {
            if (comment) comment.textContent = "🔄 Restart mikrofonu...";
            setTimeout(() => {
                try { rec.start(); } catch {}
            }, 300);
        } else {
            if (comment) comment.textContent = "⛔ Mikrofon zatrzymany";
        }
    };

    return rec;
}

// ----------------------------------------
// START MIKROFONU
// ----------------------------------------
function startMic() {
    if (!recognition) recognition = initRecognition();
    if (!recognition) return;

    if (!recognizing) {
        recognizing = true;
        try { recognition.start(); } catch {}
    }
}

// ----------------------------------------
// STOP MIKROFONU
// ----------------------------------------
function stopMic() {
    recognizing = false;
    if (recognition) {
        try { recognition.stop(); } catch {}
    }
}

// ----------------------------------------
// OBSŁUGA TEKSTU
// ----------------------------------------
function handleRecognizedText(text) {
    document.getElementById("recognized").textContent = text;

    let sendText = text;

    // tryb ceny → wysyłamy pełny kontekst
    if (awaitingPrice) {
        sendText =
            awaitingPrice.ticker +
            " " +
            awaitingPrice.interval +
            " close " +
            text;
    }

    fetch("https://voice-xtb.onrender.com/voice-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sendText })
    })
        .then(r => r.json())
        .then(data => {
            document.getElementById("parsed").textContent =
                JSON.stringify(data, null, 2);

            if (data.comment)
                document.getElementById("comment").textContent = data.comment;

            if (data.ticker && data.interval) {
                const key = data.ticker + "|" + data.interval;
                rows[key] = data;
                renderTable();
            }

            awaitingPrice = null;
        })
        .catch(() => {
            document.getElementById("comment").textContent =
                "❌ Błąd połączenia z backendem";
        });
}

// ----------------------------------------
// PRIORYTET SYGNAŁÓW (SORTOWANIE 7.2 PRO)
// ----------------------------------------
function signalPriority(sig) {
    if (!sig) return 99;
    const s = sig.toUpperCase();

    if (s === "BUY") return 2;
    if (s === "PRAWIE BUY") return 3;
    if (s === "CZEKAJ DO") return 4;
    if (s === "CZEKAJ") return 5;
    if (s === "PRAWIE RESET") return 6;
    if (s === "RESET") return 7;
    if (s === "PRAWIE SELL") return 8;
    if (s === "SELL") return 9;

    return 99;
}

// ----------------------------------------
// KOLOROWANIE
// ----------------------------------------
function applySignalColor(row, signal, hasEntry) {
    row.className = "";

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
// RENDER TABLE (SORTOWANIE 7.2 PRO)
// ----------------------------------------
function renderTable() {
    const tbody = document.getElementById("voiceTableBody");
    tbody.innerHTML = "";

    const list = Object.values(rows);

    list.sort((a, b) => {
        // 1) ENTRY
        const aEntry = a.entry != null;
        const bEntry = b.entry != null;

        if (aEntry && !bEntry) return -1;
        if (!aEntry && bEntry) return 1;

        // 2) sygnał
        const pa = signalPriority(a.signal);
        const pb = signalPriority(b.signal);

        if (pa < pb) return -1;
        if (pa > pb) return 1;

        // 3) ticker
        const ta = a.ticker.localeCompare(b.ticker);
        if (ta !== 0) return ta;

        // 4) interwał
        return a.interval.localeCompare(b.interval);
    });

    list.forEach(row => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${row.ticker || ""}</td>
            <td>${row.interval || ""}</td>
            <td>${row.time || ""}</td>
            <td class="price" title="Kliknij aby podać cenę">${row.close ?? ""}</td>
            <td>${row.entry ?? ""}</td>
            <td>${row.signal || ""}</td>
            <td>${row.tp3 ?? ""}</td>
            <td>${row.low != null && row.high != null ? row.low + " – " + row.high : ""}</td>
        `;

        tr.querySelector(".price").onclick = () =>
            startPrice(row.ticker, row.interval);

        applySignalColor(tr, row.signal, row.entry != null);

        tbody.appendChild(tr);
    });
}

// ----------------------------------------
// TRYB PODAWANIA CENY
// ----------------------------------------
function startPrice(ticker, interval) {
    awaitingPrice = { ticker, interval };
    document.getElementById("comment").textContent =
        `🎯 Podaj cenę dla ${ticker} ${interval}`;
}

console.log("VOICE.JS ZAŁADOWANY POPRAWNIE");
