import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Companion,
  STUDY_MS,
  ATTENTION_MS,
  HUG_MS,
  PINCH_REACTION_MS,
  dayProgress,
} from '../src/companion.mjs';
import { normalizeSettings } from '../src/settings.mjs';
import { FEED_MS, feedingPose } from '../src/feeding.mjs';
function fixture() {
  let t = 1000;
  const c = new Companion(() => t);
  return {
    c,
    advance: (ms) => {
      t += ms;
      c.tick();
    },
  };
}
function gesture(c, kind, cancel = false) {
  assert.equal(c.beginGesture(kind), true);
  c.moveGesture(30);
  c.endGesture(cancel);
}

test('each of the first three squeezes previews and retains a distinct mood; fourth cries', () => {
  const { c, advance } = fixture();
  for (let level = 1; level <= 3; level++) {
    c.beginGesture('cheek');
    assert.equal(c.pinchMood, level);
    assert.equal(c.pinchCount, level - 1);
    c.moveGesture(30);
    c.endGesture();
    assert.equal(c.state, 'idle');
    assert.equal(c.pinchMood, level);
    advance(PINCH_REACTION_MS - 1);
    assert.equal(c.pinchMood, level);
    advance(1);
    assert.equal(c.pinchMood, 0);
    assert.equal(c.pinchCount, level);
  }
  c.beginGesture('cheek');
  assert.equal(c.pinchMood, 3);
  c.moveGesture(30);
  c.endGesture();
  assert.equal(c.state, 'crying');
  assert.equal(c.pinchMood, 0);
  gesture(c, 'head');
  assert.equal(c.state, 'asking_hug');
  assert.equal(c.hugRequired, true);
  c.hug();
  advance(HUG_MS);
  assert.equal(c.state, 'idle');
  assert.equal(c.hugRequired, false);
  assert.equal(c.pinchCount, 0);
  c.beginGesture('cheek');
  assert.equal(c.pinchMood, 1);
});

test('short or cancelled squeezes restore the old mood without renewing or counting it', () => {
  const { c, advance } = fixture();
  c.beginGesture('cheek');
  c.endGesture();
  assert.equal(c.pinchMood, 0);
  assert.equal(c.pinchCount, 0);
  gesture(c, 'cheek');
  advance(3000);
  c.beginGesture('cheek');
  assert.equal(c.pinchMood, 2);
  c.moveGesture(11);
  c.endGesture();
  assert.equal(c.pinchMood, 1);
  assert.equal(c.pinchCount, 1);
  gesture(c, 'cheek', true);
  assert.equal(c.pinchMood, 1);
  assert.equal(c.pinchCount, 1);
  advance(3000);
  assert.equal(c.pinchMood, 0);
});

