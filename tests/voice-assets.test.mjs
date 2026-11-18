import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { DIALOGUE_BANK } from '../src/dialogue-bank.mjs';

test('every bubble line has a local, nonempty MP3 and measured duration', () => {
  const manifest = JSON.parse(
    fs.readFileSync(new URL('../src/voice-manifest.json', import.meta.url), 'utf8'),
  );
  const lines = new Set(Object.values(DIALOGUE_BANK).flat(2));
  const files = new Set();
  for (const text of lines) {
    const clip = manifest.clips[text];
    assert.ok(clip, `Missing voice: ${text}`);
    const id = createHash('sha256').update(text).digest('hex').slice(0, 16);
    assert.equal(clip.file, `assets/voice/${id}.mp3`);
    assert.ok(clip.durationMs > 150 && clip.durationMs < 22500, text);
    assert.ok(clip.spokenText && !/[♪♡ﾉ]/.test(clip.spokenText), text);
    const data = fs.readFileSync(new URL('../public/' + clip.file, import.meta.url));
    assert.ok(data.length > 1000, text);
    assert.ok(
      data.subarray(0, 3).toString() === 'ID3' || (data[0] === 255 && (data[1] & 224) === 224),
      text,
    );
    files.add(id + '.mp3');
  }
  assert.deepEqual(new Set(Object.keys(manifest.clips)), lines);
  const packaged = fs
    .readdirSync(new URL('../public/assets/voice/', import.meta.url))
    .filter((name) => name.endsWith('.mp3'));
  assert.deepEqual(new Set(packaged), files, 'Do not ship unused speech clips');
});

test('voice direction covers every emotion and matches the delivered recordings', () => {
  const directions = JSON.parse(
    fs.readFileSync(new URL('../src/voice-direction.json', import.meta.url), 'utf8'),
  );
  const manifest = JSON.parse(
    fs.readFileSync(new URL('../src/voice-manifest.json', import.meta.url), 'utf8'),
  );
  assert.equal(manifest.directionRevision, directions.revision);
  assert.equal(manifest.mode, 'instruct2');
  assert.deepEqual(manifest.mastering, directions.mastering);
  assert.match(manifest.masteringSha256, /^[a-f0-9]{64}$/);
  for (const [context, groups] of Object.entries(DIALOGUE_BANK)) {
    const profile = directions.profiles[context];
    assert.ok(profile, context);
    assert.ok(profile.speed >= 0.8 && profile.speed <= 1.2, context);
    for (const text of groups.flat()) {
      const clip = manifest.clips[text];
      assert.equal(clip.mood, context, `Wrong mood: ${text}`);
      assert.equal(clip.direction, profile.instruction, text);
      assert.match(clip.recipeSha256, /^[a-f0-9]{64}$/);
      assert.equal(
        clip.masteringSha256,
        manifest.masteringSha256,
        `Outdated voice mastering: ${text}`,
      );
    }
  }
});
