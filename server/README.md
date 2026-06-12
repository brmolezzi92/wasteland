# Wasteland — Servidor autoritativo

Servidor de juego real para Wasteland. Corre en **tu PC**, es la **única autoridad**
del mundo (enemigos, IA, combate, items, duelos) y trae una **consola** para ver
jugadores online, duelos, pings y spectear el mundo en vivo.

No es peer-host: ningún jugador "hostea". El cliente (web, en `../web`) pasa a ser
solo render + input y le habla a este servidor por **WebSocket (socket.io)**.

```
web/ (cliente)  ──socket.io──►  server/ (este)  ──►  Supabase (persistencia opcional)
                                     │
                                     └──►  consola web (/admin) + TUI
```

## Requisitos
- Node 18+ (probado en Node 24)

## Setup
```bash
cd server
npm install
cp .env.example .env      # editá ADMIN_TOKEN; SUPABASE_* es opcional
```

`.env`:
- `PORT` — puerto del server y la consola (default 8787)
- `ADMIN_TOKEN` — clave para entrar a la consola (web y TUI). **Cambialo.**
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` — opcionales. Sin ellos, el server
  corre en **modo prueba** (sin guardar ELO/persistencia).

## Correr
```bash
npm run dev        # servidor con auto-reload (recomendado en desarrollo)
# o
npm start          # servidor sin watch
```
Al arrancar imprime el puerto, el token y la URL de la consola.

### Consola web
Abrí **http://localhost:8787/admin**, pegá el `ADMIN_TOKEN` y Conectar. Vas a ver:
- Jugadores online: clase, zona, posición, HP, **ping**, si están en duelo
- Duelos activos con HP de cada lado
- Población por zona (jugadores / enemigos vivos)
- **Spectate**: 👁 en un jugador renderiza su zona en vivo (jugadores, enemigos, items)
- ⏏ para expulsar a un jugador

### Consola TUI (terminal)
```bash
npm run tui        # tabla viva en la terminal (mismos datos)
```

## Probar con un amigo (túnel a internet)
1. Levantá el server: `npm run dev`
2. En otra terminal, abrí el túnel:
   ```bash
   npm run tunnel
   ```
   Usa **cloudflared** (sin cuenta) y cae a **ngrok** si no está. Imprime una URL
   `https://...`.
3. En el cliente (`../web/.env.local`) seteá esa URL:
   ```
   VITE_SERVER_URL=https://xxxx.trycloudflare.com
   ```
4. Reiniciá el cliente (`cd ../web && npm run dev`). Vos y tu amigo entran por la
   web del cliente; ambos pegan al servidor de tu PC.

> Instalá un túnel si no tenés:
> cloudflared — https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
> ngrok — https://ngrok.com/download

## Tooling de prueba
```bash
npx tsx scripts/smoketest.ts        # valida join + snapshot + admin (server arriba)
npx tsx scripts/bot.ts Nombre 1     # bot que deambula en una zona (para ver la consola)
npm run sync:tilemap                # re-sincroniza el mapa desde web/ (fuente única)
```

## Cómo está organizado
```
src/
  index.ts           arranque: http + socket.io + loops (tick/snapshot/admin)
  config.ts          puerto, token, tick rates
  world/
    World.ts         zonas + jugadores + tick + resolución de combate
    Zone.ts          IA de enemigos por zona (apunta al jugador más cercano), items
    Player.ts        estado autoritativo del jugador
    combat.ts        cálculo de daño (armadura, escudo, multiplicadores)
    Duels.ts         matchmaking 1v1 + instancias de duelo
  net/
    protocol.ts      contrato cliente↔servidor (espejo en web/src/lib/protocol.ts)
    gameNamespace.ts handlers del juego (/game)
    adminNamespace.ts consola (/admin), con token
  admin/
    metrics.ts       arma las métricas para la consola
    tui.ts           consola de terminal
  shared/
    tilemap.ts       ESPEJO de web/src/engine/tilemap.ts (no editar; npm run sync:tilemap)
    gameData.ts      carga CLASSES/SPELLS/ITEMS desde web/public/data
public/admin/        dashboard web (HTML/JS)
```

## Notas
- **Fuente única del mapa**: `tilemap.ts` vive en el cliente; el server usa un
  espejo generado. Si editás el mapa, corré `npm run sync:tilemap`.
- **Movimiento**: el cliente reporta su tile y el server lo valida (anti-teleport
  básico). Enemigos, combate, items y muerte son 100% del server.
- **Deploy del cliente** (Vercel): seteá `VITE_SERVER_URL` en las env vars de
  Vercel apuntando al túnel/host del server, o el cliente intentará localhost.
