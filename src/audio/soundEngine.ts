export type MusicIntensity = 'normal' | 'intense' | 'final';

class CombatSoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private muted = false;
  private sfxVolume = 0.9;
  private musicVolume = 0.55;

  private musicTimer: number | null = null;
  private musicPlaying = false;
  private musicStep = 0;
  private musicIntensity: MusicIntensity = 'normal';

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    this.applyMasterGains();
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyMasterGains();
    return this.muted;
  }

  public setVolumes(sfxVol: number, musicVol: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, sfxVol));
    this.musicVolume = Math.max(0, Math.min(1, musicVol));
    this.applyMasterGains();
  }

  private applyMasterGains(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(this.muted ? 0 : this.sfxVolume, now, 0.02);
    }
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(this.muted ? 0 : this.musicVolume * 0.36, now, 0.04);
    }
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.ctx.destination);
      this.musicGain.connect(this.ctx.destination);
      this.applyMasterGains();
      this.buildNoiseBuffer();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private buildNoiseBuffer(): void {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  private ready(): { ctx: AudioContext; out: GainNode } | null {
    if (this.muted || this.sfxVolume <= 0.01) return null;
    if (!this.ctx) this.unlock();
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return null;
    return { ctx: this.ctx, out: this.sfxGain };
  }

  // Procedural Adaptive Combat Synth Music
  public startMusic(): void {
    this.unlock();
    if (this.musicPlaying) return;
    this.musicPlaying = true;
    this.musicStep = 0;

    const scheduleStep = () => {
      if (!this.musicPlaying) return;
      const stepMs =
        this.musicIntensity === 'final' ? 118 : this.musicIntensity === 'intense' ? 136 : 158;
      this.playMusicBeat();
      this.musicTimer = window.setTimeout(scheduleStep, stepMs);
    };
    scheduleStep();
  }

  public stopMusic(): void {
    this.musicPlaying = false;
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  public setMusicIntensity(intensity: MusicIntensity): void {
    this.musicIntensity = intensity;
  }

  private playMusicBeat(): void {
    if (this.muted || this.musicVolume <= 0.01) return;
    if (!this.ctx || !this.musicGain || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const out = this.musicGain;
    const now = ctx.currentTime;
    const step = this.musicStep % 16;
    this.musicStep += 1;

    // Punchy Kick on 0, 4, 8, 12 (plus syncopated 10 in intense/final)
    if (step % 4 === 0 || (this.musicIntensity !== 'normal' && step === 10)) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(115, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.11);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 0.14);
    }

    // Tight Snare/Clap on 4 & 12
    if ((step === 4 || step === 12) && this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 1800;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      src.connect(hp);
      hp.connect(gain);
      gain.connect(out);
      src.start(now);
      src.stop(now + 0.1);
    }

    // Driving Hi-Hat
    if ((step % 2 === 1 || this.musicIntensity === 'final') && this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5400;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(step % 2 === 1 ? 0.08 : 0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      src.connect(hp);
      hp.connect(gain);
      gain.connect(out);
      src.start(now);
      src.stop(now + 0.04);
    }

    // D-Minor Synth Bass Groove
    const bassPattern = [73.42, 0, 73.42, 87.31, 73.42, 0, 98.0, 87.31, 65.41, 0, 65.41, 73.42, 82.41, 0, 98.0, 110.0];
    const bassFreq = bassPattern[step];
    if (bassFreq > 0) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = this.musicIntensity === 'final' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(bassFreq, now);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(this.musicIntensity === 'normal' ? 420 : 880, now);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 0.13);
    }

    // High Tension Lead Pulse in intense/final
    if (this.musicIntensity !== 'normal' && step % 2 === 0) {
      const leadNotes = [293.66, 349.23, 440, 392, 329.63, 349.23, 440, 523.25];
      const f = leadNotes[(step / 2) % leadNotes.length] * (this.musicIntensity === 'final' ? 1.0 : 0.5);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 0.09);
    }
  }

  public playUiTap(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.045);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playWhoosh(pitch = 1): void {
    const r = this.ready();
    if (!r || !this.noiseBuffer) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420 * pitch, now);
    filter.frequency.exponentialRampToValueAtTime(1100 * pitch, now + 0.06);
    filter.frequency.exponentialRampToValueAtTime(260 * pitch, now + 0.14);
    filter.Q.value = 1.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(now);
    src.stop(now + 0.16);
  }

  public playHitLight(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.11);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.13);

    if (this.noiseBuffer) {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.22, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(out);
      n.start(now);
      n.stop(now + 0.08);
    }
  }

  public playHitHeavy(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(145, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + 0.24);
    subGain.gain.setValueAtTime(0.48, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    sub.connect(subGain);
    subGain.connect(out);
    sub.start(now);
    sub.stop(now + 0.26);

    if (this.noiseBuffer) {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2800, now);
      lp.frequency.exponentialRampToValueAtTime(320, now + 0.16);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.38, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      n.connect(lp);
      lp.connect(ng);
      ng.connect(out);
      n.start(now);
      n.stop(now + 0.18);
    }
  }

  public playBlock(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = 'square';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(340, now);
    osc1.frequency.exponentialRampToValueAtTime(140, now + 0.09);
    osc2.frequency.setValueAtTime(520, now);
    osc2.frequency.exponentialRampToValueAtTime(210, now + 0.09);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(out);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.11);
    osc2.stop(now + 0.11);
  }

  public playGuardBreak(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    [980, 640, 320].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.03);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.4, now + 0.25);
      gain.gain.setValueAtTime(0.18, now + idx * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now + idx * 0.03);
      osc.stop(now + 0.28);
    });
  }

  public playTagSwap(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.14);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playTaunt(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    [440, 587].forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.06);
      gain.gain.setValueAtTime(0.14, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.12);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.13);
    });
  }

  public playFootstep(isRun: boolean): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isRun ? 95 : 72, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.055);
    gain.gain.setValueAtTime(isRun ? 0.11 : 0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playJump(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.12);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playLand(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(92, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.09);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playSpecial(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    const freqs = [110, 220, 330, 440];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(f * 0.7, now);
      osc.frequency.exponentialRampToValueAtTime(f * 1.4, now + 0.22);
      gain.gain.setValueAtTime(0.09 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 0.36);
    });
  }

  public playBell(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    [880, 1318, 1760, 2489].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.18 / (i + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.9);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 0.92);
    });
  }

  public playKO(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    this.playHitHeavy();
    const now = ctx.currentTime + 0.06;
    [220, 330, 440, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.88, now + 1.1);
      gain.gain.setValueAtTime(0.18 / (i + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.15);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 1.2);
    });
    this.playCrowdCheer(0.85);
  }

  public playParry(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    [1046, 1568, 2093].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.12, now + 0.16);
      gain.gain.setValueAtTime(0.16 / (i + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 0.25);
    });
  }

  public playRopeBounce(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.16);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.23);
  }

  public playProjectile(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.24);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  public playCrowdCheer(intensity = 0.55): void {
    const r = this.ready();
    if (!r || !this.noiseBuffer) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(620, now);
    filter.frequency.linearRampToValueAtTime(1150, now + 0.35);
    filter.frequency.linearRampToValueAtTime(700, now + 0.9);
    filter.Q.value = 0.9;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.16 * intensity, now + 0.16);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(now);
    src.stop(now + 0.98);
  }

  public playClinchLock(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.12);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playThrowSlam(): void {
    this.playHitHeavy();
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    const sub = ctx.createOscillator();
    const gain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(105, now);
    sub.frequency.exponentialRampToValueAtTime(34, now + 0.28);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    sub.connect(gain);
    gain.connect(out);
    sub.start(now);
    sub.stop(now + 0.32);
  }

  public playSpringboard(): void {
    this.playRopeBounce();
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.18);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  public playSuddenDeath(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    [330, 440, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.09);
      gain.gain.setValueAtTime(0.14, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.22);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.24);
    });
  }

  public playVictoryFanfare(): void {
    const r = this.ready();
    if (!r) return;
    const { ctx, out } = r;
    const now = ctx.currentTime;
    [440, 554.37, 659.25, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t0 = now + idx * 0.075;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.15, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t0);
      osc.stop(t0 + 0.48);
    });
  }
}

export const soundEngine = new CombatSoundEngine();
