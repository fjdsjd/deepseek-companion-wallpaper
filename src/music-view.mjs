const NS = 'http://www.w3.org/2000/svg';
import { textIfChanged, hiddenIfChanged } from './dom-update.mjs';
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const clock = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export class MusicView {
  constructor(root) {
    this.root = root;
    this.canvas = document.getElementById('spectrum');
    this.ctx = this.canvas.getContext('2d');
    this.lastUi = -Infinity;
    this.peak = new Float32Array(32);
  }
  draw(now, audio, media, { enabled = true, hostAudio = false, hostMedia = false } = {}) {
    const hasTrack =
      media.enabled && !!media.track.title && !['stopped', 'closed'].includes(media.playback);
    const visible = enabled && (hasTrack || audio.active);
    hiddenIfChanged(this.root, !visible);
    const panel = document.getElementById('consolePanel');
    if (panel.dataset.audio !== String(visible)) panel.dataset.audio = String(visible);
    hiddenIfChanged(document.getElementById('consoleOutput'), visible);
    if (now - this.lastUi > 180) {
      this.lastUi = now;
      textIfChanged(
        document.getElementById('consoleHeading'),
        visible ? 'DEEPSEEK / AUDIO' : 'DEEPSEEK / RUNTIME',
      );
      textIfChanged(
        document.getElementById('consoleMode'),
        visible ? 'SYSTEM MIX' : 'LOCAL EVENT STREAM',
      );
      const state =
        hasTrack && media.playback === 'paused'
          ? 'PAUSED'
          : audio.active
            ? 'PLAYING'
            : hasTrack
              ? 'READY'
              : 'CONNECTED';
      textIfChanged(document.getElementById('streamState'), state);
      const title = hasTrack ? media.track.title : '系统音频 · 未提供名称';
      textIfChanged(document.getElementById('trackTitle'), title);
      textIfChanged(
        document.getElementById('trackArtist'),
        hasTrack
          ? media.track.artist || media.track.album || '系统媒体会话'
          : media.enabled
            ? '播放器未提供媒体信息'
            : '媒体信息已关闭',
      );
      textIfChanged(
        document.getElementById('musicPlayback'),
        state === 'PAUSED' ? 'Ⅱ PAUSED' : audio.active ? '▶ NOW PLAYING' : '♫ MEDIA SESSION',
      );
      textIfChanged(
        document.getElementById('spectrumState'),
        !hostAudio
          ? '频谱需在 Wallpaper Engine 中显示'
          : audio.active
            ? 'SYSTEM AUDIO · LIVE'
            : '等待音频信号',
      );
      textIfChanged(
        document.getElementById('musicTimeline'),
        hasTrack && media.duration > 0 ? `${clock(media.position)} / ${clock(media.duration)}` : '',
      );
      textIfChanged(
        document.getElementById('musicStatus'),
        !hostAudio
          ? '浏览器可读取系统播放名称；实时频谱和节奏律动需在 Wallpaper Engine 中运行。'
          : hostMedia && !media.enabled
            ? 'Wallpaper Engine 的媒体信息已关闭，仍可显示系统音频频谱。'
            : !hasTrack && audio.active
              ? '检测到系统音频，播放器尚未提供歌曲名称。'
              : '已接入系统音频；有声音时显示频谱，待机时随节奏轻轻律动。',
      );
    }
    if (!visible || !this.ctx) return;
    const ctx = this.ctx,
      w = this.canvas.clientWidth,
      h = this.canvas.clientHeight,
      dpr = Math.min(devicePixelRatio || 1, 2);
    if (!w || !h) return;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#76c69222';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      ctx.moveTo(0, (h * i) / 4);
      ctx.lineTo(w, (h * i) / 4);
    }
    for (let i = 1; i < 8; i++) {
      ctx.moveTo((w * i) / 8, 0);
      ctx.lineTo((w * i) / 8, h);
    }
    ctx.stroke();
    const width = w / 32,
      points = [];
    for (let i = 0; i < 32; i++) {
      const value = Math.sqrt((audio.bands[i * 2] + audio.bands[i * 2 + 1]) / 2) * 0.92;
      const bar = clamp(value) * (h - 6),
        x = i * width + 1,
        y = h - bar - 2;
      this.peak[i] = Math.max(bar, this.peak[i] - 0.7);
      ctx.fillStyle = `rgba(119,211,151,${0.4 + value * 0.5})`;
      ctx.fillRect(x, y, Math.max(1, width - 2), Math.max(1, bar));
      ctx.fillStyle = '#d2f2d6';
      if (bar > 1) ctx.fillRect(x, h - this.peak[i] - 3, Math.max(1, width - 2), 1);
      points.push([x + width / 2, y]);
    }
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = '#a7edb5';
    ctx.lineWidth = 1;
    ctx.stroke();
    this.root.dataset.energy = audio.level.toFixed(4);
  }
}

