import test from 'node:test';
import assert from 'node:assert/strict';
import { DialogueVoice } from '../src/dialogue-voice.mjs';
import { Dialogue } from '../src/dialogue.mjs';
import { normalizeSettings } from '../src/settings.mjs';

function fixture() {
  const audio = {
    src: '',
    volume: 0,
    currentTime: 0,
    calls: 0,
    paused: true,
    play() {
      this.calls++;
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
    },
    load() {
      this.currentTime = 0;
    },
    removeAttribute() {
      this.src = '';
    },
    getAttribute() {
      return this.src;
    },
  };
  let now = 0;
  const voice = new DialogueVoice(
    { clips: { 你好: { file: 'assets/voice/a.mp3' }, 抱抱: { file: 'assets/voice/b.mp3' } } },
    { createAudio: () => audio, now: () => now },
  );
  const item = { visible: true, text: '你好', context: 'idle', serial: 1 };
  return { voice, audio, item, advance: (value) => (now += value) };
}
test('a visible line plays once, updating volume cannot restart it', async () => {
  const { voice, audio, item } = fixture();
  voice.sync(item);
  await Promise.resolve();
  for (let i = 0; i < 60; i++) voice.sync(item, { voiceVolume: 25 });
  assert.equal(audio.calls, 1);
  assert.equal(audio.volume, 0.25);
  assert.equal(voice.status, 'playing');
  audio.onended();
  voice.sync(item);
  assert.equal(audio.calls, 1);
});
test('dismiss, disable, zero volume and missing clip stop and release the player', () => {
  for (const [patch, settings] of [
    [{ visible: false }, {}],
    [{ text: 'missing' }, {}],
    [{}, { voiceEnabled: false }],
    [{}, { voiceVolume: 0 }],
  ]) {
    const { voice, audio, item } = fixture();
    voice.sync(item);
    voice.sync({ ...item, ...patch }, settings);
    assert.equal(audio.paused, true);
    assert.equal(audio.src, '');
    assert.equal(voice.active, false);
  }
});
test('a new context replaces speech; a late play rejection cannot cancel its replacement', async () => {
  const { voice, audio, item } = fixture();
  let reject;
  audio.play = () => new Promise((_, r) => (reject = r));
  voice.sync(item);
  audio.play = () => Promise.resolve();
  voice.sync({ ...item, text: '抱抱', context: 'hugging', serial: 2 });
  reject({ name: 'NotAllowedError' });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(voice.status, 'playing');
  assert.equal(audio.src, 'assets/voice/b.mp3');
  assert.equal(voice.pending, false);
});
test('host pause freezes audio and resume continues the same file and position', async () => {
  const { voice, audio, item } = fixture();
  voice.sync(item);
  await Promise.resolve();
  audio.currentTime = 1.8;
  voice.setPaused(true);
  assert.equal(audio.paused, true);
  assert.equal(voice.status, 'paused');
  voice.setPaused(false);
  await Promise.resolve();
  assert.equal(audio.currentTime, 1.8);
  assert.equal(audio.calls, 2);
});
test('autoplay denial retries on a gesture, but closing the bubble cancels the pending line', async () => {
  const { voice, audio, item } = fixture();
  audio.play = () => Promise.reject({ name: 'NotAllowedError' });
  voice.sync(item);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(voice.status, 'awaiting-gesture');
  audio.play = () => Promise.resolve();
  voice.unlock();
  await Promise.resolve();
  assert.equal(voice.status, 'playing');
  voice.sync({ ...item, serial: 2 });
  voice.sync({ visible: false });
  voice.unlock();
  assert.equal(audio.src, '');
});
test('own voice and its short tail are excluded from music loopback', () => {
  const { voice, audio, item, advance } = fixture();
  assert.equal(voice.suppressLoopback, false);
  voice.sync(item);
  assert.equal(voice.suppressLoopback, true);
  audio.onended();
  advance(640);
  assert.equal(voice.suppressLoopback, true);
  advance(11);
  assert.equal(voice.suppressLoopback, false);
});
test('a rejected old play promise after pause cannot cancel a resumed clip', async () => {
  const { voice, audio, item } = fixture();
  let reject;
  audio.play = () => new Promise((_, r) => (reject = r));
  voice.sync(item);
  voice.setPaused(true);
  audio.play = () => Promise.resolve();
  voice.setPaused(false);
  reject({ name: 'AbortError' });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(voice.status, 'playing');
  assert.equal(voice.active, true);
});
test('bubble duration accommodates the recording and settings have safe bounds', () => {
  const dialogue = new Dialogue({ durationMs: () => 9200 });
  assert.equal(dialogue.duration('你好'), 9650);
  assert.equal(normalizeSettings({}).voiceEnabled, true);
  assert.equal(normalizeSettings({}).voiceVolume, 55);
  assert.equal(normalizeSettings({ voiceVolume: 999 }).voiceVolume, 100);
  assert.equal(normalizeSettings({ voiceVolume: -10 }).voiceVolume, 0);
  assert.equal(normalizeSettings({ voiceVolume: null }).voiceVolume, 55);
});
