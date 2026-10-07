/**
 * Every player-facing string (DESIGN.md §1.2). Player text never shows model symbols and always
 * says "stock", never "ball". To add a language, add another object of type `Copy` to `languages`.
 */

export type Level = 0 | 1 | 2 | 3;

export interface Copy {
  header: { eyebrow: string; title: string; tagline: string; hint: string };
  legend: { prefix: string; up: string; down: string };
  intro: {
    steps: readonly [IntroText, IntroText, IntroText];
    free: IntroText;
    next: string;
    skip: string;
    replay: string;
  };
  controls: {
    mood: SliderText;
    herd: SliderText;
    days: { label: string; value: (n: number) => string; fewer: string; more: string };
    locked: string;
    reset: string;
  };
  captions: {
    needMore: (landed: number) => string;
    wider: string;
    narrower: string;
    same: string;
    /** `same` during intro step 1, where the point is the bell itself. */
    bell: string;
    unclear: string;
    moodUp: string;
    moodDown: string;
    outOfStocks: string;
  };
  board: {
    outline: string;
    binsCaption: (n: number) => string;
    percent: (fraction: number) => string;
  };
  stock: {
    panelCaption: (n: number) => string;
    empty: string;
    day: (t: number) => string;
    price: (value: number) => string;
    title: (n: number) => string;
    summary: (start: number, end: number, change: number) => string;
    streak: (days: number, up: boolean) => string;
  };
  errors: { noWebgl: string; noWebglDetail: string };
}

export interface IntroText {
  lines: readonly string[];
}

export interface SliderText {
  label: string;
  subtitle: string;
  left: string;
  center: string;
  right: string;
  /** Current setting in words; `level` 0 = neutral, 1 = a little, 2 = clearly, 3 = strongly. */
  value: (direction: -1 | 1, level: Level) => string;
}

const money = (value: number): string => `$${value.toFixed(2)}`;
const pct = (fraction: number, digits = 0): string => {
  const value = fraction * 100;
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return `0%`;
  return `${value > 0 ? '+' : '−'}${text}%`;
};

const en: Copy = {
  header: {
    eyebrow: 'MARKET UNDER STRESS',
    title: 'Chapter 1 · The Board',
    tagline: 'Can you see through the machine?',
    hint: 'Click or hold Space to drop stocks · click a landed stock to read its story · D: debug',
  },
  legend: { prefix: "Color = the stock's last move:", up: 'up', down: 'down' },
  intro: {
    steps: [
      { lines: ['The market is a pinball machine. Each ball is a stock; each row of pegs is a trading day.', 'Drop some stocks: click, or hold Space.'] },
      { lines: ['The crowd has a mood. Slide Mood toward Panic or Optimism.', 'Watch the whole pile shift.'] },
      { lines: ["The crowd also reacts to each stock's move yesterday. Slide Yesterday.", "The outline shows a crowd that ignores yesterday. The gap between the pile and the outline is the crowd's behavior."] },
    ],
    free: { lines: ['Your machine now. Set the crowd, drop stocks, click one to read its story. If the crowd has habits, a gambler could use them.'] },
    next: 'Next',
    skip: 'Skip intro',
    replay: 'Replay intro',
  },
  controls: {
    mood: {
      label: 'Mood',
      subtitle: 'How the crowd feels about the market',
      left: 'Panic',
      center: 'Calm',
      right: 'Optimism',
      value: (direction, level) => (level === 0 ? 'Calm'
        : direction > 0 ? ['', 'A little optimistic', 'Optimistic', 'Very optimistic'][level]
          : ['', 'A little panicked', 'Panicked', 'Very panicked'][level]),
    },
    herd: {
      label: 'Yesterday',
      subtitle: "How the crowd reacts to yesterday's move",
      left: 'Turns against it',
      center: 'Ignores it',
      right: 'Chases it',
      value: (direction, level) => (level === 0 ? 'Ignores yesterday'
        : direction > 0 ? ['', 'Chases it a little', 'Chases it', 'Chases it hard'][level]
          : ['', 'Turns against it a little', 'Turns against it', 'Turns against it hard'][level]),
    },
    days: { label: 'Days', value: (n) => `${n} days`, fewer: 'Fewer days', more: 'More days' },
    locked: 'Unlocks in the next step',
    reset: 'Start over (R)',
  },
  captions: {
    needMore: (landed) => `Only ${landed} ${landed === 1 ? 'stock' : 'stocks'} so far. Drop more to see a pattern.`,
    wider: 'Wider than the outline: the crowd is chasing, so big wins and big losses are both more common.',
    narrower: 'Narrower than the outline: the crowd keeps reversing, so stocks end up closer to where they started.',
    same: 'The pile matches the outline: no visible pattern yet.',
    bell: 'Most stocks end up near where they started, and big wins and losses are rare. Many small random pushes make this bell shape.',
    unclear: 'The pile may be pulling away from the outline. Drop more stocks to be sure.',
    moodUp: "The crowd's mood is pushing stocks up overall.",
    moodDown: "The crowd's mood is pushing stocks down overall.",
    outOfStocks: 'Out of stocks. Press R to start over.',
  },
  board: {
    outline: 'If the crowd ignored yesterday',
    binsCaption: (n) => `Where each stock ends up after ${n} days`,
    percent: (fraction) => pct(fraction),
  },
  stock: {
    panelCaption: (n) => `Price over ${n} days`,
    empty: 'Click a landed stock to see its days.',
    day: (t) => `Day ${t}`,
    price: (value) => `$${value.toFixed(0)}`,
    title: (n) => `This stock's ${n} days`,
    summary: (start, end, change) => `Started at ${money(start)} · ended at ${money(end)} · ${pct(change, 1)}`,
    streak: (days, up) => `Longest streak: ${days} ${days === 1 ? 'day' : 'days in a row'}, ${up ? 'up' : 'down'}`,
  },
  errors: { noWebgl: '3D VIEW UNAVAILABLE', noWebglDetail: 'WebGL could not start. Reload to retry.' },
};

export const languages = { en } as const satisfies Record<string, Copy>;
export type Language = keyof typeof languages;

let current: Language = 'en';

export function setLanguage(language: Language): void {
  current = language;
}

/** The active language's strings. */
export function copy(): Copy {
  return languages[current];
}
