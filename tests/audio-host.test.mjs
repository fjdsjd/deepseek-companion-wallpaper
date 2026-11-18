import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { SystemMedia } from '../src/audio.mjs';
const script = readFileSync(new URL('../public/audio-host.js', import.meta.url), 'utf8');
function host() {
  const callbacks = {},
    window = {};
  for (const [name, key] of [
    ['Audio', 'audio'],
    ['MediaProperties', 'properties'],
    ['MediaPlayback', 'playback'],
    ['MediaStatus', 'status'],
    ['MediaTimeline', 'timeline'],
  ])
    window[`wallpaperRegister${name}Listener`] = (fn) => {
      callbacks[key] = fn;
    };
  runInNewContext(script, { window, performance: { now: () => 10 } });
  return { callbacks, bridge: window.__deepseekAudioHost };
}
test('startup replays latest host events by their actual order, including equal timestamps', () => {
  const { callbacks: c, bridge } = host(),
    media = new SystemMedia(),
    order = [];
  c.properties({ title: 'old' });
  c.status({ enabled: false });
  c.status({ enabled: true });
  c.properties({ title: 'new' });
  c.playback({ state: 'playing' });
  bridge.subscribe((kind, data) => {
    order.push(kind);
    if (kind === 'status') media.hostStatus(data.enabled);
    if (kind === 'properties' && media.enabled) media.properties(data);
    if (kind === 'playback' && media.enabled) media.setPlayback(data.state);
  });
  assert.deepEqual(order, ['status', 'properties', 'playback']);
  assert.equal(media.track.title, 'new');
  assert.equal(media.playback, 'playing');
});
test('disabling media invalidates previously buffered track and timeline', () => {
  const { callbacks: c, bridge } = host(),
    events = [];
  c.properties({ title: 'old' });
  c.timeline({ position: 5 });
  c.playback({ state: 'playing' });
  c.status({ enabled: false });
  c.status({ enabled: true });
  bridge.subscribe((kind) => events.push(kind));
  assert.deepEqual(events, ['status']);
});