export class MusicEffects {
  constructor(svg) {
    this.svg = svg;
    this.particles = [];
    this.lastBeat = 0;
    svg.innerHTML = `<defs>
      <symbol id="music-note" viewBox="0 0 48 48"><path d="M18 34V10L38 5V28M18 17l20-5" stroke="#eff4dc" stroke-width="3.5" fill="none" stroke-linecap="round"/><ellipse cx="12" cy="35" rx="7" ry="5" fill="#aedbdc" stroke="#edf3e2" stroke-width="2" transform="rotate(-20 12 35)"/><ellipse cx="32" cy="29" rx="7" ry="5" fill="#aedbdc" stroke="#edf3e2" stroke-width="2" transform="rotate(-20 32 29)"/></symbol>
      <symbol id="music-spark" viewBox="0 0 48 48"><path d="m24 4 5 14 15 6-15 5-5 15-5-15-15-5 15-6Z" fill="#e5e8b9" stroke="#fff5de" stroke-width="2"/></symbol>
      <symbol id="music-heart" viewBox="0 0 48 48"><path d="M24 42C17 36 5 28 5 17 5 5 19 4 24 14 29 4 43 5 43 17 43 28 31 36 24 42Z" fill="#dcaab5" stroke="#f8ece0" stroke-width="2.5"/></symbol>
    </defs><g class="music-accent" fill="none" stroke="#d4e8da" stroke-width="3.5" stroke-linecap="round"><path d="m313 412-16-5m13 23-20 3m399-29 15-8m-9 29 19 2"/></g><g class="music-particles"></g><g class="music-still"><use href="#music-note" x="285" y="380" width="39" height="39"/><use href="#music-note" x="695" y="365" width="39" height="39"/></g>`;
    this.layer = svg.querySelector('.music-particles');
    this.accent = svg.querySelector('.music-accent');
    this.still = svg.querySelector('.music-still');
    this.hide();
  }
  hide() {
    if (this.hidden) return;
    this.hidden = true;
    this.svg.setAttribute('hidden', '');
    this.svg.style.display = 'none';
    this.particles = [];
    this.layer?.replaceChildren();
    this.svg.dataset.activeCount = '0';
  }
  draw(now, audio, { enabled = true, reduced = false, motion = 1, allowed = true } = {}) {
    if (!enabled || !allowed || !audio.active) {
      this.lastBeat = audio.beats;
      this.hide();
      return;
    }
    if (this.hidden) {
      this.hidden = false;
      this.svg.removeAttribute('hidden');
      this.svg.style.display = '';
    }
    this.still.style.display = reduced || motion === 0 ? '' : 'none';
    this.layer.style.display = reduced || motion === 0 ? 'none' : '';
    this.accent.style.display = reduced || motion === 0 ? 'none' : '';
    if (reduced || motion === 0) {
      this.lastBeat = audio.beats;
      return;
    }
    if (audio.beats !== this.lastBeat) {
      this.lastBeat = audio.beats;
      for (let i = 0; i < 2; i++) {
        const index = audio.beats * 2 + i,
          side = index % 2 === 0 ? -1 : 1,
          kind = i === 0 ? 'note' : index % 5 === 0 ? 'heart' : 'spark';
        const use = document.createElementNS(NS, 'use');
        use.setAttribute('href', `#music-${kind}`);
        use.setAttribute('width', kind === 'spark' ? '27' : '42');
        use.setAttribute('height', kind === 'spark' ? '27' : '42');
        use.dataset.kind = kind;
        this.layer.append(use);
        this.particles.push({ node: use, start: now, side, index, kind });
      }
      while (this.particles.length > 10) this.particles.shift().node.remove();
    }
    this.particles = this.particles.filter((p) => {
      const life = (now - p.start) / 1550;
      if (life >= 1) {
        p.node.remove();
        return false;
      }
      const x = 500 + p.side * (195 + life * 45) + Math.sin(life * 5 + p.index) * 8 * motion,
        y = 450 - life * 105 * motion + (p.index % 3) * 14;
      p.node.setAttribute(
        'transform',
        `translate(${x} ${y}) rotate(${p.side * (8 + Math.sin(life * 5) * 9) * motion}) scale(${0.85 + Math.sin((Math.min(1, life * 5) * Math.PI) / 2) * 0.15})`,
      );
      p.node.setAttribute('opacity', String(Math.min(1, life * 10, (1 - life) * 4) * 0.9));
      return true;
    });
    this.accent.setAttribute('opacity', String(audio.envelope * 0.65));
    this.svg.dataset.activeCount = String(this.particles.length);
  }
}
