const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const clean = (value) =>
  typeof value === 'string'
    ? value
        .replace(/[\x00-\x1f\x7f]/g, ' ')
        .trim()
        .slice(0, 240)
    : '';
export function mediaProperties(data = {}) {
  return {
    title: clean(data.title),
    artist: clean(data.artist),
    album: clean(data.albumTitle),
    contentType: ['music', 'video', 'image'].includes(data.contentType) ? data.contentType : '',
  };
}
export function playbackState(value, constants = {}) {
  if (typeof value === 'string')
    return ['playing', 'paused', 'stopped', 'closed', 'opened', 'changing'].includes(
      value.toLowerCase(),
    )
      ? value.toLowerCase()
      : 'unknown';
  for (const state of ['playing', 'paused', 'stopped']) {
    const key = state.toUpperCase();
    // Both names occur in host versions/documentation. Never guess enum numbers.
    if (
      value !== undefined &&
      (value === constants['PLAYBACK_' + key] || value === constants.playback?.[key])
    )
      return state;
  }
  return 'unknown';
}
export class SystemMedia {
  constructor() {
    this.version = 0;
    this.clear();
    this.enabled = true;
    this.source = '';
    this.status = 'waiting';
  }
  clear() {
    this.track = mediaProperties();
    this.playback = 'unknown';
    this.position = 0;
    this.duration = 0;
    this.version++;
  }
  properties(data, source = 'Wallpaper Engine') {
    this.track = mediaProperties(data);
    this.position = this.duration = 0;
    this.source = source;
    this.status = this.track.title ? 'ok' : 'none';
    this.version++;
  }
  timeline(data = {}) {
    this.duration = Number.isFinite(data.duration) && data.duration > 0 ? data.duration : 0;
    this.position = Number.isFinite(data.position)
      ? clamp(data.position, 0, this.duration || Infinity)
      : 0;
  }
  hostStatus(enabled) {
    this.enabled = enabled === true;
    if (!this.enabled) {
      this.clear();
      this.status = 'disabled';
    } else this.status = 'waiting';
  }
}

// The input is the host's 64 left + 64 right frequency magnitudes, not PCM.
// Only genuine, fresh, sustained signal can enable motion. Nothing runs on a demo clock.
export class AudioAnalysis {
  constructor() {
    this.bands = new Float32Array(64);
    this.raw = new Float32Array(64);
    this.reset();
  }
  reset() {
    this.raw.fill(0);
    this.bands.fill(0);
    this.lastSample = -Infinity;
    this.lastStep = null;
    this.level = 0;
    this.bass = 0;
    this.average = 0.025;
    this.previousBass = 0;
    this.onset = 0;
    this.envelope = 0;
    this.signalAge = 0;
    this.active = false;
    this.beats = 0;
    this.lastBeat = -Infinity;
    this.period = 550;
    this.direction = 1;
    this.sway = 0;
    this.bob = 0;
  }
  ingest(values, now) {
    if (!values || values.length !== 128 || !Number.isFinite(now)) return false;
    for (let i = 0; i < 64; i++) {
      const left = Number.isFinite(values[i]) ? clamp(values[i]) : 0,
        right = Number.isFinite(values[i + 64]) ? clamp(values[i + 64]) : 0;
      this.raw[i] = (left + right) / 2;
    }
    this.lastSample = now;
    return true;
  }
  step(now, { sensitivity = 1, paused = false } = {}) {
    if (paused) return this.snapshot();
    const dt = this.lastStep === null ? 33 : clamp(now - this.lastStep, 0, 100);
    this.lastStep = now;
    const fresh = now - this.lastSample < 450;
    let mean = 0,
      rawMean = 0,
      bass = 0;
    for (let i = 0; i < 64; i++) {
      const target = fresh ? clamp(this.raw[i] * sensitivity) : 0;
      rawMean += target;
      this.bands[i] +=
        (target - this.bands[i]) * (1 - Math.exp(-dt / (target > this.bands[i] ? 65 : 200)));
      mean += this.bands[i];
      if (i < 12) bass += target;
    }
    mean /= 64;
    rawMean /= 64;
    bass /= 12;
    this.level = mean;
    this.bass = bass;
    const audible = fresh && (rawMean > 0.012 || bass > 0.035);
    this.signalAge = audible ? this.signalAge + dt : Math.max(0, this.signalAge - dt * 3);
    this.active = audible && this.signalAge >= 360;
    const onset = Math.max(0, bass - this.previousBass);
    this.previousBass = bass;
    this.average += (bass - this.average) * (1 - Math.exp(-dt / 950));
    this.envelope *= Math.exp(-dt / 260);
    if (
      this.active &&
      bass > 0.035 &&
      bass > this.average * 1.18 &&
      onset > 0.012 &&
      now - this.lastBeat > 260
    ) {
      const gap = now - this.lastBeat;
      if (gap >= 300 && gap <= 1200) this.period = this.period * 0.65 + gap * 0.35;
      this.lastBeat = now;
      this.beats++;
      this.direction *= -1;
      this.envelope = clamp(0.45 + bass * 1.6);
      this.onset = onset;
    }
    const strength = this.active ? clamp(mean * 3.5 + bass * 0.4) : 0;
    // A beat gives a soft alternating lean; between beats it eases back, rather
    // than deforming the torso or continuing a free-running dance in silence.
    const targetSway = this.active ? this.direction * this.envelope * strength : 0;
    this.sway += (targetSway - this.sway) * (1 - Math.exp(-dt / 180));
    this.bob +=
      ((this.active ? this.envelope * strength : 0) - this.bob) * (1 - Math.exp(-dt / 105));
    return this.snapshot();
  }
  snapshot() {
    return {
      bands: this.bands,
      level: this.level,
      bass: this.bass,
      active: this.active,
      beats: this.beats,
      envelope: this.envelope,
      sway: this.sway,
      bob: this.bob,
      lastSample: this.lastSample,
    };
  }
}

export function listeningAllowed(state, media) {
  return (
    state === 'idle' &&
    !['paused', 'stopped', 'closed'].includes(media.playback) &&
    media.track.contentType !== 'image'
  );
}
export function addMusicPose(pose, music = { sway: 0, bob: 0 }, amount = 1) {
  const sway = clamp(Number.isFinite(music.sway) ? music.sway : 0, -1, 1) * clamp(amount);
  const bob = clamp(Number.isFinite(music.bob) ? music.bob : 0) * clamp(amount);
  return {
    ...pose,
    bodyAngle: clamp(pose.bodyAngle + sway * 0.009, -0.014, 0.014),
    headAngle: clamp(pose.headAngle + sway * 0.013, -0.036, 0.036),
    headShift: [pose.headShift[0], pose.headShift[1] - bob * 0.0012],
    breath: pose.breath + bob * 0.0032,
  };
}
