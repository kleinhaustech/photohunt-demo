/* Spot the Difference – app.js */
const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSc-AHGMyY7ClF_b9Zall5920Ff4I4zjLPJo9zkaXubYooSoDA/viewform';
const STORAGE_KEY = 'sd_counters_v3';
const STORAGE_KEY_V1 = 'sd_counters_v1';

// ---------- State ----------
let puzzlesData = null;
let counters = null;
let storageBlocked = false;
let grownupsUnlocked = false; // session only (in memory)
let currentMode = null;
let currentPuzzle = null;
let foundSet = new Set();
let revealedSet = new Set();
let missTimes = [];
let missMsgIndex = 0;
let ignoreUntil = 0;
let hintIdleTimer = null;
let quadGlowTimer = null;
let celebrationTimer = null;
let adultTimer = null;
let adultTimeLeft = 90;
let adultHintsLeft = 2;
let adultMisses = 0;
let coachStep = 0;
let audioCtx = null;
let imagesLoaded = false;
let puzzleOver = false;
let puzzleLoadSeq = 0;

const KIDS_MISS_MESSAGES = [
  'Ooh, close! Keep looking',
  'Try another spot!',
  'Almost! Look closely at both pictures',
  'Not quite there—keep exploring!'
];

const COACH_STEPS = [
  'Look at both pictures',
  "Tap anything that's different",
  'Find all 5 to win!'
];

