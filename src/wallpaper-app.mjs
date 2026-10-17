import { Companion, STATES, HUG_MS, dayProgress } from './companion.mjs';
import { AvatarRenderer } from './renderer.mjs';
import { headTarget } from './motion.mjs';
import { FEED_FRAMES, FEED_LAYERS, feedingPose } from './feeding.mjs';
import { MealEffects } from './meal-effects.mjs';
import { AudioAnalysis, SystemMedia, playbackState, listeningAllowed } from './audio.mjs';
import { MusicView, MusicEffects } from './music-view.mjs';
import { DEFAULTS, normalizeSettings, readSettings, saveSettings } from './settings.mjs';
import { Dialogue } from './dialogue.mjs';
import { DIALOGUE_LABELS } from './dialogue-bank.mjs';
import { createScreenLayout } from './screen-layout.mjs';
import { createSettingsNavigation } from './settings-navigation.mjs';
import { SETTINGS_KEY, HOST_KEY } from './storage-keys.mjs';
import { create550WReadout } from './550w-telemetry.mjs';
import { createFrameLoop } from './frame-loop.mjs';
import { textIfChanged } from './dom-update.mjs';
const $ = (id) => document.getElementById(id),
  clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const settings = readSettings();
const nodeReadout = create550WReadout($);
const screenLayout = createScreenLayout(() => settings);
const dialogue = new Dialogue();
let dialogueStamp = '';
const mealEffects = new MealEffects($('mealEffects'));
const audioAnalysis = new AudioAnalysis(),
  systemMedia = new SystemMedia(),
  musicView = new MusicView($('musicPanel')),
  musicEffects = new MusicEffects($('musicEffects'));
const audioHost = window.__deepseekAudioHost || { audio: false, media: false };
let musicListening = false,
  musicPortraitUntil = 0;
let hostInitialized = false,
  hostStored = {},
  hadStoredSettings = false;
try {
  hadStoredSettings = !!localStorage.getItem(SETTINGS_KEY);
  hostStored = JSON.parse(localStorage.getItem(HOST_KEY) || '{}');
} catch {}
let pausedAt = null,
  pausedTotal = 0,
  testOffset = 0,
  hostPaused = false,
  hostFps = 60;
const activeNow = () => (pausedAt ?? Date.now()) - pausedTotal + testOffset;
const sessionStart = activeNow();
let renderer,
  ready = false,
  drag = null,
  pointer = [0, 0],
  lastDraw = 0,
  lastUi = 0,
  frames = 0,
  fps = 0,
  fpsStart = 0;
const frameLoop = createFrameLoop(animate, () => Math.min(settings.fps, hostFps), {
  pacedByHost:
    location.protocol === 'file:' || typeof window.wallpaperRegisterAudioListener === 'function',
});
let lastClockSecond = -1,
  lastObserve = 0,
  lastDust = 0;
let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CAPTION_HOLD_MS = 3000,
  CAPTION_FADE_MS = 800;
let captionKey = null,
  captionSince = null,
  captionOpacity = 0;
const logs = [],
  queue = [];
let typing = '',
  typed = '',
  streamClock = 0,
  toastTimer;
