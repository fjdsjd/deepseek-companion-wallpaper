// All phases use the same active clock as study and hugs, so host pause freezes a bite.
export const FEED_MS = 10800;
// The bite phase uses feeding_base; a separate full portrait was redundant.
export const FEED_FRAMES = ['feeding_ready', 'feeding_chew'];
export const FEED_LAYERS = ['feeding_base', 'spoon_loaded', 'spoon_empty'];
export const SPOON_ANCHOR = [0.83, 0.505];
const phases = [
  ['serve', 0, 900, 'feeding_ready', '端好饭碗', '饭来啦！(๑´ڡ`๑)'],
  ['lift', 900, 1800, 'feeding_ready', '送饭入口', '啊——'],
  ['bite', 1800, 2350, 'feeding_bite', '吃一口', '啊呜！'],
  ['lower', 2350, 3000, 'feeding_chew', '放下小勺', '唔，嚼嚼……'],
  ['chew', 3000, 4700, 'feeding_chew', '慢慢咀嚼', '嚼嚼……香香的。'],
  ['scoop', 4700, 5350, 'feeding_ready', '再舀一勺', '下一勺，准备！'],
  ['lift', 5350, 6250, 'feeding_ready', '送饭入口', '再来一口——'],
  ['bite', 6250, 6800, 'feeding_bite', '吃一口', '啊呜！'],
  ['lower', 6800, 7450, 'feeding_chew', '放下小勺', '唔，嚼嚼……'],
  ['chew', 7450, 9450, 'feeding_chew', '慢慢咀嚼', '嘿嘿，白米饭真香。'],
  ['finish', 9450, FEED_MS, 'feeding_chew', '吃好啦', '吃好啦，谢谢投喂 (´ڡ`)'],
];
const smooth = (x) => x * x * (3 - 2 * x);
export function feedingPose(elapsed) {
  const t = Math.max(0, Math.min(FEED_MS, Number.isFinite(elapsed) ? elapsed : 0));
  const [phase, start, end, baseFrame, label, caption] =
    phases.find((p) => t < p[2]) || phases.at(-1);
  const progress = (t - start) / (end - start),
    ease = smooth(progress);
  let frame = baseFrame,
    travel = 0,
    loaded = 1,
    opacity = 1,
    scoop = 0;
  // The spoon is an independent rigid layer. Both hands stay on the bowl.
  if (phase === 'serve') opacity = smooth(Math.min(1, progress * 3));
  if (phase === 'lift') {
    frame = progress < 0.55 ? 'feeding_ready' : 'feeding_bite';
    travel = ease;
  }
  if (phase === 'bite') {
    travel = 1;
    loaded = 1 - smooth(Math.max(0, Math.min(1, (progress - 0.25) / 0.6)));
  }
  if (phase === 'lower') {
    frame = progress < 0.35 ? 'feeding_bite' : 'feeding_chew';
    travel = 1 - ease;
    loaded = 0;
  }
  if (phase === 'chew' || phase === 'finish') loaded = 0;
  if (phase === 'scoop') {
    scoop = Math.sin(progress * Math.PI);
    loaded = smooth(Math.max(0, Math.min(1, (progress - 0.3) / 0.5)));
  }
  if (phase === 'finish') opacity = 1 - ease;
  const spoon = {
    x: 0.515 + 0.01 * travel - 0.018 * Math.sin(travel * Math.PI) + 0.012 * scoop,
    y: 0.7 - 0.172 * travel + 0.025 * scoop,
    width: 0.26,
    angle: 0.18 - 0.21 * travel + 0.12 * scoop,
    loaded,
    opacity,
  };
  const chewing = phase === 'chew' || (phase === 'lower' && progress > 0.65);
  const envelope =
    phase === 'chew'
      ? Math.min(1, progress * 8, (1 - progress) * 8)
      : smooth(Math.max(0, (progress - 0.65) / 0.35));
  const chew = chewing ? (1 - Math.cos(((t - 3000) / 1000) * Math.PI * 5)) * 0.5 * envelope : 0;
  const nod = phase === 'finish' ? Math.sin(ease * Math.PI) : 0;
  return { phase, frame, label, caption, progress: t / FEED_MS, spoon, chew, nod };
}
