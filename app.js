/* Spot the Difference – app.js */
const FEEDBACK_URL = '#feedback-link-pending';
const STORAGE_KEY = 'sd_counters_v3';
const STORAGE_KEY_V1 = 'sd_counters_v1';
// ---------- State ----------
let puzzlesData = null;
let counters = null;
let grownupsUnlocked = false; // session only
let currentMode = null;
let currentPuzzle = null;
let foundSet = new Set();
let missTimes = [];
let ignoreUntil = 0;
let hintIdleTimer = null;
let adultTimer = null;
let adultTimeLeft = 90;
let adultHintsLeft = 2;
let adultMisses = 0;
let coachStep = 0;
let audioCtx = null;
let imagesLoaded = false;
let puzzleOver = false;
let puzzleLoadSeq = 0;
// ---------- Storage ----------
function loadCounters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      counters = JSON.parse(raw);
      if (counters && counters.v === 3) return;
    }
    // migrate from v1
    const v1 = localStorage.getItem(STORAGE_KEY_V1);
    let firstPlay = null, days = [];
    if (v1) {
      try {
        const old = JSON.parse(v1);
        firstPlay = old.firstPlay || null;
        days = Array.isArray(old.days) ? old.days.slice(0, 60) : [];
      } catch (e) { /* ignore */ }
    }
    counters = {
      v: 3,
      firstPlay,
      days,
      sound: false,
      modes: {
        kids: { started: 0, completed: 0, firstPuzzleId: null, firstPuzzleCompleted: false, done: {}, onboarded: false },
        adult: { started: 0, completed: 0, firstPuzzleId: null, firstPuzzleCompleted: false, done: {}, onboarded: false }
      },
      reports: []
    };
    saveCounters();
  } catch (e) {
    counters = makeEmptyCounters();
  }
}
function makeEmptyCounters() {
  return {
    v: 3, firstPlay: null, days: [], sound: false,
    modes: {
      kids: { started: 0, completed: 0, firstPuzzleId: null, firstPuzzleCompleted: false, done: {}, onboarded: false },
      adult: { started: 0, completed: 0, firstPuzzleId: null, firstPuzzleCompleted: false, done: {}, onboarded: false }
    },
    reports: []
  };
}
function saveCounters() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(counters)); } catch (e) { /* ignore */ }
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function addDay() {
  const t = todayStr();
  if (!counters.days.includes(t)) {
    counters.days.push(t);
    if (counters.days.length > 60) counters.days = counters.days.slice(-60);
  }
  if (!counters.firstPlay) counters.firstPlay = t;
  saveCounters();
}
// ---------- Screens ----------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.hidden = true);
  const el = document.getElementById(id);
  if (el) el.hidden = false;
  document.getElementById('gate-overlay').hidden = true;
  document.getElementById('coach-overlay').hidden = true;
  document.getElementById('result-overlay').hidden = true;
  clearInterval(adultTimer);
  adultTimer = null;
  clearTimeout(hintIdleTimer);
  // ensure no links outside grown-ups
  if (id !== 'screen-grownups') {
    const fb = document.getElementById('feedback-link-wrap');
    if (fb) fb.innerHTML = '';
    const lic = document.getElementById('licenses-link-wrap');
    if (lic) lic.innerHTML = '';
    const credits = document.getElementById('credits-list');
    if (credits) credits.innerHTML = '';
  }
}
function applyTheme(mode) {
  document.body.className = mode === 'kids' ? 'theme-kids' : mode === 'adult' ? 'theme-adult' : 'theme-neutral';
}
// ---------- Home ----------
function renderHome() {
  applyTheme('neutral');
  showScreen('screen-home');
  const kidsStars = sumStars('kids');
  const adultStars = sumStars('adult');
  document.getElementById('home-kids-stars').textContent = kidsStars + ' stars';
  document.getElementById('home-adult-stars').textContent = adultStars + ' stars';
}
function sumStars(mode) {
  const done = counters.modes[mode].done || {};
  return Object.values(done).reduce((a, b) => a + (Number(b) || 0), 0);
}
// ---------- Picker ----------
function openPicker(mode) {
  currentMode = mode;
  applyTheme(mode);
  showScreen('screen-picker');
  document.getElementById('picker-title').textContent = mode === 'kids' ? 'Kids test' : 'Adult test';
  const list = (puzzlesData.puzzles || []).filter(p => p.mode === mode);
  const grid = document.getElementById('puzzle-grid');
  grid.innerHTML = '';
  list.forEach(p => {
    const stars = counters.modes[mode].done[p.id] || 0;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'puzzle-tile';
    btn.innerHTML = '<strong>' + escapeHtml(p.title) + '</strong><div class="stars">' + stars + '/5 stars</div>';
    btn.addEventListener('click', () => startPuzzle(p));
    grid.appendChild(btn);
  });
  document.getElementById('btn-play-next').onclick = () => {
    const next = list.find(p => !(counters.modes[mode].done[p.id] >= 5));
    if (next) startPuzzle(next);
    else if (list[0]) startPuzzle(list[0]);
  };
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
// ---------- Game start ----------
function startPuzzle(p) {
  puzzleLoadSeq++;
  currentPuzzle = p;
  foundSet = new Set();
  missTimes = [];
  ignoreUntil = 0;
  adultMisses = 0;
  adultHintsLeft = 2;
  adultTimeLeft = (puzzlesData.modes && puzzlesData.modes.adult && puzzlesData.modes.adult.timeLimitSec) || 90;
  imagesLoaded = false;
  puzzleOver = false;
  clearTimeout(hintIdleTimer);
  clearInterval(adultTimer);
  adultTimer = null;
  const m = counters.modes[currentMode];
  m.started++;
  if (!m.firstPuzzleId) m.firstPuzzleId = p.id;
  addDay();
  saveCounters();
  applyTheme(currentMode);
  showScreen('screen-game');
  document.getElementById('game-title').textContent = p.title;
  renderStars();
  document.getElementById('message-area').textContent = '';
  document.getElementById('confetti').innerHTML = '';
  document.getElementById('confetti').hidden = true;
  document.getElementById('result-overlay').hidden = true;
  const imgA = document.getElementById('img-a');
  const imgB = document.getElementById('img-b');
  imgA.src = p.imageA;
  imgB.src = p.imageB;
  imgA.alt = 'Original picture';
  imgB.alt = 'Changed picture';
  // marks containers
  document.getElementById('marks-a').innerHTML = '';
  document.getElementById('marks-b').innerHTML = '';
  document.getElementById('quad-a').className = 'quadrant-glow';
  document.getElementById('quad-b').className = 'quadrant-glow';
  setupHud();
  const onLoad = () => {
    if (imgA.complete && imgB.complete) {
      imagesLoaded = true;
      layoutImages();
      if (!counters.modes[currentMode].onboarded) {
        showCoach();
      } else {
        startTimers();
      }
    }
  };
  imgA.onload = onLoad;
  imgB.onload = onLoad;
  if (imgA.complete && imgB.complete) onLoad();
  // pointer events
  ['img-a','img-b'].forEach(id => {
    const img = document.getElementById(id);
    img.onpointerdown = (e) => handleTap(e, img);
  });
}
function setupHud() {
  const ctrl = document.getElementById('hud-controls');
  ctrl.innerHTML = '';
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
  resetHintIdle();
}
function layoutImages() {
  // sized so both fit; imageB fully visible on 390x844 stacked
  const wrap = document.getElementById('images-wrap');
  const sideBySide = window.innerWidth >= 820;
  wrap.style.flexDirection = sideBySide ? 'row' : 'column';
  // simple: let CSS handle max sizes; force height constraint on small screens
  const boxes = document.querySelectorAll('.image-box');
  boxes.forEach(b => {
    b.style.maxHeight = sideBySide ? 'none' : '42vh';
    b.style.width = sideBySide ? '48%' : '100%';
  });
  // reposition existing marks
  repositionMarks();
}
window.addEventListener('resize', layoutImages);
window.addEventListener('orientationchange', layoutImages);
function repositionMarks() {
  if (!currentPuzzle) return;
  const imgA = document.getElementById('img-a');
  const imgB = document.getElementById('img-b');
  const wA = imgA.getBoundingClientRect().width;
  const hA = imgA.getBoundingClientRect().height;
  const wB = imgB.getBoundingClientRect().width;
  // marks are percentage based
  document.querySelectorAll('.mark').forEach(mark => {
    const x = parseFloat(mark.dataset.x);
    const y = parseFloat(mark.dataset.y);
    const r = parseFloat(mark.dataset.r);
    const isA = mark.parentElement.id === 'marks-a';
    const w = isA ? wA : wB;
    const size = (r * w) * 2;
    mark.style.left = (x * 100) + '%';
    mark.style.top = (y * 100) + '%';
    mark.style.width = size + 'px';
    mark.style.height = size + 'px';
  });
}
// ---------- Tap handling ----------
function handleTap(e, img) {
  if (!imagesLoaded || Date.now() < ignoreUntil || puzzleOver) return;
  if (currentMode === 'adult' && adultTimeLeft <= 0) return;
  if (foundSet.size >= 5) return;
  e.preventDefault();
  const rect = img.getBoundingClientRect();
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
      placeMark(i, d);
      renderStars();
      announce(foundSet.size + ' of 5 found');
      playDing();
      if (navigator.vibrate) try { navigator.vibrate(30); } catch (e) {}
      resetHintIdle();
      if (foundSet.size === 5) {
        e.preventDefault();
        // IMMEDIATELY record completion for THIS puzzle
        const completedPuzzleId = currentPuzzle.id;
        const completedMode = currentMode;
        const loadTokenAtWin = puzzleLoadSeq;
        const m = counters.modes[completedMode];
        m.completed++;
        m.done[completedPuzzleId] = 5;
        if (completedPuzzleId === m.firstPuzzleId) m.firstPuzzleCompleted = true;
        saveCounters();
        puzzleOver = true;
        clearInterval(adultTimer);
        adultTimer = null;
        clearTimeout(hintIdleTimer);
        // Delay only the win overlay/celebration display
        setTimeout(() => {
          if (currentPuzzle && currentPuzzle.id === completedPuzzleId && currentMode === completedMode && puzzleLoadSeq === loadTokenAtWin) {
            onAllFound();
          }
        }, 350);
      }
      break;
    }
  }
  if (!hit) onMiss(e, img);
}
function placeMark(idx, d) {
  ['marks-a','marks-b'].forEach(id => {
    const container = document.getElementById(id);
    const mark = document.createElement('div');
    mark.className = 'mark';
    mark.dataset.x = d.x;
    mark.dataset.y = d.y;
    mark.dataset.r = d.r;
    container.appendChild(mark);
  });
  repositionMarks();
}
function onMiss(e, img) {
  const rect = img.getBoundingClientRect();
  if (currentMode === 'kids') {
    // soft ripple + wobble
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    ripple.style.left = (e.clientX - rect.left) + 'px';
    ripple.style.top = (e.clientY - rect.top) + 'px';
    img.parentElement.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
    img.parentElement.classList.add('wobble');
    setTimeout(() => img.parentElement.classList.remove('wobble'), 300);
    const msgs = ['Ooh, close! Keep looking', 'Try another spot!'];
    document.getElementById('message-area').textContent = msgs[Math.floor(Math.random()*msgs.length)];
    missTimes.push(Date.now());
    missTimes = missTimes.filter(t => Date.now() - t < 1500);
    if (missTimes.length >= 3) {
      ignoreUntil = Date.now() + 800;
      document.getElementById('message-area').textContent = 'Take a peek first';
      missTimes = [];
    }
  } else {
    // adult: X mark
    const xmark = document.createElement('div');
    xmark.textContent = '✕';
    xmark.className = 'miss-x';
    xmark.style.left = (e.clientX - rect.left) + 'px';
    xmark.style.top = (e.clientY - rect.top) + 'px';
    img.parentElement.appendChild(xmark);
    setTimeout(() => xmark.remove(), 800);
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
function resetHintIdle() {
  clearTimeout(hintIdleTimer);
  if (currentMode === 'kids') {
    hintIdleTimer = setTimeout(() => {
      const btn = document.getElementById('btn-hint');
      if (btn && foundSet.size < 5) btn.classList.add('pulse');
    }, 20000);
  }
}
function giveHint() {
  if (puzzleOver) return;
  if (currentMode === 'adult' && adultTimeLeft <= 0) return;
  if (foundSet.size >= 5) return;
  const diffs = currentPuzzle.differences || [];
  let nextIdx = -1;
  for (let i = 0; i < diffs.length; i++) {
    if (!foundSet.has(i)) { nextIdx = i; break; }
  }
  if (nextIdx < 0) return;
  const d = diffs[nextIdx];
  if (currentMode === 'kids') {
    const btn = document.getElementById('btn-hint');
    if (btn) btn.classList.remove('pulse');
    // quadrant glow
    const qx = d.x < 0.5 ? 'l' : 'r';
    const qy = d.y < 0.5 ? 't' : 'b';
    const cls = 'quad-' + qy + qx;
    ['quad-a','quad-b'].forEach(id => {
      const el = document.getElementById(id);
      el.className = 'quadrant-glow active ' + cls;
      setTimeout(() => { el.className = 'quadrant-glow'; }, 2500);
    });
    announce('Hint: look in this area');
  } else {
    if (adultHintsLeft <= 0) return;
    adultHintsLeft--;
    const btn = document.getElementById('btn-hint');
    if (btn) btn.textContent = 'Hint (' + adultHintsLeft + ')';
    // exact pulsing ring for 2s
    ['marks-a','marks-b'].forEach(id => {
      const container = document.getElementById(id);
      const ring = document.createElement('div');
      ring.className = 'mark';
      ring.style.borderColor = '#ffeb3b';
      ring.style.animation = 'pulse 0.6s infinite';
      ring.dataset.x = d.x;
      ring.dataset.y = d.y;
      ring.dataset.r = d.r * 1.5;
      container.appendChild(ring);
      setTimeout(() => ring.remove(), 2000);
    });
    repositionMarks();
    announce('Hint shown');
  }
  resetHintIdle();
}
// ---------- Stars / win ----------
function renderStars() {
  const slots = document.querySelectorAll('.star-slot');
  slots.forEach((s, i) => s.classList.toggle('filled', i < foundSet.size));
}
function onAllFound() {
  announce('You found them all!');
  showConfetti();
  showResult(currentMode === 'kids' ? 'You found them all!' : 'Done! Time: ' + (90 - adultTimeLeft) + 's, Misses: ' + adultMisses + ', Hints: ' + (2 - adultHintsLeft));
  // kids 10th?
  if (currentMode === 'kids') {
    const kidsPuzzles = (puzzlesData.puzzles || []).filter(p => p.mode === 'kids');
    const doneCount = Object.keys(counters.modes.kids.done).filter(id => counters.modes.kids.done[id] >= 5).length;
    if (doneCount >= kidsPuzzles.length && kidsPuzzles.length >= 10) {
      setTimeout(() => {
        const cel = document.getElementById('screen-celebration');
        cel.dataset.armedAt = Date.now();
        showScreen('screen-celebration');
      }, 1500);
    }
  }
}
function showConfetti() {
  const c = document.getElementById('confetti');
  c.hidden = false;
  c.innerHTML = '';
  for (let i = 0; i < 30; i++) {
    const s = document.createElement('span');
    s.style.left = Math.random()*100 + '%';
    s.style.background = ['#ff6b6b','#4ecdc4','#ffe66d','#fff'][i%4];
    s.style.animationDelay = (Math.random()*0.4) + 's';
    c.appendChild(s);
  }
  setTimeout(() => { c.hidden = true; }, 1200);
}
function showResult(msg) {
  document.getElementById('result-message').textContent = msg;
  const btns = document.getElementById('result-buttons');
  btns.innerHTML = '';
  const overlay = document.getElementById('result-overlay');
  overlay.dataset.armedAt = Date.now();
  const guard = (fn) => () => {
    if (Date.now() - overlay.dataset.armedAt < 400) return;
    fn();
  };
  if (currentMode === 'kids') {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'primary-btn';
    next.textContent = 'Next picture';
    next.onclick = guard(() => goNext());
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
    retry.className = 'link-btn';
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
  const list = (puzzlesData.puzzles || []).filter(p => p.mode === currentMode);
  const idx = list.findIndex(p => p.id === currentPuzzle.id);
  const next = list[idx + 1] || list[0];
  if (next) startPuzzle(next);
  else openPicker(currentMode);
}
// ---------- Adult timer ----------
function startTimers() {
  if (currentMode !== 'adult') return;
  clearInterval(adultTimer);
  adultTimer = setInterval(() => {
    adultTimeLeft--;
    const el = document.getElementById('timer-display');
    if (el) el.textContent = adultTimeLeft + 's';
    if (adultTimeLeft <= 0) {
      clearInterval(adultTimer);
      onTimeUp();
    }
  }, 1000);
}
function onTimeUp() {
  puzzleOver = true;
  clearInterval(adultTimer);
  adultTimer = null;
  const found = foundSet.size;
  const m = counters.modes.adult;
  const prev = m.done[currentPuzzle.id] || 0;
  m.done[currentPuzzle.id] = Math.max(prev, found);
  saveCounters();
  document.getElementById('result-message').textContent = "Time's up";
  const btns = document.getElementById('result-buttons');
  btns.innerHTML = '';
  const overlay = document.getElementById('result-overlay');
  overlay.dataset.armedAt = Date.now();
  const guard = (fn) => () => {
    if (Date.now() - overlay.dataset.armedAt < 400) return;
    fn();
  };
  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.className = 'primary-btn';
  reveal.textContent = 'Reveal all';
  reveal.onclick = guard(revealAll);
  btns.appendChild(reveal);
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'link-btn';
  retry.textContent = 'Retry';
  retry.onclick = guard(() => startPuzzle(currentPuzzle));
  btns.appendChild(retry);
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'link-btn';
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
    if (!foundSet.has(i)) {
      foundSet.add(i);
      placeMark(i, d);
    }
  });
  renderStars();
}
// ---------- Coach ----------
const coachTexts = ['Look at both pictures', 'Tap anything that\'s different', 'Find all 5 to win!'];
function showCoach() {
  coachStep = 0;
  document.getElementById('coach-text').textContent = coachTexts[0];
  document.getElementById('coach-overlay').hidden = false;
  document.getElementById('btn-coach-next').onclick = () => {
    coachStep++;
    if (coachStep >= 3) dismissCoach();
    else document.getElementById('coach-text').textContent = coachTexts[coachStep];
  };
  document.getElementById('btn-coach-skip').onclick = dismissCoach;
}
function dismissCoach() {
  document.getElementById('coach-overlay').hidden = true;
  counters.modes[currentMode].onboarded = true;
  saveCounters();
  startTimers();
}
// ---------- Audio ----------
function playDing() {
  if (!counters.sound) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) { /* ignore */ }
}
// ---------- Grown-ups ----------
function openGrownups() {
  if (!grownupsUnlocked) {
    showGate();
    return;
  }
  renderGrownups();
}
function showGate() {
  document.getElementById('gate-overlay').hidden = false;
  let answerCorrect = false;
  const hold = document.getElementById('btn-hold');
  let holdTimer = null;
  const status = document.getElementById('gate-status');
  function newQuestion() {
    answerCorrect = false;
    const a = Math.floor(Math.random()*8)+2;
    const b = Math.floor(Math.random()*8)+2;
    const c = Math.floor(Math.random()*5)+1;
    const correct = a + b - c;
    document.getElementById('gate-question').textContent = 'What is ' + a + ' + ' + b + ', then minus ' + c + '?';
    const answers = [correct, correct+1, correct-1, correct+2].sort(() => Math.random()-0.5);
    const container = document.getElementById('gate-answers');
    container.innerHTML = '';
    answers.forEach(n => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = n;
      btn.onclick = () => {
        if (n === correct) {
          answerCorrect = true;
          status.textContent = 'Now press and hold for 2 seconds';
        } else {
          answerCorrect = false;
          status.textContent = 'Try again';
          setTimeout(newQuestion, 600);
        }
      };
      container.appendChild(btn);
    });
  }
  newQuestion();
  hold.onpointerdown = () => {
    if (!answerCorrect) {
      status.textContent = 'Answer the question first';
      return;
    }
    holdTimer = setTimeout(() => {
      grownupsUnlocked = true;
      document.getElementById('gate-overlay').hidden = true;
      renderGrownups();
    }, 2000);
  };
  hold.onpointerup = hold.onpointerleave = hold.onpointercancel = () => clearTimeout(holdTimer);
}
function renderGrownups() {
  applyTheme('neutral');
  showScreen('screen-grownups');
  // create links only here
  const fbWrap = document.getElementById('feedback-link-wrap');
  fbWrap.innerHTML = '<a id="feedback-link" href="' + FEEDBACK_URL + '" target="_blank" rel="noopener">Give feedback (adults only)</a>';
  const licWrap = document.getElementById('licenses-link-wrap');
  licWrap.innerHTML = '<a href="LICENSES.csv">LICENSES.csv</a>';
  // stats
  const stats = buildStatsText();
  document.getElementById('stats-pre').textContent = stats;
  // credits
  const credits = document.getElementById('credits-list');
  credits.innerHTML = '';
  (puzzlesData.puzzles || []).forEach(p => {
    const cr = p.credit || {};
    const div = document.createElement('div');
    div.innerHTML = '<strong>' + escapeHtml(p.title) + '</strong> – ' + escapeHtml(cr.author || '') + ' (' + escapeHtml(cr.license || '') + ') <a href="' + escapeHtml(cr.source_url || '#') + '" target="_blank" rel="noopener">source</a>';
    credits.appendChild(div);
  });
  // report select
  const sel = document.getElementById('report-puzzle');
  sel.innerHTML = '';
  (puzzlesData.puzzles || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.title;
    sel.appendChild(opt);
  });
  document.getElementById('sound-toggle').checked = !!counters.sound;
  document.getElementById('sound-toggle').onchange = (e) => {
    counters.sound = e.target.checked;
    saveCounters();
  };
}
function nextDayStr(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const dt = new Date(y, m, d);
  dt.setDate(dt.getDate() + 1);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}
