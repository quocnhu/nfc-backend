/**
 * romanizer — Local pronunciation guides, no API keys and no quota.
 *
 * Three scripts, three different problems:
 *
 *   Chinese  pinyin-pro. A lookup: every Han character has a standard reading.
 *   Korean   A jamo table below. Hangul is algorithmic — every syllable is
 *            built from a fixed set of jamo with a fixed romanization — so the
 *            answer is exact and needs no dictionary.
 *   Japanese kuroshiro + kuromoji. The hard one: kanji readings are contextual
 *            (学校 is がっこう, never がくこう) and Japanese has no algorithmic
 *            fallback because there is no one reading per character. A kana
 *            table alone would silently produce wrong words.
 *
 * Everything here runs in-process. Nothing in this file touches the network.
 *
 * kuroshiro is ESM-only while this NestJS app is CommonJS, so it is pulled in
 * with a dynamic import() and initialised lazily on first use. That dictionary
 * load costs ~1.8s and ~84MB, which is wasted on a backend that never handles
 * Japanese — hence lazy, and hence a single shared promise so concurrent
 * requests trigger exactly one load.
 */

/** Japanese initialisation is shared: one dictionary load, many callers. */
let kuroshiroReady: Promise<{ convert: (t: string, o: { to: string }) => Promise<string> } | null> | null =
  null;

/** Kuroshiro's TS types don't describe the dynamic import shape cleanly. */
interface KuroshiroInstance {
  convert(text: string, opts: { to: 'romaji' }): Promise<string>;
}

// ─── Korean ─────────────────────────────────────────────────────────────────

/**
 * Hangul syllable decomposition. Every block is 14 bits: a leading consonant
 * (0–18), a vowel (0–10) and an optional trailing consonant (0 = none, 1–27).
 * That fixed layout is why Korean needs no dictionary — the arithmetic below is
 * the complete spec, not an approximation of it.
 */
const KOREAN_INITIALS = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's',
  'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h',
];

/**
 * Vowels are listed in the order the Unicode block uses. Note the compound
 * vowels: they occupy single slots (ㅐ 11, ㅔ 12, ㅚ 13 …) rather than being
 * built from two jamo, which is why this cannot be derived arithmetically.
 */
const KOREAN_VOWELS = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa',
  'wae', 'oe', 'yo', 'u', 'weo', 'we', 'wi', 'yu', 'eu', 'yi', 'i',
];

/**
 * Final consonants. Index 0 means "no final consonant", so the array starts
 * with an empty string. A trailing ㅇ (index 7 in the initial table) is silent
 * after a vowel — it is represented here as ['', '', 'k', 'k', 'n', 'n', 'n', 'ng', 'l', 'm', 'l', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
 */
const KOREAN_FINALS = [
  '', 'k', 'k', 'k', 'n', 'n', 'n', 'ng', 'l', 'm',
  'l', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't',
  't', 'ng', 't', 't', 'k', 't', 'p', 't',
];

const isHangul = (code: number) => code >= 0xac00 && code <= 0xd7a3;

/** Romanize one pre-composed Hangul syllable. */
function hangulSyllableToRoman(ch: string): string {
  const index = ch.charCodeAt(0) - 0xac00;
  const initial = Math.floor(index / 588);
  const vowel = Math.floor((index % 588) / 28);
  const final = index % 28;
  return KOREAN_INITIALS[initial] + KOREAN_VOWELS[vowel] + KOREAN_FINALS[final];
}

/** Romanize Hangul, passing through anything that is not a syllable block. */
export function romanizeKorean(text: string): string {
  let out = '';
  for (const ch of text) {
    out += isHangul(ch.charCodeAt(0)) ? hangulSyllableToRoman(ch) : ch;
  }
  return out;
}

// ─── Japanese ───────────────────────────────────────────────────────────────

async function loadKuroshiro(): Promise<KuroshiroInstance | null> {
  if (!kuroshiroReady) {
    kuroshiroReady = (async () => {
      try {
        const { default: Kuroshiro } = await import('kuroshiro');
        const { default: Kuromoji } = await import('kuroshiro-analyzer-kuromoji');
        const instance = new Kuroshiro() as unknown as {
          init(analyzer: unknown): Promise<void>;
        };
        await instance.init(new Kuromoji());
        return instance as unknown as KuroshiroInstance;
      } catch (error) {
        // A missing dictionary must degrade to "no guide", never crash a
        // translation — same contract as the AI-backed path.
        console.warn('[romanizer] Japanese romaji unavailable:', error);
        return null;
      }
    })();
  }
  return kuroshiroReady;
}

