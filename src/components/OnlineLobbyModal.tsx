import React, { useEffect, useState } from 'react';
import { Wifi, X } from 'lucide-react';
import { FIGHTERS } from '../data/fighters';
import { versusClient, type RoomStatePayload } from '../network/versusClient';

interface OnlineLobbyModalProps {
  selectedFighterId: string;
  onStartOnlineMatch: (
    roomCode: string,
    role: 'p1' | 'p2',
    p1FighterId: string,
    p2FighterId: string
  ) => void;
  onClose: () => void;
}

export const OnlineLobbyModal: React.FC<OnlineLobbyModalProps> = ({
  selectedFighterId,
  onStartOnlineMatch,
  onClose,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [mySlot, setMySlot] = useState<'p1' | 'p2' | null>(null);
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
  const [ready, setReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    versusClient.setCallbacks({
      onRoomJoined: (code, slot) => {
        setRoomCode(code);
        setMySlot(slot);
        setReady(false);
        setErrorMsg(null);
      },
      onRoomState: (state) => {
        setRoomState(state);
      },
      onMatchStart: (p1Id, p2Id) => {
        if (roomCode && mySlot) {
          onStartOnlineMatch(roomCode, mySlot, p1Id, p2Id);
        }
      },
      onPeerLeft: () => {
        setReady(false);
        setErrorMsg('Opponent left the room.');
      },
      onError: (msg) => {
        setErrorMsg(msg);
      },
    });
  }, [mySlot, onStartOnlineMatch, roomCode]);

  const handleCreate = () => {
    setErrorMsg(null);
    versusClient.createRoom(selectedFighterId);
  };

  const handleJoin = () => {
    if (joinCode.trim().length < 4) {
      setErrorMsg('Enter a 4-character room code.');
      return;
    }
    setErrorMsg(null);
    versusClient.joinRoom(joinCode.trim().toUpperCase(), selectedFighterId);
  };

  const handleToggleReady = () => {
    const next = !ready;
    setReady(next);
    versusClient.updatePlayer(selectedFighterId, next);
  };

  const handleClose = () => {
    versusClient.leaveRoom();
    onClose();
  };

  const p1Fighter = FIGHTERS.find((f) => f.id === roomState?.p1?.fighterId);
  const p2Fighter = FIGHTERS.find((f) => f.id === roomState?.p2?.fighterId);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-[320px] rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-sky-400" />
            <h2 className="font-display text-2xl font-extrabold text-white">
              LOCAL / WI-FI VERSUS
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close Online Lobby"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        {!roomCode ? (
          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={handleCreate}
              className="min-h-[48px] w-full rounded-xl bg-amber-500 font-display text-lg font-extrabold text-slate-950"
            >
              CREATE ROOM CODE
            </button>

            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={4}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="CODE"
                className="h-12 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-center font-mono-tabular text-lg font-bold tracking-widest text-white uppercase"
              />
              <button
                type="button"
                onClick={handleJoin}
                className="min-h-[48px] rounded-xl border border-sky-400/60 bg-sky-500/20 px-4 text-xs font-extrabold text-sky-300"
              >
                JOIN
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
              <div className="text-[10px] font-bold text-slate-400">SHARE ROOM CODE</div>
              <div className="mt-0.5 font-mono-tabular text-3xl font-extrabold tracking-widest text-amber-400">
                {roomCode}
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                You are {mySlot === 'p1' ? 'Player 1 (Host)' : 'Player 2 (Guest)'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2">
                <div className="text-[10px] text-amber-400 font-bold">P1 HOST</div>
                <div className="mt-0.5 truncate font-bold text-white">
                  {p1Fighter ? p1Fighter.name : 'Waiting...'}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  {roomState?.p1?.ready ? 'READY' : 'Selecting'}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2">
                <div className="text-[10px] text-rose-400 font-bold">P2 GUEST</div>
                <div className="mt-0.5 truncate font-bold text-white">
                  {p2Fighter ? p2Fighter.name : 'Waiting...'}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  {roomState?.p2 ? (roomState.p2.ready ? 'READY' : 'Selecting') : 'Open Slot'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleReady}
              disabled={!roomState?.p1 || !roomState?.p2}
              className={`min-h-[48px] w-full rounded-xl font-display text-lg font-extrabold ${
                !roomState?.p1 || !roomState?.p2
                  ? 'bg-slate-800 text-slate-500'
                  : ready
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-amber-500 text-slate-950'
              }`}
            >
              {!roomState?.p1 || !roomState?.p2
                ? 'WAITING FOR OPPONENT...'
                : ready
                ? 'READY · WAITING FOR PEER'
                : 'TAP READY TO FIGHT'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