function isReducedMotion() {
  try {
    return Boolean(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch (e) {
    return false;
  }
}

// ---------- Storage ----------
function showStorageNotice() {
  storageBlocked = true;
  const el = document.getElementById('storage-notice');
  if (el && el.hidden) {
    el.hidden = false;
    layoutImages();
  }
}

function makeEmptyCounters() {
  return {
    v: 3,
    firstPlay: null,
    days: [],
    sound: false,
    modes: {
      kids: {
        started: 0,
        completed: 0,
        firstPuzzleId: null,
        firstPuzzleCompleted: false,
        done: {},
        onboarded: false
      },
      adult: {
        started: 0,
        completed: 0,
        firstPuzzleId: null,
        firstPuzzleCompleted: false,
        done: {},
        onboarded: false
      }
    },
    reports: []
  };
}

function normalizeCounters(obj) {
  const base = makeEmptyCounters();
  if (!obj || typeof obj !== 'object') return base;
  base.firstPlay = typeof obj.firstPlay === 'string' ? obj.firstPlay : null;
  base.days = Array.isArray(obj.days) ? obj.days.filter(d => typeof d === 'string').slice(-60) : [];
  base.sound = Boolean(obj.sound);
  base.reports = Array.isArray(obj.reports) ? obj.reports.filter(r => typeof r === 'string').slice(-20) : [];

  ['kids', 'adult'].forEach(m => {
    const src = obj.modes && obj.modes[m] ? obj.modes[m] : {};
    base.modes[m] = {
      started: Number(src.started) || 0,
      completed: Number(src.completed) || 0,
      firstPuzzleId: typeof src.firstPuzzleId === 'string' ? src.firstPuzzleId : null,
      firstPuzzleCompleted: Boolean(src.firstPuzzleCompleted),
      done: src.done && typeof src.done === 'object' ? Object.assign({}, src.done) : {},
      onboarded: Boolean(src.onboarded)
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
        // Verify write access as well so blocked setItem is detected immediately
        saveCounters();
        return;
      }
    }
    // Migrate firstPlay and days from v1 if present, leaving v1 untouched
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

// ---------- Screen & Theme Navigation ----------
function clearAllTimers() {
  clearInterval(adultTimer);
  adultTimer = null;
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

  // Strict rule: zero <a href> elements outside Grown-ups area
  if (id !== 'screen-grownups') {
    stripGrownupLinks();
  }
}

function applyTheme(mode) {
  document.body.className =
    mode === 'kids' ? 'theme-kids' : mode === 'adult' ? 'theme-adult' : 'theme-neutral';
}

function sumStars(mode) {
  const done = (counters.modes[mode] && counters.modes[mode].done) || {};
  return Object.values(done).reduce((sum, val) => sum + (Number(val) || 0), 0);
}

// ---------- 1. Home Screen ----------
function renderHome() {
  applyTheme('neutral');
  showScreen('screen-home');
  const kidsStars = sumStars('kids');
  const adultStars = sumStars('adult');
  document.getElementById('home-kids-stars').textContent = kidsStars + ' stars';
  document.getElementById('home-adult-stars').textContent = adultStars + ' stars';
}

// ---------- 2. Picker Screen ----------
function openPicker(mode) {
  currentMode = mode;
  applyTheme(mode);
  showScreen('screen-picker');

  document.getElementById('picker-title').textContent =
    mode === 'kids' ? 'Kids test' : 'Adult test';

  const list = ((puzzlesData && puzzlesData.puzzles) || []).filter(p => p.mode === mode);
  const totalPossible = list.length * 5;
  const collected = sumStars(mode);
  const progEl = document.getElementById('picker-progress');
  if (progEl) {
    progEl.textContent = collected + ' of ' + totalPossible + ' stars collected';
  }

  const grid = document.getElementById('puzzle-grid');
  grid.textContent = '';

  list.forEach((p, idx) => {
    const stars = Math.min(5, Math.max(0, Number(counters.modes[mode].done[p.id]) || 0));
    const isComplete = stars >= 5;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'puzzle-tile' + (isComplete ? ' is-complete' : '');
    btn.setAttribute('role', 'listitem');

    const topRow = document.createElement('div');
    topRow.className = 'tile-top';

    const numBadge = document.createElement('span');
    numBadge.className = 'tile-num';
    numBadge.textContent = '#' + (idx + 1);
    topRow.appendChild(numBadge);

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

    const starsText = document.createElement('div');
    starsText.className = 'stars';
    starsText.textContent = stars + '/5 stars';

    btn.appendChild(topRow);
    btn.appendChild(titleEl);
    btn.appendChild(starBar);
    btn.appendChild(starsText);

    btn.addEventListener('click', () => startPuzzle(p));
    grid.appendChild(btn);
  });

  const playNextBtn = document.getElementById('btn-play-next');
  const nextUnfinished = list.find(p => !(counters.modes[mode].done[p.id] >= 5));
  playNextBtn.textContent = nextUnfinished ? 'Play next' : 'Play again';
  playNextBtn.onclick = () => {
    const target = list.find(p => !(counters.modes[mode].done[p.id] >= 5)) || list[0];
    if (target) startPuzzle(target);
  };
}

// ---------- 3. Game Screen ----------
function startPuzzle(p) {
  puzzleLoadSeq++;
  const seq = puzzleLoadSeq;

  currentPuzzle = p;
  foundSet = new Set();
  revealedSet = new Set();
  missTimes = [];
  ignoreUntil = 0;
  adultMisses = 0;
  adultHintsLeft = 2;
  adultTimeLeft =
    (puzzlesData &&
      puzzlesData.modes &&
      puzzlesData.modes.adult &&
      Number(puzzlesData.modes.adult.timeLimitSec)) ||
    90;
  imagesLoaded = false;
  puzzleOver = false;

  clearAllTimers();

  // Update play counters on start
  const m = counters.modes[currentMode];
  m.started++;
  if (!m.firstPuzzleId) m.firstPuzzleId = p.id;
  addDay();
  saveCounters();

  applyTheme(currentMode);
  showScreen('screen-game');

  document.getElementById('game-title').textContent = p.title;
  renderStars();
  announce(
    currentMode === 'kids'
      ? 'Tap any difference you spot on either picture!'
      : 'Find all 5 differences before time runs out.'
  );

  const confetti = document.getElementById('confetti');
  confetti.textContent = '';
  confetti.hidden = true;

  const resOverlay = document.getElementById('result-overlay');
  resOverlay.hidden = true;
  resOverlay.classList.remove('docked');
  resOverlay.setAttribute('aria-modal', 'true');

  document.getElementById('marks-a').textContent = '';
  document.getElementById('marks-b').textContent = '';
  document.getElementById('quad-a').className = 'quadrant-glow';
  document.getElementById('quad-b').className = 'quadrant-glow';

  setupHud();

  const imgA = document.getElementById('img-a');
  const imgB = document.getElementById('img-b');
  imgA.alt = 'Original picture';
  imgB.alt = 'Changed picture';

  // Pre-size boxes using puzzle aspect ratio so layout is stable immediately
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

  if (currentMode === 'kids') {
    const hint = document.createElement('button');
    hint.type = 'button';
    hint.className = 'hint-btn';
    hint.id = 'btn-hint';
    hint.textContent = 'Hint';
    hint.onclick = giveHint;
    ctrl.appendChild(hint);
  } else {
    const timer = document.createElement('span');
    timer.className = 'timer-display';
    timer.id = 'timer-display';
    timer.textContent = adultTimeLeft + 's';
    ctrl.appendChild(timer);

    const miss = document.createElement('span');
    miss.className = 'miss-count';
    miss.id = 'miss-count';
    miss.textContent = 'Misses: 0';
    ctrl.appendChild(miss);

    const hint = document.createElement('button');
    hint.type = 'button';
    hint.className = 'hint-btn';
    hint.id = 'btn-hint';
    hint.textContent = 'Hint (' + adultHintsLeft + ')';
    hint.onclick = giveHint;
    ctrl.appendChild(hint);
  }
}

function layoutImages() {
  const screenGame = document.getElementById('screen-game');
  if (!screenGame || screenGame.hidden || !currentPuzzle) return;

  const wrap = document.getElementById('images-wrap');
  const hud = document.getElementById('hud');
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
  const natH = (imgA && imgA.naturalHeight) || currentPuzzle.height || 533;
  const aspect = natW / natH;

  const hudH = hud ? hud.getBoundingClientRect().height : 56;
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
    const maxEachH = Math.max(160, Math.floor(vh - hudH - msgH - dockedH - noticeH - padY));

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
    // Stacked vertically: guarantee both images and any docked bar fit without overlap or scrolling
    const padX = 16;
    const gap = 8;
    const padY = 12;
    const maxW = Math.max(160, vw - padX);
    const availH = Math.max(180, vh - hudH - msgH - dockedH - noticeH - padY - gap);
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

// ---------- Tap & Hit Testing ----------
function handleTap(e, img) {
  if (!imagesLoaded || Date.now() < ignoreUntil || puzzleOver) return;
  if (!document.getElementById('coach-overlay').hidden) return;
  if (currentMode === 'adult' && adultTimeLeft <= 0) return;
  if (foundSet.size >= 5) return;

  e.preventDefault();

  const rect = img.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  const diffs = currentPuzzle.differences || [];

  let hit = false;
  for (let i = 0; i < diffs.length; i++) {
    if (foundSet.has(i)) continue;
    const d = diffs[i];
    const thr = currentMode === 'kids' ? Math.max(d.r, 0.045) : d.r;
    const distPx = Math.hypot((x - d.x) * rect.width, (y - d.y) * rect.height);

    if (distPx <= thr * rect.width) {
      foundSet.add(i);
      hit = true;
      clearQuadrantGlow();
      placeMark(i, d, false);
      renderStars(i);
      announce(foundSet.size + ' of 5 found');
      playDing(foundSet.size);
      if (navigator.vibrate) {
        try { navigator.vibrate(30); } catch (err) { /* ignore */ }
      }
      resetHintIdle();

      if (foundSet.size === 5) {
        const completedPuzzleId = currentPuzzle.id;
        const completedMode = currentMode;
        const loadTokenAtWin = puzzleLoadSeq;

        const m = counters.modes[completedMode];
        m.completed++;
        m.done[completedPuzzleId] = 5;
        if (completedPuzzleId === m.firstPuzzleId) {
          m.firstPuzzleCompleted = true;
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
            onAllFound();
          }
        }, 350);
      }
      break;
    }
  }

  if (!hit) {
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
    mark.dataset.r = currentMode === 'kids' ? Math.max(d.r, 0.045) : d.r;
    container.appendChild(mark);
  });
  repositionMarks();
}

function onMiss(e, img) {
  const rect = img.getBoundingClientRect();
  const tapX = e.clientX - rect.left;
  const tapY = e.clientY - rect.top;

  if (currentMode === 'kids') {
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

    const now = Date.now();
    missTimes.push(now);
    missTimes = missTimes.filter(t => now - t < 1500);

    if (missTimes.length >= 3) {
      ignoreUntil = now + 800;
      missTimes = [];
      announce('Take a peek first 👀');
    } else {
      const msg = KIDS_MISS_MESSAGES[missMsgIndex % KIDS_MISS_MESSAGES.length];
      missMsgIndex++;
      announce(msg);
    }
  } else {
    const xmark = document.createElement('div');
    xmark.textContent = '✕';
    xmark.className = 'miss-x';
    xmark.style.left = tapX + 'px';
    xmark.style.top = tapY + 'px';
    img.parentElement.appendChild(xmark);
    setTimeout(() => xmark.remove(), 750);

    adultMisses++;
    const mc = document.getElementById('miss-count');
    if (mc) mc.textContent = 'Misses: ' + adultMisses;
    announce('Miss');
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
  if (currentMode === 'kids' && !puzzleOver && foundSet.size < 5) {
    hintIdleTimer = setTimeout(() => {
      const hintBtn = document.getElementById('btn-hint');
      if (hintBtn && foundSet.size < 5 && !puzzleOver && !isReducedMotion()) {
        hintBtn.classList.add('pulse');
      }
    }, 20000);
  }
}

function giveHint() {
  if (puzzleOver || !imagesLoaded) return;
  if (currentMode === 'adult' && adultTimeLeft <= 0) return;
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

  if (currentMode === 'kids') {
    const btn = document.getElementById('btn-hint');
    if (btn) btn.classList.remove('pulse');

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

    announce('Hint: look in the glowing ' + (labelMap[cls] || 'area'));
  } else {
    if (adultHintsLeft <= 0) return;
    adultHintsLeft--;
    const btn = document.getElementById('btn-hint');
    if (btn) {
      btn.textContent = 'Hint (' + adultHintsLeft + ')';
      if (adultHintsLeft <= 0) btn.disabled = true;
    }

    ['marks-a', 'marks-b'].forEach(id => {
      const container = document.getElementById(id);
      const ring = document.createElement('div');
      ring.className = 'mark hint-ring';
      ring.dataset.x = d.x;
      ring.dataset.y = d.y;
      ring.dataset.r = Math.max(d.r * 1.4, 0.055);
      container.appendChild(ring);
      setTimeout(() => ring.remove(), 2000);
    });
    repositionMarks();
    announce('Hint shown (' + adultHintsLeft + ' left)');
  }
  resetHintIdle();
}

// ---------- Stars, Win & Time-Up ----------
function renderStars() {
  const slots = document.querySelectorAll('.star-slot');
  slots.forEach((s, i) => {
    const shouldFill = i < foundSet.size;
    s.classList.toggle('filled', shouldFill);
  });
}

function isAllKidsDone() {
  if (!puzzlesData || !Array.isArray(puzzlesData.puzzles)) return false;
  const kidsPuzzles = puzzlesData.puzzles.filter(p => p.mode === 'kids');
  if (kidsPuzzles.length < 10) return false;
  const doneMap = counters.modes.kids.done || {};
  const doneCount = kidsPuzzles.filter(p => (Number(doneMap[p.id]) || 0) >= 5).length;
  return doneCount >= kidsPuzzles.length;
}

function openCelebrationScreen() {
  clearAllTimers();
  const cel = document.getElementById('screen-celebration');
  cel.dataset.armedAt = String(Date.now());
  showScreen('screen-celebration');
}

function onAllFound() {
  announce('You found them all!');
  playWinChime();
  showConfetti();

  const timeLimit =
    (puzzlesData &&
      puzzlesData.modes &&
      puzzlesData.modes.adult &&
      Number(puzzlesData.modes.adult.timeLimitSec)) ||
    90;
  const timeUsed = Math.max(1, timeLimit - adultTimeLeft);
  const hintsUsed = 2 - adultHintsLeft;

  const winText =
    currentMode === 'kids'
      ? 'You found them all!'
      : 'All 5 found! Time: ' + timeUsed + 's • Misses: ' + adultMisses + ' • Hints: ' + hintsUsed;

  const allKidsComplete = currentMode === 'kids' && isAllKidsDone();
  showResult(winText, allKidsComplete);

  if (allKidsComplete) {
    const token = puzzleLoadSeq;
    celebrationTimer = setTimeout(() => {
      if (puzzleLoadSeq === token && currentMode === 'kids') {
        openCelebrationScreen();
      }
    }, 1150);
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

function showResult(msg, allKidsComplete) {
  const resStars = document.getElementById('result-stars');
  if (resStars) {
    resStars.textContent = '★★★★★';
    resStars.hidden = false;
  }
  document.getElementById('result-message').textContent = msg;

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

  if (currentMode === 'kids') {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'primary-btn';
    next.textContent = 'Next picture';
    next.onclick = guard(() => {
      if (allKidsComplete) {
        openCelebrationScreen();
      } else {
        goNext();
      }
    });
    btns.appendChild(next);

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'link-btn';
    pick.textContent = 'Pick another';
    pick.onclick = guard(() => openPicker(currentMode));
    btns.appendChild(pick);
  } else {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'primary-btn';
    next.textContent = 'Next';
    next.onclick = guard(() => goNext());
    btns.appendChild(next);

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'secondary-btn';
    retry.textContent = 'Retry';
    retry.onclick = guard(() => startPuzzle(currentPuzzle));
    btns.appendChild(retry);

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'link-btn';
    pick.textContent = 'Pick another';
    pick.onclick = guard(() => openPicker(currentMode));
    btns.appendChild(pick);
  }
  overlay.hidden = false;
}

function goNext() {
  const list = ((puzzlesData && puzzlesData.puzzles) || []).filter(p => p.mode === currentMode);
  const idx = list.findIndex(p => p.id === currentPuzzle.id);
  const unfinishedAfter = list.slice(idx + 1).find(p => !(counters.modes[currentMode].done[p.id] >= 5));
  const anyUnfinished = list.find(p => !(counters.modes[currentMode].done[p.id] >= 5));
  const next = unfinishedAfter || list[idx + 1] || anyUnfinished || list[0];
  if (next) startPuzzle(next);
  else openPicker(currentMode);
}

// ---------- Adult Timer ----------
function startTimers() {
  resetHintIdle();
  if (currentMode !== 'adult') return;

  clearInterval(adultTimer);
  const updateTimerUi = () => {
    const el = document.getElementById('timer-display');
    if (!el) return;
    el.textContent = adultTimeLeft + 's';
    el.classList.toggle('timer-warn', adultTimeLeft <= 20 && adultTimeLeft > 10);
    el.classList.toggle('timer-danger', adultTimeLeft <= 10);
  };
  updateTimerUi();

  adultTimer = setInterval(() => {
    adultTimeLeft--;
    updateTimerUi();
    if (adultTimeLeft <= 0) {
      clearInterval(adultTimer);
      adultTimer = null;
      onTimeUp();
    }
  }, 1000);
}

function onTimeUp() {
  puzzleOver = true;
  clearAllTimers();

  const found = foundSet.size;
  const m = counters.modes.adult;
  const prev = Number(m.done[currentPuzzle.id]) || 0;
  m.done[currentPuzzle.id] = Math.max(prev, found);
  saveCounters();

  const resStars = document.getElementById('result-stars');
  if (resStars) {
    resStars.textContent = '★'.repeat(found) + '☆'.repeat(5 - found);
    resStars.hidden = false;
  }

  document.getElementById('result-message').textContent = "Time's up";
  announce("Time's up! " + found + ' of 5 found.');

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

  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.className = 'primary-btn';
  reveal.textContent = 'Reveal all';
  reveal.onclick = guard(() => {
    reveal.hidden = true;
    overlay.classList.add('docked');
    overlay.setAttribute('aria-modal', 'false');
    revealAll();
    layoutImages();
  });
  btns.appendChild(reveal);

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'secondary-btn';
  retry.textContent = 'Retry';
  retry.onclick = guard(() => startPuzzle(currentPuzzle));
  btns.appendChild(retry);

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'secondary-btn';
  next.textContent = 'Next';
  next.onclick = guard(() => goNext());
  btns.appendChild(next);

  const pick = document.createElement('button');
  pick.type = 'button';
  pick.className = 'link-btn';
  pick.textContent = 'Pick another';
  pick.onclick = guard(() => openPicker(currentMode));
  btns.appendChild(pick);

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
function renderGrownups() {
  applyTheme('neutral');
  showScreen('screen-grownups');

  // Create outbound links ONLY inside Grown-ups screen
  const fbWrap = document.getElementById('feedback-link-wrap');
  fbWrap.textContent = '';
  const fbLink = document.createElement('a');
  fbLink.id = 'feedback-link';
  fbLink.className = 'feedback-btn-link';
  fbLink.href = FEEDBACK_URL;
  fbLink.target = '_blank';
  fbLink.rel = 'noopener';
  fbLink.textContent = 'Give feedback (adults only)';
  fbWrap.appendChild(fbLink);

  const licWrap = document.getElementById('licenses-link-wrap');
  licWrap.textContent = '';
  const licLink = document.createElement('a');
  licLink.href = 'LICENSES.csv';
  licLink.textContent = 'View full LICENSES.csv';
  licWrap.appendChild(licLink);

  // Render stats
  document.getElementById('stats-pre').textContent = buildStatsText();
  document.getElementById('copy-status').textContent = '';
  document.getElementById('report-status').textContent = '';
  document.getElementById('clear-confirm').hidden = true;

  // Render credits
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
  ((puzzlesData && puzzlesData.puzzles) || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.id + ' – ' + p.title;
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
  ['kids', 'adult'].forEach(mode => {
    const m = counters.modes[mode];
    const name = mode === 'kids' ? 'Kids test' : 'Adult test';
    const finished = m.firstPuzzleCompleted ? 'yes' : 'no';
    const puzzlesFinished = m.completed;
    const daysPlayed = counters.days.length;
    const cameBack =
      counters.firstPlay && counters.days.some(d => d > counters.firstPlay) ? 'yes' : 'no';
    const cameNext = nextDay && counters.days.includes(nextDay) ? 'yes' : 'no';
    lines.push(
      name +
        ': first puzzle finished=' +
        finished +
        ', puzzles finished=' +
        puzzlesFinished +
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
function init() {
  loadCounters();
  setupGrownupsActions();

  fetch('puzzles.json')
    .then(r => r.json())
    .then(data => {
      puzzlesData = data;
      renderHome();
    })
    .catch(() => {
      const msg = document.getElementById('message-area');
      if (msg) msg.textContent = 'Could not load puzzles.json';
    });

  document.getElementById('btn-kids').onclick = () => openPicker('kids');
  document.getElementById('btn-adult').onclick = () => openPicker('adult');
  document.getElementById('btn-grownups-home').onclick = openGrownups;
  document.getElementById('btn-back-home').onclick = renderHome;
  document.getElementById('btn-back-picker').onclick = () => openPicker(currentMode);
  document.getElementById('btn-grownups-back').onclick = renderHome;
  document.getElementById('btn-celebration-home').onclick = () => {
    const cel = document.getElementById('screen-celebration');
    if (Date.now() - Number(cel.dataset.armedAt || 0) < 350) return;
    renderHome();
  };

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const gate = document.getElementById('gate-overlay');
      if (gate && !gate.hidden) {
        gate.hidden = true;
      }
      const coach = document.getElementById('coach-overlay');
      if (coach && !coach.hidden) {
        dismissCoach();
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', init);