/** Romaji for Japanese, or null when the dictionary could not be loaded. */
export async function romanizeJapanese(text: string): Promise<string | null> {
  const instance = await loadKuroshiro();
  if (!instance) return null;
  try {
    const romaji = await instance.convert(text, { to: 'romaji' });
    // Kuroshiro returns the input untouched when it contains no kana at all;
    // a "guide" identical to the translation is noise, so drop it.
    if (!romaji || romaji === text) return null;
    return romaji;
  } catch (error) {
    console.warn('[romanizer] Japanese conversion failed:', error);
    return null;
  }
}

/** Warms the Japanese dictionary during boot so the first turn isn't slow. */
export function warmJapaneseRomaji(): void {
  void loadKuroshiro();
}

// ─── English ────────────────────────────────────────────────────────────────

/**
 * ARPAbet → plain-English spelling.
 *
 * CMUdict gives exact phonemes for ~135k words, which is strictly better than
 * asking a model to guess. The vowels are deliberately spelled the way a
 * beginner's dictionary prints them — "AW" is 'aw' (thought), not 'ao', so
 * someone reading it out loud gets THAWT rather than a phonetic symbol they
 * don't know. Consonants keep their ordinary letter names.
 */
const ARPABET: Record<string, string> = {
  AA: 'ah', AE: 'ad', AH: 'uh', AO: 'aw', AW: 'ow', AY: 'eye',
  EH: 'eh', ER: 'ur', EY: 'ay', IH: 'ih', IY: 'ee', OW: 'oh',
  OY: 'oy', UH: 'uh', UW: 'oo',
  B: 'b', CH: 'ch', D: 'd', DH: 'th', F: 'f', G: 'g', HH: 'h',
  JH: 'j', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ng', P: 'p',
  R: 'r', S: 's', SH: 'sh', T: 't', TH: 'th', V: 'v', W: 'w',
  Y: 'y', Z: 'z', ZH: 'zh',
};

/** The 15 pure-vowel phonemes. Everything else in ARPAbet is a consonant. */
const ARPABET_VOWELS = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
]);
const isVowel = (phoneme: string) => ARPABET_VOWELS.has(phoneme);

/** Lazy so boot doesn't pay the 4.7MB dictionary parse. */
let cmuDict: Record<string, string> | null = null;
function loadCmuDict(): Record<string, string> {
  if (!cmuDict) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('cmu-pronouncing-dictionary') as { dictionary: Record<string, string> };
      cmuDict = mod.dictionary ?? {};
    } catch (error) {
      console.warn('[romanizer] CMU dictionary unavailable:', error);
      cmuDict = {};
    }
  }
  return cmuDict;
}

/**
 * Render one word's ARPAbet as a beginner-friendly respelling.
 *
 * Syllables are cut at each vowel and rejoined with hyphens, and the stressed
 * syllable is capitalised whole the way a learner's dictionary prints it —
 * "hello" (HH AH0 L OW1) reads "huhl-OW", "water" reads "WAWT-ur", and a
 * one-syllable word is capitalised entirely ("THAWT"). Capitalising the whole
 * syllable rather than the first letter of it keeps the stress visible
 * mid-word, where a single capital letter just reads as a typo.
 */
function respellPhonemes(phonemes: string): string | null {
  const parts = phonemes.trim().split(/\s+/).filter(Boolean);
  const syllables: Array<{ text: string; stressed: boolean }> = [];
  // Consonants seen before any vowel belong to the syllable that follows —
  // HH is the start of "hello", not a syllable of its own.
  let pending = '';
  let current: { text: string; stressed: boolean } | null = null;

  for (const part of parts) {
    const bare = part.replace(/[012]$/, '');
    const letters = ARPABET[bare];
    if (!letters) continue;

    if (isVowel(bare)) {
      current = { text: pending + letters, stressed: part.endsWith('1') };
      pending = '';
      syllables.push(current);
    } else if (current) {
      current.text += letters;
    } else {
      pending += letters;
    }
  }
  if (pending) {
    if (!syllables.length) return null;
    syllables[syllables.length - 1].text += pending;
  }
  if (!syllables.length) return null;

  if (syllables.length === 1) {
    return syllables[0].text.toUpperCase();
  }

  return syllables.map((s) => (s.stressed ? s.text.toUpperCase() : s.text)).join('-');
}

/**
 * Pronunciation respelling for English, or null when nothing was recognised.
 *
 * Words missing from CMUdict are passed through unchanged rather than guessed
 * — an invented respelling teaches the wrong pronunciation, which is worse than
 * showing nothing.
 */
export function romanizeEnglish(text: string): string | null {
  const dict = loadCmuDict();
  if (!Object.keys(dict).length) return null;

  let changed = false;
  const rendered = text.replace(/[A-Za-z']+/g, (word) => {
    const phonemes = dict[word.toLowerCase()];
    if (!phonemes) return word;
    const respelled = respellPhonemes(phonemes);
    if (!respelled || respelled.toLowerCase() === word.toLowerCase()) return word;
    changed = true;
    return respelled;
  });

  return changed ? rendered : null;
}