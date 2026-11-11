// Daily and weekly fun: the chicken of the day, and the weekly boss challenge. Pure functions of the date, so the browser and
// the server always agree.
import { BOSS_KINDS, WEEK_RULE_IDS } from './sim';
import { dayId, weekId, hash32 } from './timeutil';

/** Same order as the costume list in src/costumes.ts (a chicken's costume is its id % 10). */
export const COSTUME_INFO = [
  { name: 'Pirate Pete', icon: '🏴‍☠️', fact: 'Lost one eye and gained a lot of confidence.' },
  { name: 'Astro Ace', icon: '🚀', fact: 'First chicken on the moon. It laid an egg up there.' },
  { name: 'Ninja Nugget', icon: '🥷', fact: 'You will never hear the cluck coming.' },
  { name: 'Cowboy Clucker', icon: '🤠', fact: 'Fastest peck in the barnyard west.' },
  { name: 'Captain Cape', icon: '🦸', fact: 'Cannot actually fly, but nobody has told the cape.' },
  { name: 'Wizard Wattle', icon: '🧙', fact: 'Turned a worm into a bigger worm. Twice.' },
  { name: 'Zombie Zed', icon: '🧟', fact: 'Only craves corn. Mostly.' },
  { name: 'Party Pecky', icon: '🥳', fact: 'Shows up to every wave with confetti and zero invites.' },
  { name: 'Sleepy Sue', icon: '😴', fact: 'Flies in her sleep. Hits the walls less than you think.' },
  { name: 'Robo Rooster', icon: '🤖', fact: 'Built from spare toasters. Crows in binary.' },
];

export const WEEK_RULES = [
  { id: 'freeze', name: 'Deep freeze', desc: 'Every 20 seconds the whole crew freezes for a second.' },
  { id: 'hurry', name: 'Hurry up', desc: 'The boss attacks 35% faster.' },
  { id: 'glass', name: 'Glass cannon', desc: 'One life only, but the boss takes double damage.' },
  { id: 'storm', name: 'Egg storm', desc: 'An extra ring of eggs every 6 seconds.' },
];

/** { id, index, name, icon, fact, bonus }: kills of this costume score +50 today. */
export function cotdInfo(date = new Date()) {
  const id = dayId(date);
  const index = hash32('cotd:' + id) % COSTUME_INFO.length;
  return { id, index, ...COSTUME_INFO[index], bonus: 50 };
}

/** { id, boss, rule, ruleName, ruleDesc, seed, reward }: one boss and one special rule for the whole week. */
export function weekBossInfo(date = new Date()) {
  const id = weekId(date);
  const h = hash32('weekboss:' + id);
  const boss = BOSS_KINDS[h % BOSS_KINDS.length];
  const rule = WEEK_RULES[(h >>> 8) % WEEK_RULES.length];
  return { id, boss, rule: rule.id, ruleName: rule.name, ruleDesc: rule.desc, seed: hash32('weekseed:' + id), reward: 8 };
}

export const WEEK_RULE_COUNT = WEEK_RULE_IDS.length;
