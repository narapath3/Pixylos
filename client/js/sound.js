// PixelWorld - Sound Manager (Web Audio API Synthesized Sounds)
const SoundManager = {
    ctx: null,
    enabled: true,
    masterVolume: 0.35,
    cooldowns: {},

    // Lazy-init AudioContext on first user interaction
    _ensureContext() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx;
    },

    // Cooldown check to prevent audio spam
    _canPlay(name, cooldownMs = 50) {
        const now = performance.now();
        if (this.cooldowns[name] && now - this.cooldowns[name] < cooldownMs) return false;
        this.cooldowns[name] = now;
        return true;
    },

    // Create a gain node with envelope
    _createGain(volume = 1, attack = 0.005, decay = 0.1) {
        const ctx = this.ctx;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(volume * this.masterVolume, ctx.currentTime + attack);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + attack + decay);
        gain.connect(ctx.destination);
        return { gain, duration: attack + decay };
    },

    // Generate noise buffer for percussive sounds
    _createNoiseBuffer(duration = 0.1) {
        const ctx = this.ctx;
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * duration;
        const buffer = ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    },

    // Play a tone with optional frequency sweep
    _playTone(freq, duration = 0.1, type = 'square', volume = 0.3, freqEnd = null) {
        if (!this.enabled) return;
        const ctx = this._ensureContext();
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (freqEnd !== null) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), ctx.currentTime + duration);
        }
        const { gain } = this._createGain(volume, 0.003, duration);
        osc.connect(gain);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration + 0.05);
    },

    // Play filtered noise burst
    _playNoise(duration = 0.08, freq = 1000, volume = 0.3, type = 'bandpass') {
        if (!this.enabled) return;
        const ctx = this._ensureContext();
        const noise = ctx.createBufferSource();
        noise.buffer = this._createNoiseBuffer(duration + 0.05);
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = freq;
        filter.Q.value = 1;
        const { gain } = this._createGain(volume, 0.003, duration);
        noise.connect(filter);
        filter.connect(gain);
        noise.start(ctx.currentTime);
        noise.stop(ctx.currentTime + duration + 0.05);
    },

    // ─── PUBLIC SOUND EFFECTS ───────────────────────────

    // Punch / Hit a block
    playHit() {
        if (!this._canPlay('hit', 80)) return;
        this._playNoise(0.06, 600, 0.25, 'bandpass');
        this._playTone(150, 0.05, 'square', 0.12);
    },

    // Block fully broken
    playBreak() {
        if (!this._canPlay('break', 100)) return;
        this._playNoise(0.15, 1200, 0.3, 'highpass');
        this._playTone(400, 0.12, 'sawtooth', 0.15, 80);
        // Crumble tail
        setTimeout(() => {
            if (this.ctx) this._playNoise(0.1, 2000, 0.15, 'highpass');
        }, 60);
    },

    // Place a block
    playPlace() {
        if (!this._canPlay('place', 80)) return;
        this._playTone(200, 0.06, 'square', 0.15, 300);
        this._playNoise(0.04, 400, 0.15, 'lowpass');
    },

    // Footstep (walking or sprinting)
    playFootstep(isSprinting = false) {
        if (!this._canPlay('footstep', isSprinting ? 120 : 180)) return;
        const vol = isSprinting ? 0.18 : 0.1;
        const freq = 200 + Math.random() * 100;
        this._playNoise(0.04, freq, vol, 'bandpass');
    },

    // Jump
    playJump() {
        if (!this._canPlay('jump', 200)) return;
        this._playTone(250, 0.12, 'sine', 0.2, 500);
    },

    // Land on ground
    playLand() {
        if (!this._canPlay('land', 150)) return;
        this._playNoise(0.08, 300, 0.2, 'lowpass');
        this._playTone(100, 0.06, 'sine', 0.12, 60);
    },

    // Collect gems
    playGemCollect() {
        if (!this._canPlay('gem', 60)) return;
        this._playTone(800, 0.08, 'sine', 0.2);
        setTimeout(() => {
            if (this.ctx) this._playTone(1200, 0.1, 'sine', 0.18);
        }, 70);
        setTimeout(() => {
            if (this.ctx) this._playTone(1600, 0.12, 'sine', 0.12);
        }, 140);
    },

    // Door open/close
    playDoor() {
        if (!this._canPlay('door', 200)) return;
        this._playTone(300, 0.15, 'triangle', 0.15, 150);
        this._playNoise(0.08, 500, 0.1, 'bandpass');
    },

    // UI click
    playClick() {
        if (!this._canPlay('click', 50)) return;
        this._playTone(1000, 0.03, 'square', 0.1);
    },

    // Toggle mute
    toggleMute() {
        this.enabled = !this.enabled;
        return this.enabled;
    },

    // Set master volume (0.0 - 1.0)
    setVolume(vol) {
        this.masterVolume = Math.max(0, Math.min(1, vol));
    }
};
