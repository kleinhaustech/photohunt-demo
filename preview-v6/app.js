/* Spot the Difference – app.js (v6 complete) */
const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSc-AHGMyY7ClF_b9Zall5920Ff4I4zjLPJo9zkaXubYooSoDA/viewform';
const STORAGE_KEY = 'sd_counters_v3';
const STORAGE_KEY_V1 = 'sd_counters_v1';
const LB_STORAGE_KEY = 'sd_leaderboard_v2';
const LB_STORAGE_KEY_V1 = 'sd_leaderboard_v1';

// Phase 0 feature flags: remote leaderboard stays OFF by default and never fetches
const FEATURE_FLAGS = {
  remoteLeaderboard: false
};

// Tap-tolerance constants (hard floor: max(0.085W, 32px) at every level; luck cap <= 33%)
const KIDS_MIN_HIT_R = 0.085;        // Hard minimum hit radius as fraction of width (68px at 800w)
const KIDS_MIN_HIT_PX = 32;          // Hard minimum hit radius in CSS px (64px diameter on phones)
const KIDS_SLOP_CAP_R = 0.092;       // Max radius for slop-boosted small diffs so 5-circle area <= 33%
const KIDS_LARGE_CAP_R = 0.172;      // Cap for oversized/large diffs (cuts kids-06#2 r=0.2813 by >60%)
const KIDS_EDGE_MARGIN = 0.06;       // Inward anchor margin for diffs <6% from border (e.g. kids-10#1)

// Timed mode arcade schedule & scoring constants
const TIMED_LEVEL1_SEC = 90;         // Level 1 starts at 90s
const TIMED_STEP_DECAY_SEC = 6;      // -6s per subsequent level
const TIMED_MIN_LEVEL_SEC = 40;      // Minimum 40s per level
const TIMED_FIND_POINTS = 100;       // +100 points per difference found
const TIMED_SEC_BONUS_MULT = 10;     // +10 points per remaining whole second on level clear
const TIMED_MISS_PENALTY_SEC = 2;    // -2s clock penalty on miss (0 point deduction)
const TIMED_HINT_COST_SEC = 5;       // -5s clock cost for using a hint in Timed mode (0 point deduction)

// Progressive difficulty ordering (Level 1 easiest -> Level 10 hardest) using existing puzzle data
const DIFFICULTY_ORDER = [
  'kids-04', // Level 1: Toy train (5/5 in quality band, mean r=0.1206, 0 flagged low diffs)
  'kids-01', // Level 2: Cartoon fish (2 large diffs r=0.158/0.1911 + 3 clear colour diffs)
  'kids-03', // Level 3: Cartoon space rocket (mean r=0.1142, large flame/nose/fins + 1 small window)
  'kids-02', // Level 4: Cartoon turtle (2 large diffs + 2 medium + 1 small, mean r=0.0890)
  'kids-08', // Level 5: Cartoon walrus (1 large flipper + 4 medium/small diffs, min area 0.40%)
  'kids-06', // Level 6: Cartoon snail (clamped shell + 3 medium diffs + 1 near-edge small eye)
  'kids-07', // Level 7: Cartoon monkey (all 5 diffs are small/medium facial/ear edits, r=0.051–0.079)
  'kids-10', // Level 8: Cartoon lion (4 small/medium diffs including right-edge tail tuft x=0.9543)
  'kids-05', // Level 9: Cartoon owl (4 of 5 diffs sit at/near r=0.045 floor, close beak/eye pair)
  'kids-09'  // Level 10: Cartoon bat (all 5 diffs low changed-pixel area, mean 0.256%, min 0.07%)
];

// 20 kid-safe adjectives x 20 kid-safe animals + numbers 1-99 (button-only picker, zero text inputs)
const KIDS_ADJECTIVES = [
  'Sunny',
  'Cosmic',
  'Happy',
  'Bright',
  'Clever',
  'Swift',
  'Brave',
  'Gentle',
  'Lucky',
  'Jolly',
  'Mighty',
  'Nimble',
  'Sparkly',
  'Breezy',
  'Daring',
  'Friendly',
  'Golden',
  'Merry',
  'Starry',
  'Zippy'
];

const KIDS_ANIMALS = [
  'Otter',
  'Falcon',
  'Dolphin',
  'Panda',
  'Koala',
  'Penguin',
  'Tiger',
  'Badger',
  'Beaver',
  'Bunny',
  'Fox',
  'Gecko',
  'Hedgehog',
  'Lemur',
  'Lion',
  'Owl',
  'Parrot',
  'Puffin',
  'Seal',
  'Turtle'
];

const QUICK_NUMBERS = [1, 4, 7, 12, 19, 25, 33, 42, 58, 77, 88, 99];

// Kids-only categories and default tags
const DEFAULT_CATEGORIES = [
  { id: 'animals', label: 'Animals' },
  { id: 'sea-sky', label: 'Sea & Sky' },
  { id: 'vehicles-space', label: 'Vehicles & Space' }
];

const DEFAULT_PUZZLE_TAGS = {
  'kids-01': { category: 'sea-sky', categoryConfidence: 'high' },
  'kids-02': { category: 'sea-sky', categoryConfidence: 'high' },
  'kids-03': { category: 'vehicles-space', categoryConfidence: 'high' },
  'kids-04': { category: 'vehicles-space', categoryConfidence: 'high' },
  'kids-05': { category: 'sea-sky', categoryConfidence: 'high' },
  'kids-06': { category: 'animals', categoryConfidence: 'high' },
  'kids-07': { category: 'animals', categoryConfidence: 'high' },
  'kids-08': { category: 'sea-sky', categoryConfidence: 'high' },
  'kids-09': { category: 'sea-sky', categoryConfidence: 'high' },
  'kids-10': { category: 'animals', categoryConfidence: 'high' }
};

const LEGACY_TAG_ALIASES = {
  animals: 'animals',
  wildlife: 'animals',
  nature: 'animals',
  ocean: 'sea-sky',
  birds: 'sea-sky',
  'sea-sky': 'sea-sky',
  space: 'vehicles-space',
  vehicles: 'vehicles-space',
  toys: 'vehicles-space',
  'vehicles-space': 'vehicles-space'
};

const MISS_MESSAGES = [
  'Ooh, close! Keep looking',
  'Try another spot!',
  'Almost! Look closely at both pictures',
  'Not quite there—keep exploring!'
];

const COACH_STEPS = [
  'Look at both pictures',
  "Tap anything that's different",
  'Find all 5 to win each level!'
];

// ---------- State ----------
let puzzlesData = null;
let categoriesCatalog = DEFAULT_CATEGORIES.slice();
let counters = null;
let leaderboardStore = null;
let storageBlocked = false;
let grownupsUnlocked = false; // session only (in memory)
let nicknameSkippedSession = false; // session memory for Skip choice

let currentMode = 'untimed'; // 'untimed' | 'timed'
let activeCategoryFilter = 'all';

// Active run state across progressive levels
let runQueue = [];           // Ordered array of puzzle objects for the current run
let currentLevelIndex = 0;   // 0-based index in runQueue (Level = currentLevelIndex + 1)
let currentPuzzle = null;
let runScore = 0;
let runLevelsCleared = 0;
let runTotalFinds = 0;
let runTotalMisses = 0;
let runTotalHints = 0;
let runMashed = false;
let runRevealed = false;
let runStartTimeMs = 0;

// Per-level state
let foundSet = new Set();
let revealedSet = new Set();
let missTimes = [];
let missMsgIndex = 0;
let ignoreUntil = 0;
let levelMisses = 0;
let levelHintsUsed = 0;
let levelStartTimeMs = 0;
let hintIdleTimer = null;
let quadGlowTimer = null;
let celebrationTimer = null;

// Timed mode clock state
let timedLoopId = null;
let timedLevelLimitMs = 90000;
let timedRemainingMs = 90000;
let timedLastTickMs = 0;

// Untimed hint regeneration state (1 per 20s of stall time)
let untimedHintReady = true;

let lastCompletedRun = null;
let coachStep = 0;
let audioCtx = null;
let imagesLoaded = false;
let puzzleOver = false;
let puzzleLoadSeq = 0;

// Leaderboard UI state
let lbReturnScreen = 'screen-home';
let lbMode = 'timed'; // 'timed' | 'untimed'
let lbTab = 'mode';   // 'mode' | 'category' | 'daily'
let lbSelectedFilter = '';

