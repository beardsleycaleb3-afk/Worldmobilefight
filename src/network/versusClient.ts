import type { RemoteCombatSnapshot, TouchControlState } from '../engine/combatTypes';

export interface RoomStatePayload {
  code: string;
  p1: { fighterId: string; ready: boolean } | null;
  p2: { fighterId: string; ready: boolean } | null;
}

export interface VersusClientCallbacks {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onRoomJoined?: (code: string, slot: 'p1' | 'p2') => void;
  onRoomState?: (state: RoomStatePayload) => void;
  onMatchStart?: (p1FighterId: string, p2FighterId: string) => void;
  onPeerLeft?: () => void;
  onError?: (message: string) => void;
  onRemoteInput?: (input: TouchControlState) => void;
  onRemoteState?: (snapshot: RemoteCombatSnapshot) => void;
  onRemoteTaunt?: (text: string, fromSlot: 'p1' | 'p2') => void;
  onPingUpdate?: (ms: number) => void;
  onRematch?: () => void;
}

class VersusSocketClient {
  private ws: WebSocket | null = null;
  private callbacks: VersusClientCallbacks = {};
  private pingInterval: number | null = null;

  public setCallbacks(cb: VersusClientCallbacks): void {
    this.callbacks = cb;
  }

  public connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.callbacks.onConnected?.();
        this.startPingLoop();
      };

      ws.onclose = () => {
        this.stopPingLoop();
        this.ws = null;
        this.callbacks.onDisconnected?.();
      };

      ws.onerror = () => {
        this.callbacks.onError?.('Connection error reaching Versus server.');
      };

      ws.onmessage = (evt) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(evt.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = String(msg.type || '');

        if (type === 'ping:res') {
          const sent = Number(msg.clientTs || 0);
          if (sent > 0) {
            const rtt = Math.max(1, Math.round(performance.now() - sent));
            this.callbacks.onPingUpdate?.(rtt);
          }
          return;
        }

        if (type === 'room:joined') {
          this.callbacks.onRoomJoined?.(String(msg.code), msg.slot as 'p1' | 'p2');
        } else if (type === 'room:state') {
          this.callbacks.onRoomState?.({
            code: String(msg.code),
            p1: (msg.p1 as RoomStatePayload['p1']) || null,
            p2: (msg.p2 as RoomStatePayload['p2']) || null,
          });
        } else if (type === 'room:match_start') {
          this.callbacks.onMatchStart?.(String(msg.p1FighterId), String(msg.p2FighterId));
        } else if (type === 'room:peer_left') {
          this.callbacks.onPeerLeft?.();
        } else if (type === 'room:error') {
          this.callbacks.onError?.(String(msg.message || 'Room error'));
        } else if (type === 'combat:input') {
          this.callbacks.onRemoteInput?.(msg.input as TouchControlState);
        } else if (type === 'combat:state') {
          this.callbacks.onRemoteState?.(msg.snapshot as RemoteCombatSnapshot);
        } else if (type === 'combat:taunt') {
          this.callbacks.onRemoteTaunt?.(
            String(msg.text || 'READY!'),
            (msg.fromSlot as 'p1' | 'p2') || 'p2'
          );
        } else if (type === 'combat:rematch') {
          this.callbacks.onRematch?.();
        }
      };
    } catch {
      this.callbacks.onError?.('WebSocket unavailable.');
    }
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    const sendPing = () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping:req', clientTs: performance.now() });
      }
    };
    sendPing();
    this.pingInterval = window.setInterval(sendPing, 2500);
  }

  private stopPingLoop(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public disconnect(): void {
    this.stopPingLoop();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private send(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public createRoom(fighterId: string): void {
    this.connect();
    const waitAndSend = () => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'room:create', fighterId });
      } else {
        setTimeout(waitAndSend, 80);
      }
    };
    waitAndSend();
  }

  public joinRoom(code: string, fighterId: string): void {
    this.connect();
    const waitAndSend = () => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'room:join', code, fighterId });
      } else {
        setTimeout(waitAndSend, 80);
      }
    };
    waitAndSend();
  }

  public leaveRoom(): void {
    this.send({ type: 'room:leave' });
  }

  public updatePlayer(fighterId: string, ready: boolean): void {
    this.send({ type: 'room:update_player', fighterId, ready });
  }

  public sendCombatInput(input: TouchControlState): void {
    this.send({ type: 'combat:input', input });
  }

  public sendCombatState(snapshot: RemoteCombatSnapshot): void {
    this.send({ type: 'combat:state', snapshot });
  }

  public sendTaunt(text: string): void {
    this.send({ type: 'combat:taunt', text });
  }

  public sendRematch(): void {
    this.send({ type: 'combat:rematch' });
  }
}

export const versusClient = new VersusSocketClient();
