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
    continueToTerrain: string;
  };
  controls: {
    mood: SliderText;
    herd: SliderText;
    days: { label: string; value: (n: number) => string; fewer: string; more: string };
    locked: string;
    reset: string;
    /** Shown instead of Mood and Yesterday while a mystery machine is active. */
    mystery: string;
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
  terrain: TerrainCopy;
  test: TestCopy;
  errors: { noWebgl: string; noWebglDetail: string };
}

export interface TerrainCopy {
  header: { title: string; tagline: string; hint: string };
  legend: readonly string[];
  /** Asymmetry note, from the rendered labels at ± the same distance. */
  asymmetry: (fall: string, rise: string) => string;
  intro: { steps: readonly [IntroText, IntroText]; free: IntroText; back: string };
  day: { label: string; subtitle: string; left: string; right: string; value: (day: number, days: number) => string };
  labels: { day: (t: number) => string; offMap: string; ghost: string };
  year: { wider: string; narrower: string; same: string; unclear: string; needMore: string; moodUp: string; moodDown: string; offMap: string };
  dayCaption: {
    middleHalf: (day: number, low: string, high: string) => string;
    wider: string;
    narrower: string;
    same: string;
    unclear: string;
  };
}

export type VerdictKey = 'sawThrough' | 'fooledYourself' | 'justLuck';
export type RevealKey = 'found' | 'falseAlarm' | 'nothingThere' | 'missed' | 'missedWrongWay';