test('petting clears the pout and count without restarting normal study', () => {
  const { c, advance } = fixture();
  c.startStudy();
  const start = c.studyStarted;
  advance(2000);
  gesture(c, 'cheek');
  assert.equal(c.state, 'study');
  assert.equal(c.pinchMood, 1);
  gesture(c, 'head', true);
  assert.equal(c.pinchMood, 1);
  gesture(c, 'head');
  assert.equal(c.pinchMood, 0);
  assert.equal(c.pinchCount, 0);
  gesture(c, 'cheek');
  assert.equal(c.pinchMood, 1);
  advance(PINCH_REACTION_MS);
  assert.equal(c.pinchMood, 0);
  assert.equal(c.studyStarted, start);
  assert.equal(c.state, 'study');
  c.feed();
  assert.equal(c.pinchMood, 0);
});
test('four completed drags cry; petting requests a hug; only a full hug returns idle', () => {
  const { c, advance } = fixture();
  for (let i = 1; i <= 3; i++) {
    gesture(c, 'cheek');
    assert.equal(c.state, 'idle');
    assert.equal(c.pinchCount, i);
  }
  gesture(c, 'cheek');
  assert.equal(c.state, 'crying');
  assert.equal(c.startStudy(), false);
  assert.equal(c.beginGesture('cheek'), true);
  c.endGesture(true);
  c.beginGesture('head');
  assert.equal(c.state, 'petting');
  c.moveGesture(40);
  c.endGesture();
  assert.equal(c.state, 'asking_hug');
  assert.equal(c.pinchCount, 0);
  assert.equal(c.hugRequired, true);
  assert.equal(c.startStudy(), false);
  assert.equal(c.feed(), false);
  assert.equal(c.state, 'asking_hug');
  assert.equal(c.hug(), true);
  advance(HUG_MS - 1);
  assert.equal(c.state, 'hugging');
  advance(1);
  assert.equal(c.state, 'idle');
  assert.equal(c.pinchCount, 0);
  assert.equal(c.hugRequired, false);
});
test('clicks and cancelled drags do not count and cancelled soothing preserves crying', () => {
  const { c } = fixture();
  c.beginGesture('cheek');
  c.endGesture();
  assert.equal(c.pinchCount, 0);
  gesture(c, 'cheek', true);
  assert.equal(c.pinchCount, 0);
  for (let i = 0; i < 4; i++) gesture(c, 'cheek');
  gesture(c, 'head', true);
  assert.equal(c.state, 'crying');
});
test('study uses exact 10 minute and 5 minute thresholds', () => {
  const { c, advance } = fixture();
  c.startStudy();
  advance(STUDY_MS - 1);
  assert.equal(c.state, 'study');
  advance(1);
  assert.equal(c.state, 'study_tired');
  advance(ATTENTION_MS - 1);
  assert.equal(c.state, 'study_tired');
  advance(1);
  assert.equal(c.state, 'asking_hug');
});
test('custom study duration keeps exact boundaries and the five-minute comfort window', () => {
  for (const minutes of [1, 25, 120]) {
    const { c, advance } = fixture();
    c.studyDurationMs = normalizeSettings({ studyMinutes: minutes }).studyMinutes * 60000;
    c.startStudy();
    advance(minutes * 60000 - 1);
    assert.equal(c.state, 'study');
    advance(1);
    assert.equal(c.state, 'study_tired');
    advance(ATTENTION_MS - 1);
    assert.equal(c.state, 'study_tired');
    advance(1);
    assert.equal(c.state, 'asking_hug');
  }
});
test('duration edits apply to the next round without restarting current study or attention', () => {
  const { c, advance } = fixture();
  c.studyDurationMs = 2 * 60000;
  c.startStudy();
  advance(60000);
  c.studyDurationMs = 25 * 60000;
  assert.equal(c.studyCycleMs, 2 * 60000);
  advance(59999);
  assert.equal(c.state, 'study');
  advance(1);
  assert.equal(c.state, 'study_tired');
  const tiredSince = c.tiredSince;
  c.studyDurationMs = 3 * 60000;
  advance(1000);
  assert.equal(c.tiredSince, tiredSince);
  gesture(c, 'head');
  assert.equal(c.state, 'study');
  assert.equal(c.studyCycleMs, 3 * 60000);
  advance(3 * 60000 - 1);
  assert.equal(c.state, 'study');
  advance(1);
  assert.equal(c.state, 'study_tired');
  c.stopStudy();
  c.studyDurationMs = 60000;
  c.startStudy();
  assert.equal(c.studyCycleMs, 60000);
});
test('a meal pauses a custom study round without adopting a pending duration edit', () => {
  const { c, advance } = fixture();
  c.studyDurationMs = 60000;
  c.startStudy();
  advance(59000);
  c.feed();
  c.studyDurationMs = 25 * 60000;
  advance(FEED_MS);
  assert.equal(c.state, 'study');
  assert.equal(c.studyCycleMs, 60000);
  advance(999);
  assert.equal(c.state, 'study');
  advance(1);
  assert.equal(c.state, 'study_tired');
});
test('study duration migrates old preferences and rejects malformed saved or host values', () => {
  assert.equal(normalizeSettings({}).studyMinutes, 10);
  for (const value of [null, undefined, true, false, '', ' ', NaN, Infinity, 'invalid'])
    assert.equal(normalizeSettings({ studyMinutes: value }).studyMinutes, 10);
  for (const [value, expected] of [
    [0, 1],
    [-10, 1],
    [121, 120],
    ['25', 25],
    [25.6, 26],
  ])
    assert.equal(normalizeSettings({ studyMinutes: value }).studyMinutes, expected);
});
test('late tick carries study overflow and reassurance restarts study', () => {
  const a = fixture();
  a.c.startStudy();
  a.advance(STUDY_MS + ATTENTION_MS);
  assert.equal(a.c.state, 'asking_hug');
  const b = fixture();
  b.c.startStudy();
  b.advance(STUDY_MS + 100);
  gesture(b.c, 'head');
  assert.equal(b.c.state, 'study');
  b.advance(STUDY_MS - 1);
  assert.equal(b.c.state, 'study');
  b.advance(1);
  assert.equal(b.c.state, 'study_tired');
});
test('head rub during study retains its timer, cheek does not erase study session', () => {
  const { c, advance } = fixture();
  c.startStudy();
  advance(STUDY_MS - 100);
  gesture(c, 'head');
  gesture(c, 'cheek');
  advance(100);
  assert.equal(c.state, 'study_tired');
  assert.equal(c.stopStudy(), true);
  assert.equal(c.state, 'idle');
});
test('day progress and corrupt persisted settings are bounded', () => {
  assert.equal(dayProgress(new Date(2026, 9, 14, 0, 0, 0)), 0);
  assert.equal(dayProgress(new Date(2026, 9, 14, 12, 0, 0)), 0.5);
  const s = normalizeSettings({
    fps: 999,
    brightness: -10,
    infoSide: 'evil',
    showInfo: 'false',
    latitude: undefined,
  });
  assert.equal(s.fps, 60);
  assert.equal(s.brightness, 45);
  assert.equal(s.infoSide, 'left');
  assert.equal(s.showNodeInfo, true);
  assert.equal('showInfo' in s, false);
  assert.equal('latitude' in s, false);
});

