# --- 0. Importaciones ---
import random, time
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
from model import get_prediction, CLASS_NAMES # Re-importamos las herramientas de IA

# --- 1. Arquitectura de Clases para el Torneo por Grupos ---

class Player:
    """ Representa a un único jugador DENTRO de un grupo. """
    def __init__(self, name):
        self.name = name
        self.best_score_this_round = 0.0
        # En lugar de eliminarlo de la lista, lo marcamos. Es más limpio.
        self.is_eliminated = False

class Group:
    """ Gestiona la eliminatoria interna de un grupo (un navegador). """
    def __init__(self, group_sid, player_names):
        self.id = group_sid
        self.players = [Player(name) for name in player_names]
        self.active_player_index = 0
        self.state = "WAITING" # Estados del grupo: WAITING, READY_FOR_NEXT_TURN, PLAYING, ROUND_OVER, CHAMPION_SELECTED
        self.current_objective = ""
        self.eliminated_player_name_this_round = None

    def start_new_round(self):
        """ Prepara una nueva ronda de eliminación DENTRO de este grupo. """
        self.eliminated_player_name_this_round = None
        # Reseteamos la puntuación solo de los jugadores que siguen en juego.
        for player in self.get_survivors():
            player.best_score_this_round = 0.0
        
        self.current_objective = random.choice(CLASS_NAMES)
        self.active_player_index = 0
        self.state = "READY_FOR_NEXT_TURN"

    def start_turn(self):
        """ Comienza el turno para el jugador activo del grupo. """
        if self.state == "READY_FOR_NEXT_TURN":
            self.state = "PLAYING"
            # El temporizador ahora es parte del objeto Game, para que el loop principal lo controle.
            game.turn_start_time = time.time()
    
    def next_turn(self):
        """ Pasa al siguiente jugador superviviente del grupo. """
        survivors = self.get_survivors()
        # Buscamos el índice actual en la lista de supervivientes
        current_survivor_index = survivors.index(self.get_active_player())
        
        if current_survivor_index + 1 < len(survivors):
            # El siguiente en jugar es el siguiente en la lista de supervivientes
            next_player_name = survivors[current_survivor_index + 1].name
            # Encontramos su índice en la lista original de jugadores
            self.active_player_index = [p.name for p in self.players].index(next_player_name)
            self.state = "READY_FOR_NEXT_TURN"
        else:
            self.end_round()

    def end_round(self):
        """ Finaliza la ronda del grupo, elimina al de menor puntaje. """
        survivors = self.get_survivors()
        if len(survivors) > 1:
            min_score_player = min(survivors, key=lambda p: p.best_score_this_round)
            min_score_player.is_eliminated = True
            self.eliminated_player_name_this_round = min_score_player.name
            self.state = "ROUND_OVER"
        
        # Comprobamos si ya tenemos un campeón
        if len(self.get_survivors()) == 1:
            self.state = "CHAMPION_SELECTED"
            print(f"🏆 Campeón del Grupo {self.id}: {self.get_champion().name}")

    def get_survivors(self):
        """ Devuelve una lista de los jugadores no eliminados del grupo. """
        return [p for p in self.players if not p.is_eliminated]

    def get_active_player(self):
        """ Devuelve el objeto del jugador al que le toca jugar. """
        return self.players[self.active_player_index]

    def get_champion(self):
        """ Devuelve al campeón del grupo si solo queda uno. """
        survivors = self.get_survivors()
        return survivors[0] if len(survivors) == 1 else None