function log(event, detail = '') {
  const stamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
  queue.push(`[${stamp}] ${event}${detail ? ' ' + detail : ''}`);
  if (queue.length > 30) queue.shift();
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 4200);
}
const labels = {
  annoyed_1: ['有一点点不满', 'POUT I', '哼，小鲸鱼也会生气的 (｡•ˇ‸ˇ•｡)', '先摆一下小尾巴。'],
  annoyed_2: ['气鼓鼓了', 'POUT II', '怎么又捏嘛……( •̀ - •́ )', '眉毛皱起来了，眼睛也有点湿。'],
  annoyed_3: [
    '快忍不住了',
    'POUT III',
    '再捏就、就真的哭了哦……(｡•́︿•̀｡)',
    '眼泪挂在眼角，正在努力忍住。',
  ],
  idle: ['安静陪伴', 'IDLE', '探头——我在这儿呢 (｡･ω･｡)ﾉ', '呆毛还醒着，本人正在发呆。'],
  petting: ['被温柔对待', 'COMFORT', '唔……再摸一下 (〃ω〃)', '脑袋再借你的手心靠一小会儿。'],
  comfort: ['被温柔对待', 'COMFORT', '呜……轻轻摸就好 (｡•́︿•̀｡)', '吸吸鼻子，已经好一点点了。'],
  pinching: [
    '脸颊被捏住了',
    'PINCH',
    '呜哇，小鲸鱼要被捏扁啦！(＞﹏＜)',
    '脸颊正在小声抗议，轻一点点嘛。',
  ],
  crying: ['有一点委屈', 'TEARS', '哼……鼻子酸酸的 (｡•́︿•̀｡)', '先不捏了，要轻轻摸摸头。'],
  asking_hug: ['想要抱抱', 'HUG?', '手伸好啦，抱一下嘛 (つ´ω`)つ', '这里有一只等抱的小鲸鱼。'],
  hugging: ['安心了', 'WARMTH', '接住啦！嘿嘿，好暖。', '呼……刚刚的委屈慢慢散掉了。'],
  study: ['认真学习中', 'FOCUS', '再看一页……就一页！', '嘘，我在和这道题对视。'],
  study_tired: [
    '等你的目光',
    'WAITING',
    '字开始晃了……摸摸头嘛 (っ﹏-)',
    '脑袋转不动了，书签先夹在这里。',
  ],
  feeding: ['开心吃饭中', 'EATING', '饭来啦！(๑´ڡ`๑)', '小口啊呜，不许饭粒逃走。'],
};
const companion = new Companion(activeNow, (snapshot, reason) => {
  updateEmotion();
  log(reason, `state="${snapshot.state}" pinch=${snapshot.pinchCount}`);
});
function updateEmotion() {
  const s = companion.state,
    mood = companion.pinchMood,
    l = mood
      ? labels[`annoyed_${mood}`]
      : companion.cryingPinch
        ? labels.crying
        : s === 'idle' && musicListening
          ? ['听歌陪伴中', 'RHYTHM', '哼哼～呆毛也跟着摇 ♪', '这段好听，耳朵还不想下班。']
          : s === 'petting' && companion.gesture?.previous === 'crying'
            ? labels.comfort
            : labels[s];
  $('room').dataset.state = s;
  $('room').dataset.pinchMood = String(mood);
  $('emotionValue').textContent = l[0];
  $('emotionCode').textContent = l[1];
  $('emotionDescription').textContent = l[3];
  if (s !== 'feeding') showCaption(l[2]);
  $('recognitionState').textContent = l[1];
  $('alertFlag').textContent = ['crying', 'asking_hug', 'study_tired'].includes(s) ? '!' : '·';
  $('alertFlag').setAttribute('aria-label', l[0]);
  $('hugButton').hidden = s !== 'asking_hug';
  const studying = ['study', 'study_tired'].includes(s);
  $('studyLabel').textContent = studying ? '让她休息' : '让她学习';
  $('studyButton').disabled = [
    'crying',
    'asking_hug',
    'hugging',
    'petting',
    'pinching',
    'feeding',
  ].includes(s);
  $('studyProgress').hidden = !studying;
  $('feedButton').disabled = !ready || !companion.canFeed;
  $('feedButton').setAttribute('aria-busy', String(s === 'feeding'));
  $('feedLabel').textContent = s === 'feeding' ? '正在吃饭…' : '喂她大白饭';
  $('feedStatus').hidden = s !== 'feeding';
  if (s === 'feeding') $('character').style.cursor = 'default';
  else mealEffects.hide();
  updateFeeding();
  updateDialogue();
}
function showCaption(text) {
  const key = `${companion.state}:${text}`;
  if (!ready) {
    $('captionText').textContent = text;
    return;
  }
  if (key === captionKey) return;
  captionKey = key;
  captionSince = activeNow();
  $('captionText').textContent = text;
  updateCaption();
}
function updateCaption() {
  // Reuse active time so host pauses freeze the fade; no extra timer or polling.
  const elapsed = captionSince === null ? Infinity : activeNow() - captionSince;
  const progress = clamp((elapsed - CAPTION_HOLD_MS) / CAPTION_FADE_MS, 0, 1);
  const opacity = reduced
    ? elapsed < CAPTION_HOLD_MS
      ? 1
      : 0
    : 1 - progress * progress * (3 - 2 * progress);
  if (opacity === captionOpacity) return;
  captionOpacity = opacity;
  $('caption').style.setProperty('--caption-opacity', String(opacity));
  $('caption').setAttribute('aria-hidden', String(opacity === 0));
}
function updateDialogue() {
  const item = dialogue.step(activeNow(), {
    state: companion.cryingPinch ? 'crying' : companion.state,
    pinchMood: companion.pinchMood,
    listening: musicListening,
    comforting: companion.state === 'petting' && companion.gesture?.previous === 'crying',
    enabled: settings.showChatter,
    blocked: !ready || !$('settingsOverlay').hidden,
    interval: settings.chatterInterval,
  });
  const stamp = `${item.context}:${item.serial}:${item.visible}`;
  if (stamp === dialogueStamp) return;
  dialogueStamp = stamp;
  $('chatterBubble').hidden = !item.visible;
  $('room').dataset.chattering = String(item.visible);
  $('chatterText').textContent = item.text;
  $('chatterContext').textContent = DIALOGUE_LABELS[item.context] || '';
  $('chatterBubble').dataset.context = item.context;
  $('chatterSequence').textContent = item.total > 1 ? (item.line === 1 ? '● ·' : '· ●') : '';
  screenLayout.refresh();
}
function updateFeeding() {
  const meal = companion.state === 'feeding' ? feedingPose(activeNow() - companion.since) : null;
  $('feedButton').style.setProperty('--feed-progress', `${(meal?.progress || 0) * 100}%`);
  if (!meal) return;
  showCaption(meal.caption);
  $('feedStatus').textContent = meal.label;
  $('emotionDescription').textContent =
    companion.meal?.previous === 'idle'
      ? '小口啊呜，不许饭粒逃走。'
      : '书签夹好了，先把这一口嚼完。';
}
function applySettings(patch = {}, persist = true) {
  Object.assign(settings, normalizeSettings({ ...settings, ...patch }));
  companion.studyDurationMs = settings.studyMinutes * 60 * 1000;
  document.documentElement.style.setProperty('--character-scale', settings.characterScale / 100);
  document.documentElement.style.setProperty('--brightness', settings.brightness / 100);
  $('room').dataset.side = settings.infoSide;
  $('trackingStatus').textContent = settings.mouseTracking ? 'ACTIVE' : 'OFF';
  $('systemInfo').hidden = $('topResources').hidden = !settings.showNodeInfo;
  $('weatherInfo').hidden = !settings.showRootEnvironment;
  nodeReadout?.update(activeNow() - sessionStart, settings, true);
  $('consolePanel').hidden = !settings.showConsole;
  $('clockPanel').hidden = !settings.showClock;
  $('dust').hidden = !settings.showParticles;
  screenLayout.refresh();
  if (
    drag &&
    ((drag.kind === 'head' && !settings.enablePet) ||
      (drag.kind === 'cheek' && !settings.enablePinch))
  )
    finishDrag(true);
  for (const node of document.querySelectorAll('[data-setting]')) {
    const key = node.dataset.setting;
    if (node.type === 'checkbox') node.checked = settings[key];
    else if (node.type === 'radio') node.checked = node.value === String(settings[key]);
    else node.value = settings[key];
  }
  for (const node of document.querySelectorAll('[data-value]'))
    node.value = `${settings[node.dataset.value]}${node.dataset.unit || '%'}`;
  updateStudyProgress();
  updateSystemStatus();
  updateDialogue();
  if (!settings.mealEffects) mealEffects.hide();
  if (!settings.musicEffects) musicEffects.hide();
  if (persist && !saveSettings(settings)) toast('当前环境无法保存设置，本次设置仍然有效。');
}
function wallpaperUser(props) {
  const map = {
    showconsole: 'showConsole',
    showclock: 'showClock',
    showparticles: 'showParticles',
    mealeffects: 'mealEffects',
    showmusic: 'showMusic',
    musicmotion: 'musicMotion',
    musiceffects: 'musicEffects',
    musicsensitivity: 'musicSensitivity',
    mousetracking: 'mouseTracking',
    enablepet: 'enablePet',
    enablepinch: 'enablePinch',
    infoside: 'infoSide',
    characterscale: 'characterScale',
    brightness: 'brightness',
    motion: 'motion',
    fps: 'fps',
    showchatter: 'showChatter',
    chatterinterval: 'chatterInterval',
  };
  map.avoidtaskbar = 'avoidTaskbar';
  map.shownodeinfo = 'showNodeInfo';
  map.showrootenvironment = 'showRootEnvironment';
  map.noderefresh = 'systemInterval';
  map.studyminutes = 'studyMinutes';
  const initialFull = !hostInitialized && Object.keys(props).length >= 8;
  hostInitialized = true;
  const patch = {};
  for (const [name, key] of Object.entries(map))
    if (props[name] && Object.hasOwn(props[name], 'value')) {
      const value = props[name].value;
      // Initial host defaults must not erase settings changed inside the wallpaper.
      if (
        !initialFull ||
        !hadStoredSettings ||
        (Object.hasOwn(hostStored, key) ? hostStored[key] !== value : DEFAULTS[key] !== value)
      )
        patch[key] = value;
      hostStored[key] = value;
    }
  try {
    localStorage.setItem(HOST_KEY, JSON.stringify(hostStored));
  } catch {}
  applySettings(patch);
  log('settings.apply', Object.keys(patch).join(','));
}
function updatePause() {
  const paused = hostPaused || document.hidden;
  if (paused && pausedAt === null) {
    pausedAt = Date.now();
    finishDrag(true);
    frameLoop.stop();
    renderer?.cache.trim(performance.now(), true);
  }
  if (!paused && pausedAt !== null) {
    pausedTotal += Date.now() - pausedAt;
    pausedAt = null;
    lastDraw = 0;
    audioAnalysis.reset();
    musicPortraitUntil = 0;
  }
  if (!paused && ready) frameLoop.start();
  $('runState').textContent = paused ? 'HOLD' : 'RUN';
  $('room').dataset.paused = String(paused);
  updateSystemStatus();
}
const pending = window.__wallpaperQueue || [];
window.wallpaperPropertyListener = {
  applyUserProperties: wallpaperUser,
  applyGeneralProperties: (p) => {
    if (Number.isFinite(Number(p.fps))) hostFps = clamp(Number(p.fps), 1, 144);
  },
  setPaused: (p) => {
    hostPaused = !!p;
    updatePause();
  },
};
for (const [type, p] of pending) {
  if (type === 'user') wallpaperUser(p);
  if (type === 'general') window.wallpaperPropertyListener.applyGeneralProperties(p);
  if (type === 'paused') window.wallpaperPropertyListener.setPaused(p);
}
document.addEventListener('visibilitychange', updatePause);
audioHost.subscribe?.((kind, data, at) => {
  if (kind === 'audio') {
    if (pausedAt === null && (settings.showMusic || settings.musicMotion || settings.musicEffects))
      audioAnalysis.ingest(data, at);
  } else if (kind === 'status') systemMedia.hostStatus(data?.enabled);
  else if (systemMedia.enabled) {
    if (kind === 'properties') systemMedia.properties(data || {});
    if (kind === 'playback') {
      systemMedia.playback = playbackState(data?.state, window.wallpaperMediaIntegration || {});
      if (systemMedia.playback === 'stopped') {
        systemMedia.clear();
        systemMedia.playback = 'stopped';
        systemMedia.status = 'none';
      }
    }
    if (kind === 'timeline') systemMedia.timeline(data);
  }
});
const settingsNavigation = createSettingsNavigation(
  $('settingsScroll'),
  $('settingsContent'),
  $('settingsPageUp'),
  $('settingsPageDown'),
  $('settingsPosition'),
);
let lastFocus;
function openSettings() {
  finishDrag(true);
  lastFocus = document.activeElement;
  $('settingsOverlay').hidden = false;
  updateDialogue();
  $('closeSettings').focus();
  settingsNavigation.refresh();
}
function closeSettings() {
  $('settingsOverlay').hidden = true;
  updateDialogue();
  lastFocus?.focus();
}
$('settingsButton').onclick = () => openSettings();
$('panelSettingsButton').onclick = () => openSettings();
$('closeSettings').onclick = closeSettings;
$('settingsOverlay').onclick = (e) => {
  if (e.target === $('settingsOverlay')) closeSettings();
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    finishDrag(true);
    if (!$('settingsOverlay').hidden) closeSettings();
  }
  if (e.key === 'Tab' && !$('settingsOverlay').hidden) {
    const all = [...$('settingsPanel').querySelectorAll('button,input,select')].filter(
      (x) => !x.disabled && x.offsetParent !== null,
    );
    const first = all[0],
      last = all.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }
});
for (const node of document.querySelectorAll('[data-setting]'))
  node.addEventListener('input', () => {
    if (node.type === 'radio' && !node.checked) return;
    applySettings({ [node.dataset.setting]: node.type === 'checkbox' ? node.checked : node.value });
  });
