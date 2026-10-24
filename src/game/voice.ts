// © ONOKO-CRÉATIONS — Tous droits réservés.

// =========================================================
// DISCUSSION VOCALE
//  - VoiceChat : chat vocal WebRTC en maillage (jusqu'a 8 joueurs),
//    signalisation via /api/rooms/[code]/sync, detection de parole,
//    push-to-talk ou voix libre, volume spatialise par distance
//  - speak() : synthese vocale (lecture des messages et alertes)
//  - VoiceDictation : reconnaissance vocale pour dicter un message
// =========================================================

export interface VoiceSignal {
  to: string;
  kind: "offer" | "answer" | "ice";
  payload: Record<string, unknown>;
}

export interface IncomingSignal {
  id: number;
  from: string;
  kind: string;
  payload: Record<string, unknown>;
}

export interface VoicePeerStatus {
  playerId: string;
  connected: boolean;
  speaking: boolean;
  muted: boolean;
}

export interface VoiceStatus {
  enabled: boolean;
  micError: string | null;
  speaking: boolean;
  pushToTalk: boolean;
  talking: boolean; // touche PTT enfoncée
  peers: VoicePeerStatus[];
}

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  gain: GainNode | null;
  analyser: AnalyserNode | null;
  connected: boolean;
  speaking: boolean;
  muted: boolean;
  makingOffer: boolean;
  polite: boolean;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

export class VoiceChat {
  private peers = new Map<string, Peer>();
  private outbox: VoiceSignal[] = [];
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micData: Uint8Array<ArrayBuffer> | null = null;
  private enabled = false;
  private micError: string | null = null;
  private pushToTalk = false;
  private talking = false;
  private speaking = false;
  private meterTimer = 0;
  private positions = new Map<string, { x: number; z: number }>();
  private myPos = { x: 0, z: 0 };
  private spatial = true;

  constructor(
    private myId: string,
    private onStatus: (status: VoiceStatus) => void
  ) {}

  // ---------- Micro ----------

  async enable(): Promise<boolean> {
    if (this.enabled) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (error) {
      this.micError = error instanceof Error && error.name === "NotAllowedError" ? "Micro refusé par le navigateur." : "Micro indisponible.";
      this.emit();
      return false;
    }
    this.micError = null;
    this.enabled = true;
    this.ensureContext();
    if (this.ctx && this.stream) {
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.micAnalyser = this.ctx.createAnalyser();
      this.micAnalyser.fftSize = 512;
      this.micData = new Uint8Array(this.micAnalyser.frequencyBinCount);
      src.connect(this.micAnalyser);
    }
    this.applyTrackState();
    // Ajoute la piste aux connexions existantes
    for (const peer of this.peers.values()) {
      for (const track of this.stream.getAudioTracks()) peer.pc.addTrack(track, this.stream);
    }
    this.startMeter();
    this.emit();
    return true;
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.micAnalyser = null;
    this.speaking = false;
    this.emit();
  }

  setPushToTalk(ptt: boolean): void {
    this.pushToTalk = ptt;
    this.applyTrackState();
    this.emit();
  }

  setTalking(talking: boolean): void {
    if (this.talking === talking) return;
    this.talking = talking;
    this.applyTrackState();
    this.emit();
  }

  setSpatial(spatial: boolean): void {
    this.spatial = spatial;
  }

  setMuted(playerId: string, muted: boolean): void {
    const peer = this.peers.get(playerId);
    if (!peer) return;
    peer.muted = muted;
    peer.audio.muted = muted;
    this.emit();
  }

