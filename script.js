// ── TRACK DATA ──
const TRACKS = [
  { title: "Neon Dreams",  artist: "Synthwave Collective", emoji: "🌙", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
  { title: "Playyybeatz",  artist: "Dawson Hollow",        emoji: "🥁", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  { title: "Kingtune",     artist: "Breter",               emoji: "👑", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
  { title: "Olivatune",    artist: "Jake",                 emoji: "🍃", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" },
];

const MAX_DURATION = 3 * 60; // 3-minute cap per track

// ── DOM ──
const audio       = document.getElementById('audio');
const playBtn     = document.getElementById('playBtn');
const playIcon    = document.getElementById('playIcon');
const pauseIcon   = document.getElementById('pauseIcon');
const prevBtn     = document.getElementById('prevBtn');
const nextBtn     = document.getElementById('nextBtn');
const shuffleBtn  = document.getElementById('shuffleBtn');
const repeatBtn   = document.getElementById('repeatBtn');
const muteBtn     = document.getElementById('muteBtn');
const progSlider  = document.getElementById('progSlider');
const volSlider   = document.getElementById('volSlider');
const volPct      = document.getElementById('volPct');
const curTime     = document.getElementById('curTime');
const durTime     = document.getElementById('durTime');
const songTitle   = document.getElementById('songTitle');
const songArtist  = document.getElementById('songArtist');
const albumArt    = document.getElementById('albumArt');
const trackNum    = document.getElementById('trackNum');
const speedSelect = document.getElementById('speedSelect');
const plList      = document.getElementById('plList');
const autoTog     = document.getElementById('autoTog');
const toast       = document.getElementById('toast');
const canvas      = document.getElementById('vizCanvas');
const ctx2d       = canvas.getContext('2d');

// ── STATE ──
let cur        = 0;
let playing    = false;
let shuffleOn  = false;
let repeatOn   = false;
let autoplay   = true;
let muted      = false;
let prevVol    = 0.75;

// Previous-button double-tap state
let prevClickTime = 0;
const DOUBLE_TAP_MS = 2000;

// Shuffled order array
let playOrder = TRACKS.map((_, i) => i); // [0,1,2,3]

// Favorites
const favorites = new Set();

// ── VISUALIZER (animated, no CORS needed) ──
const NUM_BARS  = 36;
const barValues = Array.from({ length: NUM_BARS }, () => Math.random() * 0.15);

function drawViz() {
  requestAnimationFrame(drawViz);
  const W = canvas.width, H = canvas.height;
  ctx2d.clearRect(0, 0, W, H);
  const barW = (W / NUM_BARS) - 1;
  barValues.forEach((v, i) => {
    const target = playing
      ? 0.08 + Math.random() * 0.88
      : 0.02 + Math.random() * 0.06;
    barValues[i] += (target - v) * (playing ? 0.2 : 0.05);
    const h = barValues[i] * H;
    const g = ctx2d.createLinearGradient(0, H - h, 0, H);
    g.addColorStop(0, '#1db954');
    g.addColorStop(1, '#0a4a20');
    ctx2d.fillStyle = g;
    const x = i * (barW + 1);
    ctx2d.beginPath();
    ctx2d.roundRect(x, H - h, barW, h, 3);
    ctx2d.fill();
  });
}

function resizeCanvas() {
  const r = canvas.getBoundingClientRect();
  canvas.width  = r.width || 400;
  canvas.height = r.height || 40;
}
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 60);
drawViz();

// ── HELPERS ──
function fmt(s) {
  if (!s || isNaN(s) || !isFinite(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
}

function setPlayUI(isPlaying) {
  playIcon.style.display  = isPlaying ? 'none'  : 'block';
  pauseIcon.style.display = isPlaying ? 'block' : 'none';
  albumArt.classList.toggle('playing', isPlaying);
}

function updatePlaylistHighlight() {
  document.querySelectorAll('.pl-item').forEach((el, i) => {
    el.classList.toggle('active', i === cur);
    el.querySelector('.pl-num').textContent = (i === cur && playing) ? '♪' : (i + 1);
  });
}

// ── LOAD TRACK ──
function loadTrack(idx) {
  cur = ((idx % TRACKS.length) + TRACKS.length) % TRACKS.length;
  const t = TRACKS[cur];
  audio.src = t.src;
  audio.volume  = parseFloat(volSlider.value);
  audio.playbackRate = parseFloat(speedSelect.value);
  songTitle.textContent  = t.title;
  songArtist.textContent = t.artist;
  albumArt.textContent   = t.emoji;
  trackNum.textContent   = `${cur + 1} / ${TRACKS.length}`;
  progSlider.value = 0;
  progSlider.style.setProperty('--pct', '0%');
  curTime.textContent = '0:00';
  durTime.textContent = '--:--';
  updatePlaylistHighlight();
}

// ── PLAY / PAUSE ──
function doPlay() {
  audio.play().catch(err => {
    console.warn('Playback error:', err);
    showToast('⚠ Could not play – check internet');
  });
  playing = true;
  setPlayUI(true);
  updatePlaylistHighlight();
}

function doPause() {
  audio.pause();
  playing = false;
  setPlayUI(false);
  updatePlaylistHighlight();
}

function playIndex(idx, notify = true) {
  loadTrack(idx);
  doPlay();
  if (notify) showToast(`▶  ${TRACKS[cur].title}`);
}

// ── NEXT ──
function nextTrack() {
  if (repeatOn) { audio.currentTime = 0; doPlay(); return; }
  const nextIdx = shuffleOn
    ? playOrder[(playOrder.indexOf(cur) + 1) % playOrder.length]
    : (cur + 1) % TRACKS.length;
  playIndex(nextIdx);
}

// ── PREVIOUS (double-tap logic) ──
function prevTrack() {
  const now = Date.now();
  if (now - prevClickTime < DOUBLE_TAP_MS && audio.currentTime < 3) {
    // Second tap within window → go to previous song
    const prevIdx = shuffleOn
      ? playOrder[(playOrder.indexOf(cur) - 1 + playOrder.length) % playOrder.length]
      : (cur - 1 + TRACKS.length) % TRACKS.length;
    playIndex(prevIdx);
    prevClickTime = 0;
  } else {
    // First tap → restart current song from beginning
    audio.currentTime = 0;
    if (!playing) doPlay();
    showToast('↺  Restarted');
    prevClickTime = now;
  }
}

// ── SHUFFLE ──
function doShuffle() {
  shuffleOn = !shuffleOn;
  shuffleBtn.classList.toggle('active', shuffleOn);
  if (shuffleOn) {
    // Fisher-Yates shuffle
    playOrder = TRACKS.map((_, i) => i);
    for (let i = playOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playOrder[i], playOrder[j]] = [playOrder[j], playOrder[i]];
    }
    showToast('🔀  Shuffle ON – playlist shuffled');
  } else {
    playOrder = TRACKS.map((_, i) => i);
    showToast('Shuffle OFF');
  }
}

// ── BUILD PLAYLIST ──
TRACKS.forEach((t, i) => {
  const li = document.createElement('li');
  li.className = 'pl-item' + (i === 0 ? ' active' : '');
  li.innerHTML = `
    <span class="pl-num">${i + 1}</span>
    <span class="pl-emoji">${t.emoji}</span>
    <span class="pl-heart">♥</span>
    <div class="pl-name">${t.title}</div>
    <div class="pl-artist">${t.artist}</div>`;
  li.addEventListener('click', () => playIndex(i));
  plList.appendChild(li);
});

loadTrack(0); // init first track

// ── BUTTON EVENTS ──
playBtn.addEventListener('click', () => playing ? doPause() : doPlay());
nextBtn.addEventListener('click', nextTrack);
prevBtn.addEventListener('click', prevTrack);

shuffleBtn.addEventListener('click', doShuffle);

repeatBtn.addEventListener('click', () => {
  repeatOn = !repeatOn;
  repeatBtn.classList.toggle('active', repeatOn);
  showToast(repeatOn ? '🔁  Repeat ON' : 'Repeat OFF');
});

autoTog.addEventListener('click', () => {
  autoplay = !autoplay;
  autoTog.classList.toggle('on', autoplay);
  showToast(autoplay ? 'Autoplay ON' : 'Autoplay OFF');
});

muteBtn.addEventListener('click', () => {
  muted = !muted;
  audio.volume    = muted ? 0 : prevVol;
  volSlider.value = muted ? 0 : prevVol;
  volSlider.style.setProperty('--pct', (audio.volume * 100) + '%');
  volPct.textContent = Math.round(audio.volume * 100) + '%';
  muteBtn.textContent = muted ? '🔇' : '🔊';
  showToast(muted ? 'Muted 🔇' : 'Unmuted 🔊');
});

speedSelect.addEventListener('change', () => {
  audio.playbackRate = parseFloat(speedSelect.value);
  showToast(`Speed: ${speedSelect.value}×`);
});

progSlider.addEventListener('input', () => {
  const effectiveDur = Math.min(audio.duration || 0, MAX_DURATION);
  if (effectiveDur > 0) audio.currentTime = (progSlider.value / 100) * effectiveDur;
  progSlider.style.setProperty('--pct', progSlider.value + '%');
});

volSlider.addEventListener('input', () => {
  audio.volume = parseFloat(volSlider.value);
  if (!muted) prevVol = audio.volume;
  volPct.textContent = Math.round(audio.volume * 100) + '%';
  volSlider.style.setProperty('--pct', (audio.volume * 100) + '%');
  muteBtn.textContent = audio.volume === 0 ? '🔇' : '🔊';
  muted = audio.volume === 0;
});

curTime.addEventListener('click', () => {
  // toggle showing remaining time
  curTime.dataset.remaining = curTime.dataset.remaining === '1' ? '0' : '1';
});

// ── AUDIO EVENTS ──
audio.addEventListener('loadedmetadata', () => {
  durTime.textContent = fmt(Math.min(audio.duration, MAX_DURATION));
});

audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  // Enforce 3-minute cap
  if (audio.currentTime >= MAX_DURATION) {
    if (repeatOn) { audio.currentTime = 0; return; }
    if (autoplay || shuffleOn) { nextTrack(); return; }
    doPause(); audio.currentTime = 0; return;
  }
  const effectiveDur = Math.min(audio.duration, MAX_DURATION);
  const pct = (audio.currentTime / effectiveDur) * 100;
  progSlider.value = pct;
  progSlider.style.setProperty('--pct', pct + '%');
  const remaining = effectiveDur - audio.currentTime;
  curTime.textContent = curTime.dataset.remaining === '1'
    ? '-' + fmt(remaining)
    : fmt(audio.currentTime);
  durTime.textContent = fmt(effectiveDur);
});

audio.addEventListener('ended', () => {
  if (repeatOn) { audio.currentTime = 0; doPlay(); return; }
  if (autoplay || shuffleOn) nextTrack();
  else { doPause(); }
});

// ── KEYBOARD SHORTCUTS ──
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      playing ? doPause() : doPlay();
      break;
    case 'ArrowRight': nextTrack(); break;
    case 'ArrowLeft':  prevTrack(); break;
    case 'ArrowUp':
      audio.volume = Math.min(1, audio.volume + 0.05);
      volSlider.value = audio.volume;
      volSlider.style.setProperty('--pct', (audio.volume * 100) + '%');
      volPct.textContent = Math.round(audio.volume * 100) + '%';
      break;
    case 'ArrowDown':
      audio.volume = Math.max(0, audio.volume - 0.05);
      volSlider.value = audio.volume;
      volSlider.style.setProperty('--pct', (audio.volume * 100) + '%');
      volPct.textContent = Math.round(audio.volume * 100) + '%';
      break;
    case 'KeyM': muteBtn.click(); break;
  }
});
