import { DIALOGUE_BANK } from './dialogue-bank.mjs';

export function dialogueContext(
  state,
  { listening = false, comforting = false, pinchMood = 0 } = {},
) {
  if (
    pinchMood >= 1 &&
    pinchMood <= 3 &&
    ['pinching', 'idle', 'study', 'study_tired'].includes(state)
  )
    return `annoyed_${pinchMood}`;
  if (state === 'idle' && listening) return 'listening';
  if (state === 'petting' && comforting) return 'comfort';
  return Object.hasOwn(DIALOGUE_BANK, state) ? state : 'idle';
}

// Uses the existing active animation clock: no extra timer, fetch or model call.
export class Dialogue {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.context = null;
    this.group = null;
    this.lineIndex = 0;
    this.nextAt = 0;
    this.until = 0;
    this.interval = 45;
    this.enabled = false;
    this.blocked = false;
    this.bags = new Map();
    this.last = new Map();
    this.serial = 0;
  }
  delay() {
    return this.interval * 1000 * (0.8 + this.random() * 0.4);
  }
  pick(context) {
    const bank = DIALOGUE_BANK[context];
    let bag = this.bags.get(context);
    if (!bag?.length) {
      bag = bank.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.length > 1 && bag.at(-1) === this.last.get(context))
        [bag[0], bag[bag.length - 1]] = [bag.at(-1), bag[0]];
      this.bags.set(context, bag);
    }
    const index = bag.pop();
    this.last.set(context, index);
    return bank[index];
  }
  start(now) {
    this.group = this.pick(this.context);
    this.lineIndex = 0;
    this.serial++;
    this.until = now + this.duration(this.group[0]);
  }
  duration(text) {
    return Math.min(7500, Math.max(5000, Array.from(text).length * 220));
  }
  dismiss(now) {
    // Skip the entire exchange, including its second line. Keep future chatter
    // enabled and wait a normal interval before speaking in the same context.
    this.group = null;
    this.until = 0;
    this.nextAt = now + this.delay();
  }
  step(
    now,
    {
      state = 'idle',
      listening = false,
      comforting = false,
      pinchMood = 0,
      enabled = true,
      blocked = false,
      interval = 45,
    } = {},
  ) {
    const context = dialogueContext(state, { listening, comforting, pinchMood });
    const value = Number(interval),
      nextInterval = Number.isFinite(value) ? Math.min(180, Math.max(15, value)) : 45;
    if (nextInterval !== this.interval) {
      this.interval = nextInterval;
      if (!this.group) this.nextAt = now + this.delay();
    }
    if (!enabled || blocked) {
      this.enabled = enabled;
      this.blocked = blocked;
      this.context = context;
      this.group = null;
      this.until = 0;
      this.nextAt = now + this.delay();
      return this.snapshot();
    }
    const changed = this.context !== context,
      resumed = !this.enabled || this.blocked;
    if (changed || resumed) {
      this.group = null;
      this.until = 0;
      this.context = context;
      // Direct touch/emotion responses are prompt; passive chatter settles first.
      const immediate =
        context.startsWith('annoyed_') ||
        [
          'petting',
          'comfort',
          'pinching',
          'crying',
          'asking_hug',
          'hugging',
          'feeding',
          'study_tired',
        ].includes(context);
      this.nextAt = now + (immediate ? 120 : context === 'study' ? 1200 : 4000);
    }
    this.enabled = true;
    this.blocked = false;
    if (this.group && now >= this.until) {
      // A long suspended frame drops the old exchange instead of replaying it.
      if (now - this.until < 2000 && this.lineIndex + 1 < this.group.length) {
        this.lineIndex++;
        this.serial++;
        this.until = now + this.duration(this.group[this.lineIndex]);
      } else {
        this.group = null;
        this.until = 0;
        this.nextAt = now + this.delay();
      }
    }
    if (!this.group && now >= this.nextAt) this.start(now);
    return this.snapshot();
  }
  snapshot() {
    return {
      context: this.context,
      text: this.group?.[this.lineIndex] || '',
      line: this.group ? this.lineIndex + 1 : 0,
      total: this.group?.length || 0,
      visible: !!this.group,
      serial: this.serial,
      nextAt: this.nextAt,
      until: this.until,
    };
  }
}