test('a meal rejects duplicate actions but allows a head stroke to clear prior pinching', () => {
  const { c, advance } = fixture();
  gesture(c, 'cheek');
  assert.equal(c.feed(), true);
  const since = c.since;
  advance(1600);
  assert.equal(c.feed(), false);
  assert.equal(c.since, since);
  assert.equal(c.beginGesture('cheek'), false);
  assert.equal(c.startStudy(), false);
  assert.equal(c.stopStudy(), false);
  assert.equal(c.hug(), false);
  gesture(c, 'head');
  assert.equal(c.state, 'feeding');
  assert.equal(c.pinchCount, 0);
  advance(FEED_MS - 1601);
  assert.equal(c.state, 'feeding');
  advance(1);
  assert.equal(c.state, 'idle');
  assert.equal(c.pinchCount, 0);
  assert.equal(c.meal, null);
  assert.equal(c.canFeed, true);
});

test('eating pauses study and attention deadlines without resetting them', () => {
  const { c, advance } = fixture();
  c.startStudy();
  advance(STUDY_MS - 1000);
  c.feed();
  advance(FEED_MS);
  assert.equal(c.state, 'study');
  advance(999);
  assert.equal(c.state, 'study');
  advance(1);
  assert.equal(c.state, 'study_tired');
  advance(ATTENTION_MS - 1000);
  c.feed();
  advance(FEED_MS);
  assert.equal(c.state, 'study_tired');
  advance(1000);
  assert.equal(c.state, 'asking_hug');
});