$('resetSettings').onclick = () => {
  applySettings({ ...DEFAULTS });
  toast('已恢复默认设置');
};
$('studyButton').onclick = () => {
  if (['study', 'study_tired'].includes(companion.state)) companion.stopStudy();
  else companion.startStudy();
};
$('hugButton').onclick = () => companion.hug();
$('feedButton').onclick = () => {
  if (ready && pausedAt === null) companion.feed();
};
$('closeChatter').onclick = () => {
  dialogue.dismiss(activeNow());
  captionSince = null;
  updateCaption();
  updateDialogue();
};

function localPoint(e) {
  const rect = $('character').getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height,
    size: rect.width,
  };
}
function hitTest(p) {
  const { x, y } = renderer?.hitPoint(p) || p;
  if (settings.enablePet && x > 0.25 && x < 0.8 && y > 0.07 && y < 0.33) return 'head';
  if (
    settings.enablePinch &&
    y > 0.46 &&
    y < 0.56 &&
    ((x > 0.365 && x < 0.455) || (x > 0.59 && x < 0.675))
  )
    return 'cheek';
  return null;
}
// Wallpaper Engine forwards mouse buttons and pointer capture independently.
// A captured native trace contains lostpointercapture + buttons=0 moves BEFORE
// pointerup. Only an explicit release ends a host mouse gesture.
const hostMouseInput =
  location.protocol === 'file:' || typeof window.wallpaperRegisterAudioListener === 'function';