// ---------- Helpers ----------
function isReducedMotion() {
  try {
    return Boolean(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch (e) {
    return false;
  }
}

function todayStr() {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

function daysBetweenDateStrs(olderStr, newerStr) {
  if (!olderStr || !newerStr) return 0;
  const p1 = olderStr.split('-').map(Number);
  const p2 = newerStr.split('-').map(Number);
  if (p1.length !== 3 || p2.length !== 3) return 0;
  const d1 = Date.UTC(p1[0], p1[1] - 1, p1[2]);
  const d2 = Date.UTC(p2[0], p2[1] - 1, p2[2]);
  return Math.round((d2 - d1) / 86400000);
}

function getLevelTimeLimitSec(levelNumber) {
  const lvl = Math.max(1, Number(levelNumber) || 1);
  return Math.max(TIMED_MIN_LEVEL_SEC, TIMED_LEVEL1_SEC - (lvl - 1) * TIMED_STEP_DECAY_SEC);
}

// ---------- Nickname Validation (Word Lists Only) ----------
function parsePresetNickname(nick) {
  if (!nick || typeof nick !== 'string') return null;
  const parts = nick.trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length !== 3) return null;
  const [adj, animal, rawNum] = parts;
  if (!KIDS_ADJECTIVES.includes(adj)) return null;
  if (!KIDS_ANIMALS.includes(animal)) return null;
  const cleanNumStr = rawNum.replace(/^#/, '');
  if (!/^\d{1,2}$/.test(cleanNumStr)) return null;
  const num = parseInt(cleanNumStr, 10);
  if (isNaN(num) || num < 1 || num > 99) return null;
  return {
    adj,
    animal,
    num,
    formatted: adj + ' ' + animal + ' ' + num
  };
}

function isValidPresetNickname(nick) {
  return Boolean(parsePresetNickname(nick));
}

function normalizePresetNickname(nick) {
  const parsed = parsePresetNickname(nick);
  return parsed ? parsed.formatted : null;
}

// ---------- LeaderboardStore Seam (sd_leaderboard_v2) ----------
function compareLeaderboardEntries(a, b, mode) {
  if (mode === 'timed') {
    // Timed mode: highest final score first, then higher level reached, then earliest timestamp
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    if ((b.levelReached || 0) !== (a.levelReached || 0)) {
      return (b.levelReached || 0) - (a.levelReached || 0);
    }
    return (a.ts || 0) - (b.ts || 0);
  }
  // Untimed mode: most levels cleared first, then fewest misses, then earliest timestamp
  if ((b.levelsCleared || 0) !== (a.levelsCleared || 0)) {
    return (b.levelsCleared || 0) - (a.levelsCleared || 0);
  }
  if ((a.misses || 0) !== (b.misses || 0)) return (a.misses || 0) - (b.misses || 0);
  return (a.ts || 0) - (b.ts || 0);
}

class LocalLeaderboardStore {
  constructor() {
    this.storageOk = true;
    this.state = this.makeEmptyState();
    this.load();
  }

  makeEmptyState() {
    return {
      v: 2,
      nickname: null,
      boards: {}
    };
  }

  normalizeState(raw) {
    const base = this.makeEmptyState();
    if (!raw || typeof raw !== 'object') return base;

    // Re-check stored nickname against allowlisted word lists; drop if invalid
    const candidateNick =
      typeof raw.nickname === 'string'
        ? raw.nickname
        : raw.nicknames && typeof raw.nicknames.kids === 'string'
        ? raw.nicknames.kids
        : null;
    const validNick = normalizePresetNickname(candidateNick);
    if (validNick) {
      base.nickname = validNick;
    }

    if (raw.boards && typeof raw.boards === 'object') {
      const today = todayStr();
      Object.keys(raw.boards).forEach(scopeKey => {
        // Keep 7 days including today (0..6 days old) for daily:<mode>:<YYYY-MM-DD>
        if (scopeKey.startsWith('daily:')) {
          const parts = scopeKey.split(':');
          const dStr = parts[2] || '';
          const ageDays = daysBetweenDateStrs(dStr, today);
          if (ageDays > 6 || ageDays < -1) return;
        }
        const arr = raw.boards[scopeKey];
        if (!Array.isArray(arr)) return;
        const mode = scopeKey.includes(':timed') ? 'timed' : 'untimed';
        const cleanEntries = [];

        arr.forEach(item => {
          if (!item || typeof item !== 'object') return;
          // Re-check every stored entry's nickname against word lists; drop invalid ones
          const checkedNick = normalizePresetNickname(item.nickname);
          if (!checkedNick) return;

          cleanEntries.push({
            nickname: checkedNick,
            mode,
            score: Math.max(0, Number(item.score) || 0),
            levelReached: Math.max(1, Number(item.levelReached) || 1),
            levelsCleared: Math.max(0, Number(item.levelsCleared) || 0),
            finds: Math.max(0, Number(item.finds) || 0),
            misses: Math.max(0, Number(item.misses) || 0),
            hints: Math.max(0, Number(item.hints) || 0),
            durationMs: Math.max(100, Number(item.durationMs) || 1000),
            categoryId: String(item.categoryId || 'all'),
            date: String(item.date || today),
            ts: Number(item.ts) || 0
          });
        });

        cleanEntries.sort((a, b) => compareLeaderboardEntries(a, b, mode));
        base.boards[scopeKey] = cleanEntries.slice(0, 5);
      });
    }
    return base;
  }

  load() {
    try {
      const rawV2 = localStorage.getItem(LB_STORAGE_KEY);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        this.state = this.normalizeState(parsed);
      } else {
        // Safely migrate valid preset nickname from v1 if present, ignoring incompatible v1 boards
        let migratedNick = null;
        try {
          const rawV1 = localStorage.getItem(LB_STORAGE_KEY_V1);
          if (rawV1) {
            const parsedV1 = JSON.parse(rawV1);
            if (parsedV1 && parsedV1.nicknames && parsedV1.nicknames.kids) {
              migratedNick = normalizePresetNickname(parsedV1.nicknames.kids);
            }
          }
        } catch (e) { /* ignore v1 parse errors */ }
        this.state = this.makeEmptyState();
        if (migratedNick) this.state.nickname = migratedNick;
      }
      this.save();
    } catch (e) {
      this.storageOk = false;
      this.state = this.makeEmptyState();
      showStorageNotice();
    }
  }

  save() {
    try {
      this.state = this.normalizeState(this.state);
      localStorage.setItem(LB_STORAGE_KEY, JSON.stringify(this.state));
      this.storageOk = true;
    } catch (e) {
      this.storageOk = false;
      showStorageNotice();
    }
  }

  isStorageAvailable() {
    return this.storageOk && !storageBlocked;
  }

  getNickname() {
    return this.state.nickname || null;
  }

  setNickname(nickname) {
    const valid = normalizePresetNickname(nickname);
    if (!valid) return false;
    this.state.nickname = valid;
    this.save();
    return true;
  }

  getTop(scopeKey, limit = 5) {
    const list = (this.state.boards && this.state.boards[scopeKey]) || [];
    return list.slice(0, limit);
  }

  submitRun(run) {
    // Do not record runs that ended with Reveal all, were flagged as mashed, or when storage is blocked
    if (!this.isStorageAvailable()) return null;
    if (!run || !run.mode) return null;
    if (run.disqualified || run.mashed || run.revealed) return null;

    const mode = run.mode === 'timed' ? 'timed' : 'untimed';
    const validNick = normalizePresetNickname(run.nickname || this.getNickname());
    if (!validNick) return null;

    const nowTs = Number(run.ts) || Date.now();
    const dateStr = run.date || todayStr();
    const categoryId = run.categoryId || 'all';

    const entry = {
      nickname: validNick,
      mode,
      score: Math.max(0, Number(run.score) || 0),
      levelReached: Math.max(1, Number(run.levelReached) || 1),
      levelsCleared: Math.max(0, Number(run.levelsCleared) || 0),
      finds: Math.max(0, Number(run.finds) || 0),
      misses: Math.max(0, Number(run.misses) || 0),
      hints: Math.max(0, Number(run.hints) || 0),
      durationMs: Math.max(100, Number(run.durationMs) || 1000),
      categoryId,
      date: dateStr,
      ts: nowTs
    };

    const scopes = {
      mode: 'mode:' + mode + ':all',
      category: 'category:' + mode + ':' + categoryId,
      daily: 'daily:' + mode + ':' + dateStr
    };

    const ranks = { mode: null, category: null, daily: null };

    Object.keys(scopes).forEach(scopeType => {
      const key = scopes[scopeType];
      const existing = Array.isArray(this.state.boards[key])
        ? this.state.boards[key].slice()
        : [];
      existing.push(Object.assign({}, entry));
      existing.sort((a, b) => compareLeaderboardEntries(a, b, mode));
      const trimmed = existing.slice(0, 5);
      this.state.boards[key] = trimmed;
      const idx = trimmed.findIndex(e => e.ts === nowTs && e.nickname === validNick);
      if (idx !== -1) {
        ranks[scopeType] = idx + 1;
      }
    });

    this.save();
    return { entry, ranks, scopes };
  }

  clearAll() {
    this.state = this.makeEmptyState();
    this.save();
  }
}

// Documented stub for future server leaderboard; OFF by default in FEATURE_FLAGS and never constructed
class RemoteLeaderboardStore {
  constructor(endpointUrl) {
    this.endpointUrl = endpointUrl || '';
  }
}

function createLeaderboardStore() {
  if (FEATURE_FLAGS.remoteLeaderboard) {
    return new RemoteLeaderboardStore('');
  }
  return new LocalLeaderboardStore();
}

// ---------- Counters Storage (sd_counters_v3) ----------
function showStorageNotice() {
  storageBlocked = true;
  const el = document.getElementById('storage-notice');
  if (el && el.hidden) {
    el.hidden = false;
    layoutImages();
  }
  const lbWarn = document.getElementById('leaderboard-storage-msg');
  if (lbWarn) {
    lbWarn.hidden = false;
  }
}

function makeEmptyCounters() {
  return {
    v: 3,
    firstPlay: null,
    days: [],
    sound: false,
    modes: {
      untimed: {
        started: 0,
        completed: 0,
        firstPuzzleId: null,
        firstPuzzleCompleted: false,
        done: {},
        onboarded: false,
        bestScore: 0
      },
      timed: {
        started: 0,
        completed: 0,
        firstPuzzleId: null,
        firstPuzzleCompleted: false,
        done: {},
        onboarded: false,
        bestScore: 0
      }
    },
    reports: []
  };
}

function normalizeCounters(obj) {
  const base = makeEmptyCounters();
  if (!obj || typeof obj !== 'object') return base;
  base.firstPlay = typeof obj.firstPlay === 'string' ? obj.firstPlay : null;
  base.days = Array.isArray(obj.days)
    ? obj.days.filter(d => typeof d === 'string').slice(-60)
    : [];
  base.sound = Boolean(obj.sound);
  base.reports = Array.isArray(obj.reports)
    ? obj.reports.filter(r => typeof r === 'string' && !r.startsWith('kids-') === false).slice(-20)
    : [];

  const rawModes = obj.modes && typeof obj.modes === 'object' ? obj.modes : {};
  // Migrate legacy 'kids' bucket into 'untimed' if 'untimed' is empty
  const untimedSrc = rawModes.untimed || rawModes.kids || {};
  const timedSrc = rawModes.timed || {};

  [
    ['untimed', untimedSrc],
    ['timed', timedSrc]
  ].forEach(([modeKey, src]) => {
    const cleanDone = {};
    if (src.done && typeof src.done === 'object') {
      Object.keys(src.done).forEach(pid => {
        if (pid.startsWith('kids-')) {
          cleanDone[pid] = Math.min(5, Math.max(0, Number(src.done[pid]) || 0));
        }
      });
    }
    base.modes[modeKey] = {
      started: Math.max(0, Number(src.started) || 0),
      completed: Math.max(0, Number(src.completed) || 0),
      firstPuzzleId:
        typeof src.firstPuzzleId === 'string' && src.firstPuzzleId.startsWith('kids-')
          ? src.firstPuzzleId
          : null,
      firstPuzzleCompleted: Boolean(src.firstPuzzleCompleted),
      done: cleanDone,
      onboarded: Boolean(src.onboarded),
      bestScore: Math.max(0, Number(src.bestScore) || 0)
    };
  });

  return base;
}

function loadCounters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === 3) {
        counters = normalizeCounters(parsed);
        saveCounters();
        return;
      }
    }
    let firstPlay = null;
    let days = [];
    const v1 = localStorage.getItem(STORAGE_KEY_V1);
    if (v1) {
      try {
        const old = JSON.parse(v1);
        if (old && typeof old === 'object') {
          firstPlay = typeof old.firstPlay === 'string' ? old.firstPlay : null;
          if (Array.isArray(old.days)) {
            days = Array.from(new Set(old.days.filter(d => typeof d === 'string'))).slice(0, 60);
          }
        }
      } catch (e) { /* ignore malformed v1 */ }
    }
    counters = makeEmptyCounters();
    counters.firstPlay = firstPlay;
    counters.days = days;
    saveCounters();
  } catch (e) {
    counters = makeEmptyCounters();
    showStorageNotice();
  }
}

function saveCounters() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counters));
  } catch (e) {
    showStorageNotice();
  }
}

function addDay() {
  const t = todayStr();
  if (!counters.days.includes(t)) {
    counters.days.push(t);
    if (counters.days.length > 60) {
      counters.days = counters.days.slice(-60);
    }
  }
  if (!counters.firstPlay) {
    counters.firstPlay = t;
  }
  saveCounters();
}

// ---------- Puzzle Catalog & Progressive Difficulty Ordering ----------
function enrichAndOrderPuzzles(data, catPatch) {
  if (!data || !Array.isArray(data.puzzles)) return;

  // Keep only kid-safe puzzles (kids-01 .. kids-10)
  data.puzzles = data.puzzles.filter(p => p && String(p.id || '').startsWith('kids-'));

  categoriesCatalog = DEFAULT_CATEGORIES.slice();
  if (catPatch && catPatch.categories) {
    const patchKidsCats = Array.isArray(catPatch.categories)
      ? catPatch.categories
      : Array.isArray(catPatch.categories.kids)
      ? catPatch.categories.kids
      : null;
    if (patchKidsCats && patchKidsCats.length > 0) {
      const valid = patchKidsCats.filter(
        c => c && typeof c.id === 'string' && typeof c.label === 'string'
      );
      if (valid.length > 0) categoriesCatalog = valid;
    }
  }

  const tagMap =
    catPatch && catPatch.tags && typeof catPatch.tags === 'object'
      ? catPatch.tags
      : catPatch && typeof catPatch === 'object'
      ? catPatch
      : {};

  const validIds = new Set(categoriesCatalog.map(c => c.id));

  data.puzzles.forEach(p => {
    const fallbackEntry = DEFAULT_PUZZLE_TAGS[p.id] || {
      category: categoriesCatalog[0] ? categoriesCatalog[0].id : 'animals',
      categoryConfidence: 'high'
    };

    let rawCat = p.category || null;
    let rawConf = p.categoryConfidence || null;
    const patchItem = tagMap[p.id];

    if (patchItem) {
      if (typeof patchItem === 'string') {
        rawCat = patchItem;
      } else if (Array.isArray(patchItem) && patchItem.length > 0) {
        rawCat = patchItem[0];
      } else if (typeof patchItem === 'object') {
        rawCat =
          patchItem.category ||
          (Array.isArray(patchItem.categories) ? patchItem.categories[0] : null) ||
          (Array.isArray(patchItem.tags) ? patchItem.tags[0] : null);
        rawConf = patchItem.categoryConfidence || null;
      }
    }

    if (rawCat && !validIds.has(rawCat)) {
      const alias = LEGACY_TAG_ALIASES[rawCat];
      if (alias && validIds.has(alias)) rawCat = alias;
    }

    if (!rawCat || !validIds.has(rawCat)) {
      rawCat = validIds.has(fallbackEntry.category)
        ? fallbackEntry.category
        : categoriesCatalog[0]
        ? categoriesCatalog[0].id
        : 'animals';
    }

    const catObj = categoriesCatalog.find(c => c.id === rawCat);
    p.category = rawCat;
    p.categoryLabel = catObj ? catObj.label : rawCat;
    p.categoryConfidence =
      rawConf === 'low' || rawConf === 'high'
        ? rawConf
        : fallbackEntry.categoryConfidence || 'high';
  });

  // Sort puzzles in progressive difficulty order (Level 1 easiest -> Level 10 hardest)
  data.puzzles.sort((a, b) => {
    const ia = DIFFICULTY_ORDER.indexOf(a.id);
    const ib = DIFFICULTY_ORDER.indexOf(b.id);
    const rankA = ia === -1 ? 999 : ia;
    const rankB = ib === -1 ? 999 : ib;
    if (rankA !== rankB) return rankA - rankB;
    return String(a.id).localeCompare(String(b.id));
  });

  data.puzzles.forEach((p, idx) => {
    p.globalLevel = idx + 1;
  });
}

