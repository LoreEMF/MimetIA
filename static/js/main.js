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
    let isCameraOn = false;

    // --- Lógica de Configuración ---

    // Añadir un jugador:
    addPlayerButton.addEventListener("click", () => {
        const playerCount = playerInputs.children.length; // Cuenta cuántos campos de texto para jugadores ya existen.
        const newInput = document.createElement("input"); // Crea un nuevo elemento <input> en la memoria del navegador.
        newInput.type = "text";
        newInput.className = "player-name";
        newInput.placeholder = `Nombre Jugador ${playerCount + 1}`;
        newInput.value = `Jugador ${playerCount + 1}`;
        playerInputs.appendChild(newInput);
    });

    // Empezar la partida:
    startGameButton.addEventListener("click", async () => {
        const playerNames = [...document.querySelectorAll(".player-name")]
            .map(input => input.value.trim()).filter(name => name);

        if (playerNames.length < 2) {
            alert("Se necesitan al menos 2 jugadores."); return;
        }

        // primera comunicación con el servidor.
        // Envía los nombres de los jugadores a la ruta /game/start. 
        // El await hace que el código espere aquí hasta que el servidor responda.
        const response = await fetch("http://127.0.0.1:5000/game/start", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ players: playerNames }),
        });
        
        // YA NO INICIAMOS LA CÁMARA AQUÍ
        // await setupCamera(); 
        
        setupScreen.style.display = "none";
        gameScreen.style.display = "block";
        // Ejecuta la función getGameState cada 500 milisegundos (2 veces por segundo)
        stateInterval = setInterval(getGameState, 500);
    });

    // --- Lógica Principal del Juego ---

    // Manejo de la cámara:
    async function setupCamera() {
        try {
            // Pide permiso al usuario para usar la cámara:
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            // Si el usuario acepta, conecta el vídeo de la cámara al elemento <video> de la página
            video.srcObject = stream;
            isCameraOn = true; // <-- Marcamos que la cámara ya está encendida
        } catch (error) {
            console.error("Error al acceder a la cámara:", error);
            alert("No se pudo acceder a la cámara. Revisa los permisos.");
        }
    }

    function stopCamera() {
        // liberar la cámara
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }
        isCameraOn = false;
    }

    // El latido del juego:
    async function getGameState() {
        // Esta función se ejecuta 2 veces por segundo (gracias al setInterval de antes).
        // Su misión es preguntarle al servidor "¿cómo va todo?"
        try {
            const response = await fetch("http://127.0.0.1:5000/game/state");
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const gameState = await response.json();
            updateUI(gameState); //  Pasa toda la información recibida del servidor a la función updateUI para que esta actualice la pantalla.
        } catch (error) {
            console.error("Error al obtener el estado del juego:", error);
            clearInterval(stateInterval);
        }
    }

    // Actualizar la pantalla:
    function updateUI(state) {
        messageOverlay.style.display = 'none';
        turnReadyOverlay.style.display = 'none';

        objectiveSpan.textContent = state.objective;
        currentPlayerSpan.textContent = state.currentPlayer;
        timerSpan.textContent = state.timeLeft;

        // Actualiza la lista de puntuaciones de los jugadores
        playerList.innerHTML = "";
        state.players.forEach(player => {
            const li = document.createElement("li");
            li.textContent = `${player.name}: ${player.score}%`;
            if (player.name === state.currentPlayer && state.state === 'PLAYING') {
                // Añade una clase .active-player al jugador actual para que se resalte en el CSS.
                li.classList.add("active-player");
            }
            playerList.appendChild(li);
        });

        if (state.state === "PLAYING" && !predictionInterval) {
            // Si el juego está en estado "PLAYING" y el bucle de predicción no está activo, lo inicia
            predictionInterval = setInterval(sendFrameForPrediction, 200);
        } else if (state.state !== "PLAYING" && predictionInterval) {
            // Si el juego no está en estado "PLAYING" y el bucle sí está activo, lo detiene
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

    // Enviar imágenes para analizar:
    async function sendFrameForPrediction() {
        if (!isCameraOn) return; // No enviar frames si la cámara no está lista
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        // Dibuja el fotograma actual del <video> en el lienzo. Es como hacer una captura de pantalla.
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
        await fetch("http://127.0.0.1:5000/game/next_round", { method: 'POST' });
    });
});