"""
Supabase client — configurar con credenciales del proyecto.

SETUP:
  1. Crear proyecto en https://supabase.com
  2. Ejecutar el SQL de backend/schema.sql en el SQL Editor de Supabase
  3. Configurar SUPABASE_URL y SUPABASE_KEY abajo o mediante variables de entorno.
"""

import os
import json
import threading
import random
import asyncio
import socket
import uuid

# ── Credenciales ──────────────────────────────────────────────────────────────
# Ponelas aquí o en variables de entorno SUPABASE_URL / SUPABASE_KEY
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://vldjpdzvkdkdjenffcxp.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "sb_publishable_2Jaw2W2DMyCdi3SLKk9_0A__4UhO1EW")

_client = None
_world_channel = None

import time

_bytes_sent_sec = 0
_bytes_recv_sec = 0
_last_rate_calc_time = time.time()
_current_upload_rate = 0.0
_current_download_rate = 0.0
_last_latency = 0.0

def _track_upload(data):
    global _bytes_sent_sec
    try:
        _bytes_sent_sec += len(json.dumps(data))
    except:
        pass

def _track_download(data):
    global _bytes_recv_sec
    try:
        _bytes_recv_sec += len(json.dumps(data))
    except:
        pass

def get_net_rates():
    global _bytes_sent_sec, _bytes_recv_sec, _last_rate_calc_time
    global _current_upload_rate, _current_download_rate, _last_latency
    now = time.time()
    elapsed = now - _last_rate_calc_time
    if elapsed >= 1.0:
        _current_upload_rate = (_bytes_sent_sec / elapsed) / 1024.0
        _current_download_rate = (_bytes_recv_sec / elapsed) / 1024.0
        _bytes_sent_sec = 0
        _bytes_recv_sec = 0
        _last_rate_calc_time = now
    return _last_latency, _current_upload_rate, _current_download_rate

def get_client():
    global _client
    if _client is not None:
        return _client
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    try:
        from supabase import create_client
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
        return _client
    except Exception as e:
        print(f"[Supabase] No se pudo conectar: {e}")
        return None

_authenticated = False

def is_connected():
    return _authenticated

_instance_socket = None

def _get_instance_number():
    global _instance_socket
    if _instance_socket is not None:
        try:
            return _instance_socket.getsockname()[1] - 9990
        except:
            return 1
    for port in [9991, 9992, 9993, 9994]:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.bind(("127.0.0.1", port))
            _instance_socket = s
            return port - 9990
        except socket.error:
            continue
    return 1

