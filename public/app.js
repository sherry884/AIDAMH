const socket = io();

const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const messages = document.getElementById("messages");

form.addEventListener("submit", (e) => {
    e.preventDefault();

    if (input.value) {
        socket.emit("chat message", input.value);
        input.value = "";
    }
});

socket.on("chat message", (msg) => {
    displayMessage(msg);
});

socket.on("load messages", (msgs) => {
    msgs.forEach((msg) => {
        displayMessage(msg.text);
    });
});

function displayMessage(msg) {
    const item = document.createElement("div");

    item.classList.add("message");
    item.textContent = msg;

    messages.appendChild(item);

    messages.scrollTop = messages.scrollHeight;
}