function getOrderedPuzzlesForCategory(categoryId) {
  const all = (puzzlesData && puzzlesData.puzzles) || [];
  if (!categoryId || categoryId === 'all') return all.slice();
  return all.filter(p => p.category === categoryId);
}

// ---------- Screen & Theme Navigation ----------
function clearAllTimers() {
  if (timedLoopId) {
    clearInterval(timedLoopId);
    timedLoopId = null;
  }
  clearTimeout(hintIdleTimer);
  hintIdleTimer = null;
  clearTimeout(quadGlowTimer);
  quadGlowTimer = null;
  clearTimeout(celebrationTimer);
  celebrationTimer = null;
}

function stripGrownupLinks() {
  const fb = document.getElementById('feedback-link-wrap');
  if (fb) fb.textContent = '';
  const lic = document.getElementById('licenses-link-wrap');
  if (lic) lic.textContent = '';
  const credits = document.getElementById('credits-list');
  if (credits) credits.textContent = '';
  const nickEditor = document.getElementById('grownups-nick-editor');
  if (nickEditor) {
    nickEditor.textContent = '';
    nickEditor.hidden = true;
  }
}

function showScreen(id) {
  clearAllTimers();
  document.querySelectorAll('.screen').forEach(s => {
    s.hidden = true;
  });
  const target = document.getElementById(id);
  if (target) target.hidden = false;

  document.getElementById('gate-overlay').hidden = true;
  document.getElementById('coach-overlay').hidden = true;
  const resOverlay = document.getElementById('result-overlay');
  resOverlay.hidden = true;
  resOverlay.classList.remove('docked');
  resOverlay.setAttribute('aria-modal', 'true');

  const nickBox = document.getElementById('result-nickname-box');
  if (nickBox) {
    nickBox.textContent = '';
    nickBox.hidden = true;
  }

  // Strict rule: zero <a href> elements outside Grown-ups area
  if (id !== 'screen-grownups') {
    stripGrownupLinks();
  }
}

function applyTheme(mode) {
  if (mode === 'timed') {
    document.body.className = 'theme-kids theme-timed';
  } else if (mode === 'untimed') {
    document.body.className = 'theme-kids theme-untimed';
  } else {
    document.body.className = 'theme-neutral';
  }
}

function sumStars(mode) {
  const m = counters.modes[mode] || counters.modes.untimed;
  const done = (m && m.done) || {};
  return Object.values(done).reduce((sum, val) => sum + (Number(val) || 0), 0);
}

// ---------- 1. Home Screen ----------
function renderHome() {
  applyTheme('neutral');
  showScreen('screen-home');

  const untimedStars = sumStars('untimed');
  const timedStars = sumStars('timed');
  const timedBest = (counters.modes.timed && counters.modes.timed.bestScore) || 0;

  const untimedStarsEl =
    document.getElementById('home-untimed-stars') ||
    document.getElementById('home-kids-stars');
  if (untimedStarsEl) {
    untimedStarsEl.textContent = untimedStars + ' stars';
  }

  const timedStarsEl = document.getElementById('home-timed-stars');
  if (timedStarsEl) {
    timedStarsEl.textContent =
      timedBest > 0 ? timedStars + ' stars • Best ' + timedBest : timedStars + ' stars';
  } else {
    const secondCardStars = document.querySelectorAll('#screen-home .card-stars')[1];
    if (secondCardStars) {
      secondCardStars.textContent =
        timedBest > 0 ? timedStars + ' stars • Best ' + timedBest : timedStars + ' stars';
    }
  }
}

// ---------- 2. Picker Screen & Category Chips ----------
function ensureCategoryChipsContainer() {
  let chipsEl =
    document.getElementById('category-chips') ||
    document.querySelector('#screen-picker .category-chips');
  if (chipsEl) return chipsEl;

  const pickerScreen = document.getElementById('screen-picker');
  const grid = document.getElementById('puzzle-grid');
  if (!pickerScreen || !grid) return null;

  const wrap = document.createElement('div');
  wrap.className = 'category-chips-wrap';
  chipsEl = document.createElement('div');
  chipsEl.className = 'category-chips';
  chipsEl.id = 'category-chips';
  chipsEl.setAttribute('role', 'group');
  chipsEl.setAttribute('aria-label', 'Filter levels by category');
  wrap.appendChild(chipsEl);
  pickerScreen.insertBefore(wrap, grid);
  return chipsEl;
}

function renderCategoryChips() {
  const chipsContainer = ensureCategoryChipsContainer();
  if (!chipsContainer) return;
  chipsContainer.textContent = '';

  const allOptions = [{ id: 'all', label: 'All' }].concat(categoriesCatalog);

  if (
    activeCategoryFilter !== 'all' &&
    !categoriesCatalog.some(c => c.id === activeCategoryFilter)
  ) {
    activeCategoryFilter = 'all';
  }

  allOptions.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isActive = activeCategoryFilter === cat.id;
    btn.className = 'chip' + (isActive ? ' active' : '');
    btn.dataset.category = cat.id;
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btn.textContent = cat.label;
    btn.onclick = () => {
      activeCategoryFilter = cat.id;
      renderPickerContent(currentMode);
    };
    chipsContainer.appendChild(btn);
  });
}

function openPicker(mode) {
  const nextMode = mode === 'timed' ? 'timed' : 'untimed';
  if (currentMode !== nextMode) {
    activeCategoryFilter = 'all';
  }
  currentMode = nextMode;
  applyTheme(currentMode);
  showScreen('screen-picker');
  renderPickerContent(currentMode);
}

function renderPickerContent(mode) {
  document.getElementById('picker-title').textContent =
    mode === 'timed' ? 'Timed Mode' : 'Untimed Mode';

  const allPuzzles = getOrderedPuzzlesForCategory('all');
  const totalPossible = allPuzzles.length * 5;
  const collected = sumStars(mode);
  const bestScore = (counters.modes[mode] && counters.modes[mode].bestScore) || 0;
  const progEl = document.getElementById('picker-progress');
  if (progEl) {
    progEl.textContent =
      mode === 'timed'
        ? collected + ' of ' + totalPossible + ' stars • Best run: ' + bestScore + ' pts'
        : collected + ' of ' + totalPossible + ' stars collected';
  }

  renderCategoryChips();

  const filteredList = getOrderedPuzzlesForCategory(activeCategoryFilter);
  const grid = document.getElementById('puzzle-grid');
  grid.textContent = '';

  filteredList.forEach((p, idx) => {
    const levelNum = idx + 1;
    const stars = Math.min(5, Math.max(0, Number(counters.modes[mode].done[p.id]) || 0));
    const isComplete = stars >= 5;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'puzzle-tile' + (isComplete ? ' is-complete' : '');
    btn.dataset.puzzleId = p.id;
    btn.dataset.category = p.category || '';
    btn.setAttribute('role', 'listitem');

    const topRow = document.createElement('div');
    topRow.className = 'tile-top';

    const numBadge = document.createElement('span');
    numBadge.className = 'tile-num';
    numBadge.textContent = 'Level ' + levelNum;
    topRow.appendChild(numBadge);

    if (p.categoryLabel) {
      const catBadge = document.createElement('span');
      catBadge.className = 'tile-cat-badge';
      catBadge.textContent = p.categoryLabel;
      topRow.appendChild(catBadge);
    }

    if (isComplete) {
      const check = document.createElement('span');
      check.className = 'tile-done-badge';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓ Done';
      topRow.appendChild(check);
    }

    const titleEl = document.createElement('strong');
    titleEl.className = 'tile-title';
    titleEl.textContent = p.title;

    const starBar = document.createElement('div');
    starBar.className = 'tile-star-icons';
    starBar.setAttribute('aria-hidden', 'true');
    for (let s = 0; s < 5; s++) {
      const sp = document.createElement('span');
      sp.className = 'mini-star' + (s < stars ? ' earned' : '');
      sp.textContent = '★';
      starBar.appendChild(sp);
    }

    const metaText = document.createElement('div');
    metaText.className = 'stars';
    if (mode === 'timed') {
      const lvlSec = getLevelTimeLimitSec(levelNum);
      metaText.textContent = stars + '/5 stars • ' + lvlSec + 's clock';
    } else {
      metaText.textContent = stars + '/5 stars';
    }

    btn.appendChild(topRow);
    btn.appendChild(titleEl);
    btn.appendChild(starBar);
    btn.appendChild(metaText);

    btn.addEventListener('click', () => startRun(filteredList, idx));
    grid.appendChild(btn);
  });

  const playNextBtn = document.getElementById('btn-play-next');
  const pool = filteredList.length > 0 ? filteredList : allPuzzles;
  const firstUnfinishedIdx = pool.findIndex(p => !(counters.modes[mode].done[p.id] >= 5));

  if (mode === 'timed') {
    playNextBtn.textContent = 'Start Level 1 Run';
    playNextBtn.onclick = () => {
      if (pool.length > 0) startRun(pool, 0);
    };
  } else {
    playNextBtn.textContent = firstUnfinishedIdx !== -1 ? 'Play next' : 'Play again';
    playNextBtn.onclick = () => {
      const startIdx = firstUnfinishedIdx !== -1 ? firstUnfinishedIdx : 0;
      if (pool.length > 0) startRun(pool, startIdx);
    };
  }
}

// ---------- 3. Game Screen & Progressive Level Run ----------
function startRun(levelPool, startIndex = 0) {
  const pool =
    Array.isArray(levelPool) && levelPool.length > 0
      ? levelPool.slice()
      : getOrderedPuzzlesForCategory(activeCategoryFilter);
  if (pool.length === 0) return;

  runQueue = pool;
  currentLevelIndex = Math.max(0, Math.min(pool.length - 1, Number(startIndex) || 0));
  runScore = 0;
  runLevelsCleared = 0;
  runTotalFinds = 0;
  runTotalMisses = 0;
  runTotalHints = 0;
  runMashed = false;
  runRevealed = false;
  runStartTimeMs = Date.now();
  lastCompletedRun = null;

  startLevel(currentLevelIndex);
}

function startPuzzle(p) {
  const pool = getOrderedPuzzlesForCategory(activeCategoryFilter);
  const idx = pool.findIndex(item => item.id === p.id);
  if (idx !== -1) {
    startRun(pool, idx);
  } else {
    startRun([p], 0);
  }
}

function ensureTimerBarDom() {
  let barWrap = document.getElementById('timer-bar-wrap');
  let barFill = document.getElementById('timer-bar-fill');
  if (barWrap && barFill) return { barWrap, barFill };

  const screenGame = document.getElementById('screen-game');
  const imagesWrap = document.getElementById('images-wrap');
  if (!screenGame || !imagesWrap) return { barWrap: null, barFill: null };

  barWrap = document.createElement('div');
  barWrap.id = 'timer-bar-wrap';
  barWrap.className = 'timer-bar-wrap';
  barWrap.setAttribute('aria-hidden', 'true');
  barWrap.hidden = true;

  barFill = document.createElement('div');
  barFill.id = 'timer-bar-fill';
  barFill.className = 'timer-bar-fill';
  barWrap.appendChild(barFill);

  screenGame.insertBefore(barWrap, imagesWrap);
  return { barWrap, barFill };
}