class Game:
    """ Orquesta el torneo completo, gestionando las fases y los grupos. """
    def __init__(self):
        self.groups = {}
        self.is_active = False
        self.game_phase = "GROUP_STAGE"
        self.turn_duration = 10
        self.turn_start_time = 0 # Temporizador global

    def setup_game(self, groups_from_lobby):
        for sid, names in groups_from_lobby.items():
            self.groups[sid] = Group(sid, names)

    def start_tournament(self):
        """ Da el pistoletazo de salida a la fase de grupos. """
        self.is_active = True
        self.game_phase = "GROUP_STAGE"
        # Cada grupo empieza su propia primera ronda.
        for group in self.groups.values():
            group.start_new_round()
        print("--- ⚔️ FASE DE GRUPOS INICIADA ⚔️ ---")

    def update_score(self, sid, predicted_label, confidence):
        """ Actualiza la puntuación del jugador activo del grupo correspondiente. """
        group = self.groups.get(sid)
        if group and group.state == "PLAYING":
            active_player = group.get_active_player()
            if predicted_label == group.current_objective:
                if confidence > active_player.best_score_this_round:
                    active_player.best_score_this_round = confidence
    
    def get_personalized_state_for(self, sid):
        """ Crea un objeto de estado personalizado para un grupo específico. """
        my_group = self.groups.get(sid)
        if not my_group: return {}
        
        # Resumen de todos los grupos para un marcador general
        all_groups_summary = {}
        for group_id, group in self.groups.items():
            champion = group.get_champion()
            all_groups_summary[group_id] = {
                "players": [p.name for p in group.players],
                "champion": champion.name if champion else None
            }

        # Estado detallado de MI grupo
        my_group_state = {
            "id": my_group.id,
            "state": my_group.state,
            "objective": my_group.current_objective,
            "eliminatedPlayer": my_group.eliminated_player_name_this_round,
            "activePlayer": my_group.get_active_player().name if my_group.get_survivors() else "",
            "players": [{
                "name": p.name,
                "score": f"{p.best_score_this_round * 100:.2f}",
                "isEliminated": p.is_eliminated
            } for p in my_group.players]
        }
        
        time_left = 0
        if my_group.state == "PLAYING":
            time_left = int(self.turn_duration - (time.time() - self.turn_start_time))

        return {
            "gamePhase": self.game_phase,
            "allGroups": all_groups_summary,
            "myGroupState": my_group_state,
            "timeLeft": time_left
        }

# --- 2. Inicialización y Lógica de Eventos ---
app = Flask(__name__)
app.config['SECRET_KEY'] = 'mimetia_es_lo_mas!'
socketio = SocketIO(app, cors_allowed_origins="*")
game = Game()
lobby_groups = {}

# Bucle principal del servidor que controla los temporizadores
def game_loop():
    while True:
        if game.is_active and game.game_phase == "GROUP_STAGE":
            # Revisamos cada grupo para ver si su temporizador ha expirado
            for sid, group in game.groups.items():
                if group.state == "PLAYING":
                    if time.time() - game.turn_start_time > game.turn_duration:
                        group.next_turn()
                # Enviamos a cada grupo su estado personalizado
                socketio.emit('game_update', game.get_personalized_state_for(sid), to=sid)
        socketio.sleep(0.5)

# --- 3. Manejadores de Eventos ---

@app.route('/')
def index(): return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    emit('lobby_update', lobby_groups)

@socketio.on('create_group')
def handle_create_group(data):
    # ... (sin cambios)
    player_names = data.get('names', [])
    group_sid = request.sid
    if group_sid not in lobby_groups and player_names:
        lobby_groups[group_sid] = player_names
        emit('lobby_update', lobby_groups, broadcast=True)

@socketio.on('start_game')
def handle_start_game():
    if not game.is_active:
        game.setup_game(lobby_groups)
        game.start_tournament() # Nueva función que inicia la acción
        lobby_groups.clear()
        emit('game_started', broadcast=True)

# El bucle de fondo se inicia aquí
socketio.start_background_task(target=game_loop)

# Nuevos manejadores que operan sobre el grupo que los llama
@socketio.on('start_turn')
def handle_start_turn():
    group = game.groups.get(request.sid)
    if group: group.start_turn()

@socketio.on('next_round')
def handle_next_round():
    group = game.groups.get(request.sid)
    # Solo puede empezar una nueva ronda si la anterior ha terminado
    if group and group.state in ["ROUND_OVER", "CHAMPION_SELECTED"]:
        group.start_new_round()

@socketio.on('predict')
def handle_predict(data):
    # Re-importamos las herramientas de predicción
    from model import get_prediction
    img_data_b64 = data['image'].split(',')[1]
    img_data = base64.b64decode(img_data_b64)
    np_arr = np.frombuffer(img_data, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    label, confidence = get_prediction(frame)
    game.update_score(request.sid, label, confidence)

@socketio.on('disconnect')
def handle_disconnect():
    # ... (sin cambios)
    if request.sid in lobby_groups:
        del lobby_groups[request.sid]
        emit('lobby_update', lobby_groups, broadcast=True)

# --- 4. Arranque del Servidor ---
if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)