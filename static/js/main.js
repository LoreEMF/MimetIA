// Espera a que el DOM esté completamente cargado.
document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. Conexión y Variables ---
    const socket = io("http://192.168.1.129:5000"); // Usa tu IP
    let mySid = null;
    let predictionInterval = null;
    let isCameraOn = false;

    // --- 2. Referencias a Elementos del DOM ---
    const lobbyScreen = document.getElementById("lobby-screen");
    const gameScreen = document.getElementById("game-screen");
    const playerInputs = document.getElementById("player-inputs");
    const addPlayerButton = document.getElementById("add-player-button");
    const createGroupButton = document.getElementById("create-group-button");
    const lobbyGroupList = document.getElementById("lobby-group-list");
    const hostStartButton = document.getElementById("host-start-button");
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


    // --- 3. Lógica del Lobby ---
    socket.on('connect', () => { mySid = socket.id; });
    addPlayerButton.addEventListener("click", () => {
        const newInput = document.createElement("input");
        newInput.type = "text"; newInput.className = "player-name";
        newInput.placeholder = `Jugador ${playerInputs.children.length + 1}`;
        playerInputs.appendChild(newInput);
    });
    createGroupButton.addEventListener("click", () => {
        const playerNames = [...document.querySelectorAll(".player-name")].map(i => i.value.trim()).filter(n => n);
        if (playerNames.length < 1) { alert("Tu grupo debe tener al menos un jugador."); return; }
        socket.emit('create_group', { names: playerNames });
        playerInputs.style.display = 'none';
        addPlayerButton.style.display = 'none';
        createGroupButton.style.display = 'none';
    });

    socket.on('lobby_update', (groups) => {
        lobbyGroupList.innerHTML = ""; let hostSid = null;
        Object.entries(groups).forEach(([sid, names]) => {
            if (!hostSid) hostSid = sid;
            const li = document.createElement("li");
            li.textContent = `Grupo de ${names.join(', ')}`;
            if (sid === mySid) li.style.fontWeight = 'bold';
            lobbyGroupList.appendChild(li);
        });
        hostStartButton.style.display = (hostSid === mySid && Object.keys(groups).length >= 1) ? 'block' : 'none';
    });

    hostStartButton.addEventListener("click", () => { socket.emit('start_game'); });


    // --- 4. Lógica Principal del Juego ---

    // El servidor avisa que el torneo empieza.
    socket.on('game_started', () => {
        lobbyScreen.style.display = 'none';
        gameScreen.style.display = 'block';
    });

    // El nuevo "latido": recibimos un estado personalizado para nuestro grupo.
    socket.on('game_update', (gameState) => {
        const myGroup = gameState.myGroupState;
        if (!myGroup) return;
        
        updateUI(myGroup, gameState.timeLeft);
    });

    // La función "pintora", ahora mucho más centrada.
    function updateUI(myGroup, timeLeft) {
        messageOverlay.style.display = 'none';
        turnReadyOverlay.style.display = 'none';

        objectiveSpan.textContent = myGroup.objective;
        currentPlayerSpan.textContent = myGroup.activePlayer;
        timerSpan.textContent = timeLeft;

        playerList.innerHTML = "";
        myGroup.players.forEach(player => {
            const li = document.createElement("li");
            li.textContent = `${player.name}: ${player.score}%`;
            if (player.isEliminated) {
                li.classList.add("eliminated");
            }
            if (player.name === myGroup.activePlayer && myGroup.state === 'PLAYING') {
                li.classList.add("active-player");
            }
            playerList.appendChild(li);
        });

        const isMyTurnActive = (myGroup.state === "PLAYING");
        if (isMyTurnActive && !predictionInterval) {
            predictionInterval = setInterval(sendFrameForPrediction, 200);
        } else if (!isMyTurnActive && predictionInterval) {
            clearInterval(predictionInterval);
            predictionInterval = null;
        }
        
        if (myGroup.state === "READY_FOR_NEXT_TURN") {
            readyPlayerNameSpan.textContent = myGroup.activePlayer;
            readyObjectiveSpan.textContent = myGroup.objective;
            turnReadyOverlay.style.display = 'flex';
        } else if (myGroup.state === "ROUND_OVER") {
            messageTitle.textContent = "Fin de la Ronda de Grupo";
            messageText.textContent = `¡${myGroup.eliminatedPlayer} ha sido eliminado!`;
            nextRoundButton.style.display = 'block';
            messageOverlay.style.display = 'flex';
        } else if (myGroup.state === "CHAMPION_SELECTED") {
            const champion = myGroup.players.find(p => !p.isEliminated);
            messageTitle.textContent = "🏆 ¡Campeón de Grupo! 🏆";
            messageText.textContent = `¡${champion.name} ha ganado la eliminatoria! Esperando a otros grupos...`;
            nextRoundButton.style.display = 'none';
            messageOverlay.style.display = 'flex';
        }
    }

    // --- 5. Funciones de Interacción y Cámara ---
    
    // Al pulsar "¡Estoy listo!", AHORA encendemos la cámara (si no lo está ya)
    startTurnButton.addEventListener("click", async () => {
        if (!isCameraOn) {
            await setupCamera();
        }
        socket.emit('start_turn');
    });
    
    nextRoundButton.addEventListener("click", () => socket.emit('next_round'));

    async function sendFrameForPrediction() {
        if (!isCameraOn) return;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        const imageData = canvas.toDataURL("image/jpeg");
        socket.emit('predict', { image: imageData });
    }

    async function setupCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
            isCameraOn = true;
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
});