function startLevel(levelIndex) {
  puzzleLoadSeq++;
  const seq = puzzleLoadSeq;

  currentLevelIndex = levelIndex;
  const p = runQueue[currentLevelIndex];
  if (!p) {
    openPicker(currentMode);
    return;
  }

  currentPuzzle = p;
  foundSet = new Set();
  revealedSet = new Set();
  missTimes = [];
  ignoreUntil = 0;
  levelMisses = 0;
  levelHintsUsed = 0;
  untimedHintReady = true;
  imagesLoaded = false;
  puzzleOver = false;
  levelStartTimeMs = Date.now();

  const levelNumber = currentLevelIndex + 1;
  const levelSec = getLevelTimeLimitSec(levelNumber);
  timedLevelLimitMs = levelSec * 1000;
  timedRemainingMs = timedLevelLimitMs;
  timedLastTickMs = 0;

  clearAllTimers();

  // Update play counters on level start
  const m = counters.modes[currentMode];
  m.started++;
  if (!m.firstPuzzleId) m.firstPuzzleId = p.id;
  addDay();
  saveCounters();

  applyTheme(currentMode);
  showScreen('screen-game');

  document.getElementById('game-title').textContent =
    'Level ' + levelNumber + ': ' + p.title;
  renderStars();
  announce(
    currentMode === 'timed'
      ? 'Level ' + levelNumber + ' (' + levelSec + 's) — Spot all 5 differences!'
      : 'Level ' + levelNumber + ' — Tap any difference you spot on either picture!'
  );

  const confetti = document.getElementById('confetti');
  confetti.textContent = '';
  confetti.hidden = true;

  const resOverlay = document.getElementById('result-overlay');
  resOverlay.hidden = true;
  resOverlay.classList.remove('docked');
  resOverlay.setAttribute('aria-modal', 'true');

  const rankBanner = document.getElementById('result-rank-banner');
  if (rankBanner) {
    rankBanner.textContent = '';
    rankBanner.hidden = true;
  }
  const nickBox = document.getElementById('result-nickname-box');
  if (nickBox) {
    nickBox.textContent = '';
    nickBox.hidden = true;
  }

  document.getElementById('marks-a').textContent = '';
  document.getElementById('marks-b').textContent = '';
  document.getElementById('quad-a').className = 'quadrant-glow';
  document.getElementById('quad-b').className = 'quadrant-glow';

  setupHud();
  updateTimerUi();

  const imgA = document.getElementById('img-a');
  const imgB = document.getElementById('img-b');
  imgA.alt = 'Original picture';
  imgB.alt = 'Changed picture';

  layoutImages();

  let loadHandled = false;
  const checkBothLoaded = () => {
    if (loadHandled || puzzleLoadSeq !== seq) return;
    if (imgA.complete && imgB.complete && imgA.naturalWidth > 0 && imgB.naturalWidth > 0) {
      loadHandled = true;
      imagesLoaded = true;
      layoutImages();
      if (!counters.modes[currentMode].onboarded) {
        showCoach();
      } else {
        levelStartTimeMs = Date.now();
        startTimers();
      }
    }
  };

  imgA.onload = checkBothLoaded;
  imgB.onload = checkBothLoaded;
  imgA.src = p.imageA;
  imgB.src = p.imageB;
  if (imgA.complete && imgB.complete) {
    checkBothLoaded();
  }

  imgA.onpointerdown = e => handleTap(e, imgA);
  imgB.onpointerdown = e => handleTap(e, imgB);
}

function setupHud() {
  const ctrl = document.getElementById('hud-controls');
  ctrl.textContent = '';
  const { barWrap } = ensureTimerBarDom();

  if (currentMode === 'timed') {
    if (barWrap) barWrap.hidden = false;

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'score-display';
    scoreSpan.id = 'score-display';
    scoreSpan.textContent = 'Score: ' + runScore;
    ctrl.appendChild(scoreSpan);

    const timerSpan = document.createElement('span');
    timerSpan.className = 'timer-display';
    timerSpan.id = 'timer-display';
    timerSpan.textContent = Math.ceil(timedRemainingMs / 1000) + 's';
    ctrl.appendChild(timerSpan);

    const hint = document.createElement('button');
    hint.type = 'button';
    hint.className = 'hint-btn';
    hint.id = 'btn-hint';
    hint.textContent = 'Hint (-' + TIMED_HINT_COST_SEC + 's)';
    hint.onclick = giveHint;
    ctrl.appendChild(hint);
  } else {
    if (barWrap) barWrap.hidden = true;

    const hint = document.createElement('button');
    hint.type = 'button';
    hint.className = 'hint-btn';
    hint.id = 'btn-hint';
    hint.textContent = 'Hint';
    hint.onclick = giveHint;
    ctrl.appendChild(hint);
  }
}

function updateScoreUi() {
  const scoreEl = document.getElementById('score-display');
  if (scoreEl) {
    scoreEl.textContent = 'Score: ' + runScore;
  }
}

function updateTimerUi() {
  const secLeft = Math.max(0, Math.ceil(timedRemainingMs / 1000));
  const timerEl = document.getElementById('timer-display');
  if (timerEl) {
    timerEl.textContent = secLeft + 's';
    timerEl.classList.toggle('timer-warn', secLeft <= 20 && secLeft > 10);
    timerEl.classList.toggle('timer-danger', secLeft <= 10);
  }

  const { barWrap, barFill } = ensureTimerBarDom();
  if (barWrap && barFill) {
    if (currentMode !== 'timed') {
      barWrap.hidden = true;
      return;
    }
    barWrap.hidden = false;
    const rawPct =
      timedLevelLimitMs > 0
        ? Math.max(0, Math.min(100, (timedRemainingMs / timedLevelLimitMs) * 100))
        : 0;
    // Under prefers-reduced-motion, update countdown bar in discrete steps without transition
    const pct = isReducedMotion() ? Math.round(rawPct / 5) * 5 : rawPct;
    barFill.style.width = pct.toFixed(1) + '%';
    barFill.classList.toggle('bar-warn', secLeft <= 20 && secLeft > 10);
    barFill.classList.toggle('bar-danger', secLeft <= 10);
  }
}

function layoutImages() {
  const screenGame = document.getElementById('screen-game');
  if (!screenGame || screenGame.hidden || !currentPuzzle) return;

  const wrap = document.getElementById('images-wrap');
  const hud = document.getElementById('hud');
  const barWrap = document.getElementById('timer-bar-wrap');
  const msg = document.getElementById('message-area');
  const resOverlay = document.getElementById('result-overlay');
  const noticeEl = document.getElementById('storage-notice');
  const imgA = document.getElementById('img-a');
  const boxA = document.getElementById('box-a');
  const boxB = document.getElementById('box-b');

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sideBySide = vw >= 820;
  wrap.style.flexDirection = sideBySide ? 'row' : 'column';

  const natW = (imgA && imgA.naturalWidth) || currentPuzzle.width || 800;
  const natH = (imgA && imgA.naturalHeight) || currentPuzzle.height || 600;
  const aspect = natW / natH;

  const hudH = hud ? hud.getBoundingClientRect().height : 56;
  const barH =
    barWrap && !barWrap.hidden ? barWrap.getBoundingClientRect().height : 0;
  const msgH = msg ? msg.getBoundingClientRect().height : 34;
  const dockedH =
    resOverlay && !resOverlay.hidden && resOverlay.classList.contains('docked')
      ? resOverlay.getBoundingClientRect().height
      : 0;
  const noticeH =
    noticeEl && !noticeEl.hidden ? noticeEl.getBoundingClientRect().height : 0;

  if (sideBySide) {
    const padX = 32;
    const gap = 16;
    const padY = 24;
    const maxEachW = Math.max(200, Math.floor((vw - padX - gap) / 2));
    const maxEachH = Math.max(
      160,
      Math.floor(vh - hudH - barH - msgH - dockedH - noticeH - padY)
    );

    let w = maxEachW;
    let h = w / aspect;
    if (h > maxEachH) {
      h = maxEachH;
      w = h * aspect;
    }
    w = Math.round(w);
    h = Math.round(h);

    [boxA, boxB].forEach(b => {
      b.style.width = w + 'px';
      b.style.height = h + 'px';
      b.style.maxHeight = 'none';
    });
  } else {
    const padX = 16;
    const gap = 8;
    const padY = 12;
    const maxW = Math.max(160, vw - padX);
    const availH = Math.max(
      180,
      vh - hudH - barH - msgH - dockedH - noticeH - padY - gap
    );
    const maxEachH = Math.floor(availH / 2);

    let w = maxW;
    let h = w / aspect;
    if (h > maxEachH) {
      h = maxEachH;
      w = h * aspect;
    }
    w = Math.round(w);
    h = Math.round(h);

    [boxA, boxB].forEach(b => {
      b.style.width = w + 'px';
      b.style.height = h + 'px';
      b.style.maxHeight = maxEachH + 'px';
    });
  }

  repositionMarks();
}

window.addEventListener('resize', layoutImages);
window.addEventListener('orientationchange', layoutImages);

function repositionMarks() {
  if (!currentPuzzle) return;
  const imgA = document.getElementById('img-a');
  const imgB = document.getElementById('img-b');
  const wA = imgA.getBoundingClientRect().width;
  const wB = imgB.getBoundingClientRect().width;

  document.querySelectorAll('.mark').forEach(mark => {
    const x = parseFloat(mark.dataset.x);
    const y = parseFloat(mark.dataset.y);
    const r = parseFloat(mark.dataset.r);
    const isA = mark.parentElement && mark.parentElement.id === 'marks-a';
    const w = isA ? wA : wB;
    const size = Math.max(24, r * w * 2);
    mark.style.left = x * 100 + '%';
    mark.style.top = y * 100 + '%';
    mark.style.width = size + 'px';
    mark.style.height = size + 'px';
  });
}

// ---------- Progressive Tap Tolerance & Hit Testing ----------
function getLevelHitRadiusPx(d, rectWidth, levelNumber) {
  const rawR = Number(d.r) || 0.045;
  const lvlIdx = Math.max(0, Math.min(9, (Number(levelNumber) || 1) - 1));
  // Level-by-level tightening: +0.0135W on Level 1 down to +0.0000W on Level 10
  const levelSlopR = (9 - lvlIdx) * 0.0015;

  let effR;
  if (rawR > KIDS_LARGE_CAP_R) {
    // Cap large/oversized regions (including kids-06#2 r=0.2813) so 5-circle luck area <= 33%
    effR = KIDS_LARGE_CAP_R;
  } else if (rawR < KIDS_SLOP_CAP_R) {
    effR = Math.min(KIDS_SLOP_CAP_R, Math.max(rawR + levelSlopR, KIDS_MIN_HIT_R));
  } else {
    effR = rawR;
  }

  // HARD FLOOR: never below max(0.085W, 32px) at any level
  const hardFloorPx = Math.max(KIDS_MIN_HIT_R * rectWidth, KIDS_MIN_HIT_PX);
  return Math.max(effR * rectWidth, hardFloorPx);
}

function getTapDistancesPx(x, y, d, rectWidth, rectHeight) {
  const trueDistPx = Math.hypot((x - d.x) * rectWidth, (y - d.y) * rectHeight);
  const minEdge = Math.min(d.x, d.y, 1 - d.x, 1 - d.y);
  if (minEdge >= KIDS_EDGE_MARGIN) {
    return { hitDistPx: trueDistPx, trueDistPx };
  }
  const clampedX = Math.min(1 - KIDS_EDGE_MARGIN, Math.max(KIDS_EDGE_MARGIN, d.x));
  const clampedY = Math.min(1 - KIDS_EDGE_MARGIN, Math.max(KIDS_EDGE_MARGIN, d.y));
  const clampedDistPx = Math.hypot((x - clampedX) * rectWidth, (y - clampedY) * rectHeight);
  return {
    hitDistPx: Math.min(trueDistPx, clampedDistPx),
    trueDistPx
  };
}

function triggerMashCooldown(now) {
  // 800 ms cooldown after 3 rapid misses with ZERO score or clock penalty
  ignoreUntil = now + 800;
  missTimes = [];
  runMashed = true;
  announce('Take a peek first 👀');
}

function isGameplayPaused() {
  if (document.hidden) return true;
  const gate = document.getElementById('gate-overlay');
  if (gate && !gate.hidden) return true;
  const coach = document.getElementById('coach-overlay');
  if (coach && !coach.hidden) return true;
  return false;
}