function matchesDrag(e) {
  return (
    drag &&
    (e.pointerId === drag.id || (e.type.startsWith('mouse') && drag.pointerType === 'mouse'))
  );
}
function beginDrag(e) {
  if (
    e.button !== 0 ||
    e.isPrimary === false ||
    drag ||
    !ready ||
    pausedAt !== null ||
    !$('settingsOverlay').hidden
  )
    return;
  const p = localPoint(e),
    kind = hitTest(p);
  if (!kind || !companion.beginGesture(kind)) return;
  e.preventDefault();
  drag = {
    kind,
    side: p.x < 0.52 ? 'left' : 'right',
    id: e.pointerId ?? null,
    pointerType: e.pointerType || 'mouse',
    start: p,
    last: p,
    dx: 0,
    dy: 0,
  };
  // Capture is an optimization, not a requirement: mouse-only host events and
  // expired native pointer IDs still use the window-level move/up listeners.
  if (drag.id !== null)
    try {
      $('character').setPointerCapture(drag.id);
    } catch {}
  $('character').classList.add('grabbing');
  log('drag.anchor', kind === 'head' ? 'head' : `cheek.${drag.side}`);
}
$('character').addEventListener('pointerdown', beginDrag);
$('character').addEventListener('mousedown', beginDrag);
$('character').addEventListener('dragstart', (e) => e.preventDefault());
function updateDrag(e) {
  const p = localPoint(e);
  companion.moveGesture(Math.hypot(p.x - drag.last.x, p.y - drag.last.y) * p.size);
  const max = drag.kind === 'head' ? 0.3 : 0.09,
    maxY = drag.kind === 'head' ? 0.2 : 0.06;
  drag.dx = clamp(p.x - drag.start.x, -max, max);
  drag.dy = clamp(p.y - drag.start.y, -maxY, maxY);
  drag.last = p;
}
function moveInput(e) {
  pointer = [
    clamp((e.clientX / innerWidth - 0.5) * 2, -1, 1),
    clamp((e.clientY / innerHeight - 0.5) * 2, -1, 1),
  ];
  if (matchesDrag(e)) {
    if (!hostMouseInput && drag.pointerType === 'mouse' && e.buttons === 0) {
      finishDrag(true);
      return;
    }
    updateDrag(e);
    return;
  }
  if (e.target === $('character')) {
    const p = localPoint(e),
      hit = hitTest(p),
      kind = companion.canGesture(hit) ? hit : null;
    $('character').style.cursor = kind ? 'grab' : 'default';
  }
}
window.addEventListener('pointermove', moveInput, true);
// CEF host mouse forwarding can differ from a foreground browser's pointer stream.
window.addEventListener('mousemove', moveInput, true);
function finishDrag(cancel = false) {
  if (!drag) return;
  const id = drag.id;
  drag = null;
  if (id !== null)
    try {
      if ($('character').hasPointerCapture(id)) $('character').releasePointerCapture(id);
    } catch {}
  $('character').classList.remove('grabbing');
  companion.endGesture(cancel);
}
function releaseDrag(e) {
  if (matchesDrag(e) && e.button === 0) {
    updateDrag(e);
    finishDrag();
  }
}
window.addEventListener('pointerup', releaseDrag, true);
window.addEventListener('mouseup', releaseDrag, true);
window.addEventListener(
  'pointercancel',
  (e) => {
    if (matchesDrag(e)) finishDrag(true);
  },
  true,
);
$('character').addEventListener('lostpointercapture', (e) => {
  if (matchesDrag(e) && drag.pointerType !== 'mouse') finishDrag(true);
});
window.addEventListener('blur', () => {
  if (location.protocol !== 'file:') finishDrag(true);
  if (!drag) pointer = [0, 0];
});
// Leaving the host viewport cancels safely even if the release occurs outside it.
document.addEventListener('mouseleave', () => {
  finishDrag(true);
  pointer = [0, 0];
});

