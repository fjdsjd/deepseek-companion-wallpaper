// One reusable HTML audio player. All clips are packaged files; no TTS or service
// runs in the wallpaper. The current bubble is the only playback queue entry.
export class DialogueVoice {
  constructor(manifest, { createAudio = () => new Audio(), now = () => performance.now() } = {}) {
    this.clips = manifest.clips;
    this.createAudio = createAudio;
    this.now = now;
    this.audio = null;
    this.key = null;
    this.paused = false;
    this.pending = false;
    this.active = false;
    this.status = 'idle';
    this.tailUntil = 0;
    this.generation = 0;
    this.attempt = 0;
    this.starts = 0;
  }
  get suppressLoopback() {
    return this.active || this.now() < this.tailUntil;
  }
  get snapshot() {
    return {
      status: this.status,
      active: this.active,
      paused: this.paused,
      pending: this.pending,
      starts: this.starts,
      key: this.key,
      time: this.audio?.currentTime || 0,
      volume: this.audio?.volume || 0,
      source: this.audio?.getAttribute('src') || '',
      suppressLoopback: this.suppressLoopback,
    };
  }
  stop(status = 'idle') {
    this.generation++;
    if (this.active) this.tailUntil = this.now() + 650;
    this.active = false;
    this.pending = false;
    this.key = null;
    this.status = status;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
  }
  sync(item, { voiceEnabled = true, voiceVolume = 55 } = {}) {
    const clip = item.visible && this.clips[item.text];
    if (!voiceEnabled || voiceVolume <= 0 || !clip) {
      if (this.key) this.stop();
      return;
    }
    const key = `${item.context}:${item.serial}:${item.text}`;
    if (this.audio) this.audio.volume = Math.max(0, Math.min(1, voiceVolume / 100));
    if (key === this.key) return;
    this.stop();
    this.key = key;
    if (!this.audio) {
      this.audio = this.createAudio();
      this.audio.preload = 'none';
    }
    const generation = this.generation;
    this.audio.onended = () => {
      if (generation !== this.generation) return;
      this.active = false;
      this.pending = false;
      this.tailUntil = this.now() + 650;
      this.status = 'ended';
    };
    this.audio.onerror = () => {
      if (generation !== this.generation) return;
      this.active = false;
      this.pending = false;
      this.tailUntil = this.now() + 650;
      this.status = 'unavailable';
    };
    this.audio.volume = Math.max(0, Math.min(1, voiceVolume / 100));
    this.audio.src = clip.file;
    this.pending = true;
    if (!this.paused) this.play();
  }
  play() {
    if (!this.audio || !this.key || this.paused || !this.pending) return;
    const generation = this.generation;
    const attempt = ++this.attempt;
    this.active = true;
    this.pending = false;
    this.status = 'starting';
    try {
      Promise.resolve(this.audio.play())
        .then(() => {
          if (generation !== this.generation || attempt !== this.attempt || this.paused) return;
          this.status = 'playing';
          this.starts++;
        })
        .catch((error) => {
          if (generation !== this.generation || attempt !== this.attempt || this.paused) return;
          this.active = false;
          this.pending = error?.name === 'NotAllowedError';
          this.status = this.pending ? 'awaiting-gesture' : 'unavailable';
        });
    } catch {
      this.active = false;
      this.status = 'unavailable';
    }
  }
  unlock() {
    if (this.status === 'awaiting-gesture') this.play();
  }
  setPaused(paused) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) this.attempt++;
    if (paused && this.active) {
      this.audio.pause();
      this.active = false;
      this.pending = true;
      this.status = 'paused';
      this.tailUntil = this.now() + 650;
    } else if (!paused && this.pending) this.play();
  }
}