def initialize_user_session():
    """
    Lee o genera data/user_session.json, se conecta a Supabase,
    y retorna la información del perfil del usuario (id, username, elo_1v1, etc.)
    Si falla la conexión, retorna un mock_player.
    """
    global _authenticated
    instance_num = _get_instance_number()
    db = get_client()
    if not db:
        print(f"[Supabase Auth] Sin conexión a Supabase. Cargando jugador simulado #{instance_num}.")
        _authenticated = False
        return mock_player(instance_num)
        
    os.makedirs("data", exist_ok=True)
    session_file = f"data/user_session_{instance_num}.json" if instance_num > 1 else "data/user_session.json"
    
    user_id = None
    username = None
    
    if os.path.exists(session_file):
        try:
            with open(session_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                user_id = data.get("id")
                username = data.get("username")
        except Exception as e:
            print(f"[Supabase Auth] Error al leer session_file: {e}")
            
    # Si no hay perfil guardado, generar un nuevo UUID y perfil público
    if not user_id or not username:
        user_id = str(uuid.uuid4())
        username = f"Survivor_{random.randint(1000, 9999)}"
        try:
            print(f"[Supabase Auth] Registrando nuevo usuario en tabla users: {username} ({user_id})...")
            db.table("users").insert({
                "id": user_id,
                "username": username,
                "elo_1v1": 1500,
                "elo_2v2": 1500,
                "elo_4v4": 1500,
                "wins": 0,
                "losses": 0
            }).execute()
            
            # Guardar sesión
            with open(session_file, "w", encoding="utf-8") as f:
                json.dump({"username": username, "id": user_id}, f, indent=4)
            print("[Supabase Auth] Registro completado y guardado en archivo local.")
        except Exception as e:
            print(f"[Supabase Auth] Error al registrar nuevo usuario en base de datos: {e}")
            _authenticated = False
            return mock_player(instance_num)
            
    # Obtener perfil desde la base de datos o re-insertar si no existe
    try:
        res = db.table("users").select("*").eq("id", user_id).execute()
        if res.data:
            profile = res.data[0]
            elo_prom = (profile.get("elo_1v1", 1500) + profile.get("elo_2v2", 1500) + profile.get("elo_4v4", 1500)) // 3
            profile["elo"] = elo_prom
            print(f"[Supabase Auth] Perfil cargado: {profile['username']} | ELO promedio: {elo_prom}")
            _authenticated = True
            return profile
        else:
            print(f"[Supabase Auth] Re-creando registro de usuario {username} ({user_id}) en base de datos...")
            db.table("users").insert({
                "id": user_id,
                "username": username,
                "elo_1v1": 1500,
                "elo_2v2": 1500,
                "elo_4v4": 1500,
                "wins": 0,
                "losses": 0
            }).execute()
            _authenticated = True
            return {
                "id": user_id,
                "username": username,
                "elo_1v1": 1500,
                "elo_2v2": 1500,
                "elo_4v4": 1500,
                "elo": 1500,
                "wins": 0,
                "losses": 0
            }
    except Exception as e:
        print(f"[Supabase Auth] Error al obtener perfil desde la DB: {e}")
        _authenticated = False
        return mock_player(instance_num)

# ── Supabase Realtime Broadcast (WebSockets) via AsyncClient y Background Thread ──

_loop = None
_loop_thread = None
_async_client = None
_async_channel = None

def _start_async_loop():
    global _loop, _loop_thread
    if _loop is not None:
        return
    _loop = asyncio.new_event_loop()
    def run_loop(loop):
        asyncio.set_event_loop(loop)
        loop.run_forever()
    _loop_thread = threading.Thread(target=run_loop, args=(_loop,), daemon=True)
    _loop_thread.start()

async def _async_join_world(player_id, callback_on_sync, callback_on_npc_sync, callback_on_npc_damage, callback_on_player_damage, channel_name="open_world"):
    global _async_client, _async_channel
    if _async_client is None:
        from supabase import acreate_client
        _async_client = await acreate_client(SUPABASE_URL, SUPABASE_KEY)
    
    if _async_channel is not None:
        try:
            await _async_channel.unsubscribe()
        except:
            pass
            
    _async_channel = _async_client.channel(channel_name)
    
    # Callback de posición de jugador
    def on_msg_received(message):
        _track_download(message)
        payload = message.get("payload", {})
        pid = payload.get("id")
        if pid and pid != player_id:
            callback_on_sync(
                pid,
                payload.get("x", 0),
                payload.get("y", 0),
                payload.get("hp", 100),
                payload.get("en", 100)
            )
            
    _async_channel.on_broadcast(
        event="position",
        callback=on_msg_received
    )

    # Callback de sync de NPCs
    def on_npc_received(message):
        _track_download(message)
        payload = message.get("payload", {})
        pid = payload.get("id")
        if pid and pid != player_id:
            callback_on_npc_sync(payload.get("npcs", []))

    _async_channel.on_broadcast(
        event="npc_sync",
        callback=on_npc_received
    )

    # Callback de daño a NPCs
    def on_npc_damage_received(message):
        _track_download(message)
        payload = message.get("payload", {})
        pid = payload.get("id")
        if pid and pid != player_id:
            callback_on_npc_damage(
                payload.get("type"),
                payload.get("idx"),
                payload.get("dmg"),
                payload.get("cc"),
                payload.get("cc_dur")
            )

    _async_channel.on_broadcast(
        event="npc_damage",
        callback=on_npc_damage_received
    )

    # Callback de daño/CC infligido a jugadores
    def on_player_damage_received(message):
        _track_download(message)
        payload = message.get("payload", {})
        target_id = payload.get("target_id")
        if target_id == player_id:
            callback_on_player_damage(
                payload.get("dmg", 0),
                payload.get("cc"),
                payload.get("cc_dur", 0.0)
            )

    _async_channel.on_broadcast(
        event="player_damage",
        callback=on_player_damage_received
    )

    # Callback de ping RTT
    def on_ping_received(message):
        _track_download(message)
        payload = message.get("payload", {})
        pid = payload.get("id")
        if pid == player_id:
            ts = payload.get("ts", 0.0)
            global _last_latency
            _last_latency = (time.time() - ts) * 1000.0

    _async_channel.on_broadcast(
        event="ping",
        callback=on_ping_received
    )
    
    await _async_channel.subscribe()
    print(f"[Supabase Realtime] Conectado exitosamente al canal de WebSockets (Broadcast) '{channel_name}'.")

async def _async_send_position(player_id, x, y, hp, energy):
    global _async_channel
    if _async_channel is not None:
        data = {
            "id": player_id,
            "x": int(x),
            "y": int(y),
            "hp": int(hp),
            "en": int(energy)
        }
        _track_upload(data)
        await _async_channel.send_broadcast(event="position", data=data)

async def _async_send_npc_sync(player_id, npc_data):
    global _async_channel
    if _async_channel is not None:
        data = {
            "id": player_id,
            "npcs": npc_data
        }
        _track_upload(data)
        await _async_channel.send_broadcast(event="npc_sync", data=data)

async def _async_send_npc_damage(player_id, npc_type, npc_idx, damage, cc_type, cc_duration):
    global _async_channel
    if _async_channel is not None:
        data = {
            "id": player_id,
            "type": npc_type,
            "idx": npc_idx,
            "dmg": damage,
            "cc": cc_type,
            "cc_dur": cc_duration
        }
        _track_upload(data)
        await _async_channel.send_broadcast(event="npc_damage", data=data)

async def _async_send_player_damage(target_id, dmg, cc_type=None, cc_dur=0.0):
    global _async_channel
    if _async_channel is not None:
        data = {
            "target_id": target_id,
            "dmg": dmg,
            "cc": cc_type,
            "cc_dur": cc_dur
        }
        _track_upload(data)
        await _async_channel.send_broadcast(event="player_damage", data=data)

async def _async_send_ping(player_id, ts):
    global _async_channel
    if _async_channel is not None:
        data = {
            "id": player_id,
            "ts": ts
        }
        _track_upload(data)
        await _async_channel.send_broadcast(event="ping", data=data)

async def _async_leave_world():
    global _async_channel
    if _async_channel is not None:
        try:
            await _async_channel.unsubscribe()
        except:
            pass
        _async_channel = None
        print("[Supabase Realtime] Suscripción de canal finalizada.")

def join_world_channel(player_id, callback_on_sync, callback_on_npc_sync, callback_on_npc_damage, callback_on_player_damage, channel_name="open_world"):
    if not is_connected():
        print("[Supabase Realtime] Ejecutando en modo SIMULADO.")
        return False
    try:
        _start_async_loop()
        future = asyncio.run_coroutine_threadsafe(
            _async_join_world(player_id, callback_on_sync, callback_on_npc_sync, callback_on_npc_damage, callback_on_player_damage, channel_name=channel_name),
            _loop
        )
        # Esperar hasta 6.0 segundos a que conecte el WebSocket
        future.result(timeout=6.0)
        return True
    except Exception as e:
        print(f"[Supabase Realtime] Error al conectar canal: {e}")
        return False

def send_world_position(player_id, x, y, hp, energy):
    global _loop, _async_channel
    if _loop is None or _async_channel is None:
        return False
    try:
        asyncio.run_coroutine_threadsafe(
            _async_send_position(player_id, x, y, hp, energy),
            _loop
        )
        return True
    except Exception as e:
        print(f"[Supabase Realtime] Error al enviar broadcast: {e}")
        return False

def send_npc_sync(player_id, npc_data):
    global _loop, _async_channel
    if _loop is None or _async_channel is None:
        return False
    try:
        asyncio.run_coroutine_threadsafe(
            _async_send_npc_sync(player_id, npc_data),
            _loop
        )
        return True
    except Exception as e:
        print(f"[Supabase Realtime] Error al enviar npc_sync: {e}")
        return False

def send_npc_damage(player_id, npc_type, npc_idx, damage, cc_type, cc_duration):
    global _loop, _async_channel
    if _loop is None or _async_channel is None:
        return False
    try:
        asyncio.run_coroutine_threadsafe(
            _async_send_npc_damage(player_id, npc_type, npc_idx, damage, cc_type, cc_duration),
            _loop
        )
        return True
    except Exception as e:
        print(f"[Supabase Realtime] Error al enviar npc_damage: {e}")
        return False

def send_player_damage(target_id, dmg, cc_type=None, cc_dur=0.0):
    global _loop, _async_channel
    if _loop is None or _async_channel is None:
        return False
    try:
        asyncio.run_coroutine_threadsafe(
            _async_send_player_damage(target_id, dmg, cc_type, cc_dur),
            _loop
        )
        return True
    except Exception as e:
        print(f"[Supabase Realtime] Error al enviar player_damage: {e}")
        return False

def send_ping(player_id, ts):
    global _loop, _async_channel
    if _loop is None or _async_channel is None:
        return False
    try:
        asyncio.run_coroutine_threadsafe(
            _async_send_ping(player_id, ts),
            _loop
        )
        return True
    except Exception as e:
        print(f"[Supabase Realtime] Error al enviar ping: {e}")
        return False

def leave_world_channel():
    global _loop
    if _loop is None:
        return
    try:
        future = asyncio.run_coroutine_threadsafe(
            _async_leave_world(),
            _loop
        )
        future.result(timeout=4.0)
    except Exception as e:
        print(f"[Supabase Realtime] Error al desconectar canal: {e}")

# ── ELO helpers ───────────────────────────────────────────────────────────────

def _load_ranks():
    with open("data/ranks.json", encoding="utf-8") as f:
        return json.load(f)

def elo_to_rank(elo: int) -> dict:
    data = _load_ranks()
    for rank in reversed(data["ranks"]):
        if elo >= rank["min_elo"]:
            return rank
    return data["ranks"][0]

def calculate_elo_change(winner_elo: int, loser_elo: int) -> tuple[int, int]:
    """Retorna (ganancia del ganador, pérdida del perdedor)."""
    data    = _load_ranks()
    k       = data["elo"]["k_factor"]
    expected_w = 1 / (1 + 10 ** ((loser_elo - winner_elo) / 400))
    gain    = round(k * (1 - expected_w))
    loss    = round(k * expected_w)
    return max(5, gain), max(5, loss)

# ── Matchmaking ───────────────────────────────────────────────────────────────

def join_queue(user_id: str, mode: str, elo: int) -> bool:
    """Agrega al jugador a la cola de matchmaking."""
    db = get_client()
    if not db:
        return True # Modo simulado
    try:
        # Invalida registros antiguos/colgados del usuario en la cola
        db.table("matchmaking_queue")\
          .update({"status": "processed"})\
          .eq("user_id", user_id)\
          .in_("status", ["searching", "matched"])\
          .execute()

        db.table("matchmaking_queue").insert({
            "user_id": user_id,
            "mode":    mode,
            "elo":     elo,
            "status":  "searching"
        }).execute()
        return True
    except Exception as e:
        print(f"[Matchmaking] join_queue error: {e}")
        return False

def leave_queue(user_id: str) -> bool:
    db = get_client()
    if not db:
        return True
    try:
        db.table("matchmaking_queue")\
          .update({"status": "cancelled"})\
          .eq("user_id", user_id)\
          .eq("status", "searching")\
          .execute()
        return True
    except Exception as e:
        print(f"[Matchmaking] leave_queue error: {e}")
        return False

def find_match(user_id: str, mode: str, elo: int, elo_range: int = 200):
    """Busca jugadores compatibles en la cola. Retorna room_id o None."""
    db = get_client()
    if not db:
        return None
    mode_players = {"1v1": 2, "2v2": 4, "4v4": 8}
    needed = mode_players.get(mode, 2)
    try:
        res = db.table("matchmaking_queue")\
                .select("*")\
                .eq("mode", mode)\
                .eq("status", "searching")\
                .gte("elo", elo - elo_range)\
                .lte("elo", elo + elo_range)\
                .neq("user_id", user_id)\
                .limit(needed - 1)\
                .execute()
        if len(res.data) >= needed - 1:
            # Crear sala
            room = db.table("rooms").insert({
                "mode":        mode,
                "host_id":     user_id,
                "status":      "waiting",
                "max_players": needed,
                "players":     [user_id] + [p["user_id"] for p in res.data]
            }).execute()
            
            if not room.data:
                return None
            room_id = room.data[0]["id"]
            
            # Actualizar estado de cola a matched condicionando a que sigan buscando
            claim_ids = [user_id] + [p["user_id"] for p in res.data]
            update_res = db.table("matchmaking_queue")\
              .update({"status": "matched", "room_id": room_id})\
              .in_("user_id", claim_ids)\
              .eq("status", "searching")\
              .execute()
              
            if update_res.data and len(update_res.data) >= needed:
                return room_id
            else:
                # Si fallamos en reclamar a alguno (ya emparejado por otro host), descartar la sala
                try:
                    db.table("rooms").delete().eq("id", room_id).execute()
                except:
                    pass
                return None
    except Exception as e:
        print(f"[Matchmaking] find_match error: {e}")
    return None

def check_queue_status(user_id: str) -> str | None:
    db = get_client()
    if not db:
        return None
    try:
        res = db.table("matchmaking_queue")\
                .select("status, room_id")\
                .eq("user_id", user_id)\
                .eq("status", "matched")\
                .order("created_at", desc=True)\
                .limit(1)\
                .execute()
        if res.data and res.data[0].get("room_id"):
            return res.data[0]["room_id"]
    except Exception as e:
        print(f"[Matchmaking] check_queue_status error: {e}")
    return None

# ── Friends ───────────────────────────────────────────────────────────────────

def get_friends(user_id: str) -> list:
    db = get_client()
    if not db:
        return _mock_friends()
    try:
        res = db.table("friends")\
                .select("*, friend:friend_id(username, elo_1v1, elo_2v2, elo_4v4)")\
                .eq("user_id", user_id)\
                .eq("status", "accepted")\
                .execute()
        return res.data
    except Exception as e:
        print(f"[Friends] get_friends error: {e}")
        return _mock_friends()

def send_friend_request(user_id: str, target_username: str) -> bool:
    db = get_client()
    if not db:
        return False
    try:
        target = db.table("users").select("id").eq("username", target_username).single().execute()
        db.table("friends").insert({
            "user_id":   user_id,
            "friend_id": target.data["id"],
            "status":    "pending"
        }).execute()
        return True
    except Exception as e:
        print(f"[Friends] send_friend_request error: {e}")
        return False

# ── Rooms ─────────────────────────────────────────────────────────────────────

def create_room(host_id: str, mode: str) -> str | None:
    db = get_client()
    if not db:
        return "mock_room_001"
    mode_players = {"1v1": 2, "2v2": 4, "4v4": 8, "practice": 1}
    try:
        res = db.table("rooms").insert({
            "mode":        mode,
            "host_id":     host_id,
            "status":      "waiting",
            "max_players": mode_players.get(mode, 4),
            "players":     [host_id]
        }).execute()
        return res.data[0]["id"]
    except Exception as e:
        print(f"[Rooms] create_room error: {e}")
        return None

# ── Mock data (sin conexión) ──────────────────────────────────────────────────

def _mock_friends():
    return [
        {"username": "Malkhor",   "status": "online",  "activity": "En partida 2v2", "elo": 1580},
        {"username": "Scratch",   "status": "online",  "activity": "En menú",         "elo": 1240},
        {"username": "Nomad_77",  "status": "online",  "activity": "Mundo abierto",   "elo": 2100},
        {"username": "IronVeil",  "status": "offline", "activity": "Hace 3h",         "elo": 950},
        {"username": "DustRider", "status": "offline", "activity": "Hace 1d",         "elo": 1890},
    ]

def mock_player(instance_num=1):
    return {
        "id":       f"mock_user_{instance_num:03d}",
        "username": f"Survivor_{instance_num}",
        "elo_1v1":  1500,
        "elo_2v2":  1500,
        "elo_4v4":  1500,
        "elo":      1500,  # Promedio
        "wins":     0,
        "losses":   0,
    }
