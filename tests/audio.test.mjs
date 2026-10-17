import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AudioAnalysis,
  SystemMedia,
  playbackState,
  addMusicPose,
  listeningAllowed,
} from '../src/audio.mjs';
import { bodyPose } from '../src/motion.mjs';
import { normalizeSettings } from '../src/settings.mjs';

function sample(t) {
  return Array.from({ length: 128 }, (_, i) =>
    i % 64 < 12 ? 0.05 + 0.8 * Math.exp(-(t % 500) / 65) : 0.06,
  );
}
test('system frequencies merge left and right, contain invalid spikes and reject malformed packets', () => {
  const audio = new AudioAnalysis(),
    values = new Array(128).fill(0);
  values[2] = 8;
  values[66] = 0.4;
  values[3] = NaN;
  values[67] = Infinity;
  assert.ok(audio.ingest(values, 0));
  assert.ok(Math.abs(audio.raw[2] - 0.7) < 1e-6);
  assert.equal(audio.raw[3], 0);
  assert.equal(audio.ingest([1, 2, 3], 40), false);
  assert.equal(audio.lastSample, 0);
});
test('quiet input and a short notification never start a dance; no samples cannot animate', () => {
  const audio = new AudioAnalysis();
  for (let t = 0; t < 3000; t += 33) {
    audio.ingest(new Array(128).fill(t < 100 ? 0.7 : 0.001), t);
    audio.step(t);
    assert.equal(audio.active, false);
  }
  assert.equal(audio.beats, 0);
  assert.equal(audio.sway, 0);
  for (let t = 3000; t < 5000; t += 33) audio.step(t);
  assert.equal(audio.active, false);
  assert.ok(audio.level < 0.0001);
});
test('detected low-frequency onsets drive bounded motion at 15, 30 and 60 FPS; stale audio settles', () => {
  for (const fps of [15, 30, 60]) {
    const audio = new AudioAnalysis();
    let last = -1;
    for (let t = 0; t < 4500; t += 1000 / fps) {
      audio.ingest(sample(t), t);
      audio.step(t);
      assert.ok(Math.abs(audio.sway) <= 1 && audio.bob >= 0 && audio.bob <= 1);
      if (audio.beats > last) {
        if (last > 0) assert.ok(t - audio.lastBeat >= 0);
        last = audio.beats;
      }
    }
    assert.ok(audio.active && audio.beats >= 5, `onsets at ${fps} FPS`);
    for (let t = 4500; t < 7000; t += 1000 / fps) audio.step(t);
    assert.equal(audio.active, false);
    assert.ok(audio.level < 0.001 && Math.abs(audio.sway) < 0.001 && audio.bob < 0.001);
  }
});
test('pausing freezes analysis and a restart cannot reuse stale frequency data', () => {
  const audio = new AudioAnalysis();
  for (let t = 0; t < 1500; t += 33) {
    audio.ingest(sample(t), t);
    audio.step(t);
  }
  const snapshot = JSON.stringify(audio.snapshot());
  audio.step(1600, { paused: true });
  assert.equal(JSON.stringify(audio.snapshot()), snapshot);
  audio.reset();
  audio.step(20000);
  assert.equal(audio.active, false);
  assert.equal(audio.level, 0);
});
test('music uses a rigid bounded body pose and yields to every touch, meal, study and emotional state', () => {
  for (const state of [
    'feeding',
    'petting',
    'pinching',
    'crying',
    'asking_hug',
    'hugging',
    'study',
    'study_tired',
  ])
    assert.equal(listeningAllowed(state, { track: {}, playback: 'playing' }), false);
  assert.equal(listeningAllowed('idle', { track: {}, playback: 'paused' }), false);
  assert.equal(listeningAllowed('idle', { track: {}, playback: 'playing' }), true);
  for (const sway of [-100, -1, 0, 1, 100]) {
    const base = bodyPose([0.05, 0.024], [1, 1], 1, 0),
      pose = addMusicPose(base, { sway, bob: 100 });
    assert.ok(Math.abs(pose.bodyAngle) < Math.PI / 180);
    assert.ok(Math.abs(pose.headAngle) < (2.1 * Math.PI) / 180);
    assert.ok(Math.abs(pose.breath - base.breath) <= 0.00321);
    assert.deepEqual(addMusicPose(base, { sway, bob: 1 }, 0), base);
  }
});
test('media uses host constants, clears stale tracks on loss, and survives missing artist or timeline', () => {
  assert.equal(playbackState(23, { PLAYBACK_PLAYING: 23 }), 'playing');
  assert.equal(playbackState(9, { playback: { PAUSED: 9 } }), 'paused');
  assert.equal(playbackState(3, {}), 'unknown');
  const media = new SystemMedia();
  media.properties({ title: 'Song\nname', artist: null });
  assert.equal(media.track.title, 'Song name');
  assert.equal(media.track.artist, '');
  media.timeline({ position: 30, duration: 20 });
  assert.equal(media.position, 20);
  media.properties({ title: 'New song' });
  assert.equal(media.duration, 0);
  media.hostStatus(false);
  assert.equal(media.track.title, '');
  assert.equal(media.status, 'disabled');
  assert.equal(normalizeSettings({ musicSensitivity: 999 }).musicSensitivity, 150);
});
