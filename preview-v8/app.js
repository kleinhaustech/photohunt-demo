"use strict";

const FEEDBACK_URL = "https://docs.google.com/forms/d/e/1FAIpQLSc-AHGMyY7ClF_b9Zall5920Ff4I4zjLPJo9zkaXubYooSoDA/viewform";
const COUNTERS_KEY = "sd_counters_v3";
const LEADERBOARD_KEY = "sd_leaderboard_v2";
const LEGACY_LEADERBOARD_KEY = "sd_leaderboard_v1";
const REMOTE_LEADERBOARDS_ENABLED = false;
const STATS_ENTRY_ID = "";
const LEVEL_ORDER = Object.freeze(["kids-04", "kids-03", "kids-01", "kids-06", "kids-10", "kids-02", "kids-09", "kids-08", "kids-07", "kids-05"]);
const LEVEL_SECONDS = Object.freeze([90, 90, 90, 84, 78, 84, 72, 66, 60, 54]);
const GATE_DELAY_MIN = 6;
const GATE_DELAY_MAX = 9;
const GATE_DELAY_MS = 2000;
const MASH_WINDOW_MS = 1500;
const MASH_COOLDOWN_MS = 800;
const HINT_INTERVAL_MS = 20000;
const REVEAL_NO_FIND_MS = 60000;
const DAILY_KEEP_DAYS = 7;
const TOP_N = 5;

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

const els = {};
const state = {
  puzzles: [],
  categories: [],
  selectedMode: "untimed",
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
  stickerReturnView: "homeView",
  playMoreOpen: false
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
    stickers: []
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
  out.stickers = uniqueDays(source.stickers).slice(-60);
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
    score: safeInt(candidate.score)
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
    const rawLegacy = safeJSON(window.localStorage.getItem(LEGACY_LEADERBOARD_KEY));

    state.counters = normalizeCounters(rawCounters);

    const normalizedBoards = normalizeBoards(rawBoards);
    if (!normalizedBoards.nickname) {
      normalizedBoards.nickname = findLegacyNickname(rawLegacy);
    }

    window.localStorage.setItem(COUNTERS_KEY, JSON.stringify(state.counters));
    window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(normalizedBoards));
    window.localStorage.removeItem(LEGACY_LEADERBOARD_KEY);

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
    window.localStorage.setItem(COUNTERS_KEY, JSON.stringify(state.counters));
    return true;
  } catch {
    reportStorageFailure();
    return false;
  }
}

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

    this.data.allTime[mode] = rankEntries(
      [...this.data.allTime[mode], clean],
      mode
    );

    if (!this.data.daily[day]) {
      this.data.daily[day] = { untimed: [], timed: [] };
    }

    this.data.daily[day][mode] = rankEntries(
      [...this.data.daily[day][mode], clean],
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

function showStatus(message, warning = false) {
  els.appStatus.hidden = !message;
  els.appStatus.textContent = message || "";
  els.appStatus.classList.toggle("warning", warning);
}

function showView(id) {
  for (const name of [
    "homeView", "gameView", "betweenView", "resultView",
    "boardsView", "grownView", "creditsView", "stickerBookView"
  ]) {
    $(name).hidden = name !== id;
  }
  state.view = id;
  if (id !== "gameView") closePlayMore();
  document.body.classList.toggle("sticker-book-screen", id === "stickerBookView");
  document.body.classList.toggle("playing-screen", id === "gameView");
  document.body.classList.toggle("home-screen", id === "homeView");
  document.body.classList.remove("theme-neutral", "theme-timed", "theme-untimed");
  document.body.classList.add(id === "gameView" || id === "betweenView" || id === "resultView" ?
    (state.run?.mode === "timed" ? "theme-timed" : "theme-untimed") : "theme-neutral");
  window.scrollTo({ top: 0, behavior: "instant" });
}

function labelForCategory(id) {
  return id === "all"
    ? "All"
    : (state.categories.find(cat => cat.id === id)?.label || "All");
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
}

function chooseCategory(category) {
  if (
    category !== "all" &&
    !state.categories.some(c => c.id === category)
  ) return;

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
  els.startButton.disabled = count === 0;
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
    button.addEventListener("click", () => chooseCategory(category.id));
    els.categoryChoices.append(button);
  }
  chooseCategory("all");
}

