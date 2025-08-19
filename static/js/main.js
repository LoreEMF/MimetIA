document.addEventListener("DOMContentLoaded", () => {
    // --- Referencias a Elementos del DOM ---
    const setupScreen = document.getElementById("setup-screen");
    const gameScreen = document.getElementById("game-screen");
    const playerInputs = document.getElementById("player-inputs");
    const addPlayerButton = document.getElementById("add-player-button");
    const startGameButton = document.getElementById("start-game-button");
    const video = document.getElementById("webcam");

    const objectiveSpan = document.getElementById("objective");
    const currentPlayerSpan = document.getElementById("current-player");
    const timerSpan = document.getElementById("timer");
    const playerList = document.getElementById("player-list");
    
    const messageOverlay = document.getElementById("message-overlay");
    const messageTitle = document.getElementById("message-title");
    const messageText = document.getElementById("message-text");
    const nextRoundButton = document.getElementById("next-round-button");

    const turnReadyOverlay = document.getElementById("turn-ready-overlay");
    const readyPlayerNameSpan = document.getElementById("ready-player-name");
    const readyObjectiveSpan = document.getElementById("ready-objective");
    const startTurnButton = document.getElementById("start-turn-button");

    let stateInterval;
    let predictionInterval;
    let isCameraOn = false; // <-- NUEVA VARIABLE DE CONTROL

    // --- Lógica de Configuración ---
    addPlayerButton.addEventListener("click", () => {
        const playerCount = playerInputs.children.length;
        const newInput = document.createElement("input");
        newInput.type = "text";
        newInput.className = "player-name";
        newInput.placeholder = `Nombre Jugador ${playerCount + 1}`;
        newInput.value = `Jugador ${playerCount + 1}`;
        playerInputs.appendChild(newInput);
    });

    startGameButton.addEventListener("click", async () => {
        const playerNames = [...document.querySelectorAll(".player-name")]
            .map(input => input.value.trim()).filter(name => name);

        if (playerNames.length < 2) {
            alert("Se necesitan al menos 2 jugadores."); return;
        }

        const response = await fetch("http://127.0.0.1:5000/game/start", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ players: playerNames }),
        });
        
        // YA NO INICIAMOS LA CÁMARA AQUÍ
        // await setupCamera(); 
        
        setupScreen.style.display = "none";
        gameScreen.style.display = "block";
        stateInterval = setInterval(getGameState, 500);
    });

    // --- Lógica Principal del Juego ---
    async function setupCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
            isCameraOn = true; // <-- Marcamos que la cámara ya está encendida
        } catch (error) {
            console.error("Error al acceder a la cámara:", error);
            alert("No se pudo acceder a la cámara. Revisa los permisos.");
        }
    }

    function stopCamera() {
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }
        isCameraOn = false;
    }

    async function getGameState() {
        try {
            const response = await fetch("http://127.0.0.1:5000/game/state");
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const gameState = await response.json();
            updateUI(gameState);
        } catch (error) {
            console.error("Error al obtener el estado del juego:", error);
            clearInterval(stateInterval);
        }
    }

    function updateUI(state) {
        messageOverlay.style.display = 'none';
        turnReadyOverlay.style.display = 'none';

        objectiveSpan.textContent = state.objective;
        currentPlayerSpan.textContent = state.currentPlayer;
        timerSpan.textContent = state.timeLeft;

        playerList.innerHTML = "";
        state.players.forEach(player => {
            const li = document.createElement("li");
            li.textContent = `${player.name}: ${player.score}%`;
            if (player.name === state.currentPlayer && state.state === 'PLAYING') {
                li.classList.add("active-player");
            }
            playerList.appendChild(li);
        });

        if (state.state === "PLAYING" && !predictionInterval) {
            predictionInterval = setInterval(sendFrameForPrediction, 200);
        } else if (state.state !== "PLAYING" && predictionInterval) {
            clearInterval(predictionInterval);
            predictionInterval = null;
        }
        
        if (state.state === "READY_FOR_NEXT_TURN") {
            readyPlayerNameSpan.textContent = state.currentPlayer;
            readyObjectiveSpan.textContent = state.objective;
            turnReadyOverlay.style.display = 'flex';
        } else if (state.state === "ROUND_OVER") {
            messageTitle.textContent = "¡Ronda Terminada!";
            messageText.textContent = `¡${state.eliminatedPlayer} ha sido eliminado!`;
            nextRoundButton.style.display = 'block';
            messageOverlay.style.display = 'flex';
        } else if (state.state === "GAME_OVER") {
            clearInterval(stateInterval);
            stopCamera(); // <-- APAGAMOS LA CÁMARA AL FINAL
            messageTitle.textContent = "🏆 ¡Fin de la Partida! 🏆";
            messageText.textContent = `¡El ganador es ${state.winner}!`;
            nextRoundButton.style.display = 'none';
            messageOverlay.style.display = 'flex';
        }
    }

    async function sendFrameForPrediction() {
        if (!isCameraOn) return; // No enviar frames si la cámara no está lista
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        const imageData = canvas.toDataURL("image/jpeg");

        await fetch("http://127.0.0.1:5000/predict", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: imageData }),
        });
    }
    
    startTurnButton.addEventListener("click", async () => {
        // INICIAMOS LA CÁMARA AQUÍ, SOLO SI NO ESTÁ YA ENCENDIDA
        if (!isCameraOn) {
            await setupCamera();
        }
        await fetch("http://127.0.0.1:5000/game/start_turn", { method: 'POST' });
    });

    nextRoundButton.addEventListener("click", async () => {
        // CORRECCIÓN DE BUG: La URL era incorrecta en la versión anterior.
        await fetch("http://127.0.0.1:5000/game/next_round", { method: 'POST' });
    });
});