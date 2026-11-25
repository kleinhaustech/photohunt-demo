"use strict";

const FEEDBACK_URL = "https://docs.google.com/forms/d/e/1FAIpQLSc-AHGMyY7ClF_b9Zall5920Ff4I4zjLPJo9zkaXubYooSoDA/viewform";
const COUNTERS_KEY = "sd_counters_v3";
const LEADERBOARD_KEY = "sd_leaderboard_v2";
const REMOTE_LEADERBOARDS_ENABLED = false;
const STATS_ENTRY_ID = "";
const LEVEL_ORDER = Object.freeze(["eng-classroom", "eng-bakery", "eng-campsite", "eng-farm", "eng-garden", "eng-trainstation", "eng-snowtown", "eng-zoo", "eng-kitchen", "eng-playground", "eng-underwater", "eng-space", "eng-library", "eng-birthday", "eng-rainystreet", "eng-toys", "eng-market", "eng-park", "eng-beach", "eng-firestation", "eng-bedroom", "eng-petshop"]);
const ANIMAL_LEVEL_IDS = Object.freeze(["eng-campsite", "eng-farm", "eng-garden", "eng-snowtown", "eng-zoo", "eng-park", "eng-petshop"]);
const HOME_TOWN_CATEGORY_ID = "home-town";
const HOME_TOWN_LEVEL_IDS = Object.freeze(["eng-classroom", "eng-bakery", "eng-kitchen", "eng-playground", "eng-library", "eng-birthday", "eng-rainystreet", "eng-market", "eng-bedroom"]);
const PIP_OUTFITS = Object.freeze(["none", "hat", "scarf", "bow"]);
const LEVEL_SECONDS = Object.freeze([90, 90, 90, 84, 78, 84, 72, 66, 60, 54]);
const TIMED_BASE = Object.freeze({easy: 90, medium: 70, hard: 50});
const TIMED_FLOOR = Object.freeze({easy: 25, medium: 16, hard: 15});
const TIMED_STEP = Object.freeze({
  easy: (25 / 90) ** (1 / 21),
  medium: (16 / 70) ** (1 / 21),
  hard: (15 / 50) ** (1 / 21)
});
const GATE_DELAY_MIN = 6;
const GATE_DELAY_MAX = 9;
const GATE_DELAY_MS = 2000;
const MASH_WINDOW_MS = 1500;
const MASH_COOLDOWN_MS = 800;
const HINT_INTERVAL_MS = 20000;
const REVEAL_NO_FIND_MS = 60000;
const HINT_READY_NO_FIND_MS = 40000;
const DAILY_KEEP_DAYS = 7;
const TOP_N = 5;
const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({count:5, timeScale:1.25, minTime:56, miss:1, hint:3, cap:[4,3,2], recharge:[15000,20000,25000], radius:28, multiplier:1}),
  medium: Object.freeze({count:5, timeScale:1, minTime:45, miss:2, hint:5, cap:[3,2,1], recharge:[20000,25000,30000], radius:24, multiplier:1.25}),
  hard: Object.freeze({count:5, timeScale:.75, minTime:34, miss:3, hint:8, cap:[2,1,0], recharge:[30000,40000,50000], radius:22, multiplier:1.5})
});
const difficultyName = value => ({easy:"Easy",medium:"Medium",hard:"Hard"}[value] || "Medium");
const difficultyConfig = value => DIFFICULTIES[value] || DIFFICULTIES.medium;

const ADJECTIVES = Object.freeze([
  "Bright", "Brave", "Breezy", "Calm", "Cheerful", "Clever", "Cozy", "Curious",
  "Daring", "Friendly", "Gentle", "Golden", "Happy", "Jolly", "Kind", "Lucky",
  "Merry", "Playful", "Sunny", "Swift"
]);

const ANIMALS = Object.freeze([
  "Badger", "Bear", "Bunny", "Cat", "Deer", "Dolphin", "Duck", "Falcon",
  "Fox", "Frog", "Giraffe", "Koala", "Llama", "Otter", "Owl", "Panda",
  "Penguin", "Seal", "Tiger", "Whale"
]);

const WEEKDAYS = Object.freeze([
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
]);

const TALK_PROMPTS = Object.freeze([
  "Which one was trickiest?",
  "Point to your favorite thing.",
  "Tell a story about this place.",
  "Which picture would you visit?",
  "What would you change next?",
  "Which find made you smile?",
  "Find something round together.",
  "Name three colors you see."
]);

let lastPersistedCountersJson = "";

const els = {};
const state = {
  puzzles: [],
  categories: [],
  selectedMode: "untimed",
  selectedDifficulty: "medium",
  selectedCategory: "all",
  boardMode: "untimed",
  view: "homeView",
  run: null,
  storageOkay: true,
  counters: null,
  leaderboardStore: null,
  gatePassed: false,
  pendingGrownAction: null,
  gateLockedUntil: 0,
  gateUnlockHandle: null,
  tipsOpen: false,
  nicknameSkipped: false,
  nicknameDraft: {
    adjective: "Bright",
    animal: "Otter",
    number: 1
  },
  pendingSaveEntry: null,
  savePrompted: false,
  frameId: 0,
  lastFrameAt: null,
  returnViewAfterGrown: "homeView",
  hintGlowHandle: null,
  messageHandle: null,
  imageGeneration: 0,
  gateAnswer: 0,
  lastGateExpression: "",
  dailyPool: [],
  lastDailyDate: null,
  testUnlockEnabled: false,
  testSessionFlagged: false,
  lastDailyDuel: null,
  lastHomeDuel: null,
  stickerReturnView: "homeView",
  playMoreOpen: false,
  suppressNextClick: false,
  suppressClickHandle: null,
  endRunConfirmUntil: 0,
  endRunConfirmHandle: null,
  clearLevelHandle: null,
  revealHoldHandle: null,
  dailyStreakRestarted: false,
  lastCompletedDaily: null,
  newDailyStickerKey: null,
  preloadLinks: [],
  levelsViewerMode: false,
  viewedLevelIndex: 0,
  duelTurnOverlayTimer: 0
};

function $(id) {
  return document.getElementById(id);
}

function node(tag, className, textValue) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textValue !== undefined) element.textContent = String(textValue);
  return element;
}

function appSvgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
  return el;
}

function appSvgIcon(name) {
  const svg = appSvgEl("svg", {
    viewBox: "0 0 24 24",
    class: `svg-icon icon-${name}`,
    "aria-hidden": "true",
    focusable: "false",
    fill: "none",
    stroke: "#1F2438",
    "stroke-width": "2.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  });
  if (name === "spyglass") {
    svg.append(
      appSvgEl("circle", { cx: "10.5", cy: "10.5", r: "6.5", fill: "#FFF7DC" }),
      appSvgEl("circle", { cx: "10.5", cy: "10.5", r: "3.5", fill: "#1B7A6E", stroke: "none", opacity: "0.28" }),
      appSvgEl("path", { d: "M8 8.5a2.5 2.5 0 0 1 3.5 0" }),
      appSvgEl("path", { d: "M15.5 15.5L21 21", "stroke-width": "3.2" }),
      appSvgEl("path", { d: "M14.8 14.8l2.4 2.4", stroke: "#F5A623", "stroke-width": "2.5" })
    );
  } else if (name === "sunburst-flame") {
    svg.append(
      appSvgEl("path", {
        d: "M12.5 2.5c.6 3.2-2.2 4.8-1.4 7.5.6 1.8 2.6 2.2 3.2.4.9 1.6 1.2 3.9-.2 5.8-1.6 2.2-4.9 2.6-6.9.7-1.9-1.8-2-5.1-.2-7.6 1.4-2 3.8-3.8 5.5-6.8z",
        fill: "#C73C24"
      }),
      appSvgEl("path", {
        d: "M12 12.2c.5 1.1 1.6 1.5 1.8 2.7.2 1.3-.9 2.5-2.1 2.5-1.3 0-2.2-1.1-1.9-2.4.3-1.2 1.4-1.8 2.2-2.8z",
        fill: "#F5A623",
        stroke: "none"
      })
    );
  } else if (name === "padlock") {
    svg.append(
      appSvgEl("rect", { x: "5", y: "10.5", width: "14", height: "10.5", rx: "2.5", fill: "#DEC9A8" }),
      appSvgEl("path", { d: "M8 10.5V7.5a4 4 0 0 1 8 0v3" }),
      appSvgEl("circle", { cx: "12", cy: "15.5", r: "1.4", fill: "#1F2438" })
    );
  }
  return svg;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function safeInt(n, fallback = 0, limit = 1000000000) {
  return Number.isFinite(n) && n >= 0
    ? Math.min(limit, Math.floor(n))
    : fallback;
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validDay(day) {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [year, month, date] = day.split("-").map(Number);
  const d = new Date(year, month - 1, date);
  return year >= 2000 && year <= 2100 &&
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === date;
}

function nextDay(day) {
  if (!validDay(day)) return "";
  const [y, m, d] = day.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + 1));
}

function weekdayForDay(day) {
  if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [y, m, d] = day.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return WEEKDAYS[dt.getDay()] || "Monday";
  }
  return "Monday";
}

function formatStickerTitle(day, puzzle) {
  const weekday = weekdayForDay(day);
  const title = puzzle && puzzle.title ? puzzle.title : "Picture";
  return `${weekday} · ${title}`;
}
window.formatStickerTitle = formatStickerTitle;

function uniqueDays(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter(validDay))].sort().slice(-4000)
    : [];
}

function validNickname(value) {
  if (typeof value !== "string") return false;
  const parts = /^([A-Za-z]+) ([A-Za-z]+) (\d{1,2})$/.exec(value);
  return Boolean(
    parts &&
    ADJECTIVES.includes(parts[1]) &&
    ANIMALS.includes(parts[2]) &&
    Number(parts[3]) >= 1 &&
    Number(parts[3]) <= 99 &&
    String(Number(parts[3])) === parts[3]
  );
}

function makeNickname(draft = state.nicknameDraft) {
  return `${draft.adjective} ${draft.animal} ${draft.number}`;
}

function defaultModeCounters(timed = false) {
  const record = {
    firstPuzzleStarted: false,
    firstPuzzleCompleted: false,
    completed: 0,
    mashedRuns: 0,
    days: []
  };
  if (timed) { record.bestScore = 0; record.bestLevel = 0; }
  return record;
}

function normalizeModeCounters(source, timed) {
  const base = defaultModeCounters(timed);
  if (!source || typeof source !== "object" || Array.isArray(source)) return base;
  base.firstPuzzleCompleted = source.firstPuzzleCompleted === true;
  base.completed = safeInt(source.completed);
  base.firstPuzzleStarted = source.firstPuzzleStarted === true ||
    (Number.isFinite(source.started) && source.started > 0) ||
    base.firstPuzzleCompleted || base.completed > 0;
  base.mashedRuns = safeInt(source.mashedRuns);
  base.days = uniqueDays(source.days);
  if (timed) {
    base.bestScore = safeInt(source.bestScore);
    base.bestLevel = safeInt(source.bestLevel, 0, LEVEL_ORDER.length);
  }
  return base;
}

function defaultStickerWorld() {
  return {
    activeWorld: "jungle",
    placements: {}
  };
}

function normalizeStickerWorld(raw) {
  const base = defaultStickerWorld();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const validWorlds = ["jungle", "ocean", "space"];
  if (typeof raw.activeWorld === "string" && validWorlds.includes(raw.activeWorld)) {
    base.activeWorld = raw.activeWorld;
  }
  const src = raw.placements && typeof raw.placements === "object" && !Array.isArray(raw.placements)
    ? raw.placements
    : raw;
  for (const [key, val] of Object.entries(src)) {
    if (key === "activeWorld" || key === "placements") continue;
    if (!val || typeof val !== "object" || Array.isArray(val)) continue;
    const x = Number(val.x);
    const y = Number(val.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const world = typeof val.world === "string" && validWorlds.includes(val.world)
      ? val.world
      : base.activeWorld;
    base.placements[String(key).slice(0, 48)] = {
      world,
      x: clamp(Number(x.toFixed(4)), 0.04, 0.96),
      y: clamp(Number(y.toFixed(4)), 0.04, 0.96)
    };
  }
  return base;
}

function isPipOutfitUnlockedForCounters(outfit, counters) {
  if (outfit === "none") return true;
  if (!counters || typeof counters !== "object") return false;
  if (outfit === "hat") {
    return Array.isArray(counters.hiddenPipFinds) && counters.hiddenPipFinds.length >= 3;
  }
  if (outfit === "scarf") {
    const cleared = Array.isArray(counters.clearedLevels) ? counters.clearedLevels : [];
    let animalCount = 0;
    for (const id of cleared) {
      if (ANIMAL_LEVEL_IDS.includes(id)) animalCount += 1;
    }
    return animalCount >= 2;
  }
  if (outfit === "bow") {
    return Array.isArray(counters.stickers) && counters.stickers.length >= 1;
  }
  return false;
}

function defaultCounters() {
  return {
    version: 3,
    firstPlay: null,
    days: [],
    untimed: defaultModeCounters(false),
    timed: defaultModeCounters(true),
    firstOverall: null,
    firstPuzzle: null,
    daily: { streak: 0, lastDate: null },
    clearedLevels: [],
    puzzlesPlayed: 0,
    stickers: [],
    lastSet: {},
    difficulty: "medium",
    ghostHandDone: false,
    stickerWorld: defaultStickerWorld(),
    streakFreeze: 0,
    musicMuted: false,
    hiddenPipFinds: [],
    pipOutfit: "none"
  };
}

function normalizeCounters(source) {
  const out = defaultCounters();
  if (!source || typeof source !== "object" || Array.isArray(source)) return out;
  const legacyModes = source.modes && typeof source.modes === "object" && !Array.isArray(source.modes);
  const isOld = Boolean(legacyModes) || Object.prototype.hasOwnProperty.call(source, "kids");
  const original = legacyModes ? source.modes.kids : source.kids;
  out.untimed = normalizeModeCounters(isOld ? original : source.untimed, false);
  out.timed = isOld ? defaultModeCounters(true) : normalizeModeCounters(source.timed, true);
  out.days = uniqueDays(source.days);
  if (isOld) out.untimed.days = uniqueDays([...out.untimed.days, ...out.days]);
  out.clearedLevels = Array.isArray(source.clearedLevels)
    ? [...new Set(source.clearedLevels.filter(id => LEVEL_ORDER.includes(id)))]
    : [];
  out.puzzlesPlayed = safeInt(source.puzzlesPlayed);
  out.difficulty = DIFFICULTIES[source.difficulty] ? source.difficulty : "medium";
  // L1 ghost-hand seen flag (v14 R3). Missing in older saves: treated as false.
  out.ghostHandDone = source.ghostHandDone === true;
  out.stickers = uniqueDays(source.stickers).slice(-60);
  if (source.lastSet && typeof source.lastSet === "object" && !Array.isArray(source.lastSet)) {
    for (const id of LEVEL_ORDER) {
      const value = source.lastSet[id];
      if (Number.isInteger(value) && value >= 0 && value <= 4) out.lastSet[id] = value;
    }
  }
  if (validDay(source.firstPlay)) out.firstPlay = source.firstPlay;
  else if (out.days.length) out.firstPlay = out.days[0];
  if (!isOld && source.firstOverall && typeof source.firstOverall === "object" &&
    ["untimed", "timed"].includes(source.firstOverall.mode)) {
    out.firstOverall = {mode:source.firstOverall.mode, finished:source.firstOverall.finished === true};
  }
  if (!isOld && source.firstPuzzle && typeof source.firstPuzzle === "object" &&
    ["untimed", "timed"].includes(source.firstPuzzle.mode) &&
    typeof source.firstPuzzle.puzzleId === "string" &&
    /^[a-z0-9-]+$/.test(source.firstPuzzle.puzzleId)) {
    out.firstPuzzle = {
      mode: source.firstPuzzle.mode,
      puzzleId: source.firstPuzzle.puzzleId,
      finished: source.firstPuzzle.finished === true && source.firstPuzzle.flagged !== true,
      flagged: source.firstPuzzle.flagged === true
    };
  }
  if (source.daily && typeof source.daily === "object" && !Array.isArray(source.daily)) {
    out.daily.streak = safeInt(source.daily.streak);
    out.daily.lastDate = validDay(source.daily.lastDate) ? source.daily.lastDate : null;
  }
  out.stickerWorld = normalizeStickerWorld(source.stickerWorld);
  if (typeof source.streakFreeze === "number") {
    out.streakFreeze = safeInt(source.streakFreeze, 0, 99);
  } else if (source.streakFreeze && typeof source.streakFreeze === "object" && !Array.isArray(source.streakFreeze)) {
    const rawCount = source.streakFreeze.shields ?? source.streakFreeze.count ?? source.streakFreeze.available ?? 0;
    out.streakFreeze = safeInt(rawCount, 0, 99);
  } else {
    out.streakFreeze = safeInt(Math.floor(out.daily.streak / 7), 0, 99);
  }
  out.musicMuted = source.musicMuted === true;
  out.hiddenPipFinds = Array.isArray(source.hiddenPipFinds)
    ? [...new Set(source.hiddenPipFinds.filter(id => LEVEL_ORDER.includes(id)))].slice(0, LEVEL_ORDER.length)
    : [];
  const rawOutfit = typeof source.pipOutfit === "string" && PIP_OUTFITS.includes(source.pipOutfit)
    ? source.pipOutfit
    : "none";
  out.pipOutfit = isPipOutfitUnlockedForCounters(rawOutfit, out) ? rawOutfit : "none";
  return out;
}

function defaultBoards() {
  return {
    version: 2,
    nickname: null,
    allTime: { untimed: [], timed: [] },
    daily: {}
  };
}

function cleanEntry(candidate, mode) {
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !validNickname(candidate.nickname)
  ) return null;

  if (!Number.isFinite(candidate.timestamp) || candidate.timestamp < 0) return null;
  if (!Number.isFinite(candidate.level) || candidate.level < 1) return null;

  const entry = {
    nickname: candidate.nickname,
    timestamp: candidate.timestamp,
    level: safeInt(candidate.level, 1, 10000),
    levelsCleared: safeInt(candidate.levelsCleared, 0, 10000),
    misses: safeInt(candidate.misses, 0, 10000000),
    finds: safeInt(candidate.finds, 0, 10000000),
    hints: safeInt(candidate.hints, 0, 10000000),
    score: safeInt(candidate.score),
    difficulty: DIFFICULTIES[candidate.difficulty] ? candidate.difficulty : "medium"
  };

  return mode === "timed" || mode === "untimed" ? entry : null;
}

