# Desde la terminal:
    ## Activar entorno virtual:
# .\venv\Scripts\activate 
# python main.py

import cv2
import numpy as np
from tf_keras.models import load_model

def load_labels(path):
    with open(path, "r", encoding="utf-8") as f:
        raw = [line.strip() for line in f.readlines()]
    # Quita prefijos tipo "0 Perro", "1 Gato" dejando sólo el nombre
    labels = []
    for s in raw:
        # si empieza con dígito+espacio, lo quitamos
        parts = s.split(maxsplit=1)
        labels.append(parts[1] if len(parts) == 2 and parts[0].isdigit() else s)
    return labels

def get_prediction(model, frame_bgr, class_names):
    # 0. BGR -> RGB para coincidir con entrenamiento web/RGB
    img = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    
    # 1) resize 224x224
    img = cv2.resize(img, (224, 224), interpolation=cv2.INTER_AREA)

    # 2) normalizar [-1, 1] # Es la que se realiza en Teachable Machine
    img = img.astype(np.float32)
    img = (img / 127.5) - 1.0
    
    # 3) batch de 1 # (Num_batch, Height, Width, Channels)
    data = np.expand_dims(img, axis=0) # (224,224,3) -> (1,224,224,3)

    # 4) predecir
    preds = model.predict(data, verbose=0)[0] # softmax
    idx = int(np.argmax(preds)) # índice de la clase con mayor probabilidad
    return class_names[idx], float(preds[idx])

def main():
    # Cargar modelo y etiquetas
    model = load_model("keras_model.h5", compile=False)
    class_names = load_labels("labels.txt")

    # Cámara (en Windows suele ir mejor con CAP_DSHOW)
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("No se pudo abrir la cámara (índice 0).")

    cv2.namedWindow("MimetIA - Prueba", cv2.WINDOW_AUTOSIZE)

    while True:
        ok, frame = cap.read()
        if not ok:
            print("⚠️ No llega vídeo de la cámara.")
            break

        label, conf = get_prediction(model, frame, class_names)

        cv2.putText(frame, f"Pose: {label}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        cv2.putText(frame, f"Confianza: {conf*100:.2f}%", (10, 70),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

        cv2.imshow("MimetIA - Prueba", frame)

        # salir con 'q'
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
