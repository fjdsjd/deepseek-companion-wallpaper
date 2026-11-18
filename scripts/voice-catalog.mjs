import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DIALOGUE_BANK } from '../src/dialogue-bank.mjs';

// Keep the visible kaomoji; remove them only from the spoken copy.
export function spokenText(text) {
  return text
    .replace(/\([^\p{Script=Han}]*\)/gu, '')
    .replace(/[…]+/g, '，')
    .replace(/[—～~]+/g, '，')
    .replace(/[♪♫♡♥]/g, '')
    .replace(/，([。！？?!])/g, '$1')
    .replace(/[^\p{Script=Han}\d，。！？、：；,.!?\s]/gu, '')
    .trim()
    .replace(/，+/g, '，')
    .replace(/^，/, '')
    .replace(/，$/, '。')
    .trim();
}
const rows = new Map();
const direction = JSON.parse(
  await fs.readFile(new URL('../src/voice-direction.json', import.meta.url), 'utf8'),
);
for (const [context, groups] of Object.entries(DIALOGUE_BANK))
  for (const text of groups.flat()) {
    const id = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const profile = direction.profiles[context];
    if (!profile) throw Error(`Missing voice direction: ${context}`);
    if (!rows.has(text))
      rows.set(text, {
        id,
        text,
        spokenText: spokenText(text),
        contexts: [],
        mood: context,
        ...profile,
      });
    rows.get(text).contexts.push(context);
  }
const catalog = {
  schema: 2,
  voice: 'feiyu',
  style: 'cute',
  directionRevision: direction.revision,
  mastering: direction.mastering,
  mode: 'instruct2',
  lines: [...rows.values()],
};
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(catalog, null, 2) + '\n');
else console.log(JSON.stringify(catalog, null, 2));