function handleTap(e, img) {
  if (!imagesLoaded || Date.now() < ignoreUntil || puzzleOver) return;
  if (isGameplayPaused()) return;
  if (currentMode === 'timed' && timedRemainingMs <= 0) return;
  if (foundSet.size >= 5) return;

  e.preventDefault();

  const rect = img.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  const diffs = currentPuzzle.differences || [];
  const levelNumber = currentLevelIndex + 1;

  // Always check all unfound differences first so a valid hit is never swallowed by mash guard
  let bestIdx = -1;
  let bestTrueDistPx = Infinity;

  for (let i = 0; i < diffs.length; i++) {
    if (foundSet.has(i)) continue;
    const d = diffs[i];
    const thrPx = getLevelHitRadiusPx(d, rect.width, levelNumber);
    const { hitDistPx, trueDistPx } = getTapDistancesPx(x, y, d, rect.width, rect.height);
    if (hitDistPx <= thrPx && trueDistPx < bestTrueDistPx) {
      bestIdx = i;
      bestTrueDistPx = trueDistPx;
    }
  }

  if (bestIdx !== -1) {
    const d = diffs[bestIdx];
    foundSet.add(bestIdx);
    runTotalFinds++;
    clearQuadrantGlow();
    placeMark(bestIdx, d, false);
    renderStars();

    if (currentMode === 'timed') {
      runScore += TIMED_FIND_POINTS;
      updateScoreUi();
      announce(foundSet.size + ' of 5 found (+' + TIMED_FIND_POINTS + ' pts)');
    } else {
      announce(foundSet.size + ' of 5 found');
    }

    playDing(foundSet.size);
    if (navigator.vibrate) {
      try { navigator.vibrate(30); } catch (err) { /* ignore */ }
    }
    resetHintIdle();

    if (foundSet.size === 5) {
      const completedPuzzle = currentPuzzle;
      const completedPuzzleId = completedPuzzle.id;
      const completedMode = currentMode;
      const loadTokenAtWin = puzzleLoadSeq;

      runLevelsCleared++;

      let levelBonusPts = 0;
      if (completedMode === 'timed') {
        const remWholeSec = Math.max(0, Math.ceil(timedRemainingMs / 1000));
        levelBonusPts = remWholeSec * TIMED_SEC_BONUS_MULT;
        runScore += levelBonusPts;
        updateScoreUi();
      }

      const m = counters.modes[completedMode];
      m.completed++;
      m.done[completedPuzzleId] = 5;
      if (completedPuzzleId === m.firstPuzzleId) {
        m.firstPuzzleCompleted = true;
      }
      if (completedMode === 'timed' && runScore > (m.bestScore || 0)) {
        m.bestScore = runScore;
      }
      saveCounters();

      puzzleOver = true;
      clearAllTimers();

      setTimeout(() => {
        if (
          currentPuzzle &&
          currentPuzzle.id === completedPuzzleId &&
          currentMode === completedMode &&
          puzzleLoadSeq === loadTokenAtWin
        ) {
          onLevelCleared(levelBonusPts);
        }
      }, 350);
    }
  } else {
    onMiss(e, img);
  }
}

function placeMark(idx, d, isRevealed) {
  ['marks-a', 'marks-b'].forEach(id => {
    const container = document.getElementById(id);
    const mark = document.createElement('div');
    mark.className = 'mark' + (isRevealed ? ' mark-revealed' : '');
    mark.dataset.x = d.x;
    mark.dataset.y = d.y;
    // Always draw the found ring at the real difference radius, not the enlarged tap area
    mark.dataset.r = d.r;
    container.appendChild(mark);
  });
  repositionMarks();
}

function onMiss(e, img) {
  const rect = img.getBoundingClientRect();
  const tapX = e.clientX - rect.left;
  const tapY = e.clientY - rect.top;

  if (!isReducedMotion()) {
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    ripple.style.left = tapX + 'px';
    ripple.style.top = tapY + 'px';
    img.parentElement.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);

    const box = img.parentElement;
    box.classList.remove('wobble');
    void box.offsetWidth;
    box.classList.add('wobble');
    setTimeout(() => box.classList.remove('wobble'), 310);
  }

  levelMisses++;
  runTotalMisses++;

  const now = Date.now();
  missTimes.push(now);
  missTimes = missTimes.filter(t => now - t < 1500);

  if (missTimes.length >= 3) {
    triggerMashCooldown(now);
    return;
  }

  if (currentMode === 'timed') {
    // Miss in Timed mode costs 0 points, but loses 2 seconds of clock
    timedRemainingMs = Math.max(0, timedRemainingMs - TIMED_MISS_PENALTY_SEC * 1000);
    updateTimerUi();
    if (timedRemainingMs <= 0) {
      onTimeUp();
      return;
    }
    const msg = MISS_MESSAGES[missMsgIndex % MISS_MESSAGES.length];
    missMsgIndex++;
    announce(msg + ' (-' + TIMED_MISS_PENALTY_SEC + 's)');
  } else {
    const msg = MISS_MESSAGES[missMsgIndex % MISS_MESSAGES.length];
    missMsgIndex++;
    announce(msg);
  }
}

function announce(text) {
  const area = document.getElementById('message-area');
  if (area) area.textContent = text;
}

// ---------- Hints ----------
function clearQuadrantGlow() {
  clearTimeout(quadGlowTimer);
  quadGlowTimer = null;
  ['quad-a', 'quad-b'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = 'quadrant-glow';
  });
}

function resetHintIdle() {
  clearTimeout(hintIdleTimer);
  const btn = document.getElementById('btn-hint');
  if (btn) btn.classList.remove('pulse');
  if (!puzzleOver && foundSet.size < 5) {
    hintIdleTimer = setTimeout(() => {
      untimedHintReady = true;
      const hintBtn = document.getElementById('btn-hint');
      if (hintBtn && foundSet.size < 5 && !puzzleOver) {
        if (currentMode === 'untimed') {
          hintBtn.textContent = 'Hint';
        }
        if (!isReducedMotion()) {
          hintBtn.classList.add('pulse');
        }
      }
    }, 20000);
  }
}

function giveHint() {
  if (puzzleOver || !imagesLoaded || isGameplayPaused()) return;
  if (currentMode === 'timed' && timedRemainingMs <= 0) return;
  if (foundSet.size >= 5) return;

  const diffs = currentPuzzle.differences || [];
  let nextIdx = -1;
  for (let i = 0; i < diffs.length; i++) {
    if (!foundSet.has(i)) {
      nextIdx = i;
      break;
    }
  }
  if (nextIdx < 0) return;
  const d = diffs[nextIdx];

  levelHintsUsed++;
  runTotalHints++;

  const btn = document.getElementById('btn-hint');
  if (btn) btn.classList.remove('pulse');

  if (currentMode === 'timed') {
    // Hints in Timed mode cost time, not points (leave at least 1s so a hint never insta-fails)
    timedRemainingMs = Math.max(1000, timedRemainingMs - TIMED_HINT_COST_SEC * 1000);
    updateTimerUi();
  } else {
    untimedHintReady = false;
  }

  const qx = d.x < 0.5 ? 'l' : 'r';
  const qy = d.y < 0.5 ? 't' : 'b';
  const cls = 'quad-' + qy + qx;
  const labelMap = {
    'quad-tl': 'top-left corner',
    'quad-tr': 'top-right corner',
    'quad-bl': 'bottom-left corner',
    'quad-br': 'bottom-right corner'
  };

  clearTimeout(quadGlowTimer);
  ['quad-a', 'quad-b'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = 'quadrant-glow active ' + cls;
  });
  quadGlowTimer = setTimeout(() => {
    clearQuadrantGlow();
  }, 2500);

  if (currentMode === 'timed') {
    announce(
      'Hint (-' + TIMED_HINT_COST_SEC + 's): look in the glowing ' + (labelMap[cls] || 'area')
    );
  } else {
    announce('Hint: look in the glowing ' + (labelMap[cls] || 'area'));
  }

  resetHintIdle();
}

// ---------- Stars, Level Clear, Run End & Nickname Prompt ----------
function renderStars() {
  const slots = document.querySelectorAll('.star-slot');
  slots.forEach((s, i) => {
    const shouldFill = i < foundSet.size;
    s.classList.toggle('filled', shouldFill);
  });
}

function ensureResultLeaderboardNodes() {
  const card = document.querySelector('#result-overlay .result-card');
  const btns = document.getElementById('result-buttons');
  if (!card || !btns) return { rankBanner: null, nickBox: null };

  let rankBanner = document.getElementById('result-rank-banner');
  if (!rankBanner) {
    rankBanner = document.createElement('p');
    rankBanner.id = 'result-rank-banner';
    rankBanner.className = 'result-rank-banner';
    rankBanner.hidden = true;
    card.insertBefore(rankBanner, btns);
  }

  let nickBox = document.getElementById('result-nickname-box');
  if (!nickBox) {
    nickBox = document.createElement('div');
    nickBox.id = 'result-nickname-box';
    nickBox.className = 'result-nickname-box';
    nickBox.hidden = true;
    card.insertBefore(nickBox, btns);
  }

  return { rankBanner, nickBox };
}

function formatRankSummaryText(submitResult, nickname) {
  if (!submitResult || !submitResult.ranks) return '';
  const r = submitResult.ranks;
  const parts = [];
  if (r.mode) parts.push('#' + r.mode + ' Overall');
  if (r.category) parts.push('#' + r.category + ' in Category');
  if (r.daily) parts.push('#' + r.daily + ' Today');
  if (parts.length === 0) {
    return 'Saved as ' + nickname;
  }
  return nickname + ' • ' + parts.join(' • ');
}

function buildPresetNicknameWidget(container, initialNick, onSave, onCancelOrSkip, skipLabel) {
  container.textContent = '';

  const parsed = parsePresetNickname(initialNick);
  let selAdj = parsed ? parsed.adj : KIDS_ADJECTIVES[0];
  let selAnimal = parsed ? parsed.animal : KIDS_ANIMALS[0];
  let selNum = parsed ? parsed.num : 4;

  const title = document.createElement('p');
  title.className = 'nick-prompt-title';
  title.textContent = 'Save your score? Pick a badge nickname:';
  container.appendChild(title);

  // Required safety note: "Don't use your real name."
  const safetyNote = document.createElement('p');
  safetyNote.className = 'nick-safety-note';
  safetyNote.textContent = "Don't use your real name.";
  container.appendChild(safetyNote);

  const preview = document.createElement('div');
  preview.className = 'nick-badge-preview';
  container.appendChild(preview);

  const updatePreview = () => {
    preview.textContent = selAdj + ' ' + selAnimal + ' ' + selNum;
  };
  updatePreview();

  const makeWordRow = (label, items, getSelected, setSelected) => {
    const rowLabel = document.createElement('p');
    rowLabel.className = 'nick-row-label';
    rowLabel.textContent = label;
    container.appendChild(rowLabel);

    const row = document.createElement('div');
    row.className = 'nick-word-row';
    items.forEach(word => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'nick-word-btn' + (getSelected() === word ? ' selected' : '');
      b.textContent = word;
      b.onclick = () => {
        setSelected(word);
        row.querySelectorAll('button').forEach(btn => {
          btn.classList.toggle('selected', btn.textContent === word);
        });
        updatePreview();
      };
      row.appendChild(b);
    });
    container.appendChild(row);
  };

  makeWordRow('Adjective (20):', KIDS_ADJECTIVES, () => selAdj, v => { selAdj = v; });
  makeWordRow('Animal (20):', KIDS_ANIMALS, () => selAnimal, v => { selAnimal = v; });

  const numLabel = document.createElement('p');
  numLabel.className = 'nick-row-label';
  numLabel.textContent = 'Number (1–99):';
  container.appendChild(numLabel);

  const stepRow = document.createElement('div');
  stepRow.className = 'nick-word-row';

  const quickRow = document.createElement('div');
  quickRow.className = 'nick-word-row';

  const syncQuickButtons = () => {
    quickRow.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('selected', Number(btn.dataset.num) === selNum);
    });
  };

  const adjustNum = delta => {
    let next = selNum + delta;
    if (next < 1) next = 99;
    if (next > 99) next = 1;
    selNum = next;
    syncQuickButtons();
    updatePreview();
  };

  [
    { label: '-10', delta: -10 },
    { label: '-1', delta: -1 },
    { label: '+1', delta: 1 },
    { label: '+10', delta: 10 }
  ].forEach(item => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nick-word-btn';
    b.textContent = item.label;
    b.onclick = () => adjustNum(item.delta);
    stepRow.appendChild(b);
  });
  container.appendChild(stepRow);

  QUICK_NUMBERS.forEach(n => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.num = String(n);
    b.className = 'nick-word-btn' + (selNum === n ? ' selected' : '');
    b.textContent = String(n);
    b.onclick = () => {
      selNum = n;
      syncQuickButtons();
      updatePreview();
    };
    quickRow.appendChild(b);
  });
  container.appendChild(quickRow);

  const actions = document.createElement('div');
  actions.className = 'nick-prompt-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'primary-btn';
  saveBtn.textContent = 'Save nickname';
  saveBtn.onclick = () => {
    const composed = selAdj + ' ' + selAnimal + ' ' + selNum;
    onSave(composed);
  };
  actions.appendChild(saveBtn);

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'link-btn';
  skipBtn.textContent = skipLabel || 'Skip';
  skipBtn.onclick = () => {
    onCancelOrSkip();
  };
  actions.appendChild(skipBtn);

  container.appendChild(actions);
}

