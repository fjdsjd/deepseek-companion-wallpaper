import { SETTINGS_KEY } from './storage-keys.mjs';
export const DEFAULTS = Object.freeze({
  showNodeInfo: true,
  showRootEnvironment: true,
  showConsole: true,
  showClock: true,
  avoidTaskbar: true,
  showParticles: true,
  mouseTracking: true,
  enablePet: true,
  enablePinch: true,
  infoSide: 'left',
  characterScale: 100,
  brightness: 88,
  motion: 80,
  fps: 30,
  systemInterval: 5,
  studyMinutes: 10,
  showChatter: true,
  chatterInterval: 45,
  mealEffects: true,
  showMusic: true,
  musicMotion: true,
  musicEffects: true,
  musicSensitivity: 100,
});
export function normalizeSettings(input = {}) {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof DEFAULTS[key] === 'boolean' && typeof input[key] === 'boolean')
      out[key] = input[key];
  }
  out.infoSide = input.infoSide === 'right' ? 'right' : 'left';
  for (const [key, min, max] of [
    ['systemInterval', 2, 60],
    ['chatterInterval', 15, 180],
    ['studyMinutes', 1, 120],
  ]) {
    const value = input[key];
    if (
      (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
      Number.isFinite(Number(value))
    )
      out[key] = Math.round(Math.min(max, Math.max(min, Number(value))));
  }
  for (const [k, min, max] of [
    ['characterScale', 75, 120],
    ['brightness', 45, 115],
    ['motion', 0, 100],
    ['fps', 15, 60],
    ['musicSensitivity', 50, 150],
  ]) {
    if (Number.isFinite(Number(input[k]))) out[k] = Math.min(max, Math.max(min, Number(input[k])));
  }
  return out;
}
export function readSettings() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
  } catch {
    return { ...DEFAULTS };
  }
}
export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
