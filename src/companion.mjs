import { FEED_MS } from './feeding.mjs';
export const STUDY_MS = 10 * 60 * 1000;
export const ATTENTION_MS = 5 * 60 * 1000;
export const HUG_MS = 4200;
export const PINCH_REACTION_MS = 6000;
export const STATES = [
  'idle',
  'petting',
  'pinching',
  'crying',
  'asking_hug',
  'hugging',
  'study',
  'study_tired',
  'feeding',
];

// State transitions use injected active time, never accelerated production timers.
export class Companion {
  constructor(now = () => Date.now(), changed = () => {}) {
    this.now = now;
    this.changed = changed;
    this.state = 'idle';
    this.since = now();
    this.pinchCount = 0;
    this.pinchReactionUntil = 0;
    this.hugRequired = false;
    this.studyDurationMs = STUDY_MS;
    this.studyCycleMs = STUDY_MS;
    this.studyStarted = null;
    this.tiredSince = null;
    this.gesture = null;
    this.meal = null;
  }
  transition(state, reason, since = this.now()) {
    if (!STATES.includes(state)) throw new Error('Unknown companion state');
    this.state = state;
    this.since = since;
    this.changed(this.snapshot(), reason);
  }
  snapshot() {
    return {
      state: this.state,
      since: this.since,
      pinchCount: this.pinchCount,
      pinchMood: this.pinchMood,
      cryingPinch: this.cryingPinch,
      hugRequired: this.hugRequired,
      studyStarted: this.studyStarted,
      tiredSince: this.tiredSince,
      studyDurationMs: this.studyDurationMs,
      studyCycleMs: this.studyCycleMs,
    };
  }
  get pinchMood() {
    // Preview this squeeze without counting it. Only a completed drag counts.
    if (this.state === 'pinching') return this.cryingPinch ? 0 : Math.min(3, this.pinchCount + 1);
    if (
      ['idle', 'study', 'study_tired'].includes(this.state) &&
      this.now() < this.pinchReactionUntil
    )
      return Math.min(3, this.pinchCount);
    return 0;
  }
  get cryingPinch() {
    return this.state === 'pinching' && this.gesture?.previous === 'crying';
  }
  clearPinchEmotion() {
    this.pinchCount = 0;
    this.pinchReactionUntil = 0;
  }
  canGesture(kind) {
    if (this.gesture || !['head', 'cheek'].includes(kind)) return false;
    // A head stroke can reassure every post-pinch state, including a meal.
    if (kind === 'head') return this.state !== 'feeding' || this.pinchCount > 0;
    return !['hugging', 'asking_hug', 'feeding'].includes(this.state);
  }
  startStudy() {
    if (this.gesture || ['crying', 'asking_hug', 'hugging', 'feeding'].includes(this.state))
      return false;
    this.studyStarted = this.now();
    // Keep this round stable if the user changes the next round's duration.
    this.studyCycleMs = this.studyDurationMs;
    this.tiredSince = null;
    this.transition('study', 'study.start');
    return true;
  }
  stopStudy() {
    if (this.gesture || !['study', 'study_tired'].includes(this.state)) return false;
    this.studyStarted = this.tiredSince = null;
    this.transition('idle', 'study.rest');
    return true;
  }
  beginGesture(kind) {
    if (!this.canGesture(kind)) return false;
    this.gesture = {
      kind,
      previous: this.state,
      previousSince: this.since,
      startedAt: this.now(),
      distance: 0,
    };
    this.transition(kind === 'head' ? 'petting' : 'pinching', `touch.${kind}`);
    return true;
  }
  moveGesture(distance) {
    if (this.gesture) this.gesture.distance += Math.max(0, distance);
  }
  endGesture(cancelled = false) {
    if (!this.gesture) return;
    const { kind, previous, previousSince, startedAt, distance } = this.gesture;
    this.gesture = null;
    const pausedFor = this.now() - startedAt;
    const resumeSince = ['feeding', 'hugging'].includes(previous)
      ? previousSince + pausedFor
      : previousSince;
    if (previous === 'feeding') {
      // Keep the current bite and extend study's pause only by the head stroke.
      if (this.studyStarted !== null) this.studyStarted += pausedFor;
      if (this.tiredSince !== null) this.tiredSince += pausedFor;
    }
    if (cancelled || distance < 12) {
      this.transition(previous, 'touch.cancel', resumeSince);
      return;
    }
    if (kind === 'cheek') {
      this.pinchCount++;
      this.pinchReactionUntil = this.pinchCount < 4 ? this.now() + PINCH_REACTION_MS : 0;
      if (this.pinchCount > 3) {
        this.hugRequired = true;
        this.studyStarted = this.tiredSince = null;
        this.transition('crying', 'emotion.cry');
      } else this.transition(previous, 'touch.cheek.release', previousSince);
    } else {
      this.clearPinchEmotion();
      if (this.hugRequired) {
        // Once she has cried, head strokes soothe her but cannot replace the hug.
        this.studyStarted = this.tiredSince = null;
        if (previous === 'hugging') this.transition('hugging', 'emotion.hug.resume', resumeSince);
        else this.transition('asking_hug', 'emotion.comforted');
      } else if (['asking_hug', 'hugging'].includes(previous)) {
        this.studyStarted = this.tiredSince = null;
        this.transition('idle', 'emotion.reassured');
      } else if (previous === 'study_tired') {
        this.studyStarted = this.now();
        this.studyCycleMs = this.studyDurationMs;
        this.tiredSince = null;
        this.transition('study', 'study.reassured');
      } else this.transition(previous, 'touch.head.release', resumeSince);
    }
  }
  hug() {
    if (this.state !== 'asking_hug') return false;
    this.transition('hugging', 'emotion.hug');
    return true;
  }
  get canFeed() {
    return !this.gesture && ['idle', 'study', 'study_tired'].includes(this.state);
  }
  feed() {
    if (!this.canFeed) return false;
    this.meal = { previous: this.state };
    this.transition('feeding', 'meal.start');
    return true;
  }
  tick() {
    const now = this.now();
    if (this.pinchReactionUntil && now >= this.pinchReactionUntil) {
      this.pinchReactionUntil = 0;
      // Settling a facial reaction must not restart the underlying study timer.
      this.changed(this.snapshot(), 'emotion.settle');
    }
    if (this.state === 'feeding' && now - this.since >= FEED_MS) {
      const meal = this.meal;
      // Eating pauses both study and the wait for comfort; it never resets pinch history.
      if (this.studyStarted !== null) this.studyStarted += FEED_MS;
      if (this.tiredSince !== null) this.tiredSince += FEED_MS;
      this.meal = null;
      this.transition(meal.previous, 'meal.finish');
    }
    if (this.state === 'study' && now - this.studyStarted >= this.studyCycleMs) {
      // Carry overflow forward when a delayed timer resumes.
      this.tiredSince = this.studyStarted + this.studyCycleMs;
      this.transition('study_tired', 'study.attention');
    }
    if (this.state === 'study_tired' && now - this.tiredSince >= ATTENTION_MS) {
      this.transition('asking_hug', 'study.lonely');
    }
    if (this.state === 'hugging' && now - this.since >= HUG_MS) {
      this.clearPinchEmotion();
      this.hugRequired = false;
      this.studyStarted = this.tiredSince = null;
      this.transition('idle', 'emotion.calm');
    }
  }
}

export function dayProgress(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return Math.max(0, Math.min(1, (date - start) / (end - start)));
}