function finalizeRunRecord() {
  const levelNumber = currentLevelIndex + 1;
  lastCompletedRun = {
    mode: currentMode,
    categoryId: activeCategoryFilter || 'all',
    score: currentMode === 'timed' ? runScore : runLevelsCleared * 1000,
    levelReached: levelNumber,
    levelsCleared: runLevelsCleared,
    finds: runTotalFinds,
    misses: runTotalMisses,
    hints: runTotalHints,
    durationMs: Math.max(1000, Date.now() - runStartTimeMs),
    mashed: runMashed,
    revealed: runRevealed || revealedSet.size > 0,
    disqualified: runMashed || runRevealed || revealedSet.size > 0,
    date: todayStr(),
    ts: Date.now(),
    submittedResult: null
  };
}

function handleRunEndLeaderboardFlow() {
  const { rankBanner, nickBox } = ensureResultLeaderboardNodes();
  if (!rankBanner || !nickBox) return;

  rankBanner.textContent = '';
  rankBanner.hidden = true;
  nickBox.textContent = '';
  nickBox.hidden = true;

  // Never record or prompt if storage is blocked, or if run used Reveal all / mashed
  if (!leaderboardStore || !leaderboardStore.isStorageAvailable()) {
    return;
  }
  if (!lastCompletedRun || lastCompletedRun.disqualified) {
    return;
  }
  if (currentMode === 'timed' && lastCompletedRun.score <= 0 && lastCompletedRun.finds <= 0) {
    return;
  }

  const existingNick = leaderboardStore.getNickname();

  if (existingNick) {
    const res = leaderboardStore.submitRun(
      Object.assign({}, lastCompletedRun, { nickname: existingNick })
    );
    lastCompletedRun.submittedResult = res;
    const summary = formatRankSummaryText(res, existingNick);
    if (summary) {
      rankBanner.textContent = summary;
      rankBanner.hidden = false;
    }
    return;
  }

  // Respect session-remembered "Skip" choice
  if (nicknameSkippedSession) {
    return;
  }

  rankBanner.textContent = 'Save your run to this device leaderboard?';
  rankBanner.hidden = false;
  nickBox.hidden = false;

  const onSaveNick = chosenNick => {
    leaderboardStore.setNickname(chosenNick);
    const res = leaderboardStore.submitRun(
      Object.assign({}, lastCompletedRun, { nickname: chosenNick })
    );
    lastCompletedRun.submittedResult = res;
    nickBox.textContent = '';
    nickBox.hidden = true;
    const summary = formatRankSummaryText(res, chosenNick);
    rankBanner.textContent = summary || 'Saved as ' + chosenNick;
    rankBanner.hidden = false;
  };

  const onSkipNick = () => {
    nicknameSkippedSession = true;
    nickBox.textContent = '';
    nickBox.hidden = true;
    rankBanner.textContent = 'Skipped saving score for this session.';
  };

  buildPresetNicknameWidget(nickBox, null, onSaveNick, onSkipNick, 'Skip');
}

function onLevelCleared(levelBonusPts) {
  playWinChime();
  showConfetti();

  const levelNumber = currentLevelIndex + 1;
  const totalLevels = runQueue.length;
  const hasMoreLevels = currentLevelIndex + 1 < totalLevels;

  if (hasMoreLevels) {
    announce('Level ' + levelNumber + ' complete!');
    showLevelClearOverlay(levelNumber, totalLevels, levelBonusPts);
  } else {
    announce('You completed all ' + totalLevels + ' levels!');
    finalizeRunRecord();
    showRunCompleteOverlay(totalLevels, levelBonusPts);
    handleRunEndLeaderboardFlow();
  }
}

function showConfetti() {
  const c = document.getElementById('confetti');
  c.textContent = '';
  if (isReducedMotion()) {
    c.hidden = true;
    return;
  }
  c.hidden = false;
  const palette = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ffffff'];
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('span');
    s.style.left = Math.random() * 100 + '%';
    s.style.backgroundColor = palette[i % palette.length];
    s.style.animationDelay = (Math.random() * 0.35).toFixed(2) + 's';
    c.appendChild(s);
  }
  setTimeout(() => {
    c.textContent = '';
    c.hidden = true;
  }, 1200);
}

function showLevelClearOverlay(levelNumber, totalLevels, levelBonusPts) {
  const { rankBanner, nickBox } = ensureResultLeaderboardNodes();
  if (rankBanner) {
    rankBanner.textContent = '';
    rankBanner.hidden = true;
  }
  if (nickBox) {
    nickBox.textContent = '';
    nickBox.hidden = true;
  }

  const resStars = document.getElementById('result-stars');
  if (resStars) {
    resStars.textContent = '★★★★★';
    resStars.hidden = false;
  }

  const msgEl = document.getElementById('result-message');
  if (currentMode === 'timed') {
    msgEl.textContent =
      'Level ' +
      levelNumber +
      ' of ' +
      totalLevels +
      ' cleared! Time bonus: +' +
      levelBonusPts +
      ' • Score: ' +
      runScore;
  } else {
    msgEl.textContent =
      'Level ' +
      levelNumber +
      ' of ' +
      totalLevels +
      ' cleared! You found all 5 differences!';
  }

  const btns = document.getElementById('result-buttons');
  btns.textContent = '';

  const overlay = document.getElementById('result-overlay');
  overlay.classList.remove('docked');
  overlay.setAttribute('aria-modal', 'true');
  overlay.dataset.armedAt = String(Date.now());

  const guard = fn => () => {
    if (Date.now() - Number(overlay.dataset.armedAt || 0) < 350) return;
    fn();
  };

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'primary-btn';
  nextBtn.textContent = 'Next level (Level ' + (levelNumber + 1) + ')';
  nextBtn.onclick = guard(() => {
    startLevel(currentLevelIndex + 1);
  });
  btns.appendChild(nextBtn);

  const pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.className = 'link-btn';
  pickBtn.textContent = 'Pick another';
  pickBtn.onclick = guard(() => openPicker(currentMode));
  btns.appendChild(pickBtn);

  overlay.hidden = false;
}

function showRunCompleteOverlay(totalLevels, levelBonusPts) {
  const resStars = document.getElementById('result-stars');
  if (resStars) {
    resStars.textContent = '★★★★★';
    resStars.hidden = false;
  }

  const msgEl = document.getElementById('result-message');
  if (currentMode === 'timed') {
    msgEl.textContent =
      'All ' +
      totalLevels +
      ' levels cleared! Final Score: ' +
      runScore +
      ' pts (Time bonus +' +
      levelBonusPts +
      ') • Finds: ' +
      runTotalFinds;
  } else {
    msgEl.textContent =
      'Great Job Exploring Today! Levels cleared: ' +
      runLevelsCleared +
      '/' +
      totalLevels +
      ' • Finds: ' +
      runTotalFinds +
      ' • Misses: ' +
      runTotalMisses +
      ' • Hints: ' +
      runTotalHints;
  }

  const btns = document.getElementById('result-buttons');
  btns.textContent = '';

  const overlay = document.getElementById('result-overlay');
  overlay.classList.remove('docked');
  overlay.setAttribute('aria-modal', 'true');
  overlay.dataset.armedAt = String(Date.now());

  const guard = fn => () => {
    if (Date.now() - Number(overlay.dataset.armedAt || 0) < 350) return;
    fn();
  };

  const playAgain = document.createElement('button');
  playAgain.type = 'button';
  playAgain.className = 'primary-btn';
  playAgain.textContent = 'Play again';
  playAgain.onclick = guard(() => {
    startRun(runQueue, 0);
  });
  btns.appendChild(playAgain);

  const pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.className = 'secondary-btn';
  pickBtn.textContent = 'Pick another';
  pickBtn.onclick = guard(() => openPicker(currentMode));
  btns.appendChild(pickBtn);

  const homeBtn = document.createElement('button');
  homeBtn.type = 'button';
  homeBtn.className = 'link-btn';
  homeBtn.textContent = 'Back home';
  homeBtn.onclick = guard(() => renderHome());
  btns.appendChild(homeBtn);

  overlay.hidden = false;
}

// ---------- Timed Mode Clock & Game Over ----------
function startTimers() {
  resetHintIdle();
  if (currentMode !== 'timed') return;

  if (timedLoopId) {
    clearInterval(timedLoopId);
    timedLoopId = null;
  }
  timedLastTickMs = Date.now();
  updateTimerUi();

  timedLoopId = setInterval(() => {
    const now = Date.now();
    if (puzzleOver || !imagesLoaded || isGameplayPaused()) {
      timedLastTickMs = now;
      return;
    }
    const delta = Math.max(0, now - timedLastTickMs);
    timedLastTickMs = now;
    timedRemainingMs = Math.max(0, timedRemainingMs - delta);
    updateTimerUi();

    if (timedRemainingMs <= 0) {
      clearInterval(timedLoopId);
      timedLoopId = null;
      onTimeUp();
    }
  }, 100);
}

function onTimeUp() {
  if (puzzleOver) return;
  puzzleOver = true;
  clearAllTimers();

  const foundOnLevel = foundSet.size;
  const levelNumber = currentLevelIndex + 1;
  const m = counters.modes.timed;
  const prev = Number(m.done[currentPuzzle.id]) || 0;
  m.done[currentPuzzle.id] = Math.max(prev, foundOnLevel);
  if (runScore > (m.bestScore || 0)) {
    m.bestScore = runScore;
  }
  saveCounters();

  finalizeRunRecord();

  const resStars = document.getElementById('result-stars');
  if (resStars) {
    resStars.textContent = '★'.repeat(foundOnLevel) + '☆'.repeat(5 - foundOnLevel);
    resStars.hidden = false;
  }

  document.getElementById('result-message').textContent =
    'Game Over! Final Score: ' +
    runScore +
    ' pts • Level reached: Level ' +
    levelNumber +
    ' • Total finds: ' +
    runTotalFinds;
  announce(
    'Game Over! Final score ' +
      runScore +
      ', reached Level ' +
      levelNumber +
      ' with ' +
      runTotalFinds +
      ' finds.'
  );

  const btns = document.getElementById('result-buttons');
  btns.textContent = '';

  const overlay = document.getElementById('result-overlay');
  overlay.classList.remove('docked');
  overlay.setAttribute('aria-modal', 'true');
  overlay.dataset.armedAt = String(Date.now());

  const guard = fn => () => {
    if (Date.now() - Number(overlay.dataset.armedAt || 0) < 350) return;
    fn();
  };

  const playAgain = document.createElement('button');
  playAgain.type = 'button';
  playAgain.className = 'primary-btn';
  playAgain.textContent = 'Play again';
  playAgain.onclick = guard(() => startRun(runQueue, 0));
  btns.appendChild(playAgain);

  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.className = 'secondary-btn';
  reveal.textContent = 'Reveal all';
  reveal.onclick = guard(() => {
    runRevealed = true;
    if (lastCompletedRun) {
      lastCompletedRun.revealed = true;
      lastCompletedRun.disqualified = true;
    }
    const { rankBanner, nickBox } = ensureResultLeaderboardNodes();
    if (rankBanner) rankBanner.hidden = true;
    if (nickBox) {
      nickBox.textContent = '';
      nickBox.hidden = true;
    }
    reveal.hidden = true;
    overlay.classList.add('docked');
    overlay.setAttribute('aria-modal', 'false');
    revealAll();
    layoutImages();
  });
  btns.appendChild(reveal);

  const pick = document.createElement('button');
  pick.type = 'button';
  pick.className = 'link-btn';
  pick.textContent = 'Pick another';
  pick.onclick = guard(() => openPicker(currentMode));
  btns.appendChild(pick);

  handleRunEndLeaderboardFlow();
  overlay.hidden = false;
}

function revealAll() {
  const diffs = currentPuzzle.differences || [];
  diffs.forEach((d, i) => {
    if (!foundSet.has(i) && !revealedSet.has(i)) {
      revealedSet.add(i);
      placeMark(i, d, true);
    }
  });
  announce('All 5 differences revealed');
}

// ---------- Onboarding Coach ----------
function updateCoachUi() {
  document.getElementById('coach-text').textContent = COACH_STEPS[coachStep];
  const stepLabel = document.getElementById('coach-step-label');
  if (stepLabel) {
    stepLabel.textContent = 'Step ' + (coachStep + 1) + ' of 3';
  }
  const dots = document.querySelectorAll('#coach-dots .coach-dot');
  dots.forEach((d, i) => {
    d.classList.toggle('active', i === coachStep);
  });
}

