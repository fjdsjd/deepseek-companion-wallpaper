const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function screenProfile(width, height) {
  const r = width / height;
  if (r >= 2.9) return { id: 'superwide', label: '32:9 超宽屏', portrait: false };
  if (r >= 2.05) return { id: 'ultrawide', label: '21:9 带鱼屏', portrait: false };
  if (r >= 1.7) return { id: 'wide', label: '16:9 宽屏', portrait: false };
  if (r >= 1.56) return { id: 'wide-tall', label: '16:10 宽屏', portrait: false };
  if (r >= 1.42) return { id: 'three-two', label: '3:2 屏幕', portrait: false };
  if (r >= 1.29) return { id: 'four-three', label: '4:3 屏幕', portrait: false };
  if (r >= 1.12) return { id: 'five-four', label: '5:4 屏幕', portrait: false };
  if (r >= 0.95) return { id: 'square', label: '接近方形', portrait: false };
  if (r >= 0.7) return { id: 'portrait-tablet', label: '3:4 竖屏', portrait: true };
  if (r >= 0.645) return { id: 'portrait-three-two', label: '2:3 竖屏', portrait: true };
  if (r >= 0.6) return { id: 'portrait-tall', label: '10:16 竖屏', portrait: true };
  return { id: 'portrait', label: '9:16 竖屏', portrait: true };
}

export function taskbarSpace(height, enabled, display = {}) {
  if (!enabled) return { inset: 0, source: 'off' };
  // The browser exposes screen/work-area heights in the same coordinate space.
  // Scale their difference to the wallpaper viewport (including window previews).
  const fraction = (display.height - display.availHeight) / display.height;
  const known = Number.isFinite(fraction) && fraction >= 0.012 && fraction <= 0.13;
  return {
    inset: Math.round(clamp(height * (known ? fraction : 0.045), 24, Math.min(128, height * 0.13))),
    source: known ? 'screen-work-area' : 'fallback',
  };
}

