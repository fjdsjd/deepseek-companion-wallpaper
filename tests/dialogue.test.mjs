import test from 'node:test';
import assert from 'node:assert/strict';
import { Dialogue, dialogueContext } from '../src/dialogue.mjs';
import { DIALOGUE_BANK, DIALOGUE_LABELS } from '../src/dialogue-bank.mjs';
import { STATES } from '../src/companion.mjs';
import { normalizeSettings } from '../src/settings.mjs';

test('progressive annoyance replies override idle music and study, then settle with the face', () => {
  const d = new Dialogue({ random: () => 0.5 });
  for (let level = 1; level <= 3; level++) {
    const state = level === 2 ? 'study' : 'pinching',
      now = level * 1000;
    const pending = d.step(now, { state, pinchMood: level, listening: true });
    assert.equal(pending.context, `annoyed_${level}`);
    assert.equal(pending.nextAt, now + 120);
    assert.ok(d.step(now + 120, { state, pinchMood: level }).visible);
    assert.equal(
      dialogueContext('idle', { pinchMood: level, listening: true }),
      `annoyed_${level}`,
    );
  }
  assert.equal(d.step(4000, { state: 'idle', pinchMood: 0, listening: true }).context, 'listening');
  assert.equal(dialogueContext('crying', { pinchMood: 3 }), 'crying');
  assert.equal(dialogueContext('feeding', { pinchMood: 3 }), 'feeding');
});

test('every companion mood has short local lines, including music and soothing', () => {
  for (const key of [...STATES, 'listening', 'comfort']) {
    assert.ok(DIALOGUE_BANK[key].length >= 8, key);
    assert.ok(DIALOGUE_LABELS[key]);
    for (const group of DIALOGUE_BANK[key]) {
      assert.ok(group.length >= 1 && group.length <= 2);
      assert.ok(group.every((line) => Array.from(line).length <= 34 && line.trim()));
    }
  }
  assert.equal(dialogueContext('idle', { listening: true }), 'listening');
  assert.equal(dialogueContext('study', { listening: true }), 'study');
  assert.equal(dialogueContext('petting', { comforting: true }), 'comfort');
});

test('a short exchange appears, advances one line, hides, then waits for the chosen interval', () => {
  const d = new Dialogue({ random: () => 0.5 });
  assert.equal(d.step(0).visible, false);
  assert.equal(d.step(3999).visible, false);
  const first = d.step(4000);
  assert.equal(first.line, 1);
  assert.equal(first.total, 2);
  const second = d.step(first.until);
  assert.equal(second.line, 2);
  assert.notEqual(second.text, first.text);
  const quiet = d.step(second.until);
  assert.equal(quiet.visible, false);
  assert.equal(quiet.nextAt - second.until, 45000);
  assert.equal(d.step(quiet.nextAt - 1).visible, false);
  assert.equal(d.step(quiet.nextAt).visible, true);
});

test('shuffle bags exhaust each state before repeating and never repeat across a refill', () => {
  const d = new Dialogue({ random: () => 0 });
  for (const key of Object.keys(DIALOGUE_BANK)) {
    const selected = Array.from({ length: DIALOGUE_BANK[key].length }, () => d.pick(key));
    assert.equal(new Set(selected).size, DIALOGUE_BANK[key].length);
    assert.notEqual(d.pick(key), selected.at(-1));
  }
});

test('touch, tears, feeding and study immediately discard lines from a previous context', () => {
  const d = new Dialogue({ random: () => 0.5 });
  d.step(0);
  assert.equal(d.step(4000).context, 'idle');
  for (const [index, state] of [
    'petting',
    'pinching',
    'crying',
    'asking_hug',
    'hugging',
    'study',
    'study_tired',
    'feeding',
  ].entries()) {
    const now = 5000 + index * 3000,
      change = d.step(now, { state });
    assert.equal(change.visible, false);
    assert.equal(change.context, state);
    const reply = d.step(change.nextAt, { state });
    assert.ok(DIALOGUE_BANK[state].some((group) => group[0] === reply.text));
  }
  d.step(40000, { state: 'petting', comforting: true });
  assert.equal(d.step(40120, { state: 'petting', comforting: true }).context, 'comfort');
});

test('disabled chatter and open settings hide immediately and never accumulate a backlog', () => {
  const d = new Dialogue({ random: () => 0.5 });
  d.step(0);
  assert.equal(d.step(4000).visible, true);
  assert.equal(d.step(4100, { enabled: false }).visible, false);
  assert.equal(d.step(3600000, { enabled: false }).visible, false);
  const resumed = d.step(3600100);
  assert.equal(resumed.visible, false);
  assert.equal(resumed.nextAt, 3604100);
  assert.equal(d.step(3604100).visible, true);
  assert.equal(d.step(3604200, { blocked: true }).visible, false);
  const closed = d.step(7200000, { blocked: false });
  assert.equal(closed.visible, false);
  assert.equal(closed.nextAt, 7204000);
});

test('a frozen active clock keeps the current sentence; a late frame drops stale lines', () => {
  const d = new Dialogue({ random: () => 0.5 });
  d.step(0);
  const first = d.step(4000);
  for (let i = 0; i < 60; i++) assert.deepEqual(d.step(4000), first);
  const late = d.step(first.until + 60000);
  assert.equal(late.visible, false);
  assert.equal(late.nextAt, first.until + 105000);
});

test('chatter settings are bounded, persist-compatible and do not reset other preferences', () => {
  const defaulted = normalizeSettings({ systemInterval: 17 });
  assert.equal(defaulted.showChatter, true);
  assert.equal(defaulted.chatterInterval, 45);
  assert.equal(defaulted.systemInterval, 17);
  assert.equal(normalizeSettings({ chatterInterval: 1 }).chatterInterval, 15);
  assert.equal(normalizeSettings({ chatterInterval: 999 }).chatterInterval, 180);
  assert.equal(
    normalizeSettings({ chatterInterval: '72', showChatter: false }).chatterInterval,
    72,
  );
  assert.equal(normalizeSettings({ chatterInterval: '72', showChatter: false }).showChatter, false);
  for (const value of [null, '', false, NaN])
    assert.equal(normalizeSettings({ chatterInterval: value }).chatterInterval, 45);
  const d = new Dialogue({ random: () => 0.5 });
  d.step(0);
  d.step(1000, { interval: 90 });
  assert.equal(d.snapshot().nextAt, 91000);
});
