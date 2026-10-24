// © ONOKO-CRÉATIONS — Tous droits réservés.
import type { MinkebeGame, NetAnimalState, NetHit, RemotePlayerInfo } from "./engine";
import { VoiceChat, type IncomingSignal, type VoiceStatus } from "./voice";

// =========================================================
// CLIENT RESEAU : synchronisation periodique avec le salon
// (une requete par tick : mon etat -> etats des autres)
// =========================================================

export interface ChatMessage {
  id: number;
  playerId: string;
  name: string;
  text: string;
  at: string;
}

export interface RoomSession {
  code: string;
  playerId: string;
  worldSeed: number;
  huntingEnabled: boolean;
  collectedIds: number[];
  isHost: boolean;
}

export interface NetStatus {
  connected: boolean;
  isHost: boolean;
  playerCount: number;
  players: { playerId: string; name: string; character: string; health: number; dead: boolean; voiceEnabled: boolean; voiceSpeaking: boolean }[];
  latencyMs: number;
  error: string | null;
}

interface SyncResponse {
  isHost: boolean;
  hostPlayerId: string;
  players: RemotePlayerInfo[];
  playerCount: number;
  collectedIds: number[];
  animals: NetAnimalState[] | null;
  dayTime: number | null;
  pendingHits: NetHit[];
  messages: ChatMessage[];
  signals?: IncomingSignal[];
  huntingEnabled: boolean;
  error?: string;
}

const TICK_MS = 200;

export class NetClient {
  private timer = 0;
  private inFlight = false;
  private lastMessageId = 0;
  private pendingChat: string[] = [];
  private failures = 0;
  private stopped = false;
  readonly voice: VoiceChat;

  constructor(
    private session: RoomSession,
    private engine: MinkebeGame,
    private onStatus: (status: NetStatus) => void,
    private onMessages: (messages: ChatMessage[]) => void,
    onVoiceStatus: (status: VoiceStatus) => void = () => undefined
  ) {
    this.voice = new VoiceChat(session.playerId, onVoiceStatus);
  }

  start(): void {
    this.stopped = false;
    this.engine.setNetRole(this.session.isHost ? "host" : "client");
    this.engine.applySharedCollected(this.session.collectedIds);
    this.schedule(50);
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.timer);
    this.voice.dispose();
    this.engine.setNetRole("solo");
    void fetch(`/api/rooms/${this.session.code}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: this.session.playerId }),
      keepalive: true,
    }).catch(() => undefined);
  }

  sendChat(text: string): void {
    const t = text.trim();
    if (t) this.pendingChat.push(t.slice(0, 200));
  }

  get code(): string {
    return this.session.code;
  }

  get playerId(): string {
    return this.session.playerId;
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    this.timer = window.setTimeout(() => void this.tick(), ms);
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.inFlight) {
      this.schedule(TICK_MS);
      return;
    }
    this.inFlight = true;
    const started = performance.now();
    try {
      const payload: Record<string, unknown> = {
        playerId: this.session.playerId,
        state: this.engine.getNetState(),
        collected: this.engine.drainCollected(),
        hits: this.engine.drainHits(),
        sinceMessageId: this.lastMessageId,
      };
      if (this.session.isHost) payload.host = this.engine.getHostAnimalState();
      if (this.pendingChat.length > 0) payload.chat = this.pendingChat.shift();
      const signals = this.voice.drainSignals();
      if (signals.length > 0) payload.signals = signals;
      payload.voice = this.voice.getState();

      const res = await fetch(`/api/rooms/${this.session.code}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as SyncResponse;
      if (!res.ok) throw new Error(data.error ?? "Erreur de synchronisation");

      if (data.isHost !== this.session.isHost) {
        this.session.isHost = data.isHost;
        this.engine.setNetRole(data.isHost ? "host" : "client");
      }
      this.engine.applyRemotePlayers(data.players);
      this.engine.applySharedCollected(data.collectedIds);
      if (data.isHost) {
        if (data.pendingHits.length > 0) this.engine.applyPendingHits(data.pendingHits);
      } else {
        this.engine.applyNetAnimals(data.animals, data.dayTime);
      }
      if (data.messages.length > 0) {
        this.lastMessageId = data.messages[data.messages.length - 1].id;
        this.onMessages(data.messages);
      }
      // Chat vocal : pairs présents, signaux reçus, positions pour le volume spatial
      this.voice.syncPeers(data.players.map((p) => p.playerId));
      if (data.signals && data.signals.length > 0) void this.voice.handleSignals(data.signals);
      const me = this.engine.getNetState();
      this.voice.updatePositions({ x: me.x, z: me.z }, data.players.map((p) => ({ playerId: p.playerId, x: p.state.x, z: p.state.z })));
      this.failures = 0;
      this.onStatus({
        connected: true,
        isHost: data.isHost,
        playerCount: data.playerCount,
        players: data.players.map((p) => ({
          playerId: p.playerId,
          name: p.name,
          character: p.character,
          health: p.state.health,
          dead: p.state.dead,
          voiceEnabled: Boolean(p.state.voice?.enabled),
          voiceSpeaking: Boolean(p.state.voice?.speaking),
        })),
        latencyMs: Math.round(performance.now() - started),
        error: null,
      });
    } catch (error) {
      this.failures += 1;
      this.onStatus({
        connected: this.failures < 5,
        isHost: this.session.isHost,
        playerCount: 0,
        players: [],
        latencyMs: 0,
        error: error instanceof Error ? error.message : "Connexion perdue",
      });
    } finally {
      this.inFlight = false;
      this.schedule(this.failures > 0 ? Math.min(3000, TICK_MS * (1 + this.failures)) : TICK_MS);
    }
  }
}

export async function createRoom(name: string, character: string, huntingEnabled: boolean): Promise<RoomSession> {
  const res = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, character, huntingEnabled }),
  });
  const data = (await res.json()) as RoomSession & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Création impossible");
  return data;
}

export async function joinRoom(code: string, name: string, character: string): Promise<RoomSession> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, character }),
  });
  const data = (await res.json()) as RoomSession & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Connexion impossible");
  return data;
}
