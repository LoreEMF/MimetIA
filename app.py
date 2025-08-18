#  Backend (el servidor), cerebro de la aplicación web, recibe las imagenes 
# desde el navegador, usa model.py para procesarlas y devolver resultados.

# Imports para decodificar la imagen que nos llega del navegador.
import base64
import cv2
import numpy as np

# Import de las herramientas de Flask.
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS

# Importamos nuestra función de predicción desde model.py
from model import get_prediction

# Inicialización de la aplicación Flask
app = Flask(__name__)
# Configuración de CORS para permitir peticiones desde el navegador
CORS(app) 

# --- Rutas de la Aplicación ---

@app.route('/')
def index():
    """ Sirve la página principal de la aplicación (index.html). """
    # Renderiza el archivo HTML que contiene el frontend
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    """ Recibe una imagen y devuelve la predicción de la pose. """
    # 1. Obtenemos los datos enviados desde el frontend
    data = request.get_json()
    # Extraemos la imagen en formato base64
    img_data_b64 = data['image'].split(',')[1] 

    # 2. Decodificamos la imagen para que OpenCV pueda usarla
    img_data = base64.b64decode(img_data_b64)
    np_arr = np.frombuffer(img_data, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    # 3. Obtenemos la predicción usando nuestro módulo 'model'
    label, confidence = get_prediction(frame)

    # 4. Devolvemos el resultado en formato JSON
    return jsonify({
        'pose': label,
        'confidence': f"{confidence*100:.2f}" 
    })

if __name__ == '__main__':
    # Ejecuta la aplicación en modo debug para desarrollo
    app.run(host='0.0.0.0', port=5000, debug=True)