test('food cannot bypass crying, a pending hug or a held gesture', () => {
  const { c, advance } = fixture();
  c.beginGesture('head');
  assert.equal(c.feed(), false);
  c.endGesture(true);
  for (let i = 0; i < 4; i++) gesture(c, 'cheek');
  assert.equal(c.feed(), false);
  gesture(c, 'head');
  assert.equal(c.canFeed, false);
  c.hug();
  advance(HUG_MS);
  assert.equal(c.canFeed, true);
  c.startStudy();
  advance(STUDY_MS + ATTENTION_MS);
  assert.equal(c.feed(), false);
  c.hug();
  assert.equal(c.feed(), false);
});

test('head strokes clear pinch history but only full crying requires the hug afterward', () => {
  for (const count of [1, 2, 3, 4, 6]) {
    const { c, advance } = fixture();
    for (let i = 0; i < count; i++) gesture(c, 'cheek');
    advance(PINCH_REACTION_MS + 1);
    gesture(c, 'head', true);
    assert.equal(c.pinchCount, count);
    gesture(c, 'head');
    assert.equal(c.pinchCount, 0);
    assert.equal(c.pinchMood, 0);
    assert.equal(c.state, count >= 4 ? 'asking_hug' : 'idle');
    assert.equal(c.hugRequired, count >= 4);
    if (count >= 4) {
      c.hug();
      advance(HUG_MS);
      assert.equal(c.hugRequired, false);
    }
    gesture(c, 'cheek');
    assert.equal(c.pinchCount, 1);
    assert.equal(c.pinchMood, 1);
  }
});

test('crying allows repeated held cheek drags without downgrading the expression', () => {
  const { c } = fixture();
  for (let i = 0; i < 4; i++) gesture(c, 'cheek');
  for (let count = 4; count < 7; count++) {
    assert.equal(c.canGesture('cheek'), true);
    c.beginGesture('cheek');
    assert.equal(c.cryingPinch, true);
    assert.equal(c.pinchMood, 0);
    assert.equal(c.pinchCount, count);
    c.moveGesture(45);
    c.endGesture();
    assert.equal(c.state, 'crying');
    assert.equal(c.pinchCount, count + 1);
  }
  c.beginGesture('cheek');
  c.endGesture(true);
  assert.equal(c.state, 'crying');
  assert.equal(c.pinchCount, 7);
});

test('head reassurance without full crying clears post-pinch tired, asking and hugging states', () => {
  for (const phase of ['study_tired', 'asking_hug', 'hugging']) {
    const { c, advance } = fixture();
    gesture(c, 'cheek');
    c.startStudy();
    advance(STUDY_MS);
    if (phase !== 'study_tired') advance(ATTENTION_MS);
    if (phase === 'hugging') c.hug();
    gesture(c, 'head', true);
    assert.equal(c.state, phase);
    assert.equal(c.pinchCount, 1);
    gesture(c, 'head');
    assert.equal(c.pinchCount, 0);
    assert.equal(c.pinchMood, 0);
    assert.equal(c.state, phase === 'study_tired' ? 'study' : 'idle');
  }
});

test('repeated head strokes cannot skip a required hug or restart its animation', () => {
  const { c, advance } = fixture();
  for (let i = 0; i < 6; i++) gesture(c, 'cheek');
  gesture(c, 'head');
  assert.equal(c.state, 'asking_hug');
  assert.equal(c.pinchCount, 0);
  gesture(c, 'head', true);
  assert.equal(c.state, 'asking_hug');
  assert.equal(c.hugRequired, true);
  gesture(c, 'head');
  assert.equal(c.state, 'asking_hug');
  assert.equal(c.hugRequired, true);
  advance(HUG_MS * 2);
  assert.equal(c.state, 'asking_hug');
  c.hug();
  advance(1000);
  const since = c.since;
  c.beginGesture('head');
  advance(900);
  c.moveGesture(30);
  c.endGesture();
  assert.equal(c.state, 'hugging');
  assert.equal(c.since, since + 900);
  assert.equal(c.hugRequired, true);
  advance(HUG_MS - 1001);
  assert.equal(c.state, 'hugging');
  advance(1);
  assert.equal(c.state, 'idle');
  assert.equal(c.hugRequired, false);
  assert.equal(c.pinchCount, 0);
  gesture(c, 'cheek');
  gesture(c, 'head');
  assert.equal(c.state, 'idle');
  assert.equal(c.hugRequired, false);
});