function showCoach() {
  coachStep = 0;
  updateCoachUi();
  document.getElementById('coach-overlay').hidden = false;

  document.getElementById('btn-coach-next').onclick = () => {
    coachStep++;
    if (coachStep >= COACH_STEPS.length) {
      dismissCoach();
    } else {
      updateCoachUi();
    }
  };
  document.getElementById('btn-coach-skip').onclick = dismissCoach;
}

function dismissCoach() {
  document.getElementById('coach-overlay').hidden = true;
  if (currentMode && counters.modes[currentMode]) {
    counters.modes[currentMode].onboarded = true;
    saveCounters();
  }
  levelStartTimeMs = Date.now();
  timedLastTickMs = Date.now();
  startTimers();
}

// ---------- WebAudio Synthesis ----------
function playDing(step = 1) {
  if (!counters || !counters.sound) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    const baseFreq = 660 + (step - 1) * 55;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.14);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.29);
  } catch (e) { /* ignore audio restriction */ }
}

function playWinChime() {
  if (!counters || !counters.sound) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const start = audioCtx.currentTime + idx * 0.08;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  } catch (e) { /* ignore */ }
}

// ---------- Leaderboard Screen ----------
function getLbModeButtons() {
  const btnTimed =
    document.getElementById('btn-lb-mode-timed') ||
    document.querySelectorAll('#screen-leaderboard .lb-mode-btn')[1] ||
    null;
  const btnUntimed =
    document.getElementById('btn-lb-mode-untimed') ||
    document.getElementById('btn-lb-mode-kids') ||
    document.querySelectorAll('#screen-leaderboard .lb-mode-btn')[0] ||
    null;
  if (btnUntimed) btnUntimed.textContent = 'Untimed';
  if (btnTimed) btnTimed.textContent = 'Timed';
  return { btnUntimed, btnTimed };
}

function openLeaderboard(mode, returnScreen) {
  lbMode = mode === 'timed' ? 'timed' : 'untimed';
  lbReturnScreen = returnScreen || 'screen-home';
  applyTheme(lbMode);
  showScreen('screen-leaderboard');
  syncLeaderboardControls(true);
  renderLeaderboardBody();
}

function syncLeaderboardControls(resetFilter) {
  const { btnUntimed, btnTimed } = getLbModeButtons();
  if (btnUntimed) {
    btnUntimed.classList.toggle('active', lbMode === 'untimed');
    btnUntimed.setAttribute('aria-pressed', lbMode === 'untimed' ? 'true' : 'false');
  }
  if (btnTimed) {
    btnTimed.classList.toggle('active', lbMode === 'timed');
    btnTimed.setAttribute('aria-pressed', lbMode === 'timed' ? 'true' : 'false');
  }

  const tabMode =
    document.getElementById('tab-lb-mode') || document.getElementById('tab-lb-puzzle');
  if (tabMode) tabMode.textContent = 'Top Runs';

  const tabMap = {
    mode: tabMode,
    category: document.getElementById('tab-lb-category'),
    daily: document.getElementById('tab-lb-daily')
  };
  Object.keys(tabMap).forEach(t => {
    const el = tabMap[t];
    if (!el) return;
    const isSel = lbTab === t;
    el.classList.toggle('active', isSel);
    el.setAttribute('aria-selected', isSel ? 'true' : 'false');
  });

  const warnEl = document.getElementById('leaderboard-storage-msg');
  if (warnEl) {
    warnEl.hidden = leaderboardStore.isStorageAvailable();
  }

  const sel = document.getElementById('lb-filter-select');
  if (!sel) return;
  const filterRow = sel.closest('.lb-filter-row') || sel.parentElement;
  sel.textContent = '';

  if (lbTab === 'mode') {
    const opt = document.createElement('option');
    opt.value = 'all';
    opt.textContent =
      lbMode === 'timed' ? 'All Timed Runs (Top 5)' : 'All Untimed Runs (Top 5)';
    sel.appendChild(opt);
    lbSelectedFilter = 'all';
    sel.value = 'all';
    sel.disabled = true;
    if (filterRow) filterRow.hidden = false;
  } else if (lbTab === 'category') {
    if (filterRow) filterRow.hidden = false;
    sel.disabled = false;
    const cats = [{ id: 'all', label: 'All Categories' }].concat(categoriesCatalog);
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.label;
      sel.appendChild(opt);
    });
    if (resetFilter || !cats.some(c => c.id === lbSelectedFilter)) {
      lbSelectedFilter =
        activeCategoryFilter && cats.some(c => c.id === activeCategoryFilter)
          ? activeCategoryFilter
          : 'all';
    }
    sel.value = lbSelectedFilter;
  } else {
    const today = todayStr();
    const opt = document.createElement('option');
    opt.value = today;
    opt.textContent = 'Today (' + today + ')';
    sel.appendChild(opt);
    lbSelectedFilter = today;
    sel.value = today;
    sel.disabled = true;
    if (filterRow) filterRow.hidden = false;
  }
}

function getActiveLeaderboardScopeKey() {
  if (lbTab === 'mode') {
    return 'mode:' + lbMode + ':all';
  }
  if (lbTab === 'category') {
    return 'category:' + lbMode + ':' + (lbSelectedFilter || 'all');
  }
  return 'daily:' + lbMode + ':' + todayStr();
}

function renderLeaderboardBody() {
  const body = document.getElementById('leaderboard-body');
  if (!body) return;
  body.textContent = '';

  const scopeKey = getActiveLeaderboardScopeKey();
  const entries = leaderboardStore.getTop(scopeKey, 5);

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'lb-empty';
    empty.textContent = 'No runs recorded on this board yet. Play a run to claim #1!';
    body.appendChild(empty);
  } else {
    const list = document.createElement('ol');
    list.className = 'lb-list';

    entries.forEach((entry, idx) => {
      const li = document.createElement('li');
      li.className = 'lb-row';

      const rankSpan = document.createElement('span');
      rankSpan.className = 'lb-rank';
      rankSpan.textContent = '#' + (idx + 1);
      li.appendChild(rankSpan);

      const mainInfo = document.createElement('div');
      mainInfo.className = 'lb-main';

      const nickStrong = document.createElement('strong');
      nickStrong.className = 'lb-nick';
      nickStrong.textContent = entry.nickname;
      mainInfo.appendChild(nickStrong);

      const sub = document.createElement('span');
      sub.className = 'lb-puzzle-sub';
      sub.textContent =
        lbMode === 'timed'
          ? 'Reached Level ' + entry.levelReached + ' • ' + entry.finds + ' finds'
          : 'Cleared ' +
            entry.levelsCleared +
            (entry.levelsCleared === 1 ? ' level' : ' levels') +
            ' • ' +
            entry.date;
      mainInfo.appendChild(sub);
      li.appendChild(mainInfo);

      const statsSpan = document.createElement('div');
      statsSpan.className = 'lb-stats';

      const primaryStat = document.createElement('span');
      primaryStat.className = 'lb-stat-primary';
      primaryStat.textContent =
        lbMode === 'timed'
          ? entry.score + ' pts'
          : entry.levelsCleared + (entry.levelsCleared === 1 ? ' level' : ' levels');

      const secondaryStat = document.createElement('span');
      secondaryStat.className = 'lb-stat-secondary';
      secondaryStat.textContent =
        lbMode === 'timed'
          ? 'Level ' + entry.levelReached
          : entry.misses + (entry.misses === 1 ? ' miss' : ' misses');

      statsSpan.appendChild(primaryStat);
      statsSpan.appendChild(secondaryStat);
      li.appendChild(statsSpan);

      list.appendChild(li);
    });

    body.appendChild(list);
  }

  const live = document.getElementById('leaderboard-live');
  if (live) {
    const modeLabel = lbMode === 'timed' ? 'Timed Mode' : 'Untimed Mode';
    live.textContent =
      modeLabel + ' ' + lbTab + ' leaderboard: ' + entries.length + ' entries shown.';
  }
}

function setupLeaderboardScreenActions() {
  const btnHome = document.getElementById('btn-leaderboard-home');
  if (btnHome) {
    btnHome.onclick = () => openLeaderboard(currentMode || 'timed', 'screen-home');
  }

  const btnPicker = document.getElementById('btn-leaderboard-picker');
  if (btnPicker) {
    btnPicker.onclick = () => openLeaderboard(currentMode || 'untimed', 'screen-picker');
  }

  const btnBack = document.getElementById('btn-leaderboard-back');
  if (btnBack) {
    btnBack.onclick = () => {
      if (lbReturnScreen === 'screen-picker' && currentMode) {
        openPicker(currentMode);
      } else {
        renderHome();
      }
    };
  }

  const { btnUntimed, btnTimed } = getLbModeButtons();
  if (btnUntimed) {
    btnUntimed.onclick = () => {
      lbMode = 'untimed';
      applyTheme('untimed');
      syncLeaderboardControls(true);
      renderLeaderboardBody();
    };
  }
  if (btnTimed) {
    btnTimed.onclick = () => {
      lbMode = 'timed';
      applyTheme('timed');
      syncLeaderboardControls(true);
      renderLeaderboardBody();
    };
  }

  const tabMode =
    document.getElementById('tab-lb-mode') || document.getElementById('tab-lb-puzzle');
  if (tabMode) {
    tabMode.onclick = () => {
      lbTab = 'mode';
      syncLeaderboardControls(true);
      renderLeaderboardBody();
    };
  }

  const tabCategory = document.getElementById('tab-lb-category');
  if (tabCategory) {
    tabCategory.onclick = () => {
      lbTab = 'category';
      syncLeaderboardControls(true);
      renderLeaderboardBody();
    };
  }

  const tabDaily = document.getElementById('tab-lb-daily');
  if (tabDaily) {
    tabDaily.onclick = () => {
      lbTab = 'daily';
      syncLeaderboardControls(true);
      renderLeaderboardBody();
    };
  }

  const sel = document.getElementById('lb-filter-select');
  if (sel) {
    sel.onchange = e => {
      lbSelectedFilter = e.target.value;
      renderLeaderboardBody();
    };
  }
}

// ---------- 4. Grown-ups Gate ----------
function openGrownups() {
  if (!grownupsUnlocked) {
    showGate();
    return;
  }
  renderGrownups();
}

function showGate() {
  const overlay = document.getElementById('gate-overlay');
  overlay.hidden = false;

  let answerCorrect = false;
  let holdTimer = null;
  let lastQuestionText = '';
  const holdBtn = document.getElementById('btn-hold');
  const status = document.getElementById('gate-status');
  const closeBtn = document.getElementById('btn-gate-close');

  const resetHoldVisual = () => {
    clearTimeout(holdTimer);
    holdTimer = null;
    holdBtn.classList.remove('is-holding');
  };

  function newQuestion(preserveStatus) {
    answerCorrect = false;
    resetHoldVisual();
    holdBtn.classList.remove('is-ready');
    if (!preserveStatus) {
      status.textContent = '';
    }

    let a, b, c, qText;
    do {
      a = Math.floor(Math.random() * 8) + 4; // 4..11
      b = Math.floor(Math.random() * 7) + 3; // 3..9
      c = Math.floor(Math.random() * 5) + 1; // 1..5
      qText = 'What is ' + a + ' + ' + b + ', then minus ' + c + '?';
    } while (qText === lastQuestionText);
    lastQuestionText = qText;

    const correct = a + b - c;
    document.getElementById('gate-question').textContent = qText;

    const choices = [correct, correct + 1, correct - 1, correct + 2].sort(
      () => Math.random() - 0.5
    );
    const container = document.getElementById('gate-answers');
    container.textContent = '';

    choices.forEach(n => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = String(n);
      btn.onclick = () => {
        container.querySelectorAll('button').forEach(bEl => bEl.classList.remove('selected'));
        if (n === correct) {
          answerCorrect = true;
          btn.classList.add('selected');
          holdBtn.classList.add('is-ready');
          status.textContent = 'Correct! Now press and hold the button for 2 seconds.';
        } else {
          answerCorrect = false;
          status.textContent = 'Not quite — try this new question.';
          newQuestion(true);
        }
      };
      container.appendChild(btn);
    });
  }

  newQuestion(false);

  closeBtn.onclick = () => {
    resetHoldVisual();
    overlay.hidden = true;
    timedLastTickMs = Date.now();
  };

  holdBtn.oncontextmenu = e => e.preventDefault();

  holdBtn.onpointerdown = e => {
    e.preventDefault();
    if (!answerCorrect) {
      status.textContent = 'Answer the arithmetic question above first.';
      return;
    }
    resetHoldVisual();
    holdBtn.classList.add('is-holding');
    status.textContent = 'Keep holding…';
    holdTimer = setTimeout(() => {
      holdBtn.classList.remove('is-holding');
      grownupsUnlocked = true;
      overlay.hidden = true;
      renderGrownups();
    }, 2000);
  };

  const cancelHold = () => {
    if (holdTimer) {
      resetHoldVisual();
      if (answerCorrect && !overlay.hidden) {
        status.textContent = 'Hold for a full 2 seconds to open.';
      }
    }
  };

  holdBtn.onpointerup = cancelHold;
  holdBtn.onpointerleave = cancelHold;
  holdBtn.onpointercancel = cancelHold;
}

