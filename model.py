# la lógica de IA

import cv2
import numpy as np
from tf_keras.models import load_model

# Cargamos el modelo y las etiquetas UNA SOLA VEZ al iniciar.
print("🧠 Cargando modelo de IA y etiquetas...")
MODEL = load_model("keras_model.h5", compile=False)
CLASS_NAMES = []
with open("labels.txt", "r", encoding="utf-8") as f:
    raw = [line.strip() for line in f.readlines()]
    for s in raw:
        parts = s.split(maxsplit=1)
        CLASS_NAMES.append(parts[1] if len(parts) == 2 and parts[0].isdigit() else s)
print("✅ ¡Modelo y etiquetas cargados!")

def get_prediction(frame_bgr):
    """
    Toma un frame de OpenCV (BGR) y devuelve la predicción.
    """
    # 0. BGR -> RGB (para coincidir con entrenamiento web/RGB)
    img = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    
    # 1. Redimensionar a 224x224
    img = cv2.resize(img, (224, 224), interpolation=cv2.INTER_AREA)

    # 2. Normalizar en el rango [-1, 1]
    # Es la normalización que se realiza en Teachable Machine
    img = img.astype(np.float32)
    img = (img / 127.5) - 1.0

    # 3. Añadir dimensión de batch  # (Num_batch, Height, Width, Channels)
    data = np.expand_dims(img, axis=0) # (224,224,3) -> (1,224,224,3)

    # 4. Predecir y devolver resultados
    preds = MODEL.predict(data, verbose=0)[0]  # softmax
    idx = int(np.argmax(preds))  # índice de la clase con mayor probabilidad
    
    label = CLASS_NAMES[idx]
    confidence = float(preds[idx])
    
    return label, confidence