const FEEDBACK_URL = '#feedback-link-pending';

let data = null;
let modeId = null;
let modePuzzles = [];
let idx = 0;
let found = new Set();
let hints = 0;
let timerId = null;
let timeLeft = 0;
let startedAt = 0;
let frozenUntil = 0;
let counters = { started: 0, completed: 0, firstPlay: null, days: [], firstPuzzleCompleted: false, firstPuzzleId: null };
let showingA = true;
let useToggle = false;
let storageOk = true;
let hintPending = false;
let hintTimer = null;

const $ = id => document.getElementById(id);
const screens = ['start-screen', 'game-screen', 'stats-screen'];

function show(id) {
  screens.forEach(s => $(s).classList.toggle('hidden', s !== id));
  document.getElementById('feedback-link').href = FEEDBACK_URL;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadCounters() {
  try {
    const raw = localStorage.getItem('sd_counters_v1');
    if (raw) counters = { ...counters, ...JSON.parse(raw) };
    storageOk = true;
  } catch (_) {
    storageOk = false;
  }
}

function saveCounters() {
  try {
    localStorage.setItem('sd_counters_v1', JSON.stringify(counters));
    storageOk = true;
  } catch (_) {
    storageOk = false;
  }
}

function bumpStart(p) {
  counters.started++;
  const t = today();
  if (!counters.firstPlay) counters.firstPlay = t;
  if (!counters.firstPuzzleId) counters.firstPuzzleId = p.id;
  if (!counters.days.includes(t)) {
    counters.days.push(t);
    if (counters.days.length > 60) counters.days.shift();
  }
  saveCounters();
}

function bumpComplete() {
  counters.completed++;
  if (modePuzzles[idx] && modePuzzles[idx].id === counters.firstPuzzleId) counters.firstPuzzleCompleted = true;
  saveCounters();
}

async function init() {
  try {
    const r = await fetch('puzzles.json');
    data = await r.json();
  } catch (e) {
    $('main').innerHTML = '<p>Could not load puzzles.json</p>';
    return;
  }
  loadCounters();
  const mb = $('mode-buttons');
  mb.innerHTML = '';
  Object.entries(data.modes).forEach(([id, m]) => {
    const b = document.createElement('button');
    b.textContent = m.name;
    b.onclick = () => startMode(id);
    mb.appendChild(b);
  });
  $('stats-link').onclick = $('footer-stats').onclick = showStats;
  $('back-btn').onclick = $('stats-back').onclick = () => show('start-screen');
  $('hint-btn').onclick = hint;
  $('reset-btn').onclick = resetPuzzle;
  $('next-btn').onclick = $('success-next-btn').onclick = $('timeup-next-btn').onclick = nextPuzzle;
  $('reveal-btn').onclick = revealAll;
  $('retry-btn').onclick = () => { loadPuzzle(idx); };
  $('copy-stats').onclick = copyStats;
  $('clear-counters').onclick = () => {
    try { localStorage.removeItem('sd_counters_v1'); } catch (_) {}
    counters = { started: 0, completed: 0, firstPlay: null, days: [], firstPuzzleCompleted: false, firstPuzzleId: null };
    showStats();
  };
  $('show-a').onclick = () => setVisible(true);
  $('show-b').onclick = () => setVisible(false);
  window.addEventListener('resize', layout);
  $('img-a').addEventListener('load', layout);
  $('stats-feedback').href = FEEDBACK_URL;
  show('start-screen');
}

function startMode(id) {
  modeId = id;
  modePuzzles = data.puzzles.filter(p => p.mode === id);
  idx = 0;
  loadPuzzle(0);
  show('game-screen');
}

function loadPuzzle(i, isRetry = false) {
  idx = i;
  found.clear();
  hints = 0;
  if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  hintPending = false;
  clearOverlays();
  const p = modePuzzles[idx];
  if (!isRetry) bumpStart(p);
  $('img-a').src = p.imageA;
  $('img-b').src = p.imageB;
  $('img-a').alt = $('img-b').alt = p.title;
  updateHeader();
  updateCredit();
  $('success-panel').classList.add('hidden');
  $('timeup-panel').classList.add('hidden');
  if (data.modes[modeId].timed) startTimer(); else stopTimer();
  setTimeout(layout, 50);
}

function updateHeader() {
  const m = data.modes[modeId];
  const timerTxt = m.timed ? ` · ${formatTime(timeLeft)}` : '';
  $('game-header').textContent = `${m.name} · Puzzle ${idx + 1}/${modePuzzles.length} · Found ${found.size}/5${timerTxt}`;
  $('hint-btn').textContent = m.timed ? `Hint (${hints})` : 'Hint';
}

function formatTime(s) {
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

function startTimer() {
  stopTimer();
  timeLeft = data.modes[modeId].timeLimitSec;
  startedAt = Date.now();
  frozenUntil = 0;
  updateHeader();
  timerId = setInterval(() => {
    if (Date.now() < frozenUntil) return;
    timeLeft--;
    updateHeader();
    if (timeLeft <= 0) {
      stopTimer();
      $('timeup-panel').classList.remove('hidden');
    }
  }, 1000);
}

function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

function layout() {
  const wraps = [$('image-a-wrap'), $('image-b-wrap')];
  const img = $('img-a');
  if (!img.complete || !img.naturalWidth) return;
  const narrow = window.innerWidth < 900;
  const renderedW = img.getBoundingClientRect().width;
  useToggle = narrow && renderedW < 300;
  $('toggle-bar').classList.toggle('hidden', !useToggle);
  if (useToggle) {
    $('image-b-wrap').classList.toggle('hidden', showingA);
    $('image-a-wrap').classList.toggle('hidden', !showingA);
  } else {
    wraps.forEach(w => w.classList.remove('hidden'));
  }
  redrawOverlays();
}

function setVisible(a) {
  showingA = a;
  $('show-a').classList.toggle('active', a);
  $('show-b').classList.toggle('active', !a);
  layout();
}

function clearOverlays() {
  $('overlay-a').innerHTML = '';
  $('overlay-b').innerHTML = '';
}

function redrawOverlays() {
  clearOverlays();
  const p = modePuzzles[idx];
  const w = $('img-a').getBoundingClientRect().width;
  const h = $('img-a').getBoundingClientRect().height;
  found.forEach(i => drawCircle(p.differences[i], w, h, false));
}

function drawCircle(d, w, h, pulse) {
  const r = d.r * w;
  const cx = d.x * w, cy = d.y * h;
  ['a', 'b'].forEach(side => {
    const el = document.createElement('div');
    el.className = 'diff' + (pulse ? ' pulse' : '');
    el.style.left = cx + 'px';
    el.style.top = cy + 'px';
    el.style.width = el.style.height = (r * 2) + 'px';
    $(`overlay-${side}`).appendChild(el);
  });
}

function onPointer(e, side) {
  if (found.size === 5) return;
  if (timeLeft <= 0 && data.modes[modeId].timed) return;
  const img = $(`img-${side}`);
  const rect = img.getBoundingClientRect();
  const fx = (e.clientX - rect.left) / rect.width;
  const fy = (e.clientY - rect.top) / rect.height;
  const p = modePuzzles[idx];
  const W = rect.width, H = rect.height;
  let hit = -1;
  for (let i = 0; i < p.differences.length; i++) {
    if (found.has(i)) continue;
    const d = p.differences[i];
    const dist = Math.hypot((fx - d.x) * W, (fy - d.y) * H);
    if (dist <= d.r * W) { hit = i; break; }
  }
  if (hit >= 0) {
    found.add(hit);
    drawCircle(p.differences[hit], W, H, false);
    updateHeader();
    if (found.size === 5) onAllFound();
  } else {
    showMiss(e.clientX - rect.left, e.clientY - rect.top, side);
    if (data.modes[modeId].timed) frozenUntil = Date.now() + 3000;
  }
}

function showMiss(x, y, side) {
  const el = document.createElement('div');
  el.className = 'miss-x';
  el.textContent = '✕';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  $(`overlay-${side}`).appendChild(el);
  setTimeout(() => el.remove(), 600);
}

function onAllFound() {
  stopTimer();
  bumpComplete();
  const taken = data.modes[modeId].timed ? Math.max(0, data.modes[modeId].timeLimitSec - timeLeft) : null;
  $('success-msg').textContent = taken != null ? `All found! Time: ${formatTime(taken)}` : 'All found!';
  $('success-panel').classList.remove('hidden');
}

function hint() {
  if (data.modes[modeId].timed && timeLeft <= 0) return;
  if (found.size === 5) return;
  if (hintPending) return;
  const p = modePuzzles[idx];
  const unfound = p.differences.map((_, i) => i).filter(i => !found.has(i));
  if (!unfound.length) return;
  hintPending = true;
  const i = unfound[0];
  const w = $('img-a').getBoundingClientRect().width;
  const h = $('img-a').getBoundingClientRect().height;
  drawCircle(p.differences[i], w, h, true);
  hintTimer = setTimeout(() => {
    hintTimer = null;
    found.add(i);
    hints++;
    updateHeader();
    hintPending = false;
    if (found.size === 5) onAllFound();
    else redrawOverlays();
  }, 800);
}

function resetPuzzle() {
  loadPuzzle(idx, true);
}

function nextPuzzle() {
  idx = (idx + 1) % modePuzzles.length;
  if (idx === 0) showStats();
  else loadPuzzle(idx);
}

function revealAll() {
  const p = modePuzzles[idx];
  const w = $('img-a').getBoundingClientRect().width;
  const h = $('img-a').getBoundingClientRect().height;
  p.differences.forEach((d, i) => { if (!found.has(i)) { found.add(i); drawCircle(d, w, h, false); } });
  updateHeader();
  $('timeup-panel').classList.add('hidden');
}

function updateCredit() {
  const c = modePuzzles[idx].credit;
  $('credit').innerHTML = `${c.author} · ${c.license} · <a href="${c.source_url}" target="_blank" rel="noopener">source</a>`;
}

function showStats() {
  stopTimer();
  const body = $('stats-body');
  if (!storageOk) {
    body.innerHTML = '<p>Counters not available on this browser</p>';
    show('stats-screen');
    return;
  }
  const fp = counters.firstPlay || '—';
  const days = counters.days.length;
  const firstDone = counters.firstPuzzleCompleted ? 'yes' : 'no';
  const line = `started=${counters.started}; completed=${counters.completed}; first=${counters.firstPlay || ''}; days=${counters.days.length}; firstDone=${counters.firstPuzzleCompleted ? 'yes' : 'no'}`;
  body.innerHTML = `
    <p>Puzzles started: ${counters.started}</p>
    <p>Puzzles completed: ${counters.completed}</p>
    <p>First played: ${fp}</p>
    <p>Days played: ${days}</p>
    <p>Finished your first puzzle: ${firstDone}</p>
    <pre id="stats-line" style="user-select:all;white-space:pre-wrap;background:#eee;padding:8px;border-radius:4px;">${line}</pre>
    <span id="copy-msg"></span>
  `;
  show('stats-screen');
}

function copyStats() {
  const lineEl = $('stats-line');
  const line = lineEl ? lineEl.textContent : `started=${counters.started}; completed=${counters.completed}; first=${counters.firstPlay || ''}; days=${counters.days.length}; firstDone=${counters.firstPuzzleCompleted ? 'yes' : 'no'}`;
  const msg = $('copy-msg');
  navigator.clipboard.writeText(line).then(() => {
    if (msg) msg.textContent = 'Copied ✓';
  }).catch(() => {
    if (msg) msg.textContent = 'Select the line above to copy manually';
  });
}

document.addEventListener('click', e => {
  if (e.target.id === 'img-a' || e.target.closest('#image-a-wrap')) onPointer(e, 'a');
  if (e.target.id === 'img-b' || e.target.closest('#image-b-wrap')) onPointer(e, 'b');
});

init();