// ---------- 5. Grown-ups Area ----------
function updateGrownupsNicknameSummary() {
  const nick = leaderboardStore.getNickname() || 'Not set';
  const ids = ['current-nick-display', 'kids-nick-display', 'grownups-kids-nick', 'kids-nick-val'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = nick;
  });

  const summaryEl = document.querySelector('#screen-grownups .nick-summary');
  if (summaryEl) {
    summaryEl.textContent = 'Current badge nickname: ' + nick;
  }
}

function ensureGrownupsNickEditorContainer() {
  let editor = document.getElementById('grownups-nick-editor');
  if (editor) return editor;
  const btnNick =
    document.getElementById('btn-change-nick') ||
    document.getElementById('btn-change-kids-nick');
  const parent =
    (btnNick && (btnNick.closest('.grownups-panel') || btnNick.parentElement)) ||
    document.querySelector('#screen-grownups .grownups-content');
  if (!parent) return null;
  editor = document.createElement('div');
  editor.id = 'grownups-nick-editor';
  editor.className = 'grownups-nick-editor';
  editor.hidden = true;
  parent.appendChild(editor);
  return editor;
}

function getClearLbConfirmBox() {
  const btnYes = document.getElementById('btn-clear-lb-yes');
  return (
    document.getElementById('clear-lb-confirm') ||
    document.getElementById('clear-leaderboard-confirm') ||
    (btnYes ? btnYes.closest('div') : null)
  );
}

function renderGrownups() {
  applyTheme('neutral');
  showScreen('screen-grownups');

  // Outbound links exist ONLY inside the Grown-ups screen
  const fbWrap = document.getElementById('feedback-link-wrap');
  fbWrap.textContent = '';
  const fbLink = document.createElement('a');
  fbLink.id = 'feedback-link';
  fbLink.className = 'feedback-btn-link';
  fbLink.href = FEEDBACK_URL;
  fbLink.target = '_blank';
  fbLink.rel = 'noopener';
  fbLink.textContent = 'Give feedback (grown-ups only)';
  fbWrap.appendChild(fbLink);

  const licWrap = document.getElementById('licenses-link-wrap');
  licWrap.textContent = '';
  const licLink = document.createElement('a');
  licLink.href = 'LICENSES.csv';
  licLink.textContent = 'View full LICENSES.csv';
  licWrap.appendChild(licLink);

  document.getElementById('stats-pre').textContent = buildStatsText();
  document.getElementById('copy-status').textContent = '';
  document.getElementById('report-status').textContent = '';
  document.getElementById('clear-confirm').hidden = true;

  const lbConfirm = getClearLbConfirmBox();
  if (lbConfirm) lbConfirm.hidden = true;

  const editor = ensureGrownupsNickEditorContainer();
  if (editor) {
    editor.textContent = '';
    editor.hidden = true;
  }
  updateGrownupsNicknameSummary();

  // Render credits for the 10 puzzles
  const credits = document.getElementById('credits-list');
  credits.textContent = '';
  ((puzzlesData && puzzlesData.puzzles) || []).forEach(p => {
    const cr = p.credit || {};
    const row = document.createElement('div');
    row.className = 'credit-row';

    const titleStrong = document.createElement('strong');
    titleStrong.textContent = p.title;
    row.appendChild(titleStrong);

    const metaText = document.createTextNode(
      ' – ' + (cr.author || 'Unknown') + ' (' + (cr.license || 'License') + ') '
    );
    row.appendChild(metaText);

    const srcLink = document.createElement('a');
    srcLink.href = cr.source_url || '#';
    srcLink.target = '_blank';
    srcLink.rel = 'noopener';
    srcLink.textContent = 'source';
    row.appendChild(srcLink);

    credits.appendChild(row);
  });

  // Populate report puzzle dropdown
  const sel = document.getElementById('report-puzzle');
  sel.textContent = '';
  ((puzzlesData && puzzlesData.puzzles) || []).forEach((p, idx) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = 'Level ' + (idx + 1) + ' (' + p.id + ') – ' + p.title;
    sel.appendChild(opt);
  });

  const soundCheckbox = document.getElementById('sound-toggle');
  soundCheckbox.checked = Boolean(counters.sound);
  soundCheckbox.onchange = e => {
    counters.sound = Boolean(e.target.checked);
    saveCounters();
    if (counters.sound) playDing(2);
  };
}

function nextDayStr(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const dt = new Date(y, m, d);
  dt.setDate(dt.getDate() + 1);
  return (
    dt.getFullYear() +
    '-' +
    String(dt.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(dt.getDate()).padStart(2, '0')
  );
}

function buildStatsText() {
  const lines = [];
  const nextDay = nextDayStr(counters.firstPlay);
  [
    ['untimed', 'Untimed mode'],
    ['timed', 'Timed mode']
  ].forEach(([modeKey, label]) => {
    const m = counters.modes[modeKey] || {};
    const finished = m.firstPuzzleCompleted ? 'yes' : 'no';
    const puzzlesFinished = Number(m.completed) || 0;
    const daysPlayed = counters.days.length;
    const cameBack =
      counters.firstPlay && counters.days.some(d => d > counters.firstPlay) ? 'yes' : 'no';
    const cameNext = nextDay && counters.days.includes(nextDay) ? 'yes' : 'no';
    const extra =
      modeKey === 'timed' ? ', best score=' + (Number(m.bestScore) || 0) : '';
    lines.push(
      label +
        ': first puzzle finished=' +
        finished +
        ', puzzles finished=' +
        puzzlesFinished +
        extra +
        ', days played=' +
        daysPlayed +
        ', came back another day=' +
        cameBack +
        ', came back next day=' +
        cameNext
    );
  });
  lines.push('First played: ' + (counters.firstPlay || 'never'));
  if (counters.reports && counters.reports.length) {
    lines.push('Reports: ' + counters.reports.join(', '));
  }
  return lines.join('\n');
}

function setupGrownupsActions() {
  document.getElementById('btn-copy-stats').onclick = () => {
    const text = buildStatsText();
    const statusEl = document.getElementById('copy-status');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          statusEl.textContent = 'Copied to clipboard!';
        })
        .catch(() => fallbackCopy());
    } else {
      fallbackCopy();
    }
  };

  document.querySelectorAll('.report-reasons button').forEach(btn => {
    btn.onclick = () => {
      const sel = document.getElementById('report-puzzle');
      const pid = sel && sel.value ? sel.value : 'unknown';
      const reason = btn.dataset.reason;
      const code = pid + ':' + reason;
      if (!Array.isArray(counters.reports)) counters.reports = [];
      counters.reports.push(code);
      if (counters.reports.length > 20) {
        counters.reports = counters.reports.slice(-20);
      }
      saveCounters();
      document.getElementById('report-status').textContent = 'Added report: ' + code;
      document.getElementById('stats-pre').textContent = buildStatsText();
    };
  });

  document.getElementById('btn-clear-counters').onclick = () => {
    document.getElementById('clear-confirm').hidden = false;
  };

  document.getElementById('btn-clear-yes').onclick = () => {
    counters = makeEmptyCounters();
    saveCounters();
    document.getElementById('clear-confirm').hidden = true;
    document.getElementById('sound-toggle').checked = false;
    document.getElementById('stats-pre').textContent = buildStatsText();
    document.getElementById('report-status').textContent = 'All counters cleared.';
  };

  document.getElementById('btn-clear-no').onclick = () => {
    document.getElementById('clear-confirm').hidden = true;
  };

  const openNickEditor = () => {
    const editor = ensureGrownupsNickEditorContainer();
    if (!editor) return;
    editor.hidden = false;
    buildPresetNicknameWidget(
      editor,
      leaderboardStore.getNickname(),
      newNick => {
        leaderboardStore.setNickname(newNick);
        nicknameSkippedSession = false;
        editor.textContent = '';
        editor.hidden = true;
        updateGrownupsNicknameSummary();
        document.getElementById('report-status').textContent = 'Nickname set to ' + newNick;
      },
      () => {
        editor.textContent = '';
        editor.hidden = true;
      },
      'Cancel'
    );
  };

  const btnChangeNick = document.getElementById('btn-change-nick');
  if (btnChangeNick) btnChangeNick.onclick = openNickEditor;
  const btnChangeKidsNick = document.getElementById('btn-change-kids-nick');
  if (btnChangeKidsNick) btnChangeKidsNick.onclick = openNickEditor;

  const btnClearLb = document.getElementById('btn-clear-leaderboard');
  if (btnClearLb) {
    btnClearLb.onclick = () => {
      const box = getClearLbConfirmBox();
      if (box) box.hidden = false;
      else {
        leaderboardStore.clearAll();
        updateGrownupsNicknameSummary();
        renderLeaderboardBody();
      }
    };
  }

  const btnClearLbYes = document.getElementById('btn-clear-lb-yes');
  if (btnClearLbYes) {
    btnClearLbYes.onclick = () => {
      leaderboardStore.clearAll();
      const box = getClearLbConfirmBox();
      if (box) box.hidden = true;
      updateGrownupsNicknameSummary();
      renderLeaderboardBody();
      const repStatus = document.getElementById('report-status');
      if (repStatus) repStatus.textContent = 'Leaderboard cleared.';
    };
  }

  const btnClearLbNo = document.getElementById('btn-clear-lb-no');
  if (btnClearLbNo) {
    btnClearLbNo.onclick = () => {
      const box = getClearLbConfirmBox();
      if (box) box.hidden = true;
    };
  }
}

function fallbackCopy() {
  const pre = document.getElementById('stats-pre');
  const statusEl = document.getElementById('copy-status');
  try {
    const range = document.createRange();
    range.selectNodeContents(pre);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('copy');
    statusEl.textContent = 'Selected — press Ctrl+C / Cmd+C to copy';
  } catch (e) {
    statusEl.textContent = 'Select the text box above to copy manually';
  }
}

// ---------- Initialization ----------
function bindHomeModeCards() {
  const btnUntimed =
    document.getElementById('btn-untimed') ||
    document.getElementById('btn-kids') ||
    document.querySelectorAll('#screen-home .mode-card')[0];
  const btnTimed =
    document.getElementById('btn-timed') ||
    document.querySelectorAll('#screen-home .mode-card')[1];

  if (btnUntimed) {
    btnUntimed.onclick = () => openPicker('untimed');
  }
  if (btnTimed) {
    btnTimed.onclick = () => openPicker('timed');
  }
}

function init() {
  loadCounters();
  leaderboardStore = createLeaderboardStore();
  setupGrownupsActions();
  setupLeaderboardScreenActions();
  bindHomeModeCards();

  Promise.all([
    fetch('puzzles.json').then(r => r.json()),
    fetch('puzzles-categories.json')
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
  ])
    .then(([data, catPatch]) => {
      puzzlesData = data;
      enrichAndOrderPuzzles(puzzlesData, catPatch);
      renderHome();
    })
    .catch(() => {
      const msg = document.getElementById('message-area');
      if (msg) msg.textContent = 'Could not load puzzles.json';
    });

  document.getElementById('btn-grownups-home').onclick = openGrownups;
  document.getElementById('btn-back-home').onclick = renderHome;
  document.getElementById('btn-back-picker').onclick = () => openPicker(currentMode);
  document.getElementById('btn-grownups-back').onclick = renderHome;
  document.getElementById('btn-celebration-home').onclick = () => {
    const cel = document.getElementById('screen-celebration');
    if (Date.now() - Number(cel.dataset.armedAt || 0) < 350) return;
    renderHome();
  };

  document.addEventListener('visibilitychange', () => {
    timedLastTickMs = Date.now();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const gate = document.getElementById('gate-overlay');
      if (gate && !gate.hidden) {
        gate.hidden = true;
        timedLastTickMs = Date.now();
      }
      const coach = document.getElementById('coach-overlay');
      if (coach && !coach.hidden) {
        dismissCoach();
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', init);