export function createScreenLayout(getSettings) {
  const root = document.documentElement,
    room = document.getElementById('room');
  const info = document.getElementById('infoPanel'),
    controls = document.querySelector('.right-panel');
  const footer = document.getElementById('clockPanel'),
    header = document.querySelector('.topbar');
  const chatter = document.getElementById('chatterBubble'),
    hug = document.getElementById('hugButton');
  let pending = 0,
    snapshot = null;
  const css = (key, value) => {
    if (root.style.getPropertyValue(key) !== value) root.style.setProperty(key, value);
  };
  const px = (key, value) => css(key, `${Math.round(value * 10) / 10}px`);
  const measure = (node) => (node.hidden ? 0 : node.getBoundingClientRect().height);
  function update() {
    pending = 0;
    const width = innerWidth,
      height = innerHeight,
      settings = getSettings();
    const profile = screenProfile(width, height),
      taskbar = taskbarSpace(height, settings.avoidTaskbar, window.screen);
    const usable = height - taskbar.inset,
      edge = clamp(width * 0.02, 14, 40),
      edgeY = clamp(usable * 0.02, 12, 30),
      gap = clamp(usable * 0.012, 10, 20);
    const portrait = profile.portrait,
      compact = width < 700;
    root.dataset.display = portrait ? 'portrait' : 'landscape';
    root.dataset.density = usable < 850 || portrait ? 'compact' : 'normal';
    room.dataset.layout = profile.id;
    room.dataset.taskbar = String(settings.avoidTaskbar);
    px('--taskbar-inset', taskbar.inset);
    px('--safe-height', usable);
    px('--edge', edge);
    px('--edge-y', edgeY);
    const headerHeight = clamp(usable * 0.063, 46, 92);
    const contentWidth =
      width / height >= 2.05 ? Math.min(width - 2 * edge, usable * 2.05) : width - 2 * edge;
    const panelInset = (width - contentWidth) / 2;
    const sideWidth = portrait
      ? Math.min(440, (width - 3 * edge) / 2)
      : clamp(Math.min(width * 0.175, usable * 0.25), 170, 340);
    px('--side-width', sideWidth);
    px('--panel-inset', portrait ? edge : panelInset);
    px('--header-height', headerHeight);
    px('--hud-size', clamp(usable * 0.0175, 13, 23));
    px('--clock-size', clamp(width * 0.044, 38, 96));
    px('--date-size', clamp(width * 0.023, 19, 48));
    // Read actual heights after the profile/width tokens take effect. Observers
    // also rerun this on weather fallbacks, study progress or music changes.
    const panelTop = edgeY + Math.max(headerHeight, measure(header)) + gap;
    px('--panel-top', panelTop);
    const footerTop = usable - edgeY - measure(footer),
      panelsBottom = panelTop + Math.max(measure(info), measure(controls));
    const zoom = settings.characterScale / 100;
    let size, top;
    if (portrait) {
      // Reserve a stable speech band, even between exchanges, so opening or
      // dismissing a bubble never shrinks/moves the character during a meal.
      top = panelsBottom + gap + (settings.showChatter ? (compact ? 108 : 122) : 0);
      const available = Math.max(100, footerTop - top - gap);
      size = Math.min(width * 1.04, available, Math.min(width * 0.98, available * 0.97) * zoom);
      top += Math.max(0, available - size) * 0.15;
    } else {
      const centerWidth = width - 2 * (panelInset + sideWidth + gap);
      const maxSize = Math.min(usable - panelTop + 28, centerWidth / 0.56);
      size = Math.max(160, Math.min(maxSize, usable * 0.88 * zoom));
      top = panelTop + Math.max(0, usable - panelTop - size) * 0.15;
    }
    px('--avatar-size', size);
    px('--avatar-top', top);
    const centerWidth = portrait ? width - 2 * edge : width - 2 * (panelInset + sideWidth + gap);
    const bubbleWidth = Math.max(160, Math.min(430, centerWidth - 24));
    px('--speech-width', bubbleWidth);
    px('--speech-bottom', usable - footerTop + gap + 4);
    const chatterWidth = portrait
      ? Math.min(430, width - 2 * edge)
      : Math.min(430, Math.max(240, width * 0.21), centerWidth - 16);
    const chatterRight = width - panelInset - sideWidth - gap * 1.4;
    const chatterLeft = portrait
      ? width - edge - chatterWidth
      : Math.max(edge, Math.min(width / 2 + size * 0.23, chatterRight - chatterWidth));
    const chatterTop = portrait ? panelsBottom + gap : panelTop + clamp(usable * 0.035, 14, 44);
    px('--chatter-width', chatterWidth);
    px('--chatter-left', chatterLeft);
    px('--chatter-top', chatterTop);
    // A short curved tail aims toward the actual face as the screen/zoom changes.
    const chatterHeight = measure(chatter) || 96,
      face = { x: width / 2 + size * 0.02, y: top + size * 0.46 };
    const anchor = clamp(face.x - chatterLeft, 28, chatterWidth - 28),
      tailLength = clamp(size * 0.04, 22, 38);
    const dx = face.x - chatterLeft - anchor,
      dy = Math.max(10, face.y - chatterTop - chatterHeight);
    const distance = Math.hypot(dx, dy),
      tip = { x: anchor + (dx / distance) * tailLength, y: (dy / distance) * tailLength };
    const path = `M ${anchor - 12} 0 Q ${anchor - 8} 8 ${tip.x} ${tip.y} Q ${anchor + 9} 10 ${anchor + 12} 0`;
    document.getElementById('chatterTail').setAttribute('d', path);
    const hugWidth = hug.getBoundingClientRect().width || 170,
      hugHeight = measure(hug) || 78;
    const hugTop = Math.min(
      top + size * (portrait && compact ? 0.6 : 0.52),
      footerTop - gap - hugHeight,
    );
    const hugLeft =
      portrait && compact
        ? (width - hugWidth) / 2
        : clamp(width / 2 + size * 0.23, edge, width - edge - hugWidth);
    px('--hug-left', hugLeft);
    px('--hug-top', Math.max(panelTop, hugTop));
    snapshot = {
      ...profile,
      width,
      height,
      usableHeight: usable,
      taskbarInset: taskbar.inset,
      taskbarSource: taskbar.source,
      avatar: { size, top },
      panelTop,
      panelsBottom,
      footerTop,
      chatter: {
        left: chatterLeft,
        top: chatterTop,
        width: chatterWidth,
        height: chatterHeight,
        anchor,
        tip,
        face,
      },
    };
    document.getElementById('layoutStatus').textContent = `自动适配 · ${profile.label}`;
    document.getElementById('taskbarStatus').textContent = settings.avoidTaskbar
      ? '已为底部 Windows 任务栏预留空间；关闭后铺满底部。'
      : '已关闭任务栏避让，使用整个屏幕。';
  }
  function refresh() {
    if (!pending) pending = requestAnimationFrame(update);
  }
  const observer = new ResizeObserver(refresh);
  for (const node of [info, controls, footer, chatter, hug]) observer.observe(node);
  window.addEventListener('resize', refresh);
  document.fonts.ready.then(refresh);
  refresh();
  return {
    refresh,
    get snapshot() {
      return snapshot;
    },
  };
}