function updateSystemStatus() {
  $('connectionStatus').textContent =
    hostPaused || document.hidden ? '550W / HOLD' : '550W / ONLINE';
}

const dust = $('dust'),
  ctx = dust.getContext('2d'),
  motes = Array.from({ length: 28 }, (_, i) => ({
    x: ((i * 197) % 997) / 997,
    y: ((i * 307) % 991) / 991,
    r: 0.5 + (i % 3) * 0.35,
    v: 0.007 + (i % 5) * 0.002,
  }));
function drawDust(time) {
  if (!settings.showParticles || reduced || !ctx || time - lastDust < 65) return;
  lastDust = time;
  const scale = Math.min(1, 960 / innerWidth),
    width = Math.round(innerWidth * scale),
    height = Math.round(innerHeight * scale);
  if (dust.width !== width || dust.height !== height) {
    dust.width = width;
    dust.height = height;
  }
  ctx.clearRect(0, 0, dust.width, dust.height);
  for (const m of motes) {
    const x = (m.x + Math.sin(time / 19000 + m.y * 8) * 0.025) * dust.width,
      y = ((m.y - ((((time / 1000) * m.v) / 12) % 1) + 1) % 1) * dust.height;
    ctx.beginPath();
    ctx.fillStyle = `rgba(251,234,189,${0.09 + m.r * 0.09})`;
    ctx.arc(x, y, m.r * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}
function updateStudyProgress() {
  const duration =
    companion.studyStarted === null ? companion.studyDurationMs : companion.studyCycleMs;
  const seconds =
    companion.studyStarted === null
      ? 0
      : Math.max(0, Math.floor((activeNow() - companion.studyStarted) / 1000));
  const format = (value) =>
    `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  textIfChanged($('studyTimer'), `${format(seconds)} / ${format(duration / 1000)}`);
  const width = `${Math.min(100, (seconds / (duration / 1000)) * 100)}%`;
  if ($('studyMeter').style.width !== width) $('studyMeter').style.width = width;
}
function updateClock() {
  updateFeeding();
  updateDialogue();
  const elapsed = Math.max(0, activeNow() - sessionStart) / 1000;
  nodeReadout.update(elapsed * 1000, settings);
  updateStudyProgress();
  textIfChanged(
    $('sessionTime'),
    [Math.floor(elapsed / 3600), Math.floor((elapsed % 3600) / 60), Math.floor(elapsed % 60)]
      .map((v) => String(v).padStart(2, '0'))
      .join(':'),
  );
  const second = Math.floor(Date.now() / 1000);
  if (second === lastClockSecond || !settings.showClock) return;
  lastClockSecond = second;
  const d = new Date(),
    time = d.toLocaleTimeString('en-GB', { hour12: false }),
    parts = time.split(':');
  $('clock').innerHTML = parts.join('<span>:</span>');
  $('clock').dateTime = d.toISOString();
  $('date').textContent =
    `${d.getFullYear()} / ${String(d.getMonth() + 1).padStart(2, '0')} / ${String(d.getDate()).padStart(2, '0')}`;
  const pct = dayProgress(d) * 100;
  $('dayPercent').innerHTML = `${pct.toFixed(2)}<small>%</small>`;
  $('dayFill').style.width = $('dayMarker').style.left = `${pct}%`;
}
function stream(time) {
  if (!settings.showConsole || !$('musicPanel').hidden || time - streamClock < 65) return;
  streamClock = time;
  if (!typing && queue.length) {
    typing = queue.shift();
    typed = '';
  }
  if (typing) {
    typed = typing.slice(0, typed.length + 4);
    $('consoleOutput').textContent = [...logs, typed].join('\n');
    $('consoleOutput').scrollTop = 100000;
    if (typed.length >= typing.length) {
      logs.push(typing);
      if (logs.length > 12) logs.shift();
      typing = '';
    }
  }
}
function animate(time) {
  if (pausedAt !== null || !ready) return;
  const dt = lastDraw ? Math.min(100, time - lastDraw) : 33;
  lastDraw = time;
  frames++;
  if (time - fpsStart > 1000) {
    fps = (frames * 1000) / (time - fpsStart);
    fpsStart = time;
    frames = 0;
  }
  companion.tick();
  const meal = companion.state === 'feeding' ? feedingPose(activeNow() - companion.since) : null;
  const motion = reduced ? 0 : settings.motion / 100,
    look = meal ? [0, 0] : settings.mouseTracking ? pointer : [0, 0];
  const head = headTarget(drag, look, motion);
  const pin =
    drag?.kind === 'cheek'
      ? [drag.start.x, drag.start.y, drag.dx * 0.95, drag.dy * 0.85]
      : [0.5, 0.5, 0, 0];
  const hugging =
    companion.state === 'hugging'
      ? Math.sin(clamp((activeNow() - companion.since) / HUG_MS, 0, 1) * Math.PI)
      : 0;
  const pinchMood = companion.pinchMood;
  const audio = audioAnalysis.step(time, { sensitivity: settings.musicSensitivity / 100 }),
    allowed = listeningAllowed(companion.state, systemMedia);
  if (audio.active && allowed) musicPortraitUntil = time + 1000;
  if (!allowed) musicPortraitUntil = 0;
  const listening =
    (audio.active || time < musicPortraitUntil) &&
    allowed &&
    (settings.showMusic || settings.musicMotion || settings.musicEffects);
  if (listening !== musicListening) {
    musicListening = listening;
    $('room').dataset.listening = String(listening);
    updateEmotion();
  }
  const music =
    settings.musicMotion && allowed && !reduced ? { sway: audio.sway, bob: audio.bob } : null;
  renderer.draw(time, companion.state, {
    dt,
    motion,
    look,
    head,
    pin,
    meal,
    music,
    listening,
    pinchMood,
    cryingPinch: companion.cryingPinch,
    gestureBase: companion.gesture?.previous,
    side: drag?.side,
    draggingCheek: drag?.kind === 'cheek',
    hug: hugging,
    blink: !pinchMood && motion > 0 && time % 6200 > 6000 && time % 6200 < 6140,
  });
  musicView.draw(time, audio, systemMedia, {
    enabled: settings.showMusic && settings.showConsole,
    hostAudio: audioHost.audio,
    hostMedia: audioHost.media,
  });
  musicEffects.draw(activeNow(), audio, {
    enabled: settings.musicEffects,
    allowed,
    motion,
    reduced,
  });
  mealEffects.draw(activeNow() - companion.since, meal, {
    enabled: settings.mealEffects,
    motion,
    reduced,
  });
  if (!reduced) {
    $('background').style.setProperty('--bg-x', `${look[0] * -3 * motion}px`);
    $('background').style.setProperty('--bg-y', `${look[1] * -2 * motion}px`);
  }
  drawDust(time);
  stream(time);
  updateCaption();
  if (time - lastUi > 250) {
    lastUi = time;
    updateClock();
  }
  if (time - lastObserve > 6500) {
    lastObserve = time;
    if (settings.showConsole)
      log('runtime.observe', `{state:"${companion.state}",fps:${Math.round(fps)}}`);
  }
}
applySettings({}, false);
updateEmotion();
updateClock();
const diagnostics = {
  ready: false,
  get state() {
    return companion.snapshot();
  },
  get settings() {
    return { ...settings };
  },
  get telemetry() {
    return null;
  },
  get backend() {
    return renderer?.backend;
  },
  get renderParams() {
    return renderer?.params;
  },
  get frame() {
    return renderer?.current;
  },
  get meal() {
    return companion.state === 'feeding' ? feedingPose(activeNow() - companion.since) : null;
  },
  get music() {
    return {
      hostAudio: audioHost.audio,
      hostMedia: audioHost.media,
      listening: musicListening,
      audio: { ...audioAnalysis.snapshot(), bands: Array.from(audioAnalysis.bands) },
      media: { ...systemMedia },
    };
  },
  get drag() {
    return drag ? { kind: drag.kind, side: drag.side, dx: drag.dx, dy: drag.dy } : null;
  },
  get fps() {
    return fps;
  },
  get paused() {
    return pausedAt !== null;
  },
};
window.__deepseek = diagnostics;
Object.defineProperty(diagnostics, 'dialogue', { get: () => dialogue.snapshot() });
Object.defineProperty(diagnostics, 'layout', { get: () => screenLayout.snapshot });
Object.defineProperty(diagnostics, 'edition', { value: 'standalone' });
Object.defineProperty(diagnostics, 'resources', { get: () => renderer?.cache.stats });
if (new URLSearchParams(location.search).get('test') === '1')
  diagnostics.advance = (ms) => {
    testOffset += ms;
    companion.tick();
    updateClock();
  };
async function boot() {
  try {
    renderer = new AvatarRenderer($('avatar'), $('fallback'));
    await renderer.load([
      ...STATES.filter((s) => !['pinching', 'feeding'].includes(s)),
      'pinch_left',
      'pinch_right',
      'annoyed_1',
      'annoyed_2',
      'annoyed_3',
      'blink',
      'listening',
      ...FEED_FRAMES,
      ...FEED_LAYERS,
    ]);
    ready = true;
    diagnostics.ready = true;
    updateEmotion();
    $('loading').style.opacity = '0';
    setTimeout(() => ($('loading').hidden = true), 650);
    if (renderer.backend === 'image-fallback')
      toast('WebGL 不可用：当前为简化动画，请开启硬件加速。');
    log('runtime.boot', 'renderer="' + renderer.backend + '"');
    log('companion.ready', `sprites=${Object.keys(renderer.images).length}`);
    log('input.listen', 'head | cheek.left | cheek.right | rice');
    updatePause();
  } catch (error) {
    $('loading').querySelector('strong').textContent = '素材加载失败';
    $('loading').querySelector('small').textContent = error.message;
    console.error(error);
  }
}
boot();
matchMedia('(prefers-reduced-motion: reduce)').addEventListener(
  'change',
  (e) => (reduced = e.matches),
);