test('head strokes pause a post-pinch meal without restarting bites or losing study time', () => {
  const { c, advance } = fixture();
  c.startStudy();
  const start = c.studyStarted;
  gesture(c, 'cheek');
  c.feed();
  advance(1600);
  const since = c.since;
  c.beginGesture('head');
  advance(700);
  c.moveGesture(25);
  c.endGesture();
  assert.equal(c.state, 'feeding');
  assert.equal(c.since, since + 700);
  assert.equal(c.pinchCount, 0);
  assert.equal(c.studyStarted, start + 700);
  advance(FEED_MS - 1601);
  assert.equal(c.state, 'feeding');
  advance(1);
  assert.equal(c.state, 'study');
  assert.equal(c.studyStarted, start + 700 + FEED_MS);
});

test('cancelled head strokes resume a hug from its original elapsed time', () => {
  const { c, advance } = fixture();
  c.startStudy();
  advance(STUDY_MS + ATTENTION_MS);
  c.hug();
  advance(1000);
  c.beginGesture('head');
  advance(900);
  c.endGesture(true);
  assert.equal(c.state, 'hugging');
  advance(HUG_MS - 1001);
  assert.equal(c.state, 'hugging');
  advance(1);
  assert.equal(c.state, 'idle');
});

test('late meal ticks carry excess time into the resumed study deadline', () => {
  const { c, advance } = fixture();
  c.startStudy();
  advance(STUDY_MS - 1000);
  c.feed();
  advance(FEED_MS + 1000 + ATTENTION_MS);
  assert.equal(c.state, 'asking_hug');
});

test('feeding animation includes two bites, continuous local motion, chewing, and finish', () => {
  assert.equal(feedingPose(0).frame, 'feeding_ready');
  assert.equal(feedingPose(2000).frame, 'feeding_bite');
  assert.equal(feedingPose(6500).frame, 'feeding_bite');
  assert.equal(feedingPose(3500).frame, 'feeding_chew');
  assert.equal(feedingPose(8500).frame, 'feeding_chew');
  assert.notEqual(feedingPose(1000).spoon.y, feedingPose(1200).spoon.y);
  assert.notEqual(feedingPose(3500).chew, feedingPose(3600).chew);
  assert.equal(feedingPose(FEED_MS).phase, 'finish');
  assert.equal(feedingPose(FEED_MS).progress, 1);
  for (let t = 0; t < FEED_MS; t += 13) {
    const p = feedingPose(t);
    assert.ok(p.spoon.y >= 0.528 && p.spoon.y <= 0.725);
    assert.ok(p.chew >= 0 && p.chew <= 1);
    assert.equal(p.arm, undefined);
  }
});
test('the separate spoon reaches the mouth twice, empties each bite and refills at the bowl', () => {
  for (const t of [1800, 6250]) {
    const spoon = feedingPose(t).spoon;
    assert.equal(spoon.y, 0.528);
    assert.equal(spoon.x, 0.525);
    assert.equal(spoon.loaded, 1);
  }
  for (const t of [2350, 6800]) assert.equal(feedingPose(t).spoon.loaded, 0);
  assert.equal(feedingPose(5350).spoon.loaded, 1);
  assert.equal(feedingPose(FEED_MS).spoon.opacity, 0);
  for (let t = 1; t < FEED_MS; t++) {
    const a = feedingPose(t - 1).spoon,
      b = feedingPose(t).spoon;
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.001, 'spoon path is continuous across phases');
    assert.equal(b.width, 0.26);
    assert.ok(b.loaded >= 0 && b.loaded <= 1);
  }
});