export interface TestCopy {
  header: { title: string; tagline: string; hint: string };
  legend: readonly string[];
  intro: {
    steps: readonly [IntroText, IntroText];
    free: IntroText;
    backToTerrain: string;
    backToBoard: string;
    continueToTest: string;
  };
  direction: { label: string; follow: string; followHint: string; against: string; againstHint: string };
  table: { memory: string; nerve: string; days: (n: number) => string; nerveValue: (multiple: number) => string };
  rule: {
    heading: string;
    summary: (direction: string, days: number) => string;
    /** One sentence; `percent` null means any move at all. */
    sentence: (follow: boolean, days: number, percent: string | null) => string;
    neverBets: string;
    betsShare: (share: string) => string;
  };
  scores: { practice: string; fresh: string; help: string; value: (score: number) => string; pending: string };
  actions: { test: string; luck: string; checking: string };
  pile: { caption: string; you: (score: string) => string; p95: string; offChart: (score: string) => string };
  verdict: Record<VerdictKey | 'neverBets', string>;
  explain: {
    sawThrough: (beaten: number, total: number) => string;
    fooledYourself: (practiceBeaten: number, beaten: number, total: number) => string;
    justLuck: (beaten: number, total: number) => string;
    neverBets: string;
  };
  captions: { pick: string; noneEarn: string; someEarn: string; tested: string; checking: string };
  mystery: {
    start: string;
    startHint: string;
    active: string;
    reveal: string;
    revealHint: string;
    newMystery: string;
    backToMine: string;
    revealedTitle: string;
    settings: (mood: string, yesterday: string) => string;
    outcome: Record<RevealKey, (yesterday: string) => string>;
    chapterLines: readonly string[];
    backToTest: string;
  };
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
  legend: { prefix: 'Falling: color = the last move. Landed: color = up or down overall.', up: 'up', down: 'down' },
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
    continueToTerrain: 'Continue to the terrain →',
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
    mystery: "Mystery machine: the crowd's Mood and Yesterday are hidden. Read them from the stocks.",
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
  terrain: {
    header: {
      title: 'Chapter 2 · The Terrain',
      tagline: 'The pile was one day. This is the whole year.',
      hint: 'Drag along the floor or use the Day slider to pick a day · D: debug',
    },
    legend: [
      'Terrain: where stocks are, day after day. Height: how many stocks are there.',
      'Ghost: if the crowd ignored yesterday.',
      'Lines along the valley: where the middle half of stocks are (solid) and where the ghost\'s are (dashed).',
      'Glowing dots: single stocks walking through their year.',
    ],
    asymmetry: (fall, rise) => `Gains and losses aren't symmetric: a fall to ${fall} and a rise to ${rise} are the same distance on this map.`,
    intro: {
      steps: [
        { lines: ['The pile was one day. This is the whole year. Each slice is one day: how many stocks are where.', 'Drag the Day slider, or along the floor, to walk through the year.'] },
        { lines: ['The ghost shows a crowd that ignores yesterday. Slide Yesterday.', 'Watch whether the valley opens faster or slower than the ghost.'] },
      ],
      free: { lines: ['Read the year. Does this crowd have a habit a gambler could bet on?'] },
      back: '← Back to the board',
    },
    day: {
      label: 'Day',
      subtitle: 'Pick a day to look at',
      left: 'Start',
      right: 'One year',
      value: (day, days) => `Day ${day} of ${days}`,
    },
    labels: { day: (t) => `Day ${t}`, offMap: 'Off the map', ghost: 'If the crowd ignored yesterday' },
    year: {
      wider: 'The valley opens faster than the ghost: the crowd chases yesterday, so the future gets less certain, faster.',
      narrower: 'The valley opens slower than the ghost: the crowd turns against yesterday, so stocks stay closer to where they started.',
      same: 'The valley opens just like the ghost: no habit visible over the year.',
      unclear: 'The valley may be opening differently from the ghost, but not clearly.',
      needMore: 'Not enough stocks to read the year yet.',
      moodUp: "The whole valley leans up: the crowd's mood pushes stocks up overall.",
      moodDown: "The whole valley leans down: the crowd's mood pushes stocks down overall.",
      offMap: 'Some stocks went off the map: they moved further than the terrain shows.',
    },
    dayCaption: {
      middleHalf: (day, low, high) => `Day ${day}: the middle half of stocks are between ${low} and ${high}.`,
      wider: "That's wider than the ghost.",
      narrower: "That's narrower than the ghost.",
      same: 'About the same as the ghost.',
      unclear: 'Too close to call against the ghost.',
    },
  },
  test: {
    header: {
      title: 'Chapter 3 · The Test',
      tagline: "If the crowd has habits, can you bet on them, and prove it wasn't luck?",
      hint: 'Click a tile to pick a rule · arrow keys move between tiles · D: debug',
    },
    legend: [
      'Each tile is a betting rule: Memory (rows) × Nerve (columns).',
      'Height and glow: its score on the practice table. Warm: it earned. Cool and flat: it lost.',
    ],
    intro: {
      steps: [
        { lines: ["You're the gambler now. Each tile is a betting rule, scored on the practice table: the first 100 stocks from your machine.", 'Pick a tile. The tallest one looks best.'] },
        { lines: ['Looking good on the practice table proves little: you picked the rule because it scored well on those same stocks.', 'Test it on new stocks, then check it against luck.'] },
      ],
      free: { lines: ['Try other rules and the other direction, change the crowd in Chapter 1, or take on a mystery machine.'] },
      backToTerrain: '← Back to the terrain',
      backToBoard: '← Back to the board',
      continueToTest: 'Continue to the test →',
    },
    direction: {
      label: 'How you bet',
      follow: 'Follow the move',
      followHint: 'Buy after a rise',
      against: 'Bet against the move',
      againstHint: 'Buy after a fall',
    },
    table: {
      memory: 'Memory',
      nerve: 'Nerve (× a typical move)',
      days: (n) => `${n} days`,
      nerveValue: (multiple) => (multiple === 0 ? 'any' : `${multiple}×`),
    },
    rule: {
      heading: 'Your betting rule',
      summary: (direction, days) => `${direction} · Memory: ${days} days`,
      sentence: (follow, days, percent) => {
        const move = follow
          ? (percent === null ? 'rose at all' : `rose more than ${percent}`)
          : (percent === null ? 'fell at all' : `fell more than ${percent}`);
        return `Look back ${days} days. If the stock ${move}, hold it the next day.`;
      },
      neverBets: 'On the practice table this rule never bets: the move it waits for never happens.',
      betsShare: (share) => `It holds a stock on ${share} of days.`,
    },
    scores: {
      practice: 'Practice table',
      fresh: 'New stocks, same crowd',
      help: 'Score: profit for each unit of risk you took.',
      value: (score) => score.toFixed(2),
      pending: '—',
    },
    actions: { test: 'Test it on new stocks', luck: 'Check against luck', checking: 'Checking against luck…' },
    pile: {
      caption: 'Your rule on 200 crowds with no habits (same Mood, ignores yesterday)',
      you: (score) => `Your rule on new stocks: ${score}`,
      p95: '95% of luck scores fall below this',
      offChart: (score) => `Your rule on new stocks: ${score}, far off the chart`,
    },
    verdict: {
      sawThrough: 'You saw through the machine',
      fooledYourself: 'You fooled yourself',
      justLuck: 'Just luck',
      neverBets: 'Just luck: this rule never bets',
    },
    explain: {
      sawThrough: (beaten, total) => `On new stocks your rule beat ${beaten} of ${total} crowds with no habits. Luck alone does that less than 1 time in 20, so this crowd has a habit your rule can use.`,
      fooledYourself: (practiceBeaten, beaten, total) => `On the practice table your rule beat ${practiceBeaten} of ${total} luck crowds, but on new stocks only ${beaten}. You chose it because it looked best on those same stocks, so part of its score was luck.`,
      justLuck: (beaten, total) => `On new stocks your rule beat ${beaten} of ${total} crowds with no habits. Crowds with no habits do that well often enough, so this proves nothing.`,
      neverBets: "A rule that never bets can't win or lose. Pick a tile with less Nerve, or try the other direction.",
    },
    captions: {
      pick: 'Pick a tile to choose your betting rule.',
      noneEarn: 'No rule in this direction earned on the practice table. Try the other direction.',
      someEarn: 'Tall, glowing tiles earned on the practice table. Is the tallest one real, or luck?',
      tested: 'Now check it against luck: how well does the same rule do on crowds with no habits?',
      checking: 'Running your rule on 200 crowds with no habits…',
    },
    mystery: {
      start: 'Try a mystery machine',
      startHint: 'The game picks a secret crowd. Find its habit, or find that it has none.',
      active: "Mystery machine: the crowd's Mood and Yesterday are secret. Read them on the board and the terrain, then bet.",
      reveal: 'Reveal the machine',
      revealHint: 'Get a verdict first, then reveal.',
      newMystery: 'New mystery',
      backToMine: 'Back to my machine',
      revealedTitle: 'The machine was',
      settings: (mood, yesterday) => `Mood: ${mood}. Yesterday: ${yesterday}.`,
      outcome: {
        found: () => 'Your verdict matched: there was a habit, and your rule bet on it.',
        falseAlarm: () => 'A false alarm: your rule passed, but not because of a habit it bets on. Luck does this about 1 time in 20.',
        nothingThere: () => 'Your verdict matched: there was nothing to find.',
        missed: (yesterday) => `There was a habit (${yesterday.toLowerCase()}), but your test didn't catch it.`,
        missedWrongWay: (yesterday) => `There was a habit (${yesterday.toLowerCase()}), but your rule bet the other way.`,
      },
      chapterLines: ['Mystery machine: the crowd is secret. Read it from the stocks here, then go back to the test.'],
      backToTest: 'Back to the test →',
    },
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