  private applyTrackState(): void {
    const live = this.enabled && (!this.pushToTalk || this.talking);
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = live));
  }

  private ensureContext(): void {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    } catch {
      this.ctx = null;
    }
  }

  // ---------- Positions (volume selon la distance) ----------

  updatePositions(me: { x: number; z: number }, others: { playerId: string; x: number; z: number }[]): void {
    this.myPos = me;
    for (const o of others) this.positions.set(o.playerId, { x: o.x, z: o.z });
  }

  private startMeter(): void {
    window.clearInterval(this.meterTimer);
    this.meterTimer = window.setInterval(() => {
      // Mon niveau
      let mySpeaking = false;
      if (this.micAnalyser && this.micData && this.enabled && (!this.pushToTalk || this.talking)) {
        this.micAnalyser.getByteFrequencyData(this.micData);
        let sum = 0;
        for (let i = 0; i < this.micData.length; i++) sum += this.micData[i];
        mySpeaking = sum / this.micData.length > 18;
      }
      let changed = mySpeaking !== this.speaking;
      this.speaking = mySpeaking;

      // Niveaux et volume spatial des autres
      for (const [id, peer] of this.peers) {
        let speaking = false;
        if (peer.analyser) {
          const data = new Uint8Array(peer.analyser.frequencyBinCount);
          peer.analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          speaking = sum / data.length > 14;
        }
        if (speaking !== peer.speaking) changed = true;
        peer.speaking = speaking;
        if (peer.gain) {
          const p = this.positions.get(id);
          let vol = 1;
          if (this.spatial && p) {
            const d = Math.hypot(p.x - this.myPos.x, p.z - this.myPos.z);
            vol = d < 8 ? 1 : Math.max(0.15, 1 - (d - 8) / 50);
          }
          peer.gain.gain.setTargetAtTime(peer.muted ? 0 : vol, this.ctx?.currentTime ?? 0, 0.2);
        }
      }
      if (changed) this.emit();
    }, 150);
  }

  // ---------- Connexions ----------

  /** Appelé à chaque synchronisation avec la liste des joueurs présents. */
  syncPeers(playerIds: string[]): void {
    const set = new Set(playerIds);
    for (const id of Array.from(this.peers.keys())) {
      if (!set.has(id)) this.closePeer(id);
    }
    for (const id of playerIds) {
      if (id === this.myId || this.peers.has(id)) continue;
      // Celui dont l'identifiant est le plus petit initie l'offre ("impolite")
      const polite = this.myId > id;
      const peer = this.createPeer(id, polite);
      if (!polite) void this.makeOffer(id, peer);
    }
  }

  private createPeer(id: string, polite: boolean): Peer {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    const peer: Peer = { pc, audio, gain: null, analyser: null, connected: false, speaking: false, muted: false, makingOffer: false, polite };
    this.peers.set(id, peer);

    if (this.stream) {
      for (const track of this.stream.getAudioTracks()) pc.addTrack(track, this.stream);
    } else {
      // Réception seule tant que le micro n'est pas activé
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) this.outbox.push({ to: id, kind: "ice", payload: e.candidate.toJSON() as Record<string, unknown> });
    };
    pc.onnegotiationneeded = () => void this.makeOffer(id, peer);
    pc.onconnectionstatechange = () => {
      peer.connected = pc.connectionState === "connected";
      if (pc.connectionState === "failed") {
        this.closePeer(id);
      }
      this.emit();
    };
    pc.ontrack = (e) => {
      const [remote] = e.streams;
      if (!remote) return;
      // L'élément audio garde le flux "vivant" ; le son est routé via WebAudio pour le volume
      audio.srcObject = remote;
      audio.muted = true;
      this.ensureContext();
      if (this.ctx) {
        void this.ctx.resume();
        const src = this.ctx.createMediaStreamSource(remote);
        const gain = this.ctx.createGain();
        const analyser = this.ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        src.connect(gain).connect(this.ctx.destination);
        peer.gain = gain;
        peer.analyser = analyser;
      } else {
        audio.muted = false;
      }
      void audio.play().catch(() => undefined);
    };
    return peer;
  }

  private async makeOffer(id: string, peer: Peer): Promise<void> {
    try {
      peer.makingOffer = true;
      await peer.pc.setLocalDescription();
      const desc = peer.pc.localDescription;
      if (desc) this.outbox.push({ to: id, kind: "offer", payload: { type: desc.type, sdp: desc.sdp } });
    } catch {
      // ignoré
    } finally {
      peer.makingOffer = false;
    }
  }

  async handleSignals(signals: IncomingSignal[]): Promise<void> {
    for (const sg of signals) {
      let peer = this.peers.get(sg.from);
      if (!peer) peer = this.createPeer(sg.from, this.myId > sg.from);
      const pc = peer.pc;
      try {
        if (sg.kind === "offer" || sg.kind === "answer") {
          const desc = sg.payload as unknown as RTCSessionDescriptionInit;
          const offerCollision = desc.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
          if (offerCollision && !peer.polite) continue; // l'impoli ignore l'offre concurrente
          await pc.setRemoteDescription(desc);
          if (desc.type === "offer") {
            await pc.setLocalDescription();
            const local = pc.localDescription;
            if (local) this.outbox.push({ to: sg.from, kind: "answer", payload: { type: local.type, sdp: local.sdp } });
          }
        } else if (sg.kind === "ice") {
          try {
            await pc.addIceCandidate(sg.payload as unknown as RTCIceCandidateInit);
          } catch {
            // candidat arrivé trop tôt / connexion fermée
          }
        }
      } catch {
        // signal invalide : ignoré
      }
    }
  }

  drainSignals(): VoiceSignal[] {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }

  getState(): { enabled: boolean; speaking: boolean } {
    return { enabled: this.enabled, speaking: this.speaking };
  }

  private closePeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.close();
    peer.audio.srcObject = null;
    this.peers.delete(id);
  }

  dispose(): void {
    window.clearInterval(this.meterTimer);
    for (const id of Array.from(this.peers.keys())) this.closePeer(id);
    this.disable();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  private emit(): void {
    this.onStatus({
      enabled: this.enabled,
      micError: this.micError,
      speaking: this.speaking,
      pushToTalk: this.pushToTalk,
      talking: this.talking,
      peers: Array.from(this.peers.entries()).map(([playerId, p]) => ({ playerId, connected: p.connected, speaking: p.speaking, muted: p.muted })),
    });
  }
}