function buildStatsText() {
  const lines = [];
  const nextDay = nextDayStr(counters.firstPlay);
  ['kids','adult'].forEach(mode => {
    const m = counters.modes[mode];
    const name = mode === 'kids' ? 'Kids test' : 'Adult test';
    const finished = m.firstPuzzleCompleted ? 'yes' : 'no';
    const puzzlesFinished = m.completed;
    const daysPlayed = counters.days.length;
    const cameBack = (counters.days.some(d => d > counters.firstPlay)) ? 'yes' : 'no';
    const cameNext = (nextDay && counters.days.includes(nextDay)) ? 'yes' : 'no';
    lines.push(name + ': first puzzle finished=' + finished + ', puzzles finished=' + puzzlesFinished + ', days played=' + daysPlayed + ', came back another day=' + cameBack + ', came back next day=' + cameNext);
  });
  lines.push('First played: ' + (counters.firstPlay || 'never'));
  if (counters.reports && counters.reports.length) {
    lines.push('Reports: ' + counters.reports.join(', '));
  }
  return lines.join('\n');
}
document.getElementById('btn-copy-stats').onclick = () => {
  const text = buildStatsText();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      document.getElementById('copy-status').textContent = 'Copied!';
    }).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
};
function fallbackCopy(text) {
  const pre = document.getElementById('stats-pre');
  pre.focus();
  pre.select();
  try { document.execCommand('copy'); document.getElementById('copy-status').textContent = 'Selected – copy manually'; } catch (e) {}
}
document.querySelectorAll('.report-reasons button').forEach(btn => {
  btn.onclick = () => {
    const pid = document.getElementById('report-puzzle').value;
    const reason = btn.dataset.reason;
    const code = pid + ':' + reason;
    if (!counters.reports) counters.reports = [];
    counters.reports.push(code);
    if (counters.reports.length > 20) counters.reports = counters.reports.slice(-20);
    saveCounters();
    document.getElementById('report-status').textContent = 'Added: ' + code;
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
  document.getElementById('stats-pre').textContent = buildStatsText();
  document.getElementById('report-status').textContent = 'Counters cleared';
};
document.getElementById('btn-clear-no').onclick = () => {
  document.getElementById('clear-confirm').hidden = true;
};
// ---------- Init ----------
function init() {
  loadCounters();
  fetch('puzzles.json')
    .then(r => r.json())
    .then(data => {
      puzzlesData = data;
      renderHome();
    })
    .catch(() => {
      document.body.textContent = 'Could not load puzzles.json';
    });
  document.getElementById('btn-kids').onclick = () => openPicker('kids');
  document.getElementById('btn-adult').onclick = () => openPicker('adult');
  document.getElementById('btn-grownups-home').onclick = openGrownups;
  document.getElementById('btn-back-home').onclick = renderHome;
  document.getElementById('btn-back-picker').onclick = () => openPicker(currentMode);
  document.getElementById('btn-grownups-back').onclick = renderHome;
  document.getElementById('btn-celebration-home').onclick = () => {
    const cel = document.getElementById('screen-celebration');
    if (Date.now() - (cel.dataset.armedAt || 0) < 400) return;
    renderHome();
  };
}
document.addEventListener('DOMContentLoaded', init);