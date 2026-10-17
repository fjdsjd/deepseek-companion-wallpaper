// Desktop hosts may consume wheel events. These controls only require clicks.
export function createSettingsNavigation(viewport, content, up, down, position) {
  function refresh() {
    if (!viewport.clientHeight) return;
    const max = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const top = Math.max(0, Math.min(max, viewport.scrollTop));
    up.disabled = top <= 1;
    down.disabled = top >= max - 1;
    position.textContent =
      max <= 1
        ? '全部'
        : top <= 1
          ? '顶部'
          : top >= max - 1
            ? '底部'
            : `${Math.round((top / max) * 100)}%`;
  }
  function turn(direction) {
    const step = Math.max(1, Math.round(viewport.clientHeight * 0.8));
    viewport.scrollBy({
      top: step * direction,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }
  up.addEventListener('click', () => turn(-1));
  down.addEventListener('click', () => turn(1));
  viewport.addEventListener('scroll', refresh, { passive: true });
  // Also covers showing the panel, resizing and changes to its content height.
  const resize = new ResizeObserver(refresh);
  resize.observe(viewport);
  resize.observe(content);
  refresh();
  return { refresh };
}
