// FUNKCJA: dodaje wiersz do tabeli
function addRow(data) {
    const tbody = document.getElementById("tableBody");

    const row = document.createElement("tr");

    row.innerHTML = `
        <td>${data.ticker || ""}</td>
        <td>${data.interval || ""}</td>
        <td>${data.time || ""}</td>
        <td>${data.open || ""}</td>
        <td>${data.low || ""}</td>
        <td>${data.high || ""}</td>
        <td>${data.close || ""}</td>
        <td>${data.ma20 || ""}</td>
        <td>${data.dema9 || ""}</td>
        <td>${data.rsi || ""}</td>
        <td>${data.volume || ""}</td>
        <td class="signalCell">${data.signal || ""}</td>
    `;

    tbody.prepend(row);

    // kolor sygnału
    const cell = row.querySelector(".signalCell");
    if (data.signal === "BUY") cell.style.color = "lime";
    if (data.signal === "SELL") cell.style.color = "red";
    if (data.signal === "CZEKAJ") cell.style.color = "yellow";
}

// FUNKCJA: wyświetla komentarz systemu 4.5+
function showComment(text) {
    document.getElementById("commentBox").textContent = text || "";
}

// GŁÓWNA FUNKCJA: odbiera dane z voice.js
function handleParsedData(data) {
    console.log("Dane odebrane z backendu:", data);

    addRow(data);
    showComment(data.comment);
}
