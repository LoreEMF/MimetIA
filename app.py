import base64
import cv2
import numpy as np
import random
import time
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from model import get_prediction, CLASS_NAMES

# --- 1. Clases para la Lógica del Juego ---
class Player:
    def __init__(self, name):
        self.name = name
        self.best_score_this_round = 0.0

class Game:
    def __init__(self):
        self.players = []
        self.is_active = False
        # NUEVOS ESTADOS: WAITING, READY_FOR_NEXT_TURN, PLAYING, ROUND_OVER, GAME_OVER
        self.state = "WAITING"
        self.current_player_index = 0
        self.current_objective = ""
        self.turn_start_time = 0
        self.turn_duration = 10
        self.eliminated_player_name = None # Para mostrar quién fue eliminado

    def start_game(self, player_names):
        self.players = [Player(p) for p in player_names if p]
        if not self.players:
            return
        self.is_active = True
        self.start_new_round()

    def start_new_round(self):
        for player in self.players:
            player.best_score_this_round = 0.0
        self.current_objective = random.choice(CLASS_NAMES)
        self.current_player_index = 0
        self.eliminated_player_name = None
        # Ahora el juego espera a que el primer jugador esté listo
        self.state = "READY_FOR_NEXT_TURN" 
        print(f"--- Nueva Ronda --- Objetivo: {self.current_objective}. Jugadores: {[p.name for p in self.players]}")

    # ¡NUEVA FUNCIÓN!
    def start_turn(self):
        """ Inicia el turno del jugador actual cuando el frontend lo pide. """
        if self.state == "READY_FOR_NEXT_TURN":
            self.state = "PLAYING"
            self.turn_start_time = time.time()
            print(f"Comienza el turno de: {self.players[self.current_player_index].name}")

    def next_turn(self):
        if self.current_player_index + 1 < len(self.players):
            self.current_player_index += 1
            # En lugar de empezar el turno, nos preparamos para él
            self.state = "READY_FOR_NEXT_TURN"
        else:
            self.end_round()

    def end_round(self):
        self.state = "ROUND_OVER"
        if len(self.players) > 1:
            min_score_player = min(self.players, key=lambda p: p.best_score_this_round)
            self.eliminated_player_name = min_score_player.name
            print(f"Ronda terminada. Eliminado: {self.eliminated_player_name} ({min_score_player.best_score_this_round:.2f})")
            self.players.remove(min_score_player)
        
        if len(self.players) <= 1:
            self.end_game()

    def end_game(self):
        self.state = "GAME_OVER"
        self.is_active = False
        print("🎉 Fin del juego!")

    def update_score_if_match(self, predicted_label, confidence):
        if self.state == "PLAYING" and predicted_label == self.current_objective:
            player = self.players[self.current_player_index]
            if confidence > player.best_score_this_round:
                player.best_score_this_round = confidence

    def get_state(self):
        # El temporizador solo se comprueba y avanza si está en modo PLAYING
        if self.state == "PLAYING" and time.time() - self.turn_start_time > self.turn_duration:
            print(f"Tiempo agotado para {self.players[self.current_player_index].name}")
            self.next_turn()

        player_data = [{"name": p.name, "score": f"{p.best_score_this_round * 100:.2f}"} for p in self.players]
        
        # FIX DEL BUG: Comprobar el estado antes de acceder al índice del jugador
        current_player_name = ""
        if self.is_active and self.state in ["PLAYING", "READY_FOR_NEXT_TURN"]:
            current_player_name = self.players[self.current_player_index].name

        return {
            "isActive": self.is_active,
            "state": self.state,
            "objective": self.current_objective,
            "currentPlayer": current_player_name,
            "timeLeft": int(self.turn_duration - (time.time() - self.turn_start_time)) if self.state == "PLAYING" else self.turn_duration,
            "players": player_data,
            "winner": self.players[0].name if self.state == "GAME_OVER" and self.players else "",
            "eliminatedPlayer": self.eliminated_player_name if self.state == "ROUND_OVER" else None
        }

# --- Inicialización y Rutas ---
app = Flask(__name__)
CORS(app)
game = Game()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/game/start', methods=['POST'])
def start_game_route():
    data = request.get_json()
    player_names = data.get('players', [])
    game.start_game(player_names)
    return jsonify(game.get_state())

@app.route('/game/state')
def game_state():
    return jsonify(game.get_state())
    
@app.route('/game/next_round', methods=['POST'])
def next_round():
    if game.state == "ROUND_OVER":
        game.start_new_round()
    return jsonify(game.get_state())

# ¡NUEVA RUTA!
@app.route('/game/start_turn', methods=['POST'])
def start_turn_route():
    game.start_turn()
    return jsonify(game.get_state())

@app.route('/predict', methods=['POST'])
def predict():
    if not game.is_active or game.state != "PLAYING":
        return jsonify({"status": "not_playing"})

    data = request.get_json()
    img_data_b64 = data['image'].split(',')[1]
    img_data = base64.b64decode(img_data_b64)
    np_arr = np.frombuffer(img_data, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    label, confidence = get_prediction(frame)
    game.update_score_if_match(label, confidence)
    
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)