function rankEntries(entries, mode) {
  const sorted = entries.slice().sort((a, b) => {
    if (mode === "timed") {
      return b.score - a.score ||
        b.level - a.level ||
        a.timestamp - b.timestamp;
    }
    return b.levelsCleared - a.levelsCleared ||
      a.misses - b.misses ||
      a.timestamp - b.timestamp;
  });
  return sorted.slice(0, TOP_N);
}

function recentDays() {
  const today = new Date();
  const days = [];
  for (let i = 0; i < DAILY_KEEP_DAYS; i += 1) {
    days.push(dateKey(new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - i
    )));
  }
  return days;
}

function normalizeBoards(source) {
  const out = defaultBoards();
  if (!source || typeof source !== "object" || Array.isArray(source)) return out;

  if (validNickname(source.nickname)) out.nickname = source.nickname;

  const allTime = source.allTime && typeof source.allTime === "object"
    ? source.allTime
    : {};

  for (const mode of ["untimed", "timed"]) {
    out.allTime[mode] = rankEntries(
      (Array.isArray(allTime[mode]) ? allTime[mode] : [])
        .map(e => cleanEntry(e, mode))
        .filter(Boolean),
      mode
    );
  }

  const byDay = source.daily && typeof source.daily === "object"
    ? source.daily
    : {};

  for (const day of recentDays()) {
    const record = byDay[day];
    if (!record || typeof record !== "object") continue;
    out.daily[day] = { untimed: [], timed: [] };

    for (const mode of ["untimed", "timed"]) {
      out.daily[day][mode] = rankEntries(
        (Array.isArray(record[mode]) ? record[mode] : [])
          .map(e => cleanEntry(e, mode))
          .filter(Boolean),
        mode
      );
    }
  }

  return out;
}

function safeJSON(value) {
  try { return JSON.parse(value); }
  catch { return null; }
}

function findLegacyNickname(value) {
  if (!value || typeof value !== "object") return null;
  if (validNickname(value.nickname)) return value.nickname;

  if (value.nicknames && typeof value.nicknames === "object" && validNickname(value.nicknames.kids)) return value.nicknames.kids;
  for (const key of ["name", "selectedNickname", "displayName"]) {
    if (validNickname(value[key])) return value[key];
  }
  return null;
}

function loadStorage() {
  try {
    const rawCounters = safeJSON(window.localStorage.getItem(COUNTERS_KEY));
    const rawBoards = safeJSON(window.localStorage.getItem(LEADERBOARD_KEY));

    state.counters = normalizeCounters(rawCounters);
    state.selectedDifficulty = state.counters.difficulty;

    const normalizedBoards = normalizeBoards(rawBoards);
    lastPersistedCountersJson = JSON.stringify(state.counters);
    window.localStorage.setItem(COUNTERS_KEY, lastPersistedCountersJson);
    window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(normalizedBoards));

    state.leaderboardStore = makeLeaderboardStore(normalizedBoards);
    renderTimedBest();
  } catch {
    state.storageOkay = false;
    state.counters = defaultCounters();
    state.leaderboardStore = new LocalStore(defaultBoards());
    els.storageNotice.hidden = false;
    renderTimedBest();
  }
}

function persistCounters() {
  if (!state.storageOkay) return false;
  try {
    lastPersistedCountersJson = JSON.stringify(state.counters);
    window.localStorage.setItem(COUNTERS_KEY, lastPersistedCountersJson);
    return true;
  } catch {
    reportStorageFailure();
    return false;
  }
}

function syncExternalCounters() {
  if (!state.storageOkay) return;
  try {
    const raw = window.localStorage.getItem(COUNTERS_KEY);
    if (raw && raw !== lastPersistedCountersJson) {
      state.counters = normalizeCounters(JSON.parse(raw));
      lastPersistedCountersJson = raw;
    }
  } catch {
    /* ignore */
  }
}
window.syncExternalCounters = syncExternalCounters;

function reportStorageFailure() {
  state.storageOkay = false;
  els.storageNotice.hidden = false;
  state.pendingSaveEntry = null;
  els.resultSaveButton.hidden = true;
}

class LocalStore {
  constructor(data) {
    this.data = normalizeBoards(data);
  }

  getNickname() {
    return validNickname(this.data.nickname) ? this.data.nickname : null;
  }

  setNickname(name) {
    if (!validNickname(name)) return false;
    this.data.nickname = name;
    return this.flush();
  }

  getBoard(mode, day = null) {
    if (!["untimed", "timed"].includes(mode)) return [];
    this.data = normalizeBoards(this.data);
    const source = day
      ? this.data.daily[day]?.[mode]
      : this.data.allTime[mode];
    return Array.isArray(source) ? source.slice() : [];
  }

  add(mode, entry) {
    if (!state.storageOkay || !["untimed", "timed"].includes(mode)) return false;
    const clean = cleanEntry(entry, mode);
    if (!clean) return false;

    this.data = normalizeBoards(this.data);
    const day = dateKey();

    const existingAllTime = this.data.allTime[mode].filter(e => e.timestamp !== clean.timestamp);
    this.data.allTime[mode] = rankEntries(
      [...existingAllTime, clean],
      mode
    );

    if (!this.data.daily[day]) {
      this.data.daily[day] = { untimed: [], timed: [] };
    }

    const existingDaily = this.data.daily[day][mode].filter(e => e.timestamp !== clean.timestamp);
    this.data.daily[day][mode] = rankEntries(
      [...existingDaily, clean],
      mode
    );
    return this.flush();
  }

  clear() {
    this.data.allTime = { untimed: [], timed: [] };
    this.data.daily = {};
    return this.flush();
  }

  flush() {
    if (!state.storageOkay) return false;
    try {
      this.data = normalizeBoards(this.data);
      window.localStorage.setItem(
        LEADERBOARD_KEY,
        JSON.stringify(this.data)
      );
      return true;
    } catch {
      reportStorageFailure();
      return false;
    }
  }
}

class RemoteStore {
  getNickname() { return null; }
  setNickname() { return false; }
  getBoard() { return []; }
  add() { return false; }
  clear() { return false; }
  flush() { return false; }
}

function makeLeaderboardStore(data) {
  return REMOTE_LEADERBOARDS_ENABLED
    ? new RemoteStore()
    : new LocalStore(data);
}

function ensurePresetNickname() {
  const existing = state.leaderboardStore ? state.leaderboardStore.getNickname() : null;
  if (validNickname(existing)) return existing;
  const draftCandidate = makeNickname(state.nicknameDraft);
  const generated = validNickname(draftCandidate)
    ? draftCandidate
    : `${ADJECTIVES[randomSetPosition(ADJECTIVES.length)]} ${ANIMALS[randomSetPosition(ANIMALS.length)]} ${1 + randomSetPosition(99)}`;
  const parts = /^([A-Za-z]+) ([A-Za-z]+) (\d{1,2})$/.exec(generated);
  if (parts) {
    state.nicknameDraft = {
      adjective: parts[1],
      animal: parts[2],
      number: Number(parts[3])
    };
  }
  if (state.leaderboardStore) {
    state.leaderboardStore.setNickname(generated);
  }
  return generated;
}

function flushPendingSaveEntry() {
  if (!state.pendingSaveEntry || !state.storageOkay || !state.leaderboardStore) return false;
  const storeName = state.leaderboardStore.getNickname();
  const name = validNickname(storeName)
    ? storeName
    : (validNickname(state.pendingSaveEntry.nickname)
        ? state.pendingSaveEntry.nickname
        : ensurePresetNickname());
  const mode = ["untimed", "timed"].includes(state.pendingSaveEntry.mode)
    ? state.pendingSaveEntry.mode
    : (state.run?.mode === "timed" ? "timed" : "untimed");
  const entry = {
    ...state.pendingSaveEntry,
    nickname: name
  };
  const ok = state.leaderboardStore.add(mode, entry);
  if (ok) {
    state.pendingSaveEntry.nickname = name;
    state.pendingSaveEntry.saved = true;
  }
  return ok;
}

function showStatus(message, warning = false) {
  els.appStatus.hidden = !message;
  els.appStatus.textContent = message || "";
  els.appStatus.classList.toggle("warning", warning);
}

function syncTalkAboutItCard(viewId) {
  let talkEl = document.querySelector("[data-v142-talk]");
  if (!talkEl) {
    talkEl = node("p", "talk-about-it-card");
    talkEl.setAttribute("data-v142-talk", "true");
  }
  const run = state.run;
  const finds = run ? safeInt(run.totalFinds) : 0;
  const promptText = TALK_PROMPTS[fnv1a(`${dateKey()}${finds}`) % TALK_PROMPTS.length];
  talkEl.textContent = promptText;

  if (viewId === "betweenView") {
    const betweenInner = document.querySelector("#betweenView .result-card-inner");
    if (betweenInner && talkEl.parentNode !== betweenInner) {
      betweenInner.append(talkEl);
    }
    talkEl.hidden = false;
  } else if (viewId === "resultView") {
    const resultInner = document.querySelector("#resultView .result-card-inner");
    const primaryRow = resultInner ? resultInner.querySelector("[data-v142-result-actions]") : null;
    if (resultInner) {
      if (primaryRow && primaryRow.nextSibling !== talkEl) {
        resultInner.insertBefore(talkEl, primaryRow.nextSibling);
      } else if (!primaryRow && talkEl.parentNode !== resultInner) {
        resultInner.append(talkEl);
      }
    }
    talkEl.hidden = Boolean(run && run.kind === "duel");
  }
}

function showView(id) {
  for (const name of [
    "homeView", "gameView", "betweenView", "resultView",
    "boardsView", "grownView", "creditsView", "stickerBookView"
  ]) {
    $(name).hidden = name !== id;
  }
  state.view = id;
  if (id !== "gameView") {
    closePlayMore();
    clearDuelTurnOverlay();
  }
  if (id === "betweenView" || id === "resultView") {
    syncTalkAboutItCard(id);
  }
  document.body.classList.toggle("sticker-book-screen", id === "stickerBookView");
  document.body.classList.toggle("playing-screen", id === "gameView");
  document.body.classList.toggle("home-screen", id === "homeView");
  document.body.classList.remove("theme-neutral", "theme-timed", "theme-untimed");
  document.body.classList.add(id === "gameView" || id === "betweenView" || id === "resultView" ?
    (state.run?.mode === "timed" ? "theme-timed" : "theme-untimed") : "theme-neutral");
  window.scrollTo({ top: 0, behavior: "instant" });
}

function labelForCategory(id) {
  if (id === "all") return "All";
  if (id === HOME_TOWN_CATEGORY_ID) return "Home & Town";
  return state.categories.find(cat => cat.id === id)?.label || "All";
}

function chooseMode(mode) {
  if (!["untimed", "timed"].includes(mode)) return;
  state.selectedMode = mode;

  for (const [id, value] of [
    ["modeUntimed", "untimed"],
    ["modeTimed", "timed"]
  ]) {
    const selected = mode === value;
    $(id).classList.toggle("is-selected", selected);
    $(id).setAttribute("aria-pressed", String(selected));
  }
  renderTimedBest();
  if (els.playNowButton) els.playNowButton.setAttribute("aria-label", `Play now — ${difficultyName(state.selectedDifficulty)}, ${mode}`);
}

function chooseDifficulty(value) {
  if (!DIFFICULTIES[value]) return;
  state.selectedDifficulty = value;
  if (state.counters) {
    state.counters.difficulty = value;
    persistCounters();
  }
  for (const id of ["easy", "medium", "hard"]) {
    const button = $("difficulty" + id[0].toUpperCase() + id.slice(1));
    button.classList.toggle("is-selected", id === value);
    button.setAttribute("aria-pressed", String(id === value));
  }
  const count = difficultyConfig(value).count;
  els.homeDifferenceCopy.textContent = `Find ${count} differences in every picture.`;
  els.playNowButton.setAttribute("aria-label", `Play now — ${difficultyName(value)}, ${state.selectedMode}`);
  els.tipsDifferenceCount.textContent = `Find all ${count} to finish the level.`;
}

