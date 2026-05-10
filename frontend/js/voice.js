// =========================
//  ROZPOZNAWANIE MOWY 6.5 PRO
// =========================

let recognition;
let isListening = false;

if ("webkitSpeechRecognition" in window) {
    recognition = new webkitSpeechRecognition();
} else if ("SpeechRecognition" in window) {
    recognition = new SpeechRecognition();
}

if (recognition) {
    recognition.lang = "pl-PL";
    recognition.continuous = true;
    recognition.interimResults = false;
}


// =========================
//  GŁÓWNA OBSŁUGA MOWY
// =========================
recognition.onresult = async (event) => {
    const text = event.results[event.results.length - 1][0].transcript;
    document.getElementById("raw").textContent = text;

    try {
        const res = await fetch(backend, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });

        if (!res.ok) {
            console.warn("Backend HTTP error:", res.status, res.statusText);
            return;
        }

        let data;
        try {
            data = await res.json();
        } catch (e) {
            console.error("Błąd JSON (pusta odpowiedź backendu):", e);
            return;
        }

        handleParsedData(data);

    } catch (e) {
        console.error("LIVE backend error:", e);
    }
};


// =========================
//  BŁĘDY MIKROFONU
// =========================
recognition.onerror = (event) => {
    console.warn("Błąd mikrofonu:", event.error);
};


// =========================
//  AUTO-RESTART
// =========================
recognition.onend = () => {
    if (isListening) recognition.start();
};


// =========================
//  START / STOP
// =========================
document.getElementById("micStart").onclick = () => {
    isListening = true;
    recognition.start();
};

document.getElementById("micStop").onclick = () => {
    isListening = false;
    recognition.stop();
};


// =========================
//  ANALIZA 4.5+ (POPUP)
// =========================
function analiza45PRO(d) {
    return `
📌 TICKER: ${d.ticker}
⏱ INTERWAŁ: ${d.interval}
🕒 CZAS: ${d.time}

────────────────────────
📊 ŚWIECA
O: ${d.open}
L: ${d.low}
H: ${d.high}
C: ${d.close}
ENTRY: ${d.entry}     // 🔥 NOWE

────────────────────────
📘 ŚREDNIE
MA20: ${d.ma20}
DEMA9: ${d.dema9}
RSI: ${d.rsi}
Wolumen: ${d.volume}

────────────────────────
🔥 TREND / MOMENTUM / SIŁA
${trendMomentumSil(d)}

────────────────────────
🎯 WIDEŁKI (20–35%)
${calcWidełki(d)}

🎯 TP1/TP2/TP3
${calcTP(d).tp1}
${calcTP(d).tp2}
${calcTP(d).tp3}

────────────────────────
🎬 SYGNAŁ
${d.signal ?? "BRAK"}

💬 KOMENTARZ
${d.comment}
`;
}


// =========================
//  TREND / MOMENTUM / SIŁA
// =========================
function trendMomentumSil(d) {
    const close = parseFloat(d.close);
    const ma20 = parseFloat(d.ma20);
    const dema9 = parseFloat(d.dema9);
    const rsi = parseFloat(d.rsi);

    let trend = "";
    let momentum = "";
    let sila = "";

    if (!isNaN(close) && !isNaN(ma20) && !isNaN(dema9)) {
        if (close > ma20 && close > dema9) trend = "Trend: WZROSTOWY 📈";
        else if (close < ma20 && close < dema9) trend = "Trend: SPADKOWY 📉";
        else trend = "Trend: NEUTRALNY ➖";

        if (dema9 > ma20) momentum = "Momentum: SILNE 📗";
        else if (dema9 < ma20) momentum = "Momentum: SŁABE 📕";
        else momentum = "Momentum: NEUTRALNE ➖";
    } else {
        trend = "Trend: brak danych";
        momentum = "Momentum: brak danych";
    }

    if (!isNaN(rsi)) {
        if (rsi > 60) sila = "Siła: PRZEWAGA BYKÓW 🟢";
        else if (rsi < 40) sila = "Siła: PRZEWAGA NIEDŹWIEDZI 🔴";
        else sila = "Siła: RÓWNOWAGA ⚪";
    } else {
        sila = "Siła: brak danych";
    }

    return `${trend}\n${momentum}\n${sila}`;
}