// ---------------------------------------------------------
// Synthèse vocale (lecture des messages et alertes)
// ---------------------------------------------------------

let frenchVoice: SpeechSynthesisVoice | null | undefined;

function pickFrenchVoice(): SpeechSynthesisVoice | null {
  if (frenchVoice !== undefined) return frenchVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  frenchVoice = voices.find((v) => v.lang.toLowerCase().startsWith("fr") && /google|natural|premium/i.test(v.name)) ?? voices.find((v) => v.lang.toLowerCase().startsWith("fr")) ?? null;
  return frenchVoice;
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, options: { rate?: number; pitch?: number; interrupt?: boolean } = {}): void {
  if (!canSpeak() || !text.trim()) return;
  const synth = window.speechSynthesis;
  if (options.interrupt) synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "fr-FR";
  utter.rate = options.rate ?? 1.05;
  utter.pitch = options.pitch ?? 1;
  const voice = pickFrenchVoice();
  if (voice) utter.voice = voice;
  synth.speak(utter);
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    frenchVoice = undefined;
  };
}

// ---------------------------------------------------------
// Dictée vocale (Web Speech API)
// ---------------------------------------------------------

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export function canDictate(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export class VoiceDictation {
  private rec: SpeechRecognitionLike | null = null;

  start(onResult: (text: string, final: boolean) => void, onEnd: (error: string | null) => void): boolean {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return false;
    this.stop();
    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (event) => {
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i] as ArrayLike<{ transcript: string }> & { isFinal?: boolean };
        const t = res[0]?.transcript ?? "";
        if (res.isFinal) finalText += t;
        else interim += t;
      }
      onResult((finalText + " " + interim).trim(), false);
    };
    rec.onerror = (e) => onEnd(e.error === "not-allowed" ? "Micro refusé." : e.error === "no-speech" ? "Rien entendu." : e.error);
    rec.onend = () => {
      onResult(finalText.trim(), true);
      onEnd(null);
      this.rec = null;
    };
    try {
      rec.start();
    } catch {
      return false;
    }
    this.rec = rec;
    return true;
  }

  stop(): void {
    try {
      this.rec?.stop();
    } catch {
      // ignoré
    }
    this.rec = null;
  }
}
