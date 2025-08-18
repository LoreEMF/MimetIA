document.addEventListener("DOMContentLoaded", () => {
    // 1. Obtenemos referencias a los elementos del HTML
    const video = document.getElementById("webcam");
    const poseSpan = document.getElementById("pose");
    const scoreSpan = document.getElementById("score");
    const startButton = document.getElementById("start-button");

    let predictionInterval;

    // 2. Función para configurar y encender la cámara
    async function setupCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
        } catch (error) {
            console.error("Error al acceder a la cámara:", error);
            alert("No se pudo acceder a la cámara. Revisa los permisos.");
        }
    }

    // 3. Función que envía un frame al backend para ser analizado
    async function sendFrameForPrediction() {
        // Creamos un canvas temporal para dibujar el frame actual del video
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);

        // Convertimos la imagen del canvas a formato de texto (base64)
        const imageData = canvas.toDataURL("image/jpeg");

        // Hacemos la petición al backend (app.py)
        const response = await fetch("http://127.0.0.1:5000/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: imageData }),
        });

        const data = await response.json();
        
        // Actualizamos el texto en la página con la respuesta del backend
        poseSpan.textContent = data.pose;
        scoreSpan.textContent = data.confidence;
    }
    
    // 4. El evento principal: ¿qué pasa cuando se hace clic en el botón?
    startButton.addEventListener("click", async () => {
        await setupCamera(); // Primero, encendemos la cámara
        video.play();
        startButton.style.display = 'none'; // Ocultamos el botón después de usarlo

        // Empezamos a enviar frames para predecir 5 veces por segundo (cada 200ms)
        predictionInterval = setInterval(sendFrameForPrediction, 200);
    });
});