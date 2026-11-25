import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RoomPlayer {
  ws: WebSocket;
  slot: 'p1' | 'p2';
  fighterId: string;
  ready: boolean;
}

interface VersusRoom {
  code: string;
  players: Map<'p1' | 'p2', RoomPlayer>;
  createdAt: number;
}

const rooms = new Map<string, VersusRoom>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoomState(room: VersusRoom): void {
  const p1 = room.players.get('p1');
  const p2 = room.players.get('p2');
  const statePayload = {
    type: 'room:state',
    code: room.code,
    p1: p1 ? { fighterId: p1.fighterId, ready: p1.ready } : null,
    p2: p2 ? { fighterId: p2.fighterId, ready: p2.ready } : null,
  };
  for (const player of room.players.values()) {
    sendJson(player.ws, statePayload);
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      pathname = '/';
    }
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', (ws) => {
    let activeRoom: VersusRoom | null = null;
    let activeSlot: 'p1' | 'p2' | null = null;

    const leaveCurrentRoom = () => {
      if (!activeRoom || !activeSlot) return;
      activeRoom.players.delete(activeSlot);
      if (activeRoom.players.size === 0) {
        rooms.delete(activeRoom.code);
      } else {
        for (const peer of activeRoom.players.values()) {
          sendJson(peer.ws, { type: 'room:peer_left', slot: activeSlot });
        }
        broadcastRoomState(activeRoom);
      }
      activeRoom = null;
      activeSlot = null;
    };

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = String(msg.type || '');

      if (type === 'room:create') {
        leaveCurrentRoom();
        const code = generateRoomCode();
        const fighterId = String(msg.fighterId || 'india-vikram');
        const room: VersusRoom = {
          code,
          players: new Map(),
          createdAt: Date.now(),
        };
        room.players.set('p1', { ws, slot: 'p1', fighterId, ready: false });
        rooms.set(code, room);
        activeRoom = room;
        activeSlot = 'p1';
        sendJson(ws, { type: 'room:joined', code, slot: 'p1' });
        broadcastRoomState(room);
        return;
      }

      if (type === 'room:join') {
        const code = String(msg.code || '').trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          sendJson(ws, { type: 'room:error', message: `Room ${code} not found.` });
          return;
        }
        if (room.players.has('p2')) {
          sendJson(ws, { type: 'room:error', message: `Room ${code} is already full.` });
          return;
        }
        leaveCurrentRoom();
        const fighterId = String(msg.fighterId || 'china-zhao');
        room.players.set('p2', { ws, slot: 'p2', fighterId, ready: false });
        activeRoom = room;
        activeSlot = 'p2';
        sendJson(ws, { type: 'room:joined', code, slot: 'p2' });
        broadcastRoomState(room);
        return;
      }

      if (type === 'room:leave') {
        leaveCurrentRoom();
        return;
      }

      if (type === 'ping:req') {
        sendJson(ws, { type: 'ping:res', clientTs: msg.clientTs });
        return;
      }

      if (!activeRoom || !activeSlot) return;

      if (type === 'room:update_player') {
        const player = activeRoom.players.get(activeSlot);
        if (!player) return;
        if (typeof msg.fighterId === 'string') player.fighterId = msg.fighterId;
        if (typeof msg.ready === 'boolean') player.ready = msg.ready;
        broadcastRoomState(activeRoom);

        const p1 = activeRoom.players.get('p1');
        const p2 = activeRoom.players.get('p2');
        if (p1 && p2 && p1.ready && p2.ready) {
          const startMsg = {
            type: 'room:match_start',
            p1FighterId: p1.fighterId,
            p2FighterId: p2.fighterId,
          };
          sendJson(p1.ws, startMsg);
          sendJson(p2.ws, startMsg);
        }
        return;
      }

      if (
        type === 'combat:input' ||
        type === 'combat:state' ||
        type === 'combat:rematch' ||
        type === 'combat:taunt' ||
        type === 'rtc:signal'
      ) {
        const targetSlot: 'p1' | 'p2' = activeSlot === 'p1' ? 'p2' : 'p1';
        const peer = activeRoom.players.get(targetSlot);
        if (peer) {
          sendJson(peer.ws, { ...msg, fromSlot: activeSlot });
        }
      }
    });

    ws.on('close', () => {
      leaveCurrentRoom();
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Iron Titan 8 server listening on port ${PORT}`);
  });
}

startServer();