function renderTimedBest() {
  if (!els.modeTimed || !state.counters) return;
  const summary = els.modeTimed.querySelector(".choice-description");
  if (!summary) return;
  const best = state.counters.timed;
  summary.textContent = `Always starts at Level 1 · Best level ${best.bestLevel} · Best score ${best.bestScore}`;
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

function renderLevelsPicker() {
  els.levelChoices.replaceChildren();
  const unlocked = unlockedLevelIndices();
  for (const [index, id] of LEVEL_ORDER.entries()) {
    const puzzle = state.puzzles.find(p => p.id === id && !p.mirrored);
    const allowed = unlocked.has(index) && Boolean(puzzle);
    const button = node("button", "level-choice", `${allowed ? "" : "🔒 "}Level ${index + 1} · ${puzzle?.title || "Locked"}`);
    button.type = "button";
    button.disabled = !allowed;
    button.setAttribute("aria-label", allowed ? `Play Level ${index + 1}: ${puzzle.title}` : `Level ${index + 1} locked`);
    if (allowed) button.addEventListener("click", () => startPickedLevel(index));
    els.levelChoices.append(button);
  }
}

function openLevelsPicker() {
  if (!state.puzzles.length) return;
  renderLevelsPicker();
  els.levelsDialog.showModal();
}

function startPickedLevel(index) {
  if (!Number.isInteger(index) || !unlockedLevelIndices().has(index)) return;
  closeDialogIfOpen(els.levelsDialog);
  chooseMode("untimed");
  chooseCategory("all");
  newRun({startIndex:index});
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

function filteredPuzzles() {
  return state.puzzles.filter(p => !p.mirrored && LEVEL_ORDER.includes(p.id) &&
    (state.selectedCategory === "all" || p.category === state.selectedCategory))
    .sort((a,b) => LEVEL_ORDER.indexOf(a.id) - LEVEL_ORDER.indexOf(b.id));
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
    if (!Array.isArray(entry.differences) || entry.differences.length !== 5) continue;
    if (!(entry.width > 0 && entry.height > 0)) continue;
    const sourceId = mirrored ? entry.mirrorOf : entry.id;
    if (entry.imageA !== `img/${sourceId}-a.jpg` || entry.imageB !== `img/${sourceId}-b.jpg`) continue;
    if (!entry.differences.every(d => Number.isFinite(d.x) && Number.isFinite(d.y) &&
      Number.isFinite(d.r) && d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= 1 && d.r > 0)) continue;
    seen.add(entry.id);
    puzzles.push(entry);
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
  buildCategories();
  renderDailyCard();
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
    els.startButton.disabled = true;
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
  return Math.max(45, LEVEL_SECONDS[globalLevelIndex(puzzle)]);
}
function levelBand(puzzle) {
  const index = globalLevelIndex(puzzle);
  return index < 3 ? 0 : index < 7 ? 1 : 2;
}
function hintRechargeMs(puzzle) {
  return [20000, 25000, 30000][levelBand(puzzle)];
}
function timedHintLimit(puzzle) {
  return [3, 2, 1][levelBand(puzzle)];
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

function closePlayMore() {
  if (!els.playMoreMenu || !els.playMoreButton) return;
  state.playMoreOpen = false;
  els.playMoreMenu.hidden = true;
  els.playMoreButton.setAttribute("aria-expanded", "false");
}

function togglePlayMore() {
  if (!state.run || state.view !== "gameView") return;
  state.playMoreOpen = !state.playMoreOpen;
  els.playMoreMenu.hidden = !state.playMoreOpen;
  els.playMoreButton.setAttribute("aria-expanded", String(state.playMoreOpen));
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
  const slot = node("div", `sticker-slot${tomorrow ? " tomorrow" : ""}${mirrored ? " is-mirrored" : ""}`);
  const circle = node("span", "sticker-circle");
  const picture = node("img", "sticker-image");
  const difference = puzzle.differences[0];
  // Fix 3 M1: position the unflipped source coordinates exactly at the circle's
  // 36px center. Flip the cropped circle as a whole for mirrored Daily puzzles.
  // This keeps the source difference at the visual center without double flips.
  const imageWidth = 144;
  const imageHeight = imageWidth * puzzle.height / puzzle.width;
  picture.style.width = `${imageWidth}px`;
  picture.style.height = `${imageHeight}px`;
  picture.style.left = `${36 - difference.x * imageWidth}px`;
  picture.style.top = `${36 - difference.y * imageHeight}px`;
  picture.src = puzzle.imageA;
  picture.alt = tomorrow ? "Silhouette of tomorrow's sticker" : `Sticker earned ${day}`;
  circle.append(picture);
  slot.append(circle);
  if (tomorrow) slot.append(node("span", "sticker-question", "?"));
  slot.append(node("span", "sticker-label", tomorrow ? "Tomorrow's sticker" : day));
  els.stickerGrid.append(slot);
}

function openStickerBook() {
  state.stickerReturnView = state.view === "resultView" ? "resultView" : "homeView";
  renderStickerBook();
  showView("stickerBookView");
}

function closeStickerBook() {
  showView(state.stickerReturnView === "resultView" && state.run?.finalized ? "resultView" : "homeView");
}

function duelTime(ms) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function startFamilyDuel() {
  const source = state.lastDailyDuel;
  if (!source || source.day !== dateKey()) return;
  newRun({duel: true, puzzle: source.puzzle, childElapsedMs: source.childElapsedMs});
}

function renderDailyCard() {
  if (!els.dailyButton) return;
  const puzzle = dailyPuzzle();
  const done = state.counters && state.counters.daily.lastDate === dateKey();
  els.dailyButton.disabled = !puzzle || done;
  els.dailyButton.textContent = done ? "Back tomorrow!" : "Daily Hunt";
  const streak = state.counters?.daily.streak || 0;
  els.dailyStreak.hidden = streak < 1;
  els.dailyStreak.textContent = streak > 0 ? `🔥 ${streak}-day streak` : "";
  els.stickerBookButton.textContent = `Stickers: ${state.counters?.stickers?.length || 0} ›`;
}
function playNow() {
  chooseMode("untimed");
  chooseCategory("all");
  newRun();
}
function startDaily() {
  const today = dateKey();
  const puzzle = dailyPuzzle(today);
  if (!puzzle || state.counters.daily.lastDate === today) return;
  newRun({daily:true, puzzle});
}

function newRun(options = {}) {
  const daily = options.daily === true;
  const duel = options.duel === true;
  const mode = daily || duel ? "untimed" : (Number.isInteger(options.startIndex) ? "untimed" : state.selectedMode);
  const list = duel ? [options.puzzle] : daily ? [options.puzzle || dailyPuzzle()]
    : mode === "timed" || Number.isInteger(options.startIndex)
      ? state.puzzles.filter(p => !p.mirrored && LEVEL_ORDER.includes(p.id))
        .sort((a,b) => LEVEL_ORDER.indexOf(a.id) - LEVEL_ORDER.indexOf(b.id))
      : filteredPuzzles();
  if (!list.length || !list[0]) return;
  leaveActiveRun();
  if (!daily && Number.isInteger(options.startIndex) &&
    (!unlockedLevelIndices().has(options.startIndex) || options.startIndex < 0 || options.startIndex >= list.length)) return;
  const firstAttempt = !duel && !state.counters.firstPuzzle && !state.counters.firstPlay && !state.counters.firstOverall;
  state.run = {
    mode, kind: duel ? "duel" : daily ? "daily" : "levels", category: duel || daily || mode === "timed" || Number.isInteger(options.startIndex) ? "all" : state.selectedCategory,
    list, levelIndex: mode === "timed" || daily ? 0 : (options.startIndex || 0), phase:"loading", found:new Set(), levelsCleared:0,
    totalFinds:0, totalMisses:0, totalHints:0, score:0, timeRemaining:0, timeLimit:0,
    missTimes:[], cooldownUntil:0, mashed:false, highMisses:false, finalized:false, revealed:false,
    hintAvailable:true, hintElapsedMs:0, hintUses:0, lastFindAt:null, noFindElapsedMs:0,
    modeFirstAttempt: !duel && !state.counters[mode].firstPuzzleStarted,
    initialOverall: !duel && !state.counters.firstOverall, firstLevelFinished:false,
    firstAttempt, firstLevelFlagged:false, firstLevelMisses:0, levelMisses:0,
    coachEligible: firstAttempt && !daily && list[0].id === "kids-04",
    coachElapsedMs:0, coachLastAt:0, firstFindMade:false,
    betweenElapsedMs:0, betweenShownSecond:0, showTip:true,
    dailyDate: daily ? dateKey() : null,
    testUnlock: state.testSessionFlagged,
    elapsedMs: 0, duelElapsedMs: 0,
    childElapsedMs: duel ? safeInt(options.childElapsedMs) : 0
  };
  if (!duel) recordPlayStart(mode);
  if (firstAttempt) {
    state.counters.firstPuzzle = {mode, puzzleId:list[0].id, finished:false, flagged:false};
    persistCounters();
  }
  state.pendingSaveEntry = null;
  state.savePrompted = false;
  startLevel();
  startFrames();
}

function startLevel() {
  const run = state.run;
  if (!run || run.finalized) return;

  const puzzle = run.list[run.levelIndex];
  if (!puzzle) {
    finishRun("completed");
    return;
  }

  run.phase = "loading";
  run.found = new Set();
  run.missTimes = [];
  run.cooldownUntil = 0;
  run.hintUses = 0;
  run.lastFindAt = null;
  run.firstLevelMisses = 0;
  run.levelMisses = 0;
  run.noFindElapsedMs = 0;
  closePlayMore();
  run.betweenElapsedMs = 0;
  run.timeLimit = levelTime(puzzle);
  run.timeRemaining = run.timeLimit;
  state.lastFrameAt = null;

  els.gameModeLabel.textContent = run.kind === "duel" ? "Family Duel · Untimed" : run.kind === "daily"
    ? "Daily Hunt · Untimed"
    : `${run.mode === "timed" ? "Timed" : "Untimed"} · ${labelForCategory(run.category)}`;
  els.puzzleHeading.textContent = run.kind === "duel" ? "Grown-up’s turn" : run.kind === "daily" ? "Daily Hunt" : `Level ${run.levelIndex + 1}`;
  els.puzzleTitle.textContent = puzzle.title || "Find five differences";
  els.levelCount.textContent = `${run.levelIndex + 1} / ${run.list.length}`;
  els.timerPanel.hidden = run.mode !== "timed";
  els.duelClock.hidden = run.kind !== "duel";
  els.scoreMetric.hidden = run.mode !== "timed";
  els.missingImagesNotice.hidden = true;

  els.imageA.classList.toggle("is-mirrored", puzzle.mirrored === true);
  els.imageB.classList.toggle("is-mirrored", puzzle.mirrored === true);
  els.imageInstructions.hidden = !run.showTip;
  els.imageInstructions.textContent = "Tap a difference in either picture!";
  els.imageA.alt = `Picture A: ${puzzle.title || "puzzle"}`;
  els.imageB.alt = `Picture B: ${puzzle.title || "puzzle"}`;

  const ratio = `${puzzle.width} / ${puzzle.height}`;
  els.imageStageA.style.aspectRatio = ratio;
  els.imageStageB.style.aspectRatio = ratio;

  clearHintsAndMarks();
  updateHUD();
  setGameMessage("Loading pictures…");
  showView("gameView");

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
      if (run.kind !== "duel") {
        state.counters.puzzlesPlayed += 1;
        persistCounters();
      }
      run.coachElapsedMs = 0;
      run.coachLastAt = 0;
      state.lastFrameAt = null;
      setGameMessage("Find all five!");
      updateHUD();
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
  els.revealStatus.textContent = revealRemaining > 0
    ? `Available after ${Math.ceil(revealRemaining / 1000)}s without a find.`
    : "Reveal all ends your run without completion credit.";

  const left = Math.max(0, run.timeRemaining);

  els.timerText.textContent = `${Math.ceil(left)} s`;
  els.timerTrack.setAttribute("aria-valuemax", String(run.timeLimit));
  els.timerTrack.setAttribute("aria-valuenow", String(Math.ceil(left)));
  els.timerFill.style.width =
    `${run.timeLimit ? clamp(left / run.timeLimit, 0, 1) * 100 : 0}%`;

  els.timerPanel.classList.toggle("is-urgent", left <= 15);
  els.timerPanel.classList.toggle("is-warning", left <= 30 && left > 15);
  if (run.kind === "duel") els.duelClock.textContent = duelTime(run.duelElapsedMs);
  document.querySelectorAll(".star-progress .star-slot").forEach((star, i) => {
    star.classList.toggle("filled", i < run.found.size);
  });
}

function setGameMessage(message) {
  els.gameMessage.textContent = message;
}

function canAdvanceClock() {
  return state.run &&
    state.view === "gameView" &&
    state.run.phase === "playing" &&
    !document.hidden &&
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
    run.noFindElapsedMs += delta;
    if (run.kind === "duel") run.duelElapsedMs += delta;
    if (run.mode === "timed") {
      run.timeRemaining = Math.max(0, run.timeRemaining - delta / 1000);
      if (run.timeRemaining <= 0) finishRun("timeout");
    } else if (!run.hintAvailable) {
      run.hintElapsedMs += delta;
      if (run.hintElapsedMs >= hintRechargeMs(run.list[run.levelIndex])) {
        run.hintAvailable = true;
        run.hintElapsedMs = 0;
        setGameMessage("A hint is ready!");
      }
    }
    if (state.run === run && run.coachEligible && !run.firstFindMade) {
      run.coachElapsedMs += delta;
      const interval = Math.floor(run.coachElapsedMs / 15000);
      if (interval > run.coachLastAt) {
        run.coachLastAt = interval;
        const diff = run.list[run.levelIndex].differences.find((_,i) => !run.found.has(i));
        if (diff) {
          if (interval >= 3) pulseFirstFind(diff);
          else glowHint(diff);
        }
      }
    }
    if (state.run === run) updateHUD();
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

function effectiveRadiusPixels(difference, imageWidth) {
  const r = difference.r;
  const fraction = r <= 0.092
    ? Math.min(0.092, Math.max(r + currentSlop(), 0.085))
    : Math.min(r, 0.172);
  return Math.max(fraction * imageWidth, 0.085 * imageWidth, 32);
}

function pickNearestDifference(xPx, yPx, width, height) {
  const run = state.run;
  if (!run) return -1;

  const differences = run.list[run.levelIndex].differences;
  let bestIndex = -1;
  let bestDistance = Infinity;

  differences.forEach((diff, index) => {
    if (run.found.has(index)) return;

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
  if (run.showTip) { run.showTip = false; els.imageInstructions.hidden = true; }

  if (event.detail === 0) {
    setGameMessage(
      "Tap or click the spot you noticed in either picture."
    );
    return;
  }

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
    if (run.mode === "timed") {
      run.timeRemaining = Math.max(
        0,
        run.timeRemaining - 2
      );
    }
    setGameMessage(
      run.mode === "timed"
        ? "Not this one. Minus 2 seconds."
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
    run.phase !== "playing"
  ) return;

  run.found.add(index);
  run.noFindElapsedMs = 0;
  run.totalFinds += 1;

  if (run.mode === "timed") {
    const now = performance.now();
    run.score += run.lastFindAt !== null && now - run.lastFindAt <= 3000 ? 150 : 100;
    run.lastFindAt = now;
  }
  run.firstFindMade = true;
  window.clearTimeout(state.hintGlowHandle);
  els.glowA.replaceChildren();
  els.glowB.replaceChildren();

  const difference =
    run.list[run.levelIndex].differences[index];

  addRing(difference, false);
  setGameMessage(
    `Nice find! ${run.found.size} of 5.`
  );
  updateHUD();

  if (run.found.size === 5) clearLevel();
}

function addRing(difference, revealed) {
  for (const [stage, marks] of [
    [els.imageStageA, els.marksA],
    [els.imageStageB, els.marksB]
  ]) {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const diameter = clamp(
      width * 0.085,
      38,
      65
    );

    const halfX = Math.min(
      diameter / 2,
      width / 2
    );
    const halfY = Math.min(
      diameter / 2,
      height / 2
    );

    const centerX = clamp(
      displayX(difference) * width,
      halfX,
      width - halfX
    );
    const centerY = clamp(
      difference.y * height,
      halfY,
      height - halfY
    );

    const ring = node(
      "span",
      `find-ring${revealed ? " revealed" : ""}`
    );

    ring.style.left = `${centerX}px`;
    ring.style.top = `${centerY}px`;
    ring.style.width = `${diameter}px`;
    ring.style.height = `${diameter}px`;

    marks.append(ring);
  }
}

function redrawRings() {
  const run = state.run;
  if (
    !run ||
    !run.list[run.levelIndex]
  ) return;

  els.marksA.replaceChildren();
  els.marksB.replaceChildren();

  const diffs =
    run.list[run.levelIndex].differences;

  for (const index of run.found) {
    addRing(diffs[index], run.revealed);
  }
}

function pulseFirstFind(difference) {
  window.clearTimeout(state.hintGlowHandle);
  els.glowA.replaceChildren();
  els.glowB.replaceChildren();
  for (const [stage,layer] of [[els.imageStageA,els.glowA],[els.imageStageB,els.glowB]]) {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const diameter = clamp(width * 0.085,38,65);
    const centerX = clamp(displayX(difference) * width, diameter/2, width-diameter/2);
    const centerY = clamp(difference.y * height, diameter/2, height-diameter/2);
    const ring = node("span", "find-ring coaching-pulse");
    ring.style.left = `${centerX}px`;
    ring.style.top = `${centerY}px`;
    ring.style.width = `${diameter}px`;
    ring.style.height = `${diameter}px`;
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
  } else {
    run.timeRemaining = Math.max(
      0,
      run.timeRemaining - 5
    );
  }

  glowHint(
    run.list[run.levelIndex].differences[remaining]
  );

  setGameMessage(
    run.mode === "timed"
      ? "Look in the glowing area. Minus 5 seconds."
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

  run.phase = "between";
  run.levelsCleared += 1;
  const clearedPuzzle = run.list[run.levelIndex];
  if (run.kind === "levels" && !run.testUnlock && !run.mashed && !run.revealed && !run.highMisses &&
    !state.counters.clearedLevels.includes(clearedPuzzle.id)) {
    state.counters.clearedLevels.push(clearedPuzzle.id);
    persistCounters();
  }
  if (run.firstAttempt && !run.testUnlock && run.levelIndex === 0 && state.counters.firstPuzzle) {
    state.counters.firstPuzzle.finished = !state.counters.firstPuzzle.flagged && !run.mashed && !run.revealed;
    persistCounters();
  }

  if (run.levelIndex === 0) {
    run.firstLevelFinished = true;
  }

  if (run.mode === "timed") {
    run.score +=
      Math.floor(run.timeRemaining) * 10;
  }

  updateHUD();

  if (
    run.levelIndex ===
    run.list.length - 1
  ) {
    finishRun("completed");
  } else {
    run.betweenElapsedMs = 0;
    run.betweenShownSecond = 0;
    els.nextLevelButton.textContent = "Next level →";
    els.betweenSummary.textContent =
      `${run.levelsCleared} level${run.levelsCleared === 1 ? "" : "s"} cleared. ${run.totalFinds} differences found so far.`;

    els.betweenScore.textContent =
      run.mode === "timed"
        ? `${run.score} points`
        : "Keep exploring!";

    showView("betweenView");
  }
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

function revealAll() {
  const run = state.run;
  if (
    !run ||
    run.phase !== "playing" ||
    run.noFindElapsedMs < REVEAL_NO_FIND_MS
  ) return;

  closePlayMore();
  run.revealed = true;
  if (run.levelIndex === 0) markFirstPuzzleFlagged();

  run.list[run.levelIndex].differences.forEach(
    (diff, index) => {
      if (!run.found.has(index)) {
        run.found.add(index);
        addRing(diff, true);
      }
    }
  );

  finishRun("revealed");
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
  const daily = state.counters.daily;
  if (daily.lastDate === day) return;
  daily.streak = daily.lastDate === yesterdayOf(day) ? daily.streak + 1 : 1;
  daily.lastDate = day;
  state.counters.stickers = uniqueDays([...state.counters.stickers, day]).slice(-60);
  persistCounters();
  renderDailyCard();
}

function finalizeCounters(run, reason = "stopped") {
  if (run.finalized) return;
  run.finalized = true;
  if (run.kind === "duel") return; // Duel changes no counters, stickers or boards.

  const good =
    !run.mashed && !run.revealed && !run.highMisses;

  const record =
    state.counters[run.mode];

  if (run.mashed) record.mashedRuns += 1;
  if (run.firstAttempt && !run.testUnlock && state.counters.firstPuzzle) {
    const flagged = run.firstLevelFlagged || run.mashed || run.revealed || run.highMisses;
    state.counters.firstPuzzle.flagged = flagged;
    state.counters.firstPuzzle.finished = run.firstLevelFinished && !flagged;
    if (state.counters.firstOverall) state.counters.firstOverall.finished = run.firstLevelFinished && !flagged;
  }

  if (good && !run.testUnlock) {
    record.completed += run.levelsCleared;

    if (
      run.modeFirstAttempt &&
      run.firstLevelFinished
    ) {
      record.firstPuzzleCompleted = true;
    }

    if (run.mode === "timed" && run.kind === "levels") {
      record.bestLevel = Math.max(record.bestLevel, globalLevelIndex(run.list[run.levelIndex]) + 1);
      if (["timeout", "completed"].includes(reason)) {
        record.bestScore = Math.max(record.bestScore, run.score);
      }
    }

    if (
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
  return state.storageOkay && !run.testUnlock && run.kind !== "daily" && run.kind !== "duel" &&
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
    score: run.score
  };
}

function finishRun(reason) {
  const run = state.run;
  if (
    !run ||
    run.finalized
  ) return;

  closePlayMore();
  run.phase = "ended";
  const eligibleDaily = run.kind === "daily" && reason === "completed" && !run.mashed && !run.revealed && !run.highMisses && !run.testUnlock;
  if (eligibleDaily) state.lastDailyDuel = {day:run.dailyDate,puzzle:run.list[0],childElapsedMs:run.elapsedMs};
  finalizeCounters(run, reason);
  ++state.imageGeneration;
  window.clearTimeout(state.hintGlowHandle);

  els.resultEyebrow.textContent =
    reason === "timeout"
      ? "Time is up"
      : "Run complete";

  els.resultHeading.textContent =
    run.kind === "duel" ? "Family Duel complete!" : run.kind === "daily" && reason === "completed" ? "Back tomorrow!" : reason === "timeout"
      ? "Game over!"
      : reason === "completed"
        ? "You found them all!"
        : reason === "revealed"
          ? "All differences revealed"
          : "Run finished";

  els.resultDescription.textContent =
    run.kind === "duel" ? "A family turn just for fun — no scores or counters were changed." : run.kind === "daily" && reason === "completed" ? `Daily Hunt complete! 🔍 ${state.counters.daily.streak} days` : reason === "timeout"
      ? "Nice effort! Here's how far you got."
      : reason === "completed"
        ? "Every level in this category is complete."
        : reason === "revealed"
          ? "Revealing answers ends this run without saving it."
          : "You can play again any time.";

  els.resultScore.textContent =
    run.kind === "duel" ? `Fox ${duelTime(run.childElapsedMs)} vs Owl ${duelTime(run.duelElapsedMs)}` : run.mode === "timed"
      ? `${run.score} points`
      : `${run.levelsCleared} levels cleared`;

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

  const eligible =
    leaderboardEligible(run, reason);

  renderTomorrowTeaser(run.kind === "daily" && reason === "completed");
  els.dailyStickerMessage.hidden = !eligibleDaily;
  els.resultStickerButton.hidden = !eligibleDaily;
  els.duelButton.hidden = !eligibleDaily;
  if (eligibleDaily) els.duelButton.textContent = `Grown-up's turn: beat ${duelTime(run.elapsedMs)}?`;
  els.duelComparison.hidden = true; // Fix 3 INFO: present Duel comparison once, in resultScore.
  els.resultEligibility.textContent =
    run.kind === "duel" ? "Family Duel turns do not change saved scores or statistics." : run.mashed
      ? "This run was not recorded because of rapid repeated misses."
      : run.highMisses
        ? "This run was not recorded because of repeated misses."
      : run.revealed
        ? "Reveal-all runs are not recorded."
        : !state.storageOkay
          ? "Saving is unavailable; you can still play."
          : eligible
            ? "You can save this run to your device's leaderboard."
            : "This run wasn't added to a leaderboard.";

  state.pendingSaveEntry =
    eligible ? makeEntry(run) : null;

  state.savePrompted = false;

  els.resultSaveButton.hidden =
    !eligible || state.nicknameSkipped;

  showView("resultView");
  els.playAgainButton.textContent = ["daily", "duel"].includes(run.kind) ? "Back to Home" : "Play again";
  els.resultLevelsButton.hidden = false;

  if (
    eligible &&
    !state.nicknameSkipped
  ) {
    window.setTimeout(() => {
      if (
        state.view === "resultView" &&
        state.pendingSaveEntry &&
        !state.savePrompted
      ) {
        openSavePrompt();
      }
    }, 250);
  }
}

function renderTomorrowTeaser(visible) {
  els.tomorrowTeaser.replaceChildren();
  els.tomorrowTeaser.hidden = !visible;
  if (!visible) return;
  const tomorrow = dailyPuzzle(nextDay(dateKey()));
  if (!tomorrow) return;
  els.tomorrowTeaser.append(node("p", "helper-text", "Tomorrow's picture — a little sneak peek:"));
  const picture = node("img", "daily-teaser-image");
  picture.src = tomorrow.imageA;
  picture.alt = "Blurred preview of tomorrow's puzzle";
  if (tomorrow.mirrored) picture.classList.add("is-mirrored");
  els.tomorrowTeaser.append(picture);
}

function leaveActiveRun() {
  if (
    state.run &&
    !state.run.finalized
  ) {
    state.run.phase = "ended";
    finalizeCounters(state.run);
  }

  state.run = null;
  state.pendingSaveEntry = null;
  ++state.imageGeneration;
  clearHintsAndMarks();
  state.lastFrameAt = null;
}

function returnHome() {
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
}

function randomGateInt(min, max) {
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

  const run = state.run;
  if (!run) return;

  els.saveSummary.textContent =
    run.mode === "timed"
      ? `${run.score} points · Level ${run.levelIndex + 1} · ${run.totalFinds} finds`
      : `${run.levelsCleared} levels cleared · ${run.totalMisses} misses`;

  const nickname =
    state.leaderboardStore.getNickname();

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
    state.leaderboardStore.getNickname();

  if (!name) {
    openNicknamePicker();
    return;
  }

  const entry = {
    ...state.pendingSaveEntry,
    nickname: name
  };

  const success = state.leaderboardStore.add(
    state.run.mode,
    entry
  );

  closeDialogIfOpen(els.saveDialog);

  if (success) {
    state.pendingSaveEntry = null;
    els.resultSaveButton.hidden = true;
    els.resultEligibility.textContent =
      `Saved as ${name} on this device.`;
  } else {
    els.resultEligibility.textContent =
      "Couldn't save the score. You can still play.";
  }
}

function skipNicknameForSession() {
  state.nicknameSkipped = true;
  state.pendingSaveEntry = null;
  els.resultSaveButton.hidden = true;
  els.resultEligibility.textContent =
    "Skipped saving for this session.";
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
        ? `${entry.score} pts · Level ${entry.level}`
        : `${entry.levelsCleared} levels · ${entry.misses} misses`;

    li.append(
      left,
      node("span", "entry-score", result)
    );

    container.append(li);
  });
}

function showBoards() {
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
    persistCounters();
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
    "modeUntimed", "modeTimed", "categoryChoices", "levelOrderNote", "startButton",
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
  els.tipsNav.addEventListener("click", openTips);
  els.boardsNav.addEventListener("click", showBoards);
  els.grownNav.addEventListener("click", openGrownArea);

  els.modeUntimed.addEventListener(
    "click",
    () => chooseMode("untimed")
  );

  els.modeTimed.addEventListener(
    "click",
    () => chooseMode("timed")
  );

  els.startButton.addEventListener("click", () => newRun());
  els.playNowButton.addEventListener("click", playNow);
  els.dailyButton.addEventListener("click", startDaily);
  els.stickerBookButton.addEventListener("click", openStickerBook);
  els.resultStickerButton.addEventListener("click", openStickerBook);
  els.stickerBackButton.addEventListener("click", closeStickerBook);
  els.duelButton.addEventListener("click", startFamilyDuel);
  els.homeLevelsButton.addEventListener("click", openLevelsPicker);
  els.resultLevelsButton.addEventListener("click", openLevelsPicker);
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

  els.playMoreButton.addEventListener("click", togglePlayMore);
  els.menuTipsButton.addEventListener("click", openTips);
  document.addEventListener("pointerdown", event => {
    if (state.playMoreOpen && !els.playMoreWrap.contains(event.target)) closePlayMore();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && state.playMoreOpen) closePlayMore();
  });
  els.hintButton.addEventListener("click", useHint);
  els.revealButton.addEventListener("click", revealAll);
  els.stopButton.addEventListener(
    "click",
    () => finishRun("stopped")
  );

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
    () => ["daily", "duel"].includes(state.run?.kind) ? returnHome() : newRun()
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
  void loadCatalog();
  showView("homeView");
}

document.addEventListener(
  "DOMContentLoaded",
  init
);