function chooseCategory(category) {
  if (typeof category !== "string" || !category) return;

  state.selectedCategory = category;

  els.categoryChoices.querySelectorAll("button[data-category]")
    .forEach(button => {
      const selected = button.dataset.category === category;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

  const count = filteredPuzzles().length;
  els.levelOrderNote.textContent =
    `${count} level${count === 1 ? "" : "s"}, arranged in the designed difficulty order.`;
  const empty = count === 0;
  els.playNowButton.disabled = empty;
  if (els.modeUntimed) els.modeUntimed.disabled = empty;
  if (els.modeTimed) els.modeTimed.disabled = empty;
}

function buildCategories() {
  els.categoryChoices.replaceChildren();
  for (const category of [
    { id: "all", label: "All" },
    ...state.categories
  ]) {
    const button = node("button", "category-button", category.label);
    button.type = "button";
    button.dataset.category = category.id;
    if (category.id === HOME_TOWN_CATEGORY_ID) {
      button.setAttribute("data-v145-category", HOME_TOWN_CATEGORY_ID);
    }
    button.addEventListener("click", () => chooseCategory(category.id));
    els.categoryChoices.append(button);
  }
  chooseCategory("all");
}

function renderTimedBest() {
  if (!els.modeTimed || !state.counters) return;
  const summary = els.modeTimed.querySelector(".choice-description");
  const best = state.counters.timed;
  if (summary) {
    summary.textContent = `Beat the clock · Best level ${best.bestLevel} · Best score ${best.bestScore}`;
  }
  let visibleBest = els.modeTimed.querySelector("[data-v145-timed-best]");
  if (!visibleBest) {
    visibleBest = node("span", "v145-timed-best");
    visibleBest.setAttribute("data-v145-timed-best", "true");
    const caption = els.modeTimed.querySelector(".mode-caption");
    if (caption && caption.nextSibling) {
      els.modeTimed.insertBefore(visibleBest, caption.nextSibling);
    } else {
      els.modeTimed.append(visibleBest);
    }
  }
  const hasBest = (Number(best.bestLevel) || 0) > 0 || (Number(best.bestScore) || 0) > 0;
  visibleBest.hidden = !hasBest;
  visibleBest.textContent = `Best level ${best.bestLevel} · Best score ${best.bestScore}`;
  if (els.timedStars) els.timedStars.textContent = `${Math.min(50, best.completed * 5)} stars`;
  if (els.untimedStars) els.untimedStars.textContent = `${Math.min(50, state.counters.untimed.completed * 5)} stars`;
}

function unlockedLevelIndices() {
  const unlocked = new Set([0]);
  if (state.testUnlockEnabled) return new Set(LEVEL_ORDER.map((_, i) => i));
  for (const id of state.counters.clearedLevels) {
    const index = LEVEL_ORDER.indexOf(id);
    if (index >= 0) {
      unlocked.add(index);
      if (index + 1 < LEVEL_ORDER.length) unlocked.add(index + 1);
    }
  }
  return unlocked;
}

function ensureLevelsViewerContainer() {
  let viewer = els.levelsDialog.querySelector("[data-v145-levels-viewer]");
  if (!viewer) {
    viewer = node("div", "v145-levels-viewer");
    viewer.setAttribute("data-v145-levels-viewer", "true");
    viewer.hidden = true;
    els.levelsDialog.insertBefore(viewer, els.levelChoices);
  }
  return viewer;
}

function renderLevelViewerPuzzle(index) {
  const safeIdx = clamp(Number.isInteger(index) ? index : 0, 0, LEVEL_ORDER.length - 1);
  const id = LEVEL_ORDER[safeIdx];
  const puzzle = state.puzzles.find(p => p.id === id && !p.mirrored);
  if (!puzzle) return;

  state.viewedLevelIndex = safeIdx;
  const viewer = ensureLevelsViewerContainer();
  viewer.hidden = false;
  viewer.setAttribute("data-v145-viewed-puzzle", puzzle.id);

  els.levelChoices.querySelectorAll(".level-choice").forEach((btn, idx) => {
    const isCurrent = idx === safeIdx;
    btn.classList.toggle("is-selected", isCurrent);
    btn.setAttribute("aria-pressed", String(isCurrent));
  });

  const titleEl = node("h3", "v145-viewer-title", `Level ${safeIdx + 1} · ${puzzle.title}`);
  titleEl.setAttribute("data-v145-viewer-title", "true");

  const picsGrid = node("div", "v145-viewer-pictures");
  picsGrid.setAttribute("data-v145-viewer-pictures", "true");

  for (const [side, src] of [
    ["A", puzzle.imageA],
    ["B", puzzle.imageB]
  ]) {
    const fig = node("figure", "v145-viewer-figure");
    const cap = node("figcaption", "v145-viewer-caption", `Picture ${side}`);
    const img = node("img", "v145-viewer-img");
    img.setAttribute("data-v145-viewer-img", side);
    img.src = src;
    img.alt = `Picture ${side}: ${puzzle.title}`;
    img.width = puzzle.width || 800;
    img.height = puzzle.height || 600;
    img.decoding = "async";
    fig.append(cap, img);
    picsGrid.append(fig);
  }

  const whatsHeading = node("p", "v145-viewer-whats-heading", "5 differences in this picture:");
  const whatsList = node("ol", "v145-viewer-what-list");
  whatsList.setAttribute("data-v145-viewer-whats", "true");

  const diffs = Array.isArray(puzzle.differences) ? puzzle.differences : [];
  diffs.forEach((diff, diffIdx) => {
    const whatText = typeof diff?.what === "string" && diff.what.trim()
      ? diff.what.trim()
      : `Difference ${diffIdx + 1}`;
    const li = node("li", "v145-viewer-what-item", whatText);
    li.setAttribute("data-v145-viewer-what", String(diffIdx + 1));
    whatsList.append(li);
  });

  viewer.replaceChildren(titleEl, picsGrid, whatsHeading, whatsList);
}

function renderLevelsPicker(viewerMode = state.levelsViewerMode) {
  const isViewer = Boolean(viewerMode);
  state.levelsViewerMode = isViewer;
  if (els.levelsDialog) {
    els.levelsDialog.setAttribute("data-v145-levels-mode", isViewer ? "viewer" : "picker");
  }
  const headingEl = $("levelsHeading");
  const helperEl = els.levelsDialog ? els.levelsDialog.querySelector(".helper-text") : null;
  if (isViewer) {
    if (headingEl) headingEl.textContent = "All levels (Grown-ups viewer)";
    if (helperEl) helperEl.textContent = "Browse all 22 puzzles, both pictures, and all 5 differences. Viewing does not start a game or change unlocks.";
  } else {
    if (headingEl) headingEl.textContent = "Choose an Untimed level";
    if (helperEl) helperEl.textContent = "Clear a level to unlock the next one.";
  }

  els.levelChoices.replaceChildren();
  const unlocked = unlockedLevelIndices();
  for (const [index, id] of LEVEL_ORDER.entries()) {
    const puzzle = state.puzzles.find(p => p.id === id && !p.mirrored);
    const allowed = isViewer ? Boolean(puzzle) : (unlocked.has(index) && Boolean(puzzle));
    const button = node("button", "level-choice");
    button.type = "button";
    button.disabled = !allowed;
    const labelText = `Level ${index + 1} · ${puzzle?.title || (isViewer ? id : "Locked")}`;
    if (!allowed) {
      button.append(appSvgIcon("padlock"), node("span", "", labelText));
    } else {
      button.append(node("span", "", labelText));
    }
    if (isViewer) {
      button.setAttribute("data-v145-level-view", id);
      button.setAttribute("data-v145-level-index", String(index));
      button.setAttribute("aria-label", `View Level ${index + 1}: ${puzzle?.title || id}`);
      button.addEventListener("click", () => renderLevelViewerPuzzle(index));
    } else {
      button.setAttribute("aria-label", allowed ? `Play Level ${index + 1}: ${puzzle.title}` : `Level ${index + 1} locked`);
      if (allowed) button.addEventListener("click", () => startPickedLevel(index));
    }
    els.levelChoices.append(button);
  }

  const viewer = ensureLevelsViewerContainer();
  if (isViewer) {
    viewer.hidden = false;
    renderLevelViewerPuzzle(state.viewedLevelIndex || 0);
  } else {
    viewer.hidden = true;
    viewer.replaceChildren();
  }
}

function openLevelsPicker(options = {}) {
  if (!state.puzzles.length) return;
  const isViewer = options && typeof options === "object" && typeof options.viewer === "boolean"
    ? options.viewer
    : state.view === "homeView";
  renderLevelsPicker(isViewer);
  els.levelsDialog.showModal();
}

function openGrownLevelsViewer() {
  openLevelsPicker({ viewer: true });
}
window.openGrownLevelsViewer = openGrownLevelsViewer;

function startPickedLevel(index) {
  syncExternalCounters();
  if (!Number.isInteger(index) || !unlockedLevelIndices().has(index)) return;
  closeDialogIfOpen(els.levelsDialog);
  chooseMode("untimed");
  chooseCategory("all");
  newRun({startIndex:index, picked:true});
}

function toggleTestUnlock() {
  state.testUnlockEnabled = !state.testUnlockEnabled;
  if (state.testUnlockEnabled) {
    state.testSessionFlagged = true;
    if (state.run && !state.run.finalized) state.run.testUnlock = true;
  }
  els.testUnlockButton.setAttribute("aria-pressed", String(state.testUnlockEnabled));
  els.testUnlockButton.textContent = `Unlock all levels (testing): ${state.testUnlockEnabled ? "On" : "Off"}`;
  renderGrownArea();
}

function matchesSelectedCategory(puzzle, category = state.selectedCategory) {
  if (category === "all") return true;
  if (category === HOME_TOWN_CATEGORY_ID) {
    return puzzle.category === "all" && HOME_TOWN_LEVEL_IDS.includes(puzzle.id);
  }
  return puzzle.category === category;
}

function filteredPuzzles() {
  return state.puzzles.filter(p => !p.mirrored && LEVEL_ORDER.includes(p.id) &&
    matchesSelectedCategory(p, state.selectedCategory))
    .sort((a,b) => LEVEL_ORDER.indexOf(a.id) - LEVEL_ORDER.indexOf(b.id));
}

function validDifferences(differences, count = 5) {
  return Array.isArray(differences) && differences.length === count &&
    differences.every(d => d && typeof d === "object" &&
      Number.isFinite(d.x) && Number.isFinite(d.y) && Number.isFinite(d.r) &&
      d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= 1 && d.r > 0);
}

function validExtraSets(entry) {
  const sets = [];
  const seen = new Set();
  if (!Array.isArray(entry.sets)) return sets;
  for (const candidate of entry.sets) {
    if (!candidate || typeof candidate !== "object" ||
        !Number.isInteger(candidate.id) || candidate.id < 1 || candidate.id > 4 ||
        seen.has(candidate.id) ||
        candidate.imageB !== `img/${entry.id}-b${candidate.id}.jpg` ||
        !validDifferences(candidate.differences)) continue;
    seen.add(candidate.id);
    sets.push({id: candidate.id, imageB: candidate.imageB, differences: candidate.differences});
  }
  return sets.sort((a, b) => a.id - b.id);
}

function validVariants(entry) {
  const result = {};
  const item = entry.variants?.easy;
  if (item && item.imageB === `img/${entry.id}-b-easy.jpg` &&
      validDifferences(item.differences, 5)) {
    result.easy = {imageB: item.imageB, differences: item.differences};
  }
  return result;
}

function verifyCatalog(raw) {
  if (!raw || !Array.isArray(raw.puzzles)) throw new Error("Puzzle catalogue is missing its puzzle list.");
  const seen = new Set();
  const puzzles = [];
  for (const entry of raw.puzzles) {
    if (!entry || typeof entry !== "object" || !/^[a-z0-9-]+$/.test(entry.id) || seen.has(entry.id)) continue;
    const mirrored = entry.mirrored === true;
    if (mirrored && (!/^[a-z0-9-]+$/.test(entry.mirrorOf || "") || entry.level !== undefined)) continue;
    if (!mirrored && (!Number.isInteger(entry.level) || entry.level < 1)) continue;
    if (!validDifferences(entry.differences)) continue;
    if (!(entry.width > 0 && entry.height > 0)) continue;
    const sourceId = mirrored ? entry.mirrorOf : entry.id;
    if (entry.imageA !== `img/${sourceId}-a.jpg` || entry.imageB !== `img/${sourceId}-b.jpg`) continue;
    seen.add(entry.id);
    // Invalid extra sets are individually ignored; set 0 always remains playable.
    puzzles.push(mirrored ? entry : {...entry, sets: validExtraSets(entry), variants: validVariants(entry)});
  }
  const originals = new Map(puzzles.filter(p => !p.mirrored).map(p => [p.id,p]));
  state.puzzles = puzzles.filter(p => !p.mirrored ||
    (originals.has(p.mirrorOf) && p.imageA === originals.get(p.mirrorOf).imageA &&
     p.imageB === originals.get(p.mirrorOf).imageB));
  if (!LEVEL_ORDER.every(id => originals.has(id))) throw new Error("Not all ten level puzzles are present.");
  state.dailyPool = state.puzzles.filter(p => p.daily === true);
  const availableCategories = new Set(state.puzzles.filter(p => !p.mirrored).map(p => p.category));
  const defined = raw.categories && typeof raw.categories === "object" ? Object.values(raw.categories).flat() : [];
  state.categories = defined.filter(c => c && availableCategories.has(c.id) && typeof c.label === "string");
  if (availableCategories.has("all") && !state.categories.some(c => c.id === HOME_TOWN_CATEGORY_ID)) {
    state.categories.unshift({ id: HOME_TOWN_CATEGORY_ID, label: "Home & Town" });
  }
  buildCategories();
  renderDailyCard();
}

// An unbiased integer draw, using rejection sampling rather than modulo bias.
function randomSetPosition(count) {
  if (count <= 1) return 0;
  if (window.crypto && typeof window.crypto.getRandomValues === "function") {
    const range = 0x100000000;
    const limit = range - (range % count);
    const value = new Uint32Array(1);
    do { window.crypto.getRandomValues(value); } while (value[0] >= limit);
    return value[0] % count;
  }
  return Math.floor(Math.random() * count);
}

function choosePuzzleSet(puzzle, difficulty = "medium") {
  const pairId = puzzle.mirrorOf || puzzle.id;
  const original = state.puzzles.find(item => item.id === pairId && !item.mirrored);
  const base = original || puzzle;
  if (base.variants?.easy) {
    return {...base.variants.easy, id:"variant-easy"};
  }
  const available = [
    {id: 0, imageB: base.imageB, differences: base.differences},
    ...(base.sets || [])
  ];
  const last = state.counters.lastSet[pairId];
  const choices = available.length > 1
    ? available.filter(option => option.id !== last)
    : available;
  const chosen = choices[randomSetPosition(choices.length)];
  if (!state.run || (state.run.kind !== "duel" && state.run.kind !== "challenge")) {
    state.counters.lastSet[pairId] = chosen.id;
    persistCounters();
  }
  return chosen;
}

async function loadCatalog() {
  try {
    const response = await fetch("puzzles.json", {
      cache: "no-store",
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error(`Puzzle catalogue returned ${response.status}.`);
    }

    verifyCatalog(await response.json());
    showStatus("");
  } catch {
    showStatus(
      "Couldn't load puzzles.json. Place it beside index.html and use a local or hosted web server.",
      true
    );
    els.playNowButton.disabled = true;
    if (els.modeUntimed) els.modeUntimed.disabled = true;
    if (els.modeTimed) els.modeTimed.disabled = true;
    const homeDuelBtn = document.querySelector("[data-v144-home-duel]");
    if (homeDuelBtn) homeDuelBtn.disabled = true;
  }
}

function recordPlayStart(mode) {
  const today = dateKey();
  const c = state.counters;

  if (!c.firstPlay) c.firstPlay = today;

  c.days = uniqueDays([...c.days, today]);
  c[mode].days = uniqueDays([...c[mode].days, today]);
  c[mode].firstPuzzleStarted = true;

  if (!c.firstOverall && !state.run?.testUnlock) {
    c.firstOverall = { mode, finished: false };
  }

  persistCounters();
}

function globalLevelIndex(puzzle) {
  return Math.max(0, LEVEL_ORDER.indexOf(puzzle.mirrorOf || puzzle.id));
}
function levelTime(puzzle) {
  const d = TIMED_BASE[state.run?.difficulty] ? state.run.difficulty : "medium";
  return Math.max(TIMED_FLOOR[d], Math.round(TIMED_BASE[d] * (TIMED_STEP[d] ** globalLevelIndex(puzzle))));
}
function levelBand(puzzle) {
  const index = globalLevelIndex(puzzle);
  return index < 3 ? 0 : index < 7 ? 1 : 2;
}
function hintRechargeMs(_puzzle) {
  return HINT_INTERVAL_MS;
}
function timedHintLimit(puzzle) {
  return difficultyConfig(state.run?.difficulty).cap[levelBand(puzzle)];
}
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
function dailyPuzzle(day = dateKey()) {
  return state.dailyPool.length ? state.dailyPool[fnv1a(day) % state.dailyPool.length] : null;
}
function yesterdayOf(day) {
  if (!validDay(day)) return "";
  const [y,m,d] = day.split("-").map(Number);
  return dateKey(new Date(y,m-1,d-1));
}
function resetEndRunConfirm() {
  window.clearTimeout(state.endRunConfirmHandle);
  state.endRunConfirmHandle = null;
  state.endRunConfirmUntil = 0;
  if (els.stopButton) els.stopButton.textContent = "End run";
}

function closePlayMore(restoreFocus = false) {
  if (!els.playMoreMenu || !els.playMoreButton) return;
  state.playMoreOpen = false;
  els.playMoreMenu.hidden = true;
  els.playMoreButton.setAttribute("aria-expanded", "false");
  resetEndRunConfirm();
  if (restoreFocus && state.view === "gameView") els.playMoreButton.focus();
}

function togglePlayMore() {
  if (!state.run || state.view !== "gameView") return;
  if (state.playMoreOpen) {
    closePlayMore(true);
    return;
  }
  updateHUD();
  state.playMoreOpen = true;
  els.playMoreMenu.hidden = false;
  els.playMoreButton.setAttribute("aria-expanded", "true");
}

function confirmEndRun() {
  if (!state.run || state.run.phase !== "playing") return;
  if (state.endRunConfirmUntil && performance.now() < state.endRunConfirmUntil) {
    resetEndRunConfirm();
    finishRun("stopped");
    return;
  }
  resetEndRunConfirm();
  state.endRunConfirmUntil = performance.now() + 3000;
  els.stopButton.textContent = "Tap again to end run";
  state.endRunConfirmHandle = window.setTimeout(resetEndRunConfirm, 3000);
}

function renderStickerBook() {
  els.stickerGrid.replaceChildren();
  const earned = state.counters.stickers || [];
  for (const day of earned) addStickerSlot(day, false);
  addStickerSlot(nextDay(dateKey()), true);
}

function addStickerSlot(day, tomorrow) {
  const puzzle = dailyPuzzle(day);
  if (!puzzle) return;
  const mirrored = puzzle.mirrored === true;
  const labelText = tomorrow ? "Tomorrow's sticker" : formatStickerTitle(day, puzzle);
  const slot = node("div", `sticker-slot${tomorrow ? " tomorrow" : ""}${mirrored ? " is-mirrored" : ""}`);
  if (!tomorrow) slot.setAttribute("aria-label", labelText);
  const circle = node("span", "sticker-circle");
  const picture = node("img", "sticker-image");
  const difference = puzzle.differences[0];
  // Fix 3 M1: position the unflipped source coordinates exactly at the circle's
  // 36px center. Flip the cropped circle as a whole for mirrored Daily puzzles.
  // This keeps the source difference at the visual center without double flips.
  const imageWidth = 144;
  const imageHeight = imageWidth * puzzle.height / puzzle.width;
  picture.width = puzzle.width;
  picture.height = puzzle.height;
  picture.loading = "lazy";
  picture.decoding = "async";
  picture.style.width = `${imageWidth}px`;
  picture.style.height = `${imageHeight}px`;
  picture.style.left = `${36 - difference.x * imageWidth}px`;
  picture.style.top = `${36 - difference.y * imageHeight}px`;
  picture.src = puzzle.imageA;
  picture.alt = tomorrow ? "Silhouette of tomorrow's sticker" : labelText;
  circle.append(picture);
  slot.append(circle);
  if (tomorrow) slot.append(node("span", "sticker-question", "?"));
  slot.append(node("span", "sticker-label", labelText));
  els.stickerGrid.append(slot);
}

function openStickerBook() {
  syncExternalCounters();
  if (state.view === "homeView") leaveActiveRun();
  state.stickerReturnView = state.view === "resultView" ? "resultView" : "homeView";
  state.newDailyStickerKey = null;
  renderStickerBook();
  showView("stickerBookView");
}

function closeStickerBook() {
  state.newDailyStickerKey = null;
  if (state.stickerReturnView === "resultView" && state.run?.finalized) {
    showView("resultView");
  } else {
    returnHome();
  }
}

function duelTime(ms) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function pickHomeDuelPuzzle() {
  const today = dateKey();
  const dailyDone = Boolean(state.counters && state.counters.daily && state.counters.daily.lastDate === today);
  const todaysDaily = dailyPuzzle(today);
  if (todaysDaily && !dailyDone) {
    return todaysDaily;
  }
  const earlyBand = state.puzzles.filter(p => !p.mirrored && LEVEL_ORDER.indexOf(p.id) >= 0 && LEVEL_ORDER.indexOf(p.id) < 8);
  if (earlyBand.length > 0) {
    return earlyBand[randomSetPosition(earlyBand.length)];
  }
  return todaysDaily || state.puzzles.find(p => !p.mirrored) || state.puzzles[0] || null;
}

function startFamilyDuel() {
  const today = dateKey();
  if (state.lastDailyDuel && state.lastDailyDuel.day === today && state.lastDailyDuel.puzzle) {
    const source = state.lastDailyDuel;
    newRun({
      duel: true,
      hasChildBenchmark: true,
      puzzle: source.puzzle,
      difficulty: source.difficulty,
      childElapsedMs: source.childElapsedMs,
      childFinds: source.childFinds
    });
    return;
  }
  if (state.lastHomeDuel && state.lastHomeDuel.day === today && state.lastHomeDuel.puzzle) {
    const source = state.lastHomeDuel;
    state.lastHomeDuel = null;
    newRun({
      duel: true,
      hasChildBenchmark: true,
      puzzle: source.puzzle,
      difficulty: source.difficulty,
      childElapsedMs: source.childElapsedMs,
      childFinds: source.childFinds
    });
    return;
  }
  startHomeDuel();
}

function startHomeDuel() {
  syncExternalCounters();
  const today = dateKey();
  if (state.lastDailyDuel && state.lastDailyDuel.day === today && state.lastDailyDuel.puzzle) {
    startFamilyDuel();
    return;
  }
  const puzzle = pickHomeDuelPuzzle();
  if (!puzzle) return;
  state.lastHomeDuel = null;
  newRun({
    duel: true,
    homeDuel: true,
    puzzle,
    difficulty: state.selectedDifficulty,
    childElapsedMs: 0,
    childFinds: 0
  });
}

function createHomeStickerBookIconSvg() {
  const svg = appSvgEl("svg", {
    viewBox: "0 0 24 24",
    class: "svg-icon icon-sticker-book",
    "aria-hidden": "true",
    focusable: "false",
    fill: "none",
    stroke: "#1F2438",
    "stroke-width": "2.2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  });
  svg.append(
    appSvgEl("rect", { x: "3.5", y: "3", width: "17", height: "18", rx: "2.5", fill: "#FFF7DC" }),
    appSvgEl("path", { d: "M7.5 3v18" }),
    appSvgEl("circle", { cx: "14", cy: "11.5", r: "4", fill: "#F5A623" })
  );
  return svg;
}

function createSilhouetteQuestionSvg() {
  const svg = appSvgEl("svg", {
    viewBox: "0 0 24 24",
    class: "home-sticker-silhouette-q",
    "aria-hidden": "true",
    focusable: "false",
    fill: "none",
    stroke: "#FFFDF9",
    "stroke-width": "2.6",
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  });
  svg.append(
    appSvgEl("path", { d: "M9.5 9a2.6 2.6 0 1 1 3.9 2.2c-.9.5-1.4 1.1-1.4 2.1" }),
    appSvgEl("circle", { cx: "12", cy: "17.2", r: "0.8", fill: "#FFFDF9" })
  );
  return svg;
}

function buildHomeStickerThumb(day, tomorrow) {
  const puzzle = dailyPuzzle(day);
  const thumb = node("span", `home-sticker-thumb${tomorrow ? " is-tomorrow" : ""}${puzzle?.mirrored ? " is-mirrored" : ""}`);
  thumb.setAttribute("aria-hidden", "true");
  if (puzzle && puzzle.differences && puzzle.differences[0]) {
    const img = node("img", `home-sticker-thumb-img${puzzle?.mirrored ? " is-mirrored" : ""}`);
    const diff = puzzle.differences[0];
    const imgW = 72;
    const imgH = (imgW * puzzle.height) / puzzle.width;
    const center = 15;
    const diffX = puzzle.mirrored ? 1 - diff.x : diff.x;
    img.width = puzzle.width;
    img.height = puzzle.height;
    img.loading = "lazy";
    img.decoding = "async";
    img.style.width = `${imgW}px`;
    img.style.height = `${imgH}px`;
    img.style.left = `${center - diffX * imgW}px`;
    img.style.top = `${center - diff.y * imgH}px`;
    img.src = puzzle.imageA;
    img.alt = "";
    thumb.append(img);
  }
  if (tomorrow) {
    thumb.append(createSilhouetteQuestionSvg());
  }
  return thumb;
}

function renderHomeStickerCard() {
  if (!els.stickerBookButton) return;
  els.stickerBookButton.setAttribute("data-v142-home-stickers", "true");
  const earned = Array.isArray(state.counters?.stickers) ? state.counters.stickers : [];
  const count = earned.length;
  els.stickerBookButton.setAttribute("aria-label", `Sticker Book: ${count} ${count === 1 ? "sticker" : "stickers"}`);

  const topRow = node("span", "home-sticker-card-head");
  const labelSpan = node("span", "home-sticker-label", `Stickers: ${count}`);
  topRow.append(createHomeStickerBookIconSvg(), labelSpan);

  const thumbsRow = node("span", "home-sticker-thumbs");
  thumbsRow.setAttribute("aria-hidden", "true");
  if (count > 0) {
    for (const day of earned.slice(-3)) {
      thumbsRow.append(buildHomeStickerThumb(day, false));
    }
  } else {
    thumbsRow.append(buildHomeStickerThumb(nextDay(dateKey()), true));
  }

  els.stickerBookButton.replaceChildren(topRow, thumbsRow);
}

function renderDailyCard() {
  if (!els.dailyButton) return;
  const puzzle = dailyPuzzle();
  const done = state.counters && state.counters.daily.lastDate === dateKey();
  const available = Boolean(puzzle && !done);
  els.dailyButton.disabled = !available;
  els.dailyButton.textContent = done ? "Back tomorrow!" : "Daily Hunt";
  const cardDailyBtn = document.querySelector("[data-v145-daily-button]");
  if (cardDailyBtn) {
    cardDailyBtn.disabled = !available;
    cardDailyBtn.textContent = done ? "Back tomorrow!" : "Daily Hunt";
  }
  const cardDailyThumb = document.querySelector("[data-v145-daily-thumb]");
  if (cardDailyThumb) {
    if (puzzle) {
      cardDailyThumb.src = puzzle.imageA;
      cardDailyThumb.alt = `Today's picture preview: ${puzzle.title || "Daily Hunt"}`;
      cardDailyThumb.classList.toggle("is-mirrored", puzzle.mirrored === true);
    }
    cardDailyThumb.setAttribute("role", "button");
    cardDailyThumb.setAttribute("tabindex", available ? "0" : "-1");
    cardDailyThumb.setAttribute("aria-disabled", String(!available));
    cardDailyThumb.setAttribute(
      "aria-label",
      available
        ? `Daily Hunt — ${puzzle.title || "Today's picture"}`
        : `Today's picture complete — ${puzzle?.title || "Back tomorrow!"}`
    );
    cardDailyThumb.classList.toggle("is-done", !available);
  }
  const streak = state.counters?.daily.streak || 0;
  els.dailyStreak.hidden = streak < 1;
  if (streak > 0) {
    els.dailyStreak.replaceChildren(appSvgIcon("sunburst-flame"), node("span", "", `${streak}-day streak`));
  } else {
    els.dailyStreak.replaceChildren();
  }
  renderHomeStickerCard();
}
function playNow() {
  newRun();
}
function startDaily() {
  syncExternalCounters();
  const today = dateKey();
  const puzzle = dailyPuzzle(today);
  if (!puzzle || state.counters.daily.lastDate === today) return;
  newRun({daily:true, puzzle});
}
let lastSeriesFirstId = null;

function shuffleArrayInPlace(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomSetPosition(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function shuffleWithinBands(puzzles) {
  const early = [];
  const mid = [];
  const late = [];
  for (const puzzle of puzzles) {
    const idx = LEVEL_ORDER.indexOf(puzzle.id);
    if (idx >= 0 && idx < 8) early.push(puzzle);
    else if (idx >= 8 && idx < 15) mid.push(puzzle);
    else late.push(puzzle);
  }
  shuffleArrayInPlace(early);
  shuffleArrayInPlace(mid);
  shuffleArrayInPlace(late);
  const firstBand = early.length ? early : mid.length ? mid : late;
  if (firstBand.length > 1 && lastSeriesFirstId && firstBand[0].id === lastSeriesFirstId) {
    const swapIdx = 1 + randomSetPosition(firstBand.length - 1);
    [firstBand[0], firstBand[swapIdx]] = [firstBand[swapIdx], firstBand[0]];
  }
  const combined = [...early, ...mid, ...late];
  if (combined.length) lastSeriesFirstId = combined[0].id;
  return combined;
}

function newRun(options = {}) {
  syncExternalCounters();
  const daily = options.daily === true;
  const duel = options.duel === true;
  const challenge = options.challenge === true;
  const picked = !daily && !duel && !challenge && (options.picked === true || Number.isInteger(options.startIndex));
  const mode = daily || duel ? "untimed" : challenge ? (["untimed", "timed"].includes(options.mode) ? options.mode : state.selectedMode) : (Number.isInteger(options.startIndex) ? "untimed" : state.selectedMode);
  const difficulty = duel
    ? (DIFFICULTIES[options.difficulty] ? options.difficulty : (options.homeDuel ? state.selectedDifficulty : (state.lastDailyDuel?.difficulty || state.selectedDifficulty)))
    : challenge ? (DIFFICULTIES[options.difficulty] ? options.difficulty : state.selectedDifficulty) : state.selectedDifficulty;
  const baseList = duel || challenge ? [options.puzzle] : daily ? [options.puzzle || dailyPuzzle()]
    : Number.isInteger(options.startIndex)
      ? state.puzzles.filter(p => !p.mirrored && LEVEL_ORDER.includes(p.id))
        .sort((a,b) => LEVEL_ORDER.indexOf(a.id) - LEVEL_ORDER.indexOf(b.id))
      : filteredPuzzles();
  const isSeriesRun = !daily && !duel && !challenge && !picked;
  const list = isSeriesRun ? shuffleWithinBands(baseList) : baseList;
  if (!list.length || !list[0]) return;
  if (list.some(item => {
    const original = state.puzzles.find(p => p.id === (item.mirrorOf || item.id) && !p.mirrored);
    return !original;
  })) {
    showStatus(`${difficultyName(difficulty)} pictures are not available. Generate and install the difficulty variants first.`, true);
    return;
  }
  showStatus("");
  leaveActiveRun();
  if (!daily && !challenge && Number.isInteger(options.startIndex) &&
    (!unlockedLevelIndices().has(options.startIndex) || options.startIndex < 0 || options.startIndex >= list.length)) return;
  const firstAttempt = !duel && !challenge && !state.counters.firstPuzzle && !state.counters.firstPlay && !state.counters.firstOverall;
  const firstOrderIdx = LEVEL_ORDER.indexOf(list[0].id);
  state.run = {
    mode, difficulty, kind: duel ? "duel" : daily ? "daily" : challenge ? "challenge" : "levels", category: duel || daily || challenge || Number.isInteger(options.startIndex) ? "all" : state.selectedCategory,
    picked, levelRevealed: false, revealedIdx: new Set(), revealHoldMs: 0,
    list, levelIndex: mode === "timed" || daily || challenge ? 0 : (options.startIndex || 0), phase:"loading", found:new Set(), levelsCleared:0,
    totalFinds:0, totalMisses:0, totalHints:0, score:0, levelScore:0, timeRemaining:0, timeLimit:0,
    setIndex:0, activeDifferences:[],
    missTimes:[], cooldownUntil:0, mashed:false, highMisses:false, finalized:false, revealed:false,
    hintAvailable:true, hintElapsedMs:0, hintUses:0, lastFindAt:null, noFindElapsedMs:0, hintBoostUsed:false,
    modeFirstAttempt: !duel && !challenge && !state.counters[mode].firstPuzzleStarted,
    initialOverall: !duel && !challenge && !state.counters.firstOverall, firstLevelFinished:false,
    firstAttempt, firstLevelFlagged:false, firstLevelMisses:0, levelMisses:0,
    coachEligible: firstAttempt && !daily && !challenge && firstOrderIdx >= 0 && firstOrderIdx < 8,
    coachElapsedMs:0, coachLastAt:0, firstFindMade:false,
    betweenElapsedMs:0, betweenShownSecond:0, showTip:true,
    dailyDate: daily ? dateKey() : null,
    testUnlock: state.testSessionFlagged,
    elapsedMs: 0, levelStartElapsedMs: 0, levelElapsedMs: 0, duelElapsedMs: 0,
    duelFromHome: duel && options.homeDuel === true,
    hasChildBenchmark: duel && (options.hasChildBenchmark === true || (!options.homeDuel && safeInt(options.childElapsedMs) > 0)),
    childElapsedMs: duel ? safeInt(options.childElapsedMs) : 0,
    childFinds: duel ? (options.homeDuel ? 0 : safeInt(options.childFinds ?? state.lastDailyDuel?.childFinds ?? 5, 0, 10)) : 0
  };
  if (!duel && !challenge) recordPlayStart(mode);
  if (firstAttempt) {
    state.counters.firstPuzzle = {mode, puzzleId:list[0].id, finished:false, flagged:false};
    persistCounters();
  }
  state.pendingSaveEntry = null;
  state.savePrompted = false;
  startLevel();
  startFrames();
}

function clearDuelTurnOverlay() {
  if (state.duelTurnOverlayTimer) {
    window.clearTimeout(state.duelTurnOverlayTimer);
    state.duelTurnOverlayTimer = 0;
  }
  document.querySelectorAll("[data-v145-turn-overlay]").forEach(el => el.remove());
}

function showDuelTurnOverlay(run) {
  clearDuelTurnOverlay();
  if (!run || run.kind !== "duel") return;
  const gameView = $("gameView");
  if (!gameView) return;

  const isGrownUp = Boolean(run.hasChildBenchmark);
  const turnKey = isGrownUp ? "grownup" : "kid";
  const turnTitle = isGrownUp ? "Grown-up's turn" : "Kid's turn";
  const turnSub = isGrownUp ? "Can you beat the kid's time?" : "Find all 5 differences!";
  const reducedMotion = Boolean(
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const overlay = node(
    "div",
    `v145-turn-overlay ${reducedMotion ? "is-reduced-motion" : "is-burst"}`
  );
  overlay.setAttribute("data-v145-turn-overlay", turnKey);
  overlay.setAttribute("data-v145-turn-reduced", String(reducedMotion));
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");

  const card = node("div", "v145-turn-burst-card");
  card.setAttribute("data-v145-turn-card", "true");

  const eyebrow = node("p", "eyebrow v145-turn-eyebrow", "Family Duel");
  const titleEl = node("strong", "v145-turn-title", turnTitle);
  titleEl.setAttribute("data-v145-turn-title", "true");
  const subEl = node("span", "v145-turn-sub", turnSub);
  subEl.setAttribute("data-v145-turn-sub", "true");

  card.append(eyebrow, titleEl, subEl);
  overlay.append(card);
  gameView.append(overlay);

  state.duelTurnOverlayTimer = window.setTimeout(() => {
    clearDuelTurnOverlay();
  }, 1500);
}

function startLevel() {
  const run = state.run;
  if (!run || run.finalized) return;

  const sourcePuzzle = run.list[run.levelIndex];
  if (!sourcePuzzle) {
    finishRun("completed");
    return;
  }

  // Fresh set per play, including retries, mirrored Daily and Family Duel.
  // The active level owns its selected B image and five difference coordinates.
  const chosen = choosePuzzleSet(sourcePuzzle, run.difficulty);
  if (!chosen) { showStatus("Pictures for this difficulty are missing.", true); returnHome(); return; }
  const puzzle = {...sourcePuzzle, imageB: chosen.imageB, differences: chosen.differences};
  run.list[run.levelIndex] = puzzle;
  run.setIndex = chosen.id;
  run.activeDifferences = chosen.differences;
  run.phase = "loading";
  run.found = new Set();
  run.revealedIdx = new Set();
  run.revealHoldMs = 0;
  run.missTimes = [];
  run.cooldownUntil = 0;
  run.hintUses = 0;
  run.lastFindAt = null;
  run.firstLevelMisses = 0;
  run.levelMisses = 0;
  run.levelScore = 0;
  run.levelStartElapsedMs = run.elapsedMs || 0;
  run.levelElapsedMs = 0;
  run.levelStartedAt = performance.now();
  run.noFindElapsedMs = 0;
  run.hintBoostUsed = false;
  run.missStreak = 0;
  run.hintTarget = -1;
  run.levelRevealed = false;
  window.clearTimeout(state.clearLevelHandle);
  state.clearLevelHandle = null;
  window.clearTimeout(state.revealHoldHandle);
  state.revealHoldHandle = null;
  clearDuelTurnOverlay();
  closePlayMore();
  run.betweenElapsedMs = 0;
  run.timeLimit = levelTime(puzzle);
  run.timeRemaining = run.timeLimit;
  state.lastFrameAt = null;

  els.gameModeLabel.textContent = run.kind === "duel" ? `Family Duel · ${difficultyName(run.difficulty)}` : run.kind === "daily"
    ? `Daily Hunt · ${difficultyName(run.difficulty)}`
    : run.kind === "challenge"
      ? `Challenge · ${run.mode === "timed" ? "Timed" : "Untimed"} · ${difficultyName(run.difficulty)}`
      : `${run.mode === "timed" ? "Timed" : "Untimed"} · ${difficultyName(run.difficulty)} · ${labelForCategory(run.category)}`;
  els.puzzleHeading.textContent = run.kind === "duel" ? (run.hasChildBenchmark ? "Grown-up's turn" : "Kid's turn") : run.kind === "daily" ? "Daily Hunt" : run.kind === "challenge" ? "Challenge" : `Level ${run.levelIndex + 1}`;
  els.puzzleTitle.textContent = puzzle.title || `Find ${puzzle.differences.length} differences`;
  els.levelCount.textContent = `${run.levelIndex + 1} / ${run.list.length}`;
  els.timerPanel.hidden = run.mode !== "timed";
  els.duelClock.hidden = run.kind !== "duel";
  els.scoreMetric.hidden = run.kind === "duel";
  els.scoreMetric.querySelector(".metric-name").textContent = "Total";
  els.missingImagesNotice.hidden = true;

  els.imageA.classList.toggle("is-mirrored", puzzle.mirrored === true);
  els.imageB.classList.toggle("is-mirrored", puzzle.mirrored === true);
  // Preserve the instruction slot for the entire level: no image reflow.
  els.imageInstructions.hidden = false;
  els.imageInstructions.style.visibility = run.showTip ? "visible" : "hidden";
  els.imageInstructions.textContent = "Tap a difference in either picture!";
  els.imageA.alt = `Picture A: ${puzzle.title || "puzzle"}`;
  els.imageB.alt = `Picture B: ${puzzle.title || "puzzle"}`;

  const ratio = `${puzzle.width} / ${puzzle.height}`;
  els.imageStageA.style.aspectRatio = ratio;
  els.imageStageB.style.aspectRatio = ratio;
  els.imageA.width = puzzle.width;
  els.imageA.height = puzzle.height;
  els.imageB.width = puzzle.width;
  els.imageB.height = puzzle.height;
  els.imageA.decoding = "async";
  els.imageB.decoding = "async";
  els.imageA.removeAttribute("loading");
  els.imageB.removeAttribute("loading");

  clearNextLevelPreload();
  clearHintsAndMarks();
  updateHUD();
  els.gameMessage.removeAttribute("data-v145-find-what");
  els.gameMessage.removeAttribute("data-v145-find-count");
  setGameMessage("Loading pictures…");
  showView("gameView");
  if (run.kind === "duel") {
    showDuelTurnOverlay(run);
  }

  const generation = ++state.imageGeneration;
  let ready = 0;
  let failed = false;
  const loadedSides = new Set();

  const loaded = side => {
    if (
      !state.run ||
      state.run !== run ||
      generation !== state.imageGeneration ||
      failed ||
      loadedSides.has(side)
    ) return;

    loadedSides.add(side);
    ready += 1;

    if (ready === 2) {
      run.phase = "playing";
      if (run.kind !== "duel" && run.kind !== "challenge") {
        state.counters.puzzlesPlayed += 1;
        persistCounters();
      }
      run.coachElapsedMs = 0;
      run.coachLastAt = 0;
      state.lastFrameAt = null;
      setGameMessage(`Find all ${puzzle.differences.length}!`);
      updateHUD();
      preloadNextLevel(run);
    }
  };

  const error = () => {
    if (generation !== state.imageGeneration) return;
    failed = true;
    els.missingImagesNotice.hidden = false;
    setGameMessage("Pictures are missing. Add the image files to play.");
  };

  for (const [img, src, side] of [
    [els.imageA, puzzle.imageA, "A"],
    [els.imageB, puzzle.imageB, "B"]
  ]) {
    img.onload = () => loaded(side);
    img.onerror = error;
    img.removeAttribute("src");
    img.src = src;
    if (img.complete && img.naturalWidth > 0) loaded(side);
  }
}

function clearNextLevelPreload() {
  if (Array.isArray(state.preloadLinks)) {
    for (const link of state.preloadLinks) {
      if (link && link.parentNode) link.parentNode.removeChild(link);
    }
  }
  state.preloadLinks = [];
  document.querySelectorAll('link[data-next-preload="true"]').forEach(link => link.remove());
}

function preloadNextLevel(run) {
  clearNextLevelPreload();
  if (!run || run.finalized || !Array.isArray(run.list)) return;
  const nextPuzzle = run.list[run.levelIndex + 1];
  if (!nextPuzzle) return;
  const pairId = nextPuzzle.mirrorOf || nextPuzzle.id;
  const original = state.puzzles.find(item => item.id === pairId && !item.mirrored);
  const base = original || nextPuzzle;
  const nextImageA = nextPuzzle.imageA || base.imageA;
  const nextImageB = base.variants?.easy?.imageB || nextPuzzle.imageB || base.imageB;
  const urls = [...new Set([nextImageA, nextImageB].filter(Boolean))].slice(0, 2);
  for (const href of urls) {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = href;
    link.dataset.nextPreload = "true";
    document.head.append(link);
    state.preloadLinks.push(link);
  }
}

function clearHintsAndMarks() {
  window.clearTimeout(state.hintGlowHandle);
  els.marksA.replaceChildren();
  els.marksB.replaceChildren();
  els.glowA.replaceChildren();
  els.glowB.replaceChildren();
}

function updateHUD() {
  const run = state.run;
  if (!run) return;

  els.foundCount.textContent =
    `${run.found.size} / ${run.list[run.levelIndex]?.differences.length || 5}`;
  els.scoreCount.textContent = String(run.score);
  els.totalFinds.textContent = String(run.totalFinds);
  els.totalMisses.textContent = String(run.totalMisses);
  els.totalHints.textContent = String(run.totalHints);
  els.totalCleared.textContent = String(run.levelsCleared);

  els.hintCooldownLabel.textContent = run.mode === "untimed"
    ? (run.hintAvailable ? "• Ready" : `• ${Math.max(0, Math.ceil((hintRechargeMs(run.list[run.levelIndex]) - run.hintElapsedMs) / 1000))}s`)
    : `• ${Math.max(0, timedHintLimit(run.list[run.levelIndex]) - run.hintUses)}`;

  els.hintButton.disabled = run.phase !== "playing" ||
    (run.mode === "untimed" && !run.hintAvailable) ||
    (run.mode === "timed" && run.hintUses >= timedHintLimit(run.list[run.levelIndex]));
  const revealRemaining = Math.max(0, REVEAL_NO_FIND_MS - run.noFindElapsedMs);
  els.revealButton.disabled = run.phase !== "playing" || revealRemaining > 0;
  const isSeriesNextLevel = run.kind === "levels" && !run.picked && run.levelIndex < run.list.length - 1;
  els.revealStatus.textContent = revealRemaining > 0
    ? `Available after ${Math.ceil(revealRemaining / 1000)}s without a find.`
    : isSeriesNextLevel
      ? "Shows the leftover differences, then the next level. This level isn't saved."
      : "Shows the leftover differences, then this game ends. This level isn't saved.";

  const left = Math.max(0, run.timeRemaining);

  els.timerText.textContent = `${Math.ceil(left)} s`;
  els.timerTrack.setAttribute("aria-valuemax", String(run.timeLimit));
  els.timerTrack.setAttribute("aria-valuenow", String(Math.ceil(left)));
  els.timerFill.style.width =
    `${run.timeLimit ? clamp(left / run.timeLimit, 0, 1) * 100 : 0}%`;

  els.timerPanel.classList.toggle("is-final", left <= 10);
  els.timerPanel.classList.toggle("is-urgent", left <= 15);
  els.timerPanel.classList.toggle("is-warning", left <= 30 && left > 15);
  if (run.kind === "duel") els.duelClock.textContent = duelTime(run.duelElapsedMs);
  document.querySelectorAll(".star-progress .star-slot").forEach((star, i) => {
    star.hidden = i >= run.list[run.levelIndex]?.differences.length;
    star.classList.toggle("filled", i < run.found.size);
  });
}

function setGameMessage(message) {
  els.gameMessage.textContent = message;
}

function canAdvanceClock() {
  const demoOverlay = $("demoOverlay");
  return state.run &&
    state.view === "gameView" &&
    state.run.phase === "playing" &&
    !document.hidden &&
    !(demoOverlay && !demoOverlay.hidden) &&
    !els.gateDialog.open &&
    !els.tipsDialog.open &&
    !els.nicknameDialog.open;
}

function frame(timestamp) {
  const delta = state.lastFrameAt === null ? 0 : Math.max(0, Math.min(1000, timestamp - state.lastFrameAt));
  state.lastFrameAt = timestamp;
  const run = state.run;
  if (run && canAdvanceClock()) {
    run.elapsedMs += delta;
    run.levelElapsedMs = (run.levelElapsedMs || 0) + delta;
    run.noFindElapsedMs += delta;
    if (run.kind === "duel") run.duelElapsedMs += delta;
    if (run.mode === "timed") {
      run.timeRemaining = Math.max(0, run.timeRemaining - delta / 1000);
      if (run.timeRemaining <= 0) finishRun("timeout");
    } else if (!run.hintAvailable) {
      run.hintElapsedMs += delta;
      const recharged = run.hintElapsedMs >= hintRechargeMs(run.list[run.levelIndex]);
      const boosted = !run.hintBoostUsed && run.noFindElapsedMs >= HINT_READY_NO_FIND_MS;
      if (recharged || boosted) {
        if (boosted) run.hintBoostUsed = true;
        run.hintAvailable = true;
        run.hintElapsedMs = 0;
        setGameMessage("A hint is ready!");
      }
    }
    const ghostActive = typeof window.isGhostBlockingCoach === "function" && window.isGhostBlockingCoach(run);
    if (state.run === run && run.coachEligible && !run.firstFindMade && !ghostActive) {
      run.coachElapsedMs += delta;
      const interval = Math.floor(run.coachElapsedMs / 15000);
      if (interval > run.coachLastAt) {
        run.coachLastAt = interval;
        const diffIndex = run.list[run.levelIndex].differences.findIndex((_, i) => !run.found.has(i));
        if (diffIndex >= 0) {
          const diff = run.list[run.levelIndex].differences[diffIndex];
          if (interval >= 3) {
            pulseFirstFind(diff);
          } else {
            run.hintTarget = diffIndex;
            glowHint(diff);
          }
        }
      }
    }
    if (state.run === run) updateHUD();
  }
  const demoOverlay = $("demoOverlay");
  if (
    run &&
    state.view === "gameView" &&
    run.phase === "revealing" &&
    !document.hidden &&
    !(demoOverlay && !demoOverlay.hidden) &&
    !els.gateDialog.open &&
    !els.tipsDialog.open &&
    !els.nicknameDialog.open
  ) {
    run.revealHoldMs = (run.revealHoldMs || 0) + delta;
    if (run.revealHoldMs >= 4000) {
      endRevealHold(run);
    }
  }
  if (run && state.view === "betweenView" && run.phase === "between" &&
    !document.hidden && !els.gateDialog.open && !els.tipsDialog.open) {
    run.betweenElapsedMs += delta;
    if (run.betweenElapsedMs >= 4500) nextLevel();
    else if (run.betweenElapsedMs >= 1500) {
      const remaining = Math.ceil((4500 - run.betweenElapsedMs) / 1000);
      if (remaining !== run.betweenShownSecond) {
        run.betweenShownSecond = remaining;
        els.nextLevelButton.textContent = `Next level in ${remaining}…`;
      }
    }
  }
  state.frameId = window.requestAnimationFrame(frame);
}

function startFrames() {
  if (state.frameId) return;
  state.lastFrameAt = null;
  state.frameId = window.requestAnimationFrame(frame);
}

function currentSlop() {
  const run = state.run;
  if (!run) return 0;
  const lastIndex = run.list.length - 1;

  return lastIndex === 0
    ? 0.0135
    : 0.0135 * (1 - run.levelIndex / lastIndex);
}

// Forgiving hitbox: +5% radius per counted miss after the second in a row,
// up to +15%. Reset on a find and at level start; mash-throttled taps never count.
function hitboxBonus(run) {
  const streak = run && Number.isFinite(run.missStreak) ? run.missStreak : 0;
  return Math.min(1.15, 1 + 0.05 * Math.max(0, streak - 2));
}

function effectiveRadiusPixels(difference, imageWidth) {
  const r = difference.r;
  // A size-appropriate minimum without the former 32px floor;
  // cap oversized painted regions to protect random-tap fairness.
  const difficulty = state.run?.difficulty || "medium";
  const cap = .12;
  const bonus = hitboxBonus(state.run);
  const fraction = Math.min(cap, (r + (difficulty === "easy" ? currentSlop() : 0)) * bonus);
  return Math.max(difficultyConfig(difficulty).radius * bonus, fraction * imageWidth);
}

function pickNearestDifference(xPx, yPx, width, height) {
  const run = state.run;
  if (!run) return -1;

  const differences = run.list[run.levelIndex].differences;
  let bestIndex = -1;
  let bestDistance = Infinity;

  differences.forEach((diff, index) => {
    if (run.found.has(index) || (run.revealedIdx instanceof Set && run.revealedIdx.has(index))) return;

    const dx = xPx - displayX(diff) * width;
    const dy = yPx - diff.y * height;
    const distance = Math.hypot(dx, dy);
    const radius = effectiveRadiusPixels(diff, width);

    if (distance <= radius && distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  });

  return bestIndex;
}

function tapImage(event, which) {
  const run = state.run;
  if (!run || run.phase !== "playing") return;

  if (event.detail === 0) {
    setGameMessage(
      "Tap or click the spot you noticed in either picture."
    );
    return;
  }

  // Capture geometry and classify this tap BEFORE any UI changes.
  // This also protects the hit test if a future style moves the tip.
  const surface = which === "A"
    ? els.tapSurfaceA
    : els.tapSurfaceB;

  const bounds = surface.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;

  if (
    x < 0 || y < 0 ||
    x > bounds.width || y > bounds.height
  ) return;

  const found = pickNearestDifference(
    x,
    y,
    bounds.width,
    bounds.height
  );

  // visibility:hidden keeps the instruction's reserved layout space.
  // Never use hidden/display:none for this instruction during a tap.
  if (run.showTip) {
    run.showTip = false;
    els.imageInstructions.style.visibility = "hidden";
  }

  if (found >= 0) {
    markFound(found);
    return;
  }

  const now = performance.now();

  if (now < run.cooldownUntil) {
    setGameMessage(
      "Keep looking! You can still tap a difference."
    );
    return;
  }

  showMissFeedback(which, x, y);
  run.totalMisses += 1;
  run.levelMisses += 1;
  if (run.levelMisses >= 15) {
    run.highMisses = true;
    if (run.firstAttempt) markFirstPuzzleFlagged();
  }
  if (run.levelIndex === 0) {
    run.firstLevelMisses += 1;
    if (run.firstLevelMisses >= 15) markFirstPuzzleFlagged();
  }
  run.missTimes = run.missTimes.filter(
    t => now - t <= MASH_WINDOW_MS
  );
  run.missTimes.push(now);

  if (run.missTimes.length >= 3) {
    run.mashed = true;
    if (run.levelIndex === 0) markFirstPuzzleFlagged();
    run.cooldownUntil = now + MASH_COOLDOWN_MS;
    run.missTimes = [];
    setGameMessage(
      "Try looking carefully. Take your time!"
    );
  } else {
    // Counted miss. The tap that trips the anti-mash detector (above) and taps
    // during its cooldown are mash-throttled: no streak, no penalty.
    run.missStreak = (run.missStreak || 0) + 1;
    if (run.mode === "timed") {
      run.timeRemaining = Math.max(
        0,
        run.timeRemaining - difficultyConfig(run.difficulty).miss
      );
    }
    setGameMessage(
      run.mode === "timed"
        ? `Not this one. Minus ${difficultyConfig(run.difficulty).miss} seconds.`
        : "Not quite. Try another spot!"
    );
  }

  if (
    run.mode === "timed" &&
    run.timeRemaining <= 0
  ) finishRun("timeout");

  updateHUD();
}

function showMissFeedback(which, x, y) {
  const stage = which === "A" ? els.imageStageA : els.imageStageB;
  const ripple = node("span", "miss-ripple");
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  const layer = which === "A" ? els.glowA : els.glowB;
  layer.append(ripple);
  stage.classList.remove("is-wobbling");
  void stage.offsetWidth;
  stage.classList.add("is-wobbling");
  window.setTimeout(() => { ripple.remove(); stage.classList.remove("is-wobbling"); }, 480);
}

function markFound(index) {
  const run = state.run;
  if (
    !run ||
    run.found.has(index) ||
    (run.revealedIdx instanceof Set && run.revealedIdx.has(index)) ||
    run.phase !== "playing"
  ) return;

  run.found.add(index);
  run.noFindElapsedMs = 0;
  run.hintBoostUsed = false;
  run.missStreak = 0;
  run.totalFinds += 1;

  if (run.mode === "timed") {
    const now = performance.now();
    const points = Math.round((run.lastFindAt !== null && now - run.lastFindAt <= 3000 ? 150 : 100) * difficultyConfig(run.difficulty).multiplier);
    run.score += points;
    run.levelScore += points;
    run.lastFindAt = now;
  } else if (run.kind !== "duel") {
    const points = Math.round(100 * difficultyConfig(run.difficulty).multiplier);
    run.score += points;
    run.levelScore += points;
  }
  run.firstFindMade = true;
  window.clearTimeout(state.hintGlowHandle);
  els.glowA.replaceChildren();
  els.glowB.replaceChildren();

  const difference =
    run.list[run.levelIndex].differences[index];
  const totalDiffs = run.list[run.levelIndex].differences.length;
  const rawWhat = typeof difference?.what === "string" ? difference.what.trim() : "";
  const whatText = rawWhat ? rawWhat.charAt(0).toUpperCase() + rawWhat.slice(1) : "";

  addRing(difference, false);
  els.gameMessage.setAttribute("data-v145-find-what", whatText);
  els.gameMessage.setAttribute("data-v145-find-count", `${run.found.size} of ${totalDiffs}`);
  setGameMessage(
    whatText
      ? `Nice find! ${whatText} (${run.found.size} of ${totalDiffs}).`
      : `Nice find! ${run.found.size} of ${totalDiffs}.`
  );
  updateHUD();

  if (run.found.size === run.list[run.levelIndex].differences.length) clearLevel();
}

function visualRingSize(difference, stageWidth, stageHeight) {
  // Visual-only sizing: never used to accept or reject taps.
  const maxDiameter = Math.min(stageWidth, stageHeight) * 0.45;
  const ellipse = Number.isFinite(difference.rx) && difference.rx > 0 &&
    Number.isFinite(difference.ry) && difference.ry > 0;
  const diameterX = 2 * (ellipse ? difference.rx : difference.r) * stageWidth;
  const diameterY = ellipse ? 2 * difference.ry * stageHeight : diameterX;
  return {
    width: clamp(diameterX, 28, maxDiameter),
    height: clamp(diameterY, 28, maxDiameter)
  };
}

function visualRingPosition(difference, width, height) {
  const size = visualRingSize(difference, width, height);
  const halfX = Math.min(size.width / 2, width / 2);
  const halfY = Math.min(size.height / 2, height / 2);
  return {
    left: clamp(displayX(difference) * width, halfX, width - halfX),
    top: clamp(difference.y * height, halfY, height - halfY),
    ...size
  };
}

function addRing(difference, revealed) {
  for (const [stage, marks] of [
    [els.imageStageA, els.marksA],
    [els.imageStageB, els.marksB]
  ]) {
    const position = visualRingPosition(difference, stage.clientWidth, stage.clientHeight);
    const ring = node("span", `find-ring${revealed ? " revealed" : ""}`);
    ring.style.left = `${position.left}px`;
    ring.style.top = `${position.top}px`;
    ring.style.width = `${position.width}px`;
    ring.style.height = `${position.height}px`;
    marks.append(ring);
  }
}

function redrawRings() {
  const run = state.run;
  if (!run || !run.list[run.levelIndex]) return;
  els.marksA.replaceChildren();
  els.marksB.replaceChildren();
  const diffs = run.list[run.levelIndex].differences;
  for (const index of run.found) {
    if (diffs[index]) addRing(diffs[index], false);
  }
  if (run.revealedIdx instanceof Set) {
    for (const index of run.revealedIdx) {
      if (!run.found.has(index) && diffs[index]) addRing(diffs[index], true);
    }
  }
}

function pulseFirstFind(difference) {
  window.clearTimeout(state.hintGlowHandle);
  els.glowA.replaceChildren();
  els.glowB.replaceChildren();
  for (const [stage, layer] of [[els.imageStageA, els.glowA], [els.imageStageB, els.glowB]]) {
    const position = visualRingPosition(difference, stage.clientWidth, stage.clientHeight);
    const ring = node("span", "find-ring coaching-pulse");
    ring.style.left = `${position.left}px`;
    ring.style.top = `${position.top}px`;
    ring.style.width = `${position.width}px`;
    ring.style.height = `${position.height}px`;
    layer.append(ring);
  }
  state.hintGlowHandle = window.setTimeout(() => {
    els.glowA.replaceChildren(); els.glowB.replaceChildren();
  }, 1800);
}

function displayX(difference) {
  const puzzle = state.run?.list[state.run.levelIndex];
  return puzzle?.mirrored ? 1 - difference.x : difference.x;
}

function glowHint(difference) {
  window.clearTimeout(state.hintGlowHandle);

  for (const layer of [els.glowA, els.glowB]) {
    layer.replaceChildren();

    const glow = node(
      "span",
      "hint-quadrant"
    );

    glow.style.left =
      displayX(difference) < 0.5 ? "0%" : "50%";
    glow.style.top =
      difference.y < 0.5 ? "0%" : "50%";

    layer.append(glow);
  }

  state.hintGlowHandle = window.setTimeout(() => {
    els.glowA.replaceChildren();
    els.glowB.replaceChildren();
  }, 1800);
}

// Second hint on the same unfound difference: an exact circle centred on it.
function spotHint(difference) {
  window.clearTimeout(state.hintGlowHandle);

  for (const [stage, layer] of [
    [els.imageStageA, els.glowA],
    [els.imageStageB, els.glowB]
  ]) {
    layer.replaceChildren();
    const size = visualRingSize(difference, stage.clientWidth, stage.clientHeight);
    const diameter = Math.max(56, size.width + 12, size.height + 12);
    const spot = node("span", "hint-spot");
    spot.style.left = `${displayX(difference) * 100}%`;
    spot.style.top = `${difference.y * 100}%`;
    spot.style.width = `${diameter}px`;
    spot.style.height = `${diameter}px`;
    layer.append(spot);
  }

  state.hintGlowHandle = window.setTimeout(() => {
    els.glowA.replaceChildren();
    els.glowB.replaceChildren();
  }, 2400);
}

function useHint() {
  const run = state.run;

  if (
    !run ||
    run.phase !== "playing" ||
    (run.mode === "untimed" && !run.hintAvailable)
  ) return;

  const remaining =
    run.list[run.levelIndex].differences.findIndex(
      (_, index) => !run.found.has(index)
    );

  if (remaining < 0) return;

  if (run.mode === "timed" && run.hintUses >= timedHintLimit(run.list[run.levelIndex])) return;
  run.totalHints += 1;
  run.hintUses += 1;

  if (run.mode === "untimed") {
    run.hintAvailable = false;
    run.hintElapsedMs = 0;
    if (run.noFindElapsedMs >= HINT_READY_NO_FIND_MS) {
      run.hintBoostUsed = true;
    }
  } else {
    run.timeRemaining = Math.max(
      0,
      run.timeRemaining - difficultyConfig(run.difficulty).hint
    );
  }

  const target = run.list[run.levelIndex].differences[remaining];
  if (run.hintTarget === remaining) {
    spotHint(target);
  } else {
    run.hintTarget = remaining;
    glowHint(target);
  }

  setGameMessage(
    run.mode === "timed"
      ? `Look in the glowing area. Minus ${difficultyConfig(run.difficulty).hint} seconds.`
      : "Look in the glowing area!"
  );

  if (
    run.mode === "timed" &&
    run.timeRemaining <= 0
  ) finishRun("timeout");

  updateHUD();
}

function clearLevel() {
  const run = state.run;
  if (
    !run ||
    run.phase !== "playing"
  ) return;

  closePlayMore();
  run.phase = "between";
  run.levelsCleared += 1;
  const clearedPuzzle = run.list[run.levelIndex];
  const clearedId = clearedPuzzle.mirrorOf || clearedPuzzle.id;
  if (run.kind === "levels" && !run.testUnlock && !run.levelRevealed &&
    LEVEL_ORDER.includes(clearedId) &&
    !state.counters.clearedLevels.includes(clearedId)) {
    state.counters.clearedLevels.push(clearedId);
    persistCounters();
  }
  if (run.firstAttempt && !run.testUnlock && run.levelIndex === 0 && state.counters.firstPuzzle) {
    state.counters.firstPuzzle.finished = !state.counters.firstPuzzle.flagged && !run.mashed && !run.levelRevealed;
    persistCounters();
  }

  if (run.levelIndex === 0 && !run.levelRevealed) {
    run.firstLevelFinished = true;
  }

  if (run.mode === "timed") {
    const bonus = Math.round(Math.floor(run.timeRemaining) * 10 * difficultyConfig(run.difficulty).multiplier);
    run.score += bonus;
    run.levelScore += bonus;
  }

  updateHUD();

  const lastLevel =
    run.levelIndex ===
    run.list.length - 1;

  if (!lastLevel) {
    run.betweenElapsedMs = 0;
    run.betweenShownSecond = 0;
    els.nextLevelButton.textContent = "Next level →";
    els.betweenSummary.textContent =
      `${run.levelsCleared} level${run.levelsCleared === 1 ? "" : "s"} cleared. ${run.totalFinds} differences found so far.`;

    els.betweenScore.textContent = `Level +${run.levelScore} · Total ${run.score}`;
  }

  const reducedMotion = Boolean(
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const holdMs = run.kind === "daily"
    ? (reducedMotion ? 60 : 200)
    : (reducedMotion ? 400 : 900);
  window.clearTimeout(state.clearLevelHandle);
  state.clearLevelHandle = window.setTimeout(() => {
    state.clearLevelHandle = null;
    if (state.run !== run || run.finalized || run.phase !== "between") return;
    if (lastLevel) {
      finishRun("completed");
    } else {
      run.betweenElapsedMs = 0;
      run.betweenShownSecond = 0;
      showView("betweenView");
    }
  }, holdMs);
}

function nextLevel() {
  const run = state.run;
  if (
    !run ||
    run.phase !== "between"
  ) return;

  run.levelIndex += 1;
  startLevel();
}

function endRevealHold(run) {
  window.clearTimeout(state.revealHoldHandle);
  state.revealHoldHandle = null;
  if (state.run !== run || run.finalized || run.phase !== "revealing") return;
  const isSeries = run.kind === "levels" && !run.picked;
  const lastLevel = run.levelIndex >= run.list.length - 1;
  if (isSeries && !lastLevel) {
    run.levelIndex += 1;
    startLevel();
  } else {
    finishRun("revealed");
  }
}

function revealAll() {
  const run = state.run;
  if (
    !run ||
    run.phase !== "playing" ||
    run.noFindElapsedMs < REVEAL_NO_FIND_MS
  ) return;

  closePlayMore();
  window.clearTimeout(state.hintGlowHandle);
  els.glowA.replaceChildren();
  els.glowB.replaceChildren();
  run.revealed = true;
  run.levelRevealed = true;
  run.phase = "revealing";
  run.revealHoldMs = 0;
  if (!(run.revealedIdx instanceof Set)) run.revealedIdx = new Set();
  if (run.levelIndex === 0) markFirstPuzzleFlagged();

  run.list[run.levelIndex].differences.forEach(
    (diff, index) => {
      if (!run.found.has(index) && !run.revealedIdx.has(index)) {
        run.revealedIdx.add(index);
        addRing(diff, true);
      }
    }
  );

  els.imageInstructions.hidden = false;
  els.imageInstructions.style.visibility = "visible";
  els.imageInstructions.textContent = "Here they are!";
  setGameMessage("Here they are!");
  updateHUD();

  window.clearTimeout(state.revealHoldHandle);
  state.revealHoldHandle = null;
}

function markFirstPuzzleFlagged() {
  const run = state.run;
  if (!run || !run.firstAttempt || run.levelIndex !== 0 || !state.counters.firstPuzzle) return;
  run.firstLevelFlagged = true;
  state.counters.firstPuzzle.flagged = true;
  state.counters.firstPuzzle.finished = false;
  persistCounters();
}

function markDailyComplete(day) {
  syncExternalCounters();
  const daily = state.counters.daily;
  if (daily.lastDate === day) return;
  const prevDay = yesterdayOf(day);
  const twoDaysAgo = yesterdayOf(prevDay);
  const hadPriorDate = Boolean(daily.lastDate);
  let currentFreeze = safeInt(state.counters.streakFreeze, 0, 99);
  if (daily.lastDate === prevDay) {
    daily.streak += 1;
    state.dailyStreakRestarted = false;
  } else if (daily.lastDate === twoDaysAgo && currentFreeze > 0) {
    currentFreeze -= 1;
    daily.streak += 1;
    state.dailyStreakRestarted = false;
  } else {
    daily.streak = 1;
    state.dailyStreakRestarted = hadPriorDate;
  }
  if (daily.streak > 0 && daily.streak % 7 === 0) {
    currentFreeze = Math.min(99, currentFreeze + 1);
  }
  state.counters.streakFreeze = currentFreeze;
  daily.lastDate = day;
  state.counters.stickers = uniqueDays([...state.counters.stickers, day]).slice(-60);
  persistCounters();
  renderDailyCard();
}

function finalizeCounters(run, reason = "stopped") {
  if (run.finalized) return;
  run.finalized = true;
  if (run.kind === "duel" || run.kind === "challenge") return; // Duel and Challenge change no counters, stickers or boards.

  const good =
    !run.revealed;

  const record =
    state.counters[run.mode];

  if (run.mashed) record.mashedRuns += 1;
  if (run.firstAttempt && !run.testUnlock && state.counters.firstPuzzle) {
    const flagged = run.firstLevelFlagged || run.mashed || run.revealed || run.highMisses;
    state.counters.firstPuzzle.flagged = flagged;
    state.counters.firstPuzzle.finished = run.firstLevelFinished && !flagged;
    if (state.counters.firstOverall) state.counters.firstOverall.finished = run.firstLevelFinished && !flagged;
  }

  if (!run.testUnlock) {
    record.completed += run.levelsCleared;

    if (
      run.modeFirstAttempt &&
      run.firstLevelFinished
    ) {
      record.firstPuzzleCompleted = true;
    }

    if (run.mode === "timed" && run.kind === "levels" && ["timeout", "completed", "revealed"].includes(reason)) {
      if (!run.revealed || run.levelsCleared > 0 || run.score > 0) {
        if (!run.levelRevealed) {
          record.bestLevel = Math.max(record.bestLevel, run.levelIndex + 1);
        } else if (run.levelsCleared > 0 && run.levelIndex > 0) {
          record.bestLevel = Math.max(record.bestLevel, run.levelIndex);
        }
        record.bestScore = Math.max(record.bestScore, run.score);
      }
    }

    if (
      good &&
      run.initialOverall &&
      run.firstLevelFinished &&
      state.counters.firstOverall
    ) {
      state.counters.firstOverall.finished = true;
    }
  }

  if (run.kind === "daily" && reason === "completed" && good && !run.testUnlock) markDailyComplete(run.dailyDate);
  persistCounters();
  renderTimedBest();
}

function leaderboardEligible(run, reason) {
  return state.storageOkay && !run.testUnlock && run.kind === "levels" &&
    !run.revealed &&
    !run.mashed &&
    !run.highMisses &&
    ["timeout", "completed"].includes(reason);
}

function makeEntry(run) {
  return {
    nickname: state.leaderboardStore.getNickname(),
    timestamp: Date.now(),
    level: run.levelIndex + 1,
    levelsCleared: run.levelsCleared,
    misses: run.totalMisses,
    finds: run.totalFinds,
    hints: run.totalHints,
    score: run.score,
    difficulty: run.difficulty
  };
}

function finishRun(reason) {
  const run = state.run;
  if (
    !run ||
    run.finalized
  ) return;

  window.clearTimeout(state.clearLevelHandle);
  state.clearLevelHandle = null;
  window.clearTimeout(state.revealHoldHandle);
  state.revealHoldHandle = null;
  clearDuelTurnOverlay();
  closePlayMore();
  run.phase = "ended";
  const eligibleDaily = run.kind === "daily" && reason === "completed" && !run.revealed && !run.testUnlock;
  if (eligibleDaily) {
    state.lastDailyDuel = {
      day: run.dailyDate,
      puzzle: run.list[0],
      childElapsedMs: run.elapsedMs,
      difficulty: run.difficulty,
      childFinds: run.totalFinds || 5
    };
  }
  finalizeCounters(run, reason);
  if (eligibleDaily) {
    state.lastCompletedDaily = {
      day: run.dailyDate,
      elapsedMs: run.elapsedMs,
      finds: run.totalFinds || 5,
      streak: state.counters?.daily?.streak || 1,
      restarted: Boolean(state.dailyStreakRestarted),
      justCompleted: true
    };
    state.newDailyStickerKey = run.dailyDate;
  }
  ++state.imageGeneration;
  clearNextLevelPreload();
  window.clearTimeout(state.hintGlowHandle);

  const isDuel = run.kind === "duel";
  const isFinalDuel = isDuel && Boolean(run.hasChildBenchmark);
  const resultViewEl = $("resultView");
  if (resultViewEl) {
    resultViewEl.setAttribute("data-v145-result-kind", run.kind);
  }

  els.resultEyebrow.textContent =
    reason === "timeout"
      ? "Game over"
      : "Run complete";

  els.resultHeading.textContent =
    isDuel ? (isFinalDuel ? "Team hunt done!" : "Kid's turn done!") : run.kind === "daily" && reason === "completed" ? "Back tomorrow!" : reason === "timeout"
      ? "Time's up — that's OK!"
      : reason === "completed"
        ? "You found them all!"
        : reason === "revealed"
          ? "All differences revealed"
          : "Run finished";

  if (isDuel) {
    els.resultDescription.textContent = "A family turn just for fun — no scores or counters were changed.";
  } else if (run.kind === "daily" && reason === "completed") {
    const streak = state.counters.daily.streak;
    els.resultDescription.replaceChildren(
      node("span", "", "Daily Hunt complete! "),
      appSvgIcon("spyglass"),
      node("span", "", ` ${streak} ${streak === 1 ? "day" : "days"}`)
    );
  } else {
    els.resultDescription.textContent = reason === "timeout"
      ? "Want to try again?"
      : reason === "completed"
        ? (run.kind === "challenge" ? "Challenge puzzle complete!" : "Every level in this category is complete.")
        : reason === "revealed"
          ? "Revealing answers ends this run without saving it."
          : "You can play again any time.";
  }

  const canPassHomeDuel = isDuel && !isFinalDuel && !run.revealed;
  if (canPassHomeDuel) {
    state.lastHomeDuel = {
      day: dateKey(),
      puzzle: run.list[0],
      childElapsedMs: run.duelElapsedMs,
      difficulty: run.difficulty,
      childFinds: run.totalFinds || 5
    };
  }
  const kidDuelFinds = safeInt(run.childFinds, 0, 5);
  const kidDuelTime = duelTime(run.childElapsedMs);
  const currentDuelFinds = safeInt(run.totalFinds, 0, 5);
  const currentDuelTime = duelTime(run.duelElapsedMs);

  els.resultScore.hidden = isDuel;
  els.resultScore.textContent = isDuel ? "" : `${run.score} points total`;

  els.resultLevel.textContent =
    String(run.levelIndex + 1);
  els.resultFinds.textContent =
    String(run.totalFinds);
  els.resultCleared.textContent =
    String(run.levelsCleared);
  els.resultMisses.textContent =
    String(run.totalMisses);
  els.resultHints.textContent =
    String(run.totalHints);

  const resultStats = document.querySelector("#resultView .result-stats");
  if (resultStats) {
    resultStats.hidden = isDuel;
    resultStats.querySelectorAll(":scope > div").forEach(tile => {
      if (tile.hasAttribute("data-v142-misses-row")) {
        tile.hidden = true;
      } else {
        tile.hidden = isDuel;
      }
    });
  }
  const missesRow = document.querySelector("[data-v142-misses-row]");
  if (missesRow) missesRow.hidden = true;

  const highFiveBtn = document.querySelector("[data-v142-high-five]");
  if (highFiveBtn) highFiveBtn.hidden = !isFinalDuel;

  const eligible =
    leaderboardEligible(run, reason);

  renderTomorrowTeaser(run.kind === "daily" && reason === "completed");
  els.dailyStickerMessage.hidden = !eligibleDaily;
  els.resultStickerButton.hidden = !eligibleDaily;
  els.duelButton.hidden = !(eligibleDaily || canPassHomeDuel);
  if (eligibleDaily) {
    els.duelButton.textContent = `Grown-up's turn: beat ${duelTime(run.elapsedMs)}?`;
  } else if (canPassHomeDuel) {
    els.duelButton.textContent = `Grown-up's turn: beat ${duelTime(run.duelElapsedMs)}?`;
  }
  if (isDuel) {
    els.duelComparison.hidden = false;
    const recapKidFinds = isFinalDuel ? kidDuelFinds : currentDuelFinds;
    const recapKidTime = isFinalDuel ? kidDuelTime : currentDuelTime;
    const kidLine = node("span", "v145-duel-player-line", `Kid: ${recapKidFinds} / 5 found in ${recapKidTime}`);
    kidLine.setAttribute("data-v145-duel-player", "kid");
    if (isFinalDuel) {
      const sepLine = node("span", "v145-duel-player-sep", " · ");
      const grownLine = node("span", "v145-duel-player-line", `Grown-up: ${currentDuelFinds} / 5 found in ${currentDuelTime}`);
      grownLine.setAttribute("data-v145-duel-player", "grownup");
      els.duelComparison.replaceChildren(kidLine, sepLine, grownLine);
    } else {
      els.duelComparison.replaceChildren(kidLine);
    }
  } else {
    els.duelComparison.hidden = true;
    els.duelComparison.textContent = "";
  }

  let autoSavedNickname = null;
  if (eligible) {
    autoSavedNickname = ensurePresetNickname();
    const rawEntry = {
      ...makeEntry(run),
      nickname: autoSavedNickname
    };
    const savedNow = state.leaderboardStore.add(run.mode, rawEntry);
    state.pendingSaveEntry = {
      ...rawEntry,
      mode: run.mode,
      saved: savedNow
    };
  } else {
    state.pendingSaveEntry = null;
  }

  els.resultEligibility.textContent =
    run.kind === "duel" ? "Family Duel turns do not change saved scores or statistics." : run.mashed
      ? "This run was not added to a leaderboard because of rapid repeated misses."
      : run.highMisses
        ? "This run was not added to a leaderboard because of repeated misses."
      : run.revealed
        ? "Reveal-all runs are not recorded."
        : !state.storageOkay
          ? "Saving is unavailable; you can still play."
          : eligible
            ? (state.pendingSaveEntry?.saved
                ? `Saved as ${autoSavedNickname} on this device's leaderboard.`
                : "You can save this run to your device's leaderboard.")
            : "This run wasn't added to a leaderboard.";

  state.savePrompted = false;

  els.resultSaveButton.hidden =
    !eligible || state.nicknameSkipped;

  els.playAgainButton.hidden = ["daily", "duel"].includes(run.kind);
  els.playAgainButton.textContent =
    reason === "timeout"
      ? "Try again"
      : ["daily", "duel"].includes(run.kind)
        ? "Back to Home"
        : "Play again";
  els.resultHomeButton.textContent = "Home";
  els.resultLevelsButton.hidden = false;

  if (eligibleDaily) {
    state.stickerReturnView = "homeView";
    renderStickerBook();
    showView("stickerBookView");
    return;
  }

  showView("resultView");
}

function renderTomorrowTeaser(visible) {
  els.tomorrowTeaser.replaceChildren();
  els.tomorrowTeaser.hidden = !visible;
  if (!visible) return;
  const tomorrow = dailyPuzzle(nextDay(dateKey()));
  if (!tomorrow) return;
  els.tomorrowTeaser.append(node("p", "helper-text", "Tomorrow's picture — a little sneak peek:"));
  const picture = node("img", "daily-teaser-image");
  picture.width = tomorrow.width;
  picture.height = tomorrow.height;
  picture.loading = "lazy";
  picture.decoding = "async";
  picture.src = tomorrow.imageA;
  picture.alt = "Blurred preview of tomorrow's puzzle";
  if (tomorrow.mirrored) picture.classList.add("is-mirrored");
  els.tomorrowTeaser.append(picture);
}

function leaveActiveRun() {
  window.clearTimeout(state.clearLevelHandle);
  state.clearLevelHandle = null;
  window.clearTimeout(state.revealHoldHandle);
  state.revealHoldHandle = null;
  clearDuelTurnOverlay();
  flushPendingSaveEntry();
  if (
    state.run &&
    !state.run.finalized
  ) {
    state.run.phase = "ended";
    finalizeCounters(state.run, "stopped");
  }

  state.run = null;
  ++state.imageGeneration;
  clearNextLevelPreload();
  clearHintsAndMarks();
  state.lastFrameAt = null;
}

function returnHome() {
  flushPendingSaveEntry();
  closePlayMore();
  closeDialogIfOpen(els.saveDialog);
  leaveActiveRun();
  showView("homeView");
  renderDailyCard();
}

function closeDialogIfOpen(dialog) {
  if (dialog && dialog.open) {
    dialog.close();
  }
}

function openTips() {
  closePlayMore();
  state.tipsOpen = true;
  state.lastFrameAt = null;
  els.tipsDialog.showModal();
}

function closeTips() {
  closeDialogIfOpen(els.tipsDialog);
  state.tipsOpen = false;
  state.lastFrameAt = null;
}function randomGateInt(min, max) {
  const range = max - min + 1;
  if (window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint32Array(1);
    window.crypto.getRandomValues(bytes);
    return min + (bytes[0] % range);
  }
  return min + Math.floor(Math.random() * range);
}

function newGateQuestion() {
  let left;
  let right;
  do {
    left = randomGateInt(GATE_DELAY_MIN, GATE_DELAY_MAX);
    right = randomGateInt(GATE_DELAY_MIN, GATE_DELAY_MAX);
  } while (`${left} × ${right}` === state.lastGateExpression);
  state.lastGateExpression = `${left} × ${right}`;
  state.gateAnswer = left * right;
  els.gateQuestion.textContent = `For grown-ups: what is ${left} × ${right}?`;
  const alternatives = new Set([state.gateAnswer]);
  while (alternatives.size < 4) {
    const candidate = state.gateAnswer + randomGateInt(-18, 18);
    if (candidate > 0) alternatives.add(candidate);
  }
  const choices = [...alternatives];
  for (let i = choices.length - 1; i > 0; i -= 1) {
    const index = randomGateInt(0, i);
    [choices[i], choices[index]] = [choices[index], choices[i]];
  }
  els.gateDialog.querySelectorAll(".answer-button").forEach((button, index) => {
    button.dataset.answer = String(choices[index]);
    button.textContent = String(choices[index]);
  });
}

function requireGrown(action) {
  if (state.gatePassed) {
    action();
    return;
  }

  state.pendingGrownAction = action;
  state.gateLockedUntil = 0;
  newGateQuestion();
  els.gateMessage.textContent = "";

  els.gateDialog
    .querySelectorAll(".answer-button")
    .forEach(button => {
      button.disabled = false;
    });

  state.lastFrameAt = null;
  els.gateDialog.showModal();
}

function closeGate() {
  closeDialogIfOpen(els.gateDialog);
  state.pendingGrownAction = null;
  state.lastFrameAt = null;
  window.clearTimeout(state.gateUnlockHandle);
}

function answerGate(value) {
  if (
    !els.gateDialog.open ||
    performance.now() < state.gateLockedUntil
  ) return;

  if (value === state.gateAnswer) {
    const action = state.pendingGrownAction;
    state.gatePassed = true;
    closeGate();

    if (typeof action === "function") {
      action();
    }
    return;
  }

  els.gateMessage.textContent = "Not quite";
  state.gateLockedUntil =
    performance.now() + GATE_DELAY_MS;

  els.gateDialog
    .querySelectorAll(".answer-button")
    .forEach(button => {
      button.disabled = true;
    });

  window.clearTimeout(state.gateUnlockHandle);

  state.gateUnlockHandle = window.setTimeout(() => {
    if (!els.gateDialog.open) return;

    els.gateDialog
      .querySelectorAll(".answer-button")
      .forEach(button => {
        button.disabled = false;
      });

    newGateQuestion();
    els.gateMessage.textContent = "Try again.";
  }, GATE_DELAY_MS);
}

function openGrownArea() {
  state.returnViewAfterGrown = state.view;

  requireGrown(() => {
    renderGrownArea();
    showView("grownView");
  });
}

function backFromGrown() {
  if (
    state.run &&
    !state.run.finalized &&
    state.returnViewAfterGrown === "gameView"
  ) {
    state.lastFrameAt = null;
    showView("gameView");
  } else if (
    state.run &&
    !state.run.finalized &&
    state.returnViewAfterGrown === "betweenView"
  ) {
    showView("betweenView");
  } else {
    returnHome();
  }
}

function buildWordPicker(container, words, key) {
  container.replaceChildren();

  for (const word of words) {
    const button = node(
      "button",
      "",
      word
    );

    button.type = "button";
    button.dataset.word = word;

    button.addEventListener("click", () => {
      state.nicknameDraft[key] = word;
      renderNicknamePicker();
    });

    container.append(button);
  }
}

function renderNicknamePicker() {
  for (const [id, key] of [
    ["adjectiveChoices", "adjective"],
    ["animalChoices", "animal"]
  ]) {
    $(id)
      .querySelectorAll("button[data-word]")
      .forEach(button => {
        const selected =
          button.dataset.word === state.nicknameDraft[key];

        button.classList.toggle(
          "is-selected",
          selected
        );

        button.setAttribute(
          "aria-pressed",
          String(selected)
        );
      });
  }

  els.nicknameNumber.textContent =
    String(state.nicknameDraft.number);

  els.nicknamePreview.textContent =
    makeNickname();

  els.numberDown.disabled =
    state.nicknameDraft.number <= 1;

  els.numberUp.disabled =
    state.nicknameDraft.number >= 99;
}

function openNicknamePicker() {
  const showPicker = () => {
    const current =
      state.leaderboardStore.getNickname();

    if (current) {
      const match =
        /^([A-Za-z]+) ([A-Za-z]+) (\d{1,2})$/
          .exec(current);

      if (match) {
        state.nicknameDraft = {
          adjective: match[1],
          animal: match[2],
          number: Number(match[3])
        };
      }
    }

    closeDialogIfOpen(els.saveDialog);
    renderNicknamePicker();
    els.nicknameDialog.showModal();
  };
  const firstSaveName = !state.leaderboardStore.getNickname() &&
    Boolean(state.pendingSaveEntry) && state.view === "resultView";
  if (firstSaveName) showPicker();
  else requireGrown(showPicker);
}

function finishNicknamePicker() {
  const nickname = makeNickname();
  if (!validNickname(nickname)) return;

  if (!state.leaderboardStore.setNickname(nickname)) {
    closeDialogIfOpen(els.nicknameDialog);
    renderGrownArea();
    return;
  }

  closeDialogIfOpen(els.nicknameDialog);
  if (state.pendingSaveEntry) {
    state.pendingSaveEntry.nickname = nickname;
    flushPendingSaveEntry();
  }
  renderGrownArea();

  if (
    state.pendingSaveEntry &&
    state.view === "resultView" &&
    !state.nicknameSkipped
  ) {
    openSavePrompt();
  }
}

function openSavePrompt() {
  if (
    !state.storageOkay ||
    !state.pendingSaveEntry ||
    state.nicknameSkipped
  ) return;

  state.savePrompted = true;

  const entry = state.pendingSaveEntry;
  const mode = entry.mode || state.run?.mode || state.selectedMode || "untimed";

  els.saveSummary.textContent =
    mode === "timed"
      ? `${entry.score} points · Level ${entry.level} · ${entry.finds} finds`
      : `${entry.levelsCleared} levels cleared · ${entry.misses} misses`;

  const nickname =
    ensurePresetNickname();

  els.saveNickname.textContent =
    nickname
      ? `Nickname: ${nickname}`
      : "No nickname selected yet.";

  els.saveConfirm.disabled = !nickname;

  if (!els.saveDialog.open) {
    els.saveDialog.showModal();
  }
}

function saveScore() {
  if (
    !state.pendingSaveEntry ||
    !state.storageOkay
  ) return;

  const name =
    ensurePresetNickname();

  if (!name) {
    openNicknamePicker();
    return;
  }

  const mode = state.pendingSaveEntry.mode || state.run?.mode || state.selectedMode || "untimed";
  const entry = {
    ...state.pendingSaveEntry,
    nickname: name
  };

  const success = state.leaderboardStore.add(
    mode,
    entry
  );

  closeDialogIfOpen(els.saveDialog);

  if (success) {
    state.pendingSaveEntry.nickname = name;
    state.pendingSaveEntry.saved = true;
    els.resultSaveButton.hidden = true;
    els.resultEligibility.textContent =
      `Saved as ${name} on this device.`;
  } else {
    els.resultEligibility.textContent =
      "Couldn't save the score. You can still play.";
  }
}

function skipNicknameForSession() {
  flushPendingSaveEntry();
  state.nicknameSkipped = true;
  els.resultSaveButton.hidden = true;
  els.resultEligibility.textContent =
    "Skipped nickname prompt for this session.";
  closeDialogIfOpen(els.saveDialog);
}

function renderBoardList(container, entries, mode) {
  container.replaceChildren();

  if (!entries.length) {
    container.append(
      node(
        "li",
        "empty-board",
        "No scores here yet. Try a run!"
      )
    );
    return;
  }

  entries.forEach((entry, index) => {
    const li = node("li");
    const left = node("span");

    left.append(
      node("span", "rank", `#${index + 1} `),
      node("span", "entry-name", entry.nickname)
    );

    const result =
      mode === "timed"
      ? `${entry.score} pts · Level ${entry.level} · ${difficultyName(entry.difficulty)}`
      : `${entry.levelsCleared} levels · ${entry.misses} misses · ${difficultyName(entry.difficulty)}`;

    li.append(
      left,
      node("span", "entry-score", result)
    );

    container.append(li);
  });
}

function showBoards() {
  flushPendingSaveEntry();
  leaveActiveRun();
  showView("boardsView");
  chooseBoardMode(state.boardMode);
}

function chooseBoardMode(mode) {
  if (!["untimed", "timed"].includes(mode)) return;
  state.boardMode = mode;

  for (const [id, value] of [
    ["boardUntimed", "untimed"],
    ["boardTimed", "timed"]
  ]) {
    $(id).classList.toggle(
      "is-selected",
      value === mode
    );

    $(id).setAttribute(
      "aria-pressed",
      String(value === mode)
    );
  }

  const today = dateKey();

  els.dailyDateLabel.textContent =
    `Local date: ${today}. Previous six days are retained.`;

  renderBoardList(
    els.allTimeBoard,
    state.leaderboardStore.getBoard(mode),
    mode
  );

  renderBoardList(
    els.dailyBoard,
    state.leaderboardStore.getBoard(mode, today),
    mode
  );
}

function returnIndicators(mode) {
  const days = state.counters[mode].days;

  return {
    daysPlayed: days.length,
    anotherDay: days.length >= 2,
    nextDay: Boolean(
      days.length &&
      days.includes(nextDay(days[0]))
    )
  };
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function statsText() {
  const u = state.counters.untimed;
  const t = state.counters.timed;
  const ud = returnIndicators("untimed");
  const td = returnIndicators("timed");
  const overall = state.counters.firstOverall;
  const first = state.counters.firstPuzzle;
  const days = state.counters.days;
  const cameBackNext = Boolean(state.counters.firstPlay && days.includes(nextDay(state.counters.firstPlay)));
  return [
    `Untimed mode: first puzzle finished=${yesNo(u.firstPuzzleCompleted)}, puzzles finished=${u.completed}, days played=${ud.daysPlayed}, came back another day=${yesNo(ud.anotherDay)}, came back next day=${yesNo(ud.nextDay)}, mashed runs=${u.mashedRuns}`,
    `Timed mode: first puzzle finished=${yesNo(t.firstPuzzleCompleted)}, puzzles finished=${t.completed}, best score=${t.bestScore}, days played=${td.daysPlayed}, came back another day=${yesNo(td.anotherDay)}, came back next day=${yesNo(td.nextDay)}, mashed runs=${t.mashedRuns}`,
    overall ? `First puzzle overall: mode=${overall.mode}, finished=${yesNo(overall.finished)}` : "First puzzle overall: never",
    first ? `First puzzle: mode=${first.mode}, puzzleId=${first.puzzleId}, finished=${yesNo(first.finished)}, flagged=${yesNo(first.flagged)}` : "First puzzle: never",
    `First played: ${state.counters.firstPlay || "never"}, came back next day=${yesNo(cameBackNext)}, daily streak=${state.counters.daily.streak}`,
    `Puzzles played=${state.counters.puzzlesPlayed}, levels unlocked=${unlockedLevelIndices().size}, testUnlock=${yesNo(state.testSessionFlagged)}`
  ].join("\n");
}

function renderGrownArea() {
  els.currentNickname.textContent =
    state.leaderboardStore.getNickname() ||
    "No nickname selected";

  els.statsText.textContent = statsText();
  els.copyStatus.textContent = "";
  els.sendStatsButton.hidden = !STATS_ENTRY_ID;
  els.testUnlockButton.setAttribute("aria-pressed", String(state.testUnlockEnabled));
  els.testUnlockButton.textContent = `Unlock all levels (testing): ${state.testUnlockEnabled ? "On" : "Off"}`;
}

function selectStats() {
  const range = document.createRange();
  range.selectNodeContents(els.statsText);

  const selection = window.getSelection();
  if (!selection) return;

  selection.removeAllRanges();
  selection.addRange(range);
}

async function copyStats() {
  const text = statsText();

  try {
    if (
      !navigator.clipboard ||
      !navigator.clipboard.writeText
    ) {
      throw new Error("Clipboard unavailable");
    }

    await navigator.clipboard.writeText(text);
    els.copyStatus.textContent = "Copied";
  } catch {
    selectStats();

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }

    els.copyStatus.textContent =
      copied
        ? "Copied"
        : "Text selected — choose Copy in your browser.";
  }
}

function sendStatsViaForm() {
  if (!STATS_ENTRY_ID) return;
  const url = FEEDBACK_URL + "?usp=pp_url&entry." + STATS_ENTRY_ID + "=" + encodeURIComponent(statsText());
  window.open(url, "_blank", "noopener,noreferrer");
}

function renderCredits() {
  els.creditsList.replaceChildren();

  for (const puzzle of state.puzzles) {
    const item = node("li");

    item.append(
      node(
        "strong",
        "",
        `${puzzle.title || puzzle.id} — ${puzzle.id}`
      )
    );

    item.append(
      node("span", "", `Picture A: ${puzzle.imageA}`)
    );

    item.append(
      node("span", "", `Picture B: ${puzzle.imageB}`)
    );

    item.append(
      node(
        "span",
        "",
        `Creator: ${puzzle.credit?.author || "Not provided"}`
      )
    );

    item.append(
      node(
        "span",
        "",
        `Licence: ${puzzle.credit?.license || "Not provided"}`
      )
    );

    item.append(
      node(
        "span",
        "",
        `Source: ${puzzle.credit?.source_url || "Not provided"}`
      )
    );

    els.creditsList.append(item);
  }
}

function openCredits() {
  requireGrown(() => {
    renderCredits();
    showView("creditsView");
  });
}

function openFeedback() {
  requireGrown(() => {
    window.open(
      FEEDBACK_URL,
      "_blank",
      "noopener,noreferrer"
    );
  });
}

function openClearBoardsDialog() {
  requireGrown(() => {
    els.creditsConfirmDialog.showModal();
  });
}

function clearBoards() {
  closeDialogIfOpen(els.creditsConfirmDialog);

  if (state.leaderboardStore.clear()) {
    state.counters.clearedLevels = [];
    if (!isPipOutfitUnlockedForCounters(state.counters.pipOutfit, state.counters)) {
      state.counters.pipOutfit = "none";
    }
    persistCounters();
    if (typeof window.renderPipMascots === "function") {
      window.renderPipMascots();
    }
    showStatus("Local leaderboards cleared. Unlocked levels reset.");
  } else {
    showStatus(
      "Leaderboard clearing failed because saving is unavailable.",
      true
    );
  }

  renderGrownArea();
}

function bindUI() {
  const ids = [
    "storageNotice", "appStatus", "homeNav", "tipsNav", "boardsNav", "grownNav", "untimedStars", "timedStars",
    "modeUntimed", "modeTimed", "categoryChoices", "levelOrderNote", "homeDifferenceCopy", "tipsDifferenceCount",
    "playNowButton", "dailyButton", "dailyStreak", "tomorrowTeaser", "sendStatsButton", "gateQuestion", "imageInstructions",
    "homeLevelsButton", "resultLevelsButton", "levelsDialog", "levelsClose", "levelChoices", "testUnlockButton",
    "playMoreWrap", "playMoreButton", "playMoreMenu", "menuTipsButton", "revealStatus",
    "stickerBookButton", "stickerBookView", "stickerGrid", "stickerBackButton", "resultStickerButton", "dailyStickerMessage", "duelButton", "duelClock", "duelComparison",
    "gameModeLabel", "puzzleHeading", "puzzleTitle", "levelCount", "foundCount",
    "scoreMetric", "scoreCount", "timerPanel", "timerText", "timerTrack", "timerFill",
    "imageA", "imageB", "imageStageA", "imageStageB", "tapSurfaceA", "tapSurfaceB",
    "marksA", "marksB", "glowA", "glowB", "gameMessage", "missingImagesNotice",
    "hintButton", "hintCooldownLabel", "revealButton", "stopButton", "totalFinds",
    "totalMisses", "totalHints", "totalCleared", "betweenSummary", "betweenScore",
    "nextLevelButton", "betweenHomeButton", "resultEyebrow", "resultHeading",
    "resultDescription", "resultScore", "resultLevel", "resultFinds", "resultCleared",
    "resultMisses", "resultHints", "resultEligibility", "resultSaveButton", "playAgainButton",
    "resultHomeButton", "boardsBackButton", "boardUntimed", "boardTimed", "dailyDateLabel",
    "allTimeBoard", "dailyBoard", "grownBackButton", "currentNickname", "statsText",
    "copyStatsButton", "copyStatus", "changeNicknameButton", "creditsButton", "feedbackButton",
    "clearBoardsButton", "creditsBackButton", "creditsList", "gateDialog", "gateClose",
    "gateMessage", "tipsDialog", "tipsClose", "tipsDone", "saveDialog", "saveClose",
    "saveSummary", "saveNickname", "saveConfirm", "saveChangeName", "saveSkip",
    "nicknameDialog", "nicknameClose", "adjectiveChoices", "animalChoices", "nicknameNumber",
    "nicknamePreview", "numberDown", "numberUp", "nicknameConfirm", "creditsConfirmDialog",
    "clearClose", "clearConfirm", "clearCancel"
  ];

  for (const id of ids) {
    els[id] = $(id);
    if (!els[id]) {
      throw new Error(`Missing required element: ${id}`);
    }
  }

  els.homeNav.addEventListener("click", returnHome);
  els.tipsNav.addEventListener("click", () => {
    if (typeof window.openDemoOverlay === "function") {
      window.openDemoOverlay(null, els.tipsNav);
    } else {
      openTips();
    }
  });
  els.boardsNav.addEventListener("click", showBoards);
  els.grownNav.addEventListener("click", openGrownArea);

  // Mode tiles select the chosen mode and start play immediately (v14.3).
  els.modeUntimed.addEventListener("click", () => {
    if (state.view !== "homeView") return;
    chooseMode("untimed");
    playNow();
  });
  els.modeTimed.addEventListener("click", () => {
    if (state.view !== "homeView") return;
    chooseMode("timed");
    playNow();
  });

  for (const difficulty of ["easy", "medium", "hard"]) {
    $("difficulty" + difficulty[0].toUpperCase() + difficulty.slice(1))
      .addEventListener("click", () => chooseDifficulty(difficulty));
  }
  els.dailyButton.addEventListener("click", startDaily);
  const cardDailyBtn = document.querySelector("[data-v145-daily-button]");
  if (cardDailyBtn) {
    cardDailyBtn.addEventListener("click", startDaily);
  }
  const cardDailyThumb = document.querySelector("[data-v145-daily-thumb]");
  if (cardDailyThumb) {
    cardDailyThumb.addEventListener("click", startDaily);
    cardDailyThumb.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
      event.preventDefault();
      startDaily();
    });
  }
  els.stickerBookButton.addEventListener("click", openStickerBook);
  els.resultStickerButton.addEventListener("click", openStickerBook);
  els.stickerBackButton.addEventListener("click", closeStickerBook);
  els.duelButton.addEventListener("click", startFamilyDuel);
  els.homeLevelsButton.addEventListener("click", () => requireGrown(() => openLevelsPicker({ viewer: true })));
  els.resultLevelsButton.addEventListener("click", () => openLevelsPicker({ viewer: false }));
  els.levelsClose.addEventListener("click", () => closeDialogIfOpen(els.levelsDialog));
  els.testUnlockButton.addEventListener("click", toggleTestUnlock);

  els.tapSurfaceA.addEventListener(
    "click",
    event => tapImage(event, "A")
  );

  els.tapSurfaceB.addEventListener(
    "click",
    event => tapImage(event, "B")
  );

  // Keep FIX-8 menu ordering, click-through protection and two-tap end confirmation.
  const revealLine = node("div", "reveal-menu-line");
  revealLine.append(els.revealButton, els.revealStatus);
  els.playMoreMenu.append(els.menuTipsButton, revealLine, els.stopButton);
  els.stopButton.setAttribute("aria-live", "polite");
  els.playMoreButton.addEventListener("click", togglePlayMore);
  els.menuTipsButton.addEventListener("click", openTips);
  document.addEventListener("pointerdown", event => {
    if (!state.playMoreOpen || els.playMoreWrap.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    state.suppressNextClick = true;
    window.clearTimeout(state.suppressClickHandle);
    state.suppressClickHandle = window.setTimeout(() => {
      state.suppressNextClick = false;
      state.suppressClickHandle = null;
    }, 400);
    closePlayMore();
  }, true);
  document.addEventListener("click", event => {
    if (!state.suppressNextClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.suppressNextClick = false;
    window.clearTimeout(state.suppressClickHandle);
    state.suppressClickHandle = null;
  }, true);
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !state.playMoreOpen) return;
    event.preventDefault();
    closePlayMore(true);
  });
  els.hintButton.addEventListener("click", useHint);
  els.revealButton.addEventListener("click", revealAll);
  els.stopButton.addEventListener("click", confirmEndRun);

  els.nextLevelButton.addEventListener(
    "click",
    nextLevel
  );

  els.betweenHomeButton.addEventListener(
    "click",
    returnHome
  );

  els.resultSaveButton.addEventListener(
    "click",
    openSavePrompt
  );

  els.playAgainButton.addEventListener(
    "click",
    () => {
      if (["daily", "duel"].includes(state.run?.kind)) {
        returnHome();
      } else if (state.run?.kind === "challenge" && typeof window.retryActiveChallenge === "function") {
        window.retryActiveChallenge();
      } else {
        newRun();
      }
    }
  );

  els.resultHomeButton.addEventListener(
    "click",
    returnHome
  );

  els.boardsBackButton.addEventListener(
    "click",
    returnHome
  );

  els.boardUntimed.addEventListener(
    "click",
    () => chooseBoardMode("untimed")
  );

  els.boardTimed.addEventListener(
    "click",
    () => chooseBoardMode("timed")
  );

  els.grownBackButton.addEventListener(
    "click",
    backFromGrown
  );

  els.changeNicknameButton.addEventListener(
    "click",
    openNicknamePicker
  );

  els.copyStatsButton.addEventListener(
    "click",
    copyStats
  );
  els.sendStatsButton.addEventListener("click", sendStatsViaForm);

  els.creditsButton.addEventListener(
    "click",
    openCredits
  );

  els.feedbackButton.addEventListener(
    "click",
    openFeedback
  );

  els.clearBoardsButton.addEventListener(
    "click",
    openClearBoardsDialog
  );

  els.creditsBackButton.addEventListener(
    "click",
    () => {
      renderGrownArea();
      showView("grownView");
    }
  );

  els.gateClose.addEventListener("click", closeGate);

  els.gateDialog
    .querySelectorAll(".answer-button")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => answerGate(Number(button.dataset.answer))
      );
    });

  els.gateDialog.addEventListener(
    "cancel",
    () => {
      state.pendingGrownAction = null;
      window.clearTimeout(state.gateUnlockHandle);
      state.lastFrameAt = null;
    }
  );

  els.tipsClose.addEventListener(
    "click",
    closeTips
  );

  els.tipsDone.addEventListener(
    "click",
    closeTips
  );

  els.tipsDialog.addEventListener(
    "close",
    () => {
      state.tipsOpen = false;
      state.lastFrameAt = null;
    }
  );

  els.saveClose.addEventListener(
    "click",
    () => closeDialogIfOpen(els.saveDialog)
  );

  els.saveDialog.addEventListener(
    "cancel",
    () => {
      state.savePrompted = true;
    }
  );

  els.saveChangeName.addEventListener(
    "click",
    openNicknamePicker
  );

  els.saveConfirm.addEventListener(
    "click",
    saveScore
  );

  els.saveSkip.addEventListener(
    "click",
    skipNicknameForSession
  );

  els.nicknameClose.addEventListener(
    "click",
    () => closeDialogIfOpen(els.nicknameDialog)
  );

  els.numberDown.addEventListener(
    "click",
    () => {
      state.nicknameDraft.number =
        clamp(state.nicknameDraft.number - 1, 1, 99);
      renderNicknamePicker();
    }
  );

  els.numberUp.addEventListener(
    "click",
    () => {
      state.nicknameDraft.number =
        clamp(state.nicknameDraft.number + 1, 1, 99);
      renderNicknamePicker();
    }
  );

  els.nicknameConfirm.addEventListener(
    "click",
    finishNicknamePicker
  );

  els.clearClose.addEventListener(
    "click",
    () => closeDialogIfOpen(els.creditsConfirmDialog)
  );

  els.clearCancel.addEventListener(
    "click",
    () => closeDialogIfOpen(els.creditsConfirmDialog)
  );

  els.clearConfirm.addEventListener(
    "click",
    clearBoards
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      state.lastFrameAt = null;
    }
  );

  window.addEventListener(
    "pagehide",
    () => {
      if (
        state.run &&
        !state.run.finalized
      ) {
        finalizeCounters(state.run);
      }
    }
  );

  window.addEventListener(
    "resize",
    () => {
      if (
        state.run &&
        state.view === "gameView"
      ) redrawRings();
    }
  );

  buildWordPicker(
    els.adjectiveChoices,
    ADJECTIVES,
    "adjective"
  );

  buildWordPicker(
    els.animalChoices,
    ANIMALS,
    "animal"
  );

  chooseMode("untimed");
  els.sendStatsButton.hidden = !STATS_ENTRY_ID;
  renderNicknamePicker();
}

function init() {
  bindUI();
  loadStorage();
  chooseDifficulty(state.selectedDifficulty);
  void loadCatalog();
  showView("homeView");
}

document.addEventListener(
  "DOMContentLoaded",
  init
);
