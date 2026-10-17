// One cancellable clock. Wallpaper Engine pause/visibility stops both callbacks
// and timers; resume cannot create a second rendering chain.
export function createFrameLoop(draw, getFps, { pacedByHost = false } = {}) {
  let running = false,
    raf = 0,
    timer = 0,
    next = 0;
  function schedule() {
    if (!running) return;
    // CEF's Wallpaper Engine host already schedules animation callbacks at
    // its selected FPS. An extra timeout before requesting a host frame can
    // double that interval (15 FPS becomes ~7.5 FPS).
    if (pacedByHost) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const wait = next - performance.now() - 6;
    if (wait > 5)
      timer = setTimeout(() => {
        timer = 0;
        if (running) raf = requestAnimationFrame(frame);
      }, wait);
    else raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    raf = 0;
    if (!running) return;
    if (now + 1 >= next) {
      const interval = 1000 / getFps();
      next = Math.max(next + interval, now + interval - 2);
      draw(now);
    }
    schedule();
  }
  return {
    start() {
      if (running) return;
      running = true;
      next = 0;
      schedule();
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      raf = timer = 0;
    },
    get running() {
      return running;
    },
  };
}
