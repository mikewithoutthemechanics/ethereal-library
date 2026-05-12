/**
 * ETHEREAL LIBRARY — Moroccan Immersive 3D Experience
 * Authentic Middle Eastern library with zellige tiles, Moorish arches,
 * brass lanterns, carved cedar bookshelves for Candice & Michael
 */

const IS_MOBILE = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const USE_THREE = !IS_MOBILE && (() => {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch { return false; }
})();

let CONFIG;
let scene, camera, renderer, composer, bloomPass, clock;
let booksGroup = null;
let lanternsGroup = null;
let dustParticles = null;
let raycaster, mouse;
let hoveredBook = null;
let ambientSource, audioCtx, audioGain, audioEnabled = true;
let isBookOpen = false;
let currentPageIdx = 0;
let currentBookIdx = 0;
let threeInitialized = false;
let currentScreen = 'loading';

// Camera states
let cameraState = 'orbit'; // 'orbit', 'left-shelf', 'right-shelf'
let cameraTarget = { x: 0, y: 1.8, z: 6, lx: 0, ly: 1.5, lz: -1 };
let cameraLerp = 0.03;

// Book storage + memories
let userBooks = { Candice: [], Michael: [] };
let sharedMemories = [];

// ═══════════════════════════════════════════════════════════════════════════
// Config & Data
// ═══════════════════════════════════════════════════════════════════════════

async function loadConfig() {
  try {
    CONFIG = await (await fetch('config.json')).json();
  } catch {
    CONFIG = {
      herName: 'Candice', yourName: 'Michael',
      tagline: 'A library of our love, candlelit and yours to explore.',
      books: [],
      countdownDate: new Date(Date.now() + 30 * 86400000).toISOString()
    };
  }
}

function loadUserBooks() {
  try {
    const saved = localStorage.getItem('ethereal_books');
    if (saved) userBooks = JSON.parse(saved);
  } catch {}
  try {
    const mem = localStorage.getItem('ethereal_memories');
    if (mem) sharedMemories = JSON.parse(mem);
  } catch {}

  if (CONFIG.books && CONFIG.books.length > 0) {
    CONFIG.books.forEach(book => {
      const owner = book.owner || 'Michael';
      if (!userBooks[owner]) userBooks[owner] = [];
      const exists = userBooks[owner].find(b => b.title === book.title && b.isDefault);
      if (!exists) {
        userBooks[owner].push({ ...book, isDefault: true, owner });
      }
    });
  }
}

function saveUserBooks() {
  try { localStorage.setItem('ethereal_books', JSON.stringify(userBooks)); } catch {}
}

function saveMemories() {
  try { localStorage.setItem('ethereal_memories', JSON.stringify(sharedMemories)); } catch {}
}

function getAllBooks() {
  return [...(userBooks.Candice || []), ...(userBooks.Michael || [])];
}

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════════════════════════════════════════

function renderDashboard() {
  renderShelfBooks('Candice', document.getElementById('candice-books'));
  renderShelfBooks('Michael', document.getElementById('michael-books'));
  renderMemories();
}

function renderShelfBooks(owner, container) {
  if (!container) return;
  const books = userBooks[owner] || [];
  container.innerHTML = '';

  if (books.length === 0) {
    container.innerHTML = '<div class="empty-shelf"><p>No books yet. Add one!</p></div>';
    return;
  }

  books.forEach((book, idx) => {
    const el = document.createElement('div');
    el.className = 'dash-book';
    el.innerHTML = `
      <div class="dash-book-spine" style="background:${book.spineColor || '#8B4513'}">
        <span class="dash-book-title-spine">${book.title}</span>
      </div>
      <div class="dash-book-info">
        <h4>${book.title}</h4>
        <p>${book.pages ? book.pages.length : 0} pages</p>
      </div>
      <div class="dash-book-actions">
        <button class="btn-read-book" data-owner="${owner}" data-idx="${idx}">Read</button>
        ${!book.isDefault ? '<button class="btn-delete-book" data-owner="' + owner + '" data-idx="' + idx + '">Delete</button>' : ''}
      </div>
    `;
    container.appendChild(el);
  });

  container.querySelectorAll('.btn-read-book').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const o = e.target.dataset.owner;
      const i = parseInt(e.target.dataset.idx);
      openBookFromDashboard(o, i);
    });
  });
  container.querySelectorAll('.btn-delete-book').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const o = e.target.dataset.owner;
      const i = parseInt(e.target.dataset.idx);
      if (confirm('Delete this book?')) {
        userBooks[o].splice(i, 1);
        saveUserBooks();
        renderDashboard();
      }
    });
  });
}

function openBookFromDashboard(owner, idx) {
  const books = userBooks[owner] || [];
  const book = books[idx];
  if (!book) return;
  const allBooks = getAllBooks();
  currentBookIdx = allBooks.findIndex(b => b.title === book.title && b.owner === owner);
  if (currentBookIdx < 0) currentBookIdx = 0;
  currentPageIdx = 0;
  openBookOverlay(book);
}

function openBookOverlay(book) {
  const overlay = document.getElementById('book-overlay');
  const cover = document.getElementById('book-cover');
  const title = document.getElementById('book-title-cover');
  const author = document.getElementById('book-author');

  title.textContent = book.title;
  author.textContent = 'by ' + (book.owner || CONFIG.yourName);
  const sc = book.spineColor || '#5d4037';
  document.querySelector('.cover-front').style.background =
    'linear-gradient(145deg, ' + sc + ', ' + darken(sc) + ')';
  cover.style.borderColor = sc;

  overlay.classList.remove('hidden');
  isBookOpen = true;

  setTimeout(() => {
    cover.classList.add('opened');
    showPage(book, 0);
    document.getElementById('book-pages').classList.remove('hidden');
  }, 500);
}

// ═══════════════════════════════════════════════════════════════════════════
// Memories Timeline
// ═══════════════════════════════════════════════════════════════════════════

function renderMemories() {
  const container = document.getElementById('memories-list');
  if (!container) return;
  container.innerHTML = '';

  if (sharedMemories.length === 0) {
    container.innerHTML = '<p class="empty-memories">No shared memories yet. Add your first one!</p>';
    return;
  }

  const sorted = [...sharedMemories].sort((a, b) => (b.date || 0) - (a.date || 0));
  sorted.forEach((mem, idx) => {
    const el = document.createElement('div');
    el.className = 'memory-card';
    const dateStr = mem.date ? new Date(mem.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    el.innerHTML = `
      <div class="memory-header">
        <span class="memory-type">${mem.type === 'wish' ? 'Wish' : mem.type === 'milestone' ? 'Milestone' : 'Memory'}</span>
        ${dateStr ? '<span class="memory-date">' + dateStr + '</span>' : ''}
        ${mem.location ? '<span class="memory-location">' + escapeHtml(mem.location) + '</span>' : ''}
      </div>
      <p class="memory-text">${escapeHtml(mem.text)}</p>
      ${mem.image ? '<img src="' + mem.image + '" class="memory-image" alt="Memory" />' : ''}
      <div class="memory-by">by ${escapeHtml(mem.by || 'Anonymous')}</div>
      <button class="btn-delete-memory" data-idx="${idx}">&times;</button>
    `;
    container.appendChild(el);
  });

  container.querySelectorAll('.btn-delete-memory').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const i = parseInt(e.target.dataset.idx);
      sharedMemories.splice(i, 1);
      saveMemories();
      renderMemories();
    });
  });
}

function initMemoryForm() {
  const form = document.getElementById('memory-form');
  if (!form) return;

  // Photo preview
  const photoInput = document.getElementById('memory-photo');
  if (photoInput) {
    photoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = document.getElementById('memory-photo-preview');
        if (preview) { preview.innerHTML = '<img src="' + ev.target.result + '" />'; preview.classList.remove('hidden'); }
        photoInput.dataset.dataUrl = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = document.getElementById('memory-text').value.trim();
    const type = document.getElementById('memory-type').value;
    const by = document.getElementById('memory-by-input').value.trim() || 'Anonymous';
    const location = document.getElementById('memory-location').value.trim();
    const dateVal = document.getElementById('memory-date-input').value;

    if (!text) return;

    const memory = {
      text, type, by, location,
      date: dateVal ? new Date(dateVal).getTime() : Date.now(),
      image: photoInput && photoInput.dataset.dataUrl ? photoInput.dataset.dataUrl : null
    };

    sharedMemories.push(memory);
    saveMemories();
    form.reset();
    const preview = document.getElementById('memory-photo-preview');
    if (preview) { preview.innerHTML = ''; preview.classList.add('hidden'); }
    if (photoInput) delete photoInput.dataset.dataUrl;
    renderMemories();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Add Book Modal
// ═══════════════════════════════════════════════════════════════════════════

function initAddBookModal() {
  const modal = document.getElementById('add-book-modal');
  const form = document.getElementById('add-book-form');

  document.getElementById('btn-add-book')?.addEventListener('click', () => modal.classList.remove('hidden'));
  document.querySelectorAll('.btn-add-to-shelf').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('book-owner-select').value = btn.dataset.owner;
      modal.classList.remove('hidden');
    });
  });

  document.getElementById('modal-close-add')?.addEventListener('click', () => { modal.classList.add('hidden'); form.reset(); resetPagesEditor(); });
  document.getElementById('btn-cancel-book')?.addEventListener('click', () => { modal.classList.add('hidden'); form.reset(); resetPagesEditor(); });
  modal.querySelector('.modal-backdrop')?.addEventListener('click', () => { modal.classList.add('hidden'); form.reset(); resetPagesEditor(); });

  document.getElementById('btn-add-page')?.addEventListener('click', addPageEntry);

  document.getElementById('pages-editor')?.addEventListener('change', (e) => {
    if (e.target.classList.contains('page-type-select')) {
      const entry = e.target.closest('.page-entry');
      togglePageFields(entry, e.target.value);
    }
    if (e.target.classList.contains('page-photo-input')) handlePhotoUpload(e.target);
  });

  form?.addEventListener('submit', (e) => { e.preventDefault(); createNewBook(); });
}

function togglePageFields(entry, type) {
  entry.querySelector('.page-text').classList.toggle('hidden', type === 'photo');
  entry.querySelector('.page-photo-input').classList.toggle('hidden', type !== 'photo');
  entry.querySelector('.page-photo-preview').classList.toggle('hidden', type !== 'photo');
  entry.querySelector('.page-from').classList.toggle('hidden', type !== 'note');
}

function addPageEntry() {
  const editor = document.getElementById('pages-editor');
  const count = editor.querySelectorAll('.page-entry').length;
  const entry = document.createElement('div');
  entry.className = 'page-entry';
  entry.dataset.pageIdx = count;
  entry.innerHTML = `
    <select class="page-type-select"><option value="letter">Letter/Text</option><option value="photo">Photo</option><option value="note">Note</option></select>
    <textarea class="page-text" placeholder="Write your text here..."></textarea>
    <input type="file" class="page-photo-input hidden" accept="image/*" />
    <div class="page-photo-preview hidden"></div>
    <input type="text" class="page-from hidden" placeholder="From (name)" />
    <select class="page-align"><option value="center">Center</option><option value="left">Left</option><option value="right">Right</option></select>
    <button type="button" class="btn-remove-page" title="Remove page">&times;</button>
  `;
  editor.appendChild(entry);
  entry.querySelector('.btn-remove-page').addEventListener('click', () => entry.remove());
}

function resetPagesEditor() {
  const editor = document.getElementById('pages-editor');
  editor.innerHTML = `
    <div class="page-entry" data-page-idx="0">
      <select class="page-type-select"><option value="letter">Letter/Text</option><option value="photo">Photo</option><option value="note">Note</option></select>
      <textarea class="page-text" placeholder="Write your text here..."></textarea>
      <input type="file" class="page-photo-input hidden" accept="image/*" />
      <div class="page-photo-preview hidden"></div>
      <input type="text" class="page-from hidden" placeholder="From (name)" />
      <select class="page-align"><option value="center">Center</option><option value="left">Left</option><option value="right">Right</option></select>
      <button type="button" class="btn-remove-page" title="Remove page">&times;</button>
    </div>
  `;
}

function handlePhotoUpload(input) {
  const entry = input.closest('.page-entry');
  const preview = entry.querySelector('.page-photo-preview');
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.innerHTML = '<img src="' + e.target.result + '" alt="Preview" />';
    preview.classList.remove('hidden');
    entry.dataset.photoData = e.target.result;
  };
  reader.readAsDataURL(file);
}

function createNewBook() {
  const title = document.getElementById('book-new-title').value.trim();
  const owner = document.getElementById('book-owner-select').value;
  const spineColor = document.getElementById('book-spine-color').value;
  if (!title) return;

  const pages = [];
  document.querySelectorAll('.page-entry').forEach(entry => {
    const type = entry.querySelector('.page-type-select').value;
    const align = entry.querySelector('.page-align').value;
    if (type === 'letter') {
      const text = entry.querySelector('.page-text').value.trim();
      if (text) pages.push({ type: 'letter', text, align });
    } else if (type === 'photo') {
      const photoData = entry.dataset.photoData;
      if (photoData) pages.push({ type: 'photo', file: photoData, caption: entry.querySelector('.page-text').value.trim() || 'Photo', isDataUrl: true });
    } else if (type === 'note') {
      const text = entry.querySelector('.page-text').value.trim();
      const from = entry.querySelector('.page-from').value.trim() || owner;
      if (text) pages.push({ type: 'note', from, text, align });
    }
  });

  if (pages.length === 0) { alert('Please add at least one page with content.'); return; }

  if (!userBooks[owner]) userBooks[owner] = [];
  userBooks[owner].push({ title, spineColor, owner, pages, isDefault: false, createdAt: Date.now() });
  saveUserBooks();

  document.getElementById('add-book-modal').classList.add('hidden');
  document.getElementById('add-book-form').reset();
  resetPagesEditor();
  renderDashboard();
}

// ═══════════════════════════════════════════════════════════════════════════
// Page Reading
// ═══════════════════════════════════════════════════════════════════════════

function showPage(book, idx) {
  if (!book || !book.pages || !book.pages[idx]) return;
  currentPageIdx = idx;
  const leftContent = document.getElementById('page-left-content');
  const rightContent = document.getElementById('page-right-content');
  const counter = document.getElementById('page-counter');

  leftContent.innerHTML = buildPageHTML(book.pages[idx]);
  rightContent.innerHTML = buildPageHTML(book.pages[idx + 1] || { type: 'end' });
  counter.textContent = (idx + 1) + ' / ' + book.pages.length;

  document.getElementById('prev-page').disabled = idx === 0;
  document.getElementById('next-page').disabled = idx + 2 >= book.pages.length;
  updateProgress(book);
  animatePageTurn();
}

function animatePageTurn() {
  const leftEl = document.getElementById('page-left');
  const rightEl = document.getElementById('page-right');
  leftEl.classList.remove('page-transition-in');
  rightEl.classList.remove('page-transition-in');
  leftEl.classList.add('page-transition-out');
  rightEl.classList.add('page-transition-out');
  setTimeout(() => {
    leftEl.classList.remove('page-transition-out');
    rightEl.classList.remove('page-transition-out');
    leftEl.classList.add('page-transition-in');
    rightEl.classList.add('page-transition-in');
  }, 10);
}

function updateProgress(book) {
  if (!book) return;
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = ((currentPageIdx + 1) / book.pages.length) * 100 + '%';
}

function buildPageHTML(page) {
  if (!page) return '<div class="page-empty">~</div>';
  if (page.type === 'end') return '<div class="page-end">The End</div>';

  if (page.type === 'letter') {
    const align = page.align === 'center' ? 'center' : 'left';
    return '<div class="page-letter" style="text-align:' + align + '">' + escapeHtml(page.text).replace(/\n/g, '<br>') + '</div>';
  } else if (page.type === 'photo') {
    const src = page.isDataUrl ? page.file : 'assets/' + page.file;
    return '<img src="' + src + '" alt="' + escapeHtml(page.caption || '') + '" onerror="this.style.display=\'none\'" class="page-photo-full"><div class="page-caption">' + escapeHtml(page.caption || '') + '</div>';
  } else if (page.type === 'note') {
    const align = page.align === 'right' ? 'right' : 'left';
    return '<p class="page-note-from">&mdash; ' + escapeHtml(page.from || 'Anonymous') + '</p><div class="page-letter" style="text-align:' + align + '">' + escapeHtml(page.text).replace(/\n/g, '<br>') + '</div>';
  }
  return '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getCurrentBook() {
  return getAllBooks()[currentBookIdx] || null;
}

function nextPage() {
  const book = getCurrentBook();
  if (book && currentPageIdx + 2 < book.pages.length) { currentPageIdx += 2; showPage(book, currentPageIdx); }
}

function prevPage() {
  const book = getCurrentBook();
  if (book && currentPageIdx > 0) { currentPageIdx = Math.max(0, currentPageIdx - 2); showPage(book, currentPageIdx); }
}

function closeBook() {
  const overlay = document.getElementById('book-overlay');
  const cover = document.getElementById('book-cover');
  cover.classList.add('closing');
  setTimeout(() => {
    cover.classList.remove('opened', 'closing');
    document.getElementById('book-pages').classList.add('hidden');
    overlay.classList.add('hidden');
    isBookOpen = false;
  }, 600);
}

function initBookOverlay() {
  document.getElementById('close-book')?.addEventListener('click', closeBook);
  document.getElementById('next-page')?.addEventListener('click', nextPage);
  document.getElementById('prev-page')?.addEventListener('click', prevPage);
  document.getElementById('book-overlay')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeBook(); });

  const pages = document.getElementById('book-pages');
  if (pages) {
    let sx;
    pages.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    pages.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 60) { dx < 0 ? nextPage() : prevPage(); }
    }, { passive: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Audio
// ═══════════════════════════════════════════════════════════════════════════

async function playAmbientPiano() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioGain = audioCtx.createGain();
    audioGain.connect(audioCtx.destination);
    audioGain.gain.setValueAtTime(0, audioCtx.currentTime);
    const resp = await fetch('assets/ambient.mp3');
    if (!resp.ok) return;
    const buf = await audioCtx.decodeAudioData(await resp.arrayBuffer());
    ambientSource = audioCtx.createBufferSource();
    ambientSource.buffer = buf;
    ambientSource.loop = true;
    ambientSource.connect(audioGain);
    ambientSource.start(0);
    audioGain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 3);
  } catch (e) { console.log('Audio unavailable:', e.message); }
}

function toggleAudio() {
  if (!audioGain || !audioCtx) { playAmbientPiano(); return; }
  const v = audioGain.gain.value;
  audioGain.gain.linearRampToValueAtTime(v > 0.01 ? 0 : 0.2, audioCtx.currentTime + 0.5);
}

// ═══════════════════════════════════════════════════════════════════════════
// Dust Overlay
// ═══════════════════════════════════════════════════════════════════════════

function initDustOverlay() {
  const canvas = document.getElementById('dust-overlay');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  const particles = [];
  for (let i = 0; i < 80; i++) {
    particles.push({
      x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
      size: Math.random() * 2 + 0.5, speedX: (Math.random() - 0.5) * 0.3,
      speedY: -Math.random() * 0.4 - 0.1, opacity: Math.random() * 0.5 + 0.1,
      drift: Math.random() * Math.PI * 2
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = Date.now() * 0.001;
    particles.forEach(p => {
      p.x += p.speedX + Math.sin(t + p.drift) * 0.2;
      p.y += p.speedY;
      if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
      if (p.x < -10) p.x = canvas.width + 10;
      if (p.x > canvas.width + 10) p.x = -10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 200, 120, ' + (p.opacity * (0.5 + Math.sin(t * 2 + p.drift) * 0.3)) + ')';
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// ═══════════════════════════════════════════════════════════════════════════
// Flicker Overlay
// ═══════════════════════════════════════════════════════════════════════════

function initFlickerOverlay() {
  const canvas = document.getElementById('flicker-overlay');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const time = Date.now() * 0.001;
    for (let i = 0; i < 8; i++) {
      const cx = 0.08 + (i / 8) * 0.84;
      const cy = 0.25 + Math.sin(time * 0.4 + i * 1.8) * 0.12;
      const flicker = 0.6 + Math.sin(time * 4 + i * 2.3) * 0.2 + Math.sin(time * 9.1 + i) * 0.1;
      const radius = canvas.width * (0.1 + Math.sin(time * 0.6 + i) * 0.03);
      const gradient = ctx.createRadialGradient(canvas.width * cx, canvas.height * cy, 0, canvas.width * cx, canvas.height * cy, radius);
      gradient.addColorStop(0, 'rgba(255, 150, 40, ' + (0.07 * flicker) + ')');
      gradient.addColorStop(0.4, 'rgba(255, 100, 20, ' + (0.04 * flicker) + ')');
      gradient.addColorStop(1, 'rgba(255, 60, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// ═══════════════════════════════════════════════════════════════════════════
// Three.js — Moroccan Library
// ═══════════════════════════════════════════════════════════════════════════

function initThree() {
  if (threeInitialized) return;
  threeInitialized = true;

  const container = document.getElementById('canvas-container');
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0608, 0.02);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.8, 6);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x0a0608, 1);
  container.appendChild(renderer.domElement);

  try {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.5, 0.82);
    composer.addPass(bloomPass);
  } catch (e) {
    console.warn('Post-processing unavailable:', e.message);
    composer = null;
  }

  clock = new THREE.Clock();

  buildMoroccanRoom();
  buildDualBookshelves();
  buildBrassLanterns();
  buildDustParticles3D();
  buildMoroccanDecorations();

  // Lighting — warm Middle Eastern ambiance
  scene.add(new THREE.AmbientLight(0x2a1515, 0.35));

  const moonLight = new THREE.DirectionalLight(0x4466aa, 0.1);
  moonLight.position.set(0, 8, 4);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  scene.add(moonLight);

  // Warm lantern lights
  [[-4, 3, -4.5], [-1.5, 3, -4.5], [1.5, 3, -4.5], [4, 3, -4.5],
   [-3, 1.5, -4], [3, 1.5, -4], [0, 4, -2], [-5, 2, 1], [5, 2, 1]].forEach((pos, i) => {
    const light = new THREE.PointLight(0xffaa44, 2.5, 8, 1.5);
    light.position.set(...pos);
    light.castShadow = i < 4;
    if (light.castShadow) light.shadow.mapSize.set(256, 256);
    scene.add(light);
  });

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  window.addEventListener('resize', onResize);
  window.addEventListener('click', onMouseClick);
  window.addEventListener('mousemove', onMouseMove);

  const moonlight = document.getElementById('moonlight');
  if (moonlight) {
    document.addEventListener('mousemove', (e) => {
      if (isBookOpen) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 50;
      const y = (e.clientY / window.innerHeight - 0.5) * 25;
      moonlight.style.transform = 'translateX(calc(-50% + ' + x + 'px)) perspective(800px) rotateX(' + (20 + y) + 'deg)';
    });
  }

  animate();
}

// ═══════════════════════════════════════════════════════════════════════════
// Moroccan Room
// ═══════════════════════════════════════════════════════════════════════════

function buildMoroccanRoom() {
  // Zellige tile floor
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 512; floorCanvas.height = 512;
  const fCtx = floorCanvas.getContext('2d');
  fCtx.fillStyle = '#1a0f08';
  fCtx.fillRect(0, 0, 512, 512);

  const tileSize = 32;
  const tileColors = ['#1a3a4a', '#2a1a0a', '#0a2a2a', '#3a2a1a', '#1a2a3a', '#2a3a2a'];
  for (let x = 0; x < 512; x += tileSize) {
    for (let y = 0; y < 512; y += tileSize) {
      fCtx.fillStyle = tileColors[Math.floor(Math.random() * tileColors.length)];
      fCtx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
      // Star pattern in center of some tiles
      if (Math.random() > 0.6) {
        fCtx.strokeStyle = 'rgba(196, 160, 53, 0.3)';
        fCtx.lineWidth = 0.5;
        const cx = x + tileSize / 2, cy = y + tileSize / 2;
        for (let a = 0; a < 8; a++) {
          const angle = (a / 8) * Math.PI * 2;
          fCtx.beginPath();
          fCtx.moveTo(cx, cy);
          fCtx.lineTo(cx + Math.cos(angle) * tileSize * 0.4, cy + Math.sin(angle) * tileSize * 0.4);
          fCtx.stroke();
        }
      }
      // Grout lines
      fCtx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      fCtx.lineWidth = 1;
      fCtx.strokeRect(x, y, tileSize, tileSize);
    }
  }

  const floorTex = new THREE.CanvasTexture(floorCanvas);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(3, 3);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6, metalness: 0.1, color: 0x3a2a1a }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Walls — Moroccan plaster with geometric borders
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = 512; wallCanvas.height = 512;
  const wCtx = wallCanvas.getContext('2d');
  // Base warm plaster
  wCtx.fillStyle = '#2a1a12';
  wCtx.fillRect(0, 0, 512, 512);
  // Subtle texture
  for (let i = 0; i < 300; i++) {
    wCtx.fillStyle = 'rgba(' + (30 + Math.random() * 20) + ', ' + (15 + Math.random() * 15) + ', ' + (8 + Math.random() * 10) + ', 0.3)';
    wCtx.beginPath();
    wCtx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 6 + 1, 0, Math.PI * 2);
    wCtx.fill();
  }
  // Geometric border pattern at top
  wCtx.strokeStyle = '#c4a035';
  wCtx.lineWidth = 2;
  for (let x = 0; x < 512; x += 24) {
    wCtx.beginPath();
    wCtx.moveTo(x, 20);
    wCtx.lineTo(x + 12, 8);
    wCtx.lineTo(x + 24, 20);
    wCtx.stroke();
  }

  const wallTex = new THREE.CanvasTexture(wallCanvas);
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  wallTex.repeat.set(2, 1);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, color: 0x2a1a12 });
  const w = 12, h = 6;

  // Ceiling — dark carved wood effect
  const ceilCanvas = document.createElement('canvas');
  ceilCanvas.width = 256; ceilCanvas.height = 256;
  const cCtx = ceilCanvas.getContext('2d');
  cCtx.fillStyle = '#0f0808';
  cCtx.fillRect(0, 0, 256, 256);
  // Cedar beam pattern
  for (let i = 0; i < 8; i++) {
    cCtx.fillStyle = 'hsl(15, 40%, ' + (8 + Math.random() * 6) + '%)';
    cCtx.fillRect(0, i * 32, 256, 28);
  }
  const ceilTex = new THREE.CanvasTexture(ceilCanvas);
  ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
  ceilTex.repeat.set(4, 4);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, w * 2),
    new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.9, color: 0x1a0f0a }));
  ceil.position.y = h; ceil.rotation.x = Math.PI / 2;
  scene.add(ceil);

  // Walls
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), wallMat);
  back.position.set(0, h / 2, -w / 2); back.receiveShadow = true;
  scene.add(back);

  const sideGeo = new THREE.BoxGeometry(0.3, h, w);
  const leftWall = new THREE.Mesh(sideGeo, wallMat);
  leftWall.position.set(-w / 2, h / 2, 0); leftWall.receiveShadow = true;
  scene.add(leftWall);
  const rightWall = new THREE.Mesh(sideGeo, wallMat);
  rightWall.position.set(w / 2, h / 2, 0); rightWall.receiveShadow = true;
  scene.add(rightWall);

  // Moorish arch window
  buildMoorishArch(0, 1.5, -w / 2 + 0.2, 3, 4);

  // Side arches (decorative)
  buildMoorishArch(-w / 2 + 0.2, 1, 0, 2, 3, true);
  buildMoorishArch(w / 2 - 0.2, 1, 0, 2, 3, true);

  // Moroccan rug (Beni Ourain style)
  const rugCanvas = document.createElement('canvas');
  rugCanvas.width = 256; rugCanvas.height = 384;
  const rCtx = rugCanvas.getContext('2d');
  // Cream/ivory base
  rCtx.fillStyle = '#e8dcc8';
  rCtx.fillRect(0, 0, 256, 384);
  // Diamond pattern
  rCtx.strokeStyle = '#2a1a0a';
  rCtx.lineWidth = 3;
  for (let y = 20; y < 384; y += 40) {
    for (let x = 20; x < 256; x += 40) {
      rCtx.beginPath();
      rCtx.moveTo(x, y - 15);
      rCtx.lineTo(x + 15, y);
      rCtx.lineTo(x, y + 15);
      rCtx.lineTo(x - 15, y);
      rCtx.closePath();
      rCtx.stroke();
    }
  }
  // Border fringe
  rCtx.fillStyle = '#2a1a0a';
  for (let x = 0; x < 256; x += 8) {
    rCtx.fillRect(x, 0, 3, 12);
    rCtx.fillRect(x, 372, 3, 12);
  }

  const rugTex = new THREE.CanvasTexture(rugCanvas);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4, 6),
    new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 0);
  rug.receiveShadow = true;
  scene.add(rug);

  // Cedar beams across ceiling
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x3a1a0a, roughness: 0.7 });
  for (let i = -2; i <= 2; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.15, 0.2), beamMat);
    beam.position.set(0, h - 0.1, i * 2.5);
    beam.castShadow = true;
    scene.add(beam);
  }
}

function buildMoorishArch(x, y, z, archW, archH, isSide) {
  // Horseshoe arch frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.5, metalness: 0.05 });

  // Vertical pillars
  const pillarGeo = new THREE.CylinderGeometry(0.08, 0.1, archH - 1, 8);
  const leftPillar = new THREE.Mesh(pillarGeo, frameMat);
  leftPillar.position.set(x - archW / 2, y + (archH - 1) / 2, z);
  if (isSide) leftPillar.rotation.y = Math.PI / 2;
  scene.add(leftPillar);

  const rightPillar = leftPillar.clone();
  rightPillar.position.set(x + archW / 2, y + (archH - 1) / 2, z);
  scene.add(rightPillar);

  // Arch top (torus segment for horseshoe shape)
  const archMat = new THREE.MeshStandardMaterial({ color: 0x4a2a12, roughness: 0.6 });
  const archGeo = new THREE.TorusGeometry(archW / 2, 0.08, 8, 16, Math.PI);
  const arch = new THREE.Mesh(archGeo, archMat);
  arch.position.set(x, y + archH - 1, z);
  if (isSide) arch.rotation.y = Math.PI / 2;
  scene.add(arch);

  // Decorative keystone
  const keystoneMat = new THREE.MeshStandardMaterial({ color: 0xc4a035, roughness: 0.3, metalness: 0.4 });
  const keystone = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.1), keystoneMat);
  keystone.position.set(x, y + archH - 0.85, z + 0.05);
  scene.add(keystone);

  // Window glass (only for main arch)
  if (!isSide) {
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x3355aa, transparent: true, opacity: 0.1,
      roughness: 0.0, metalness: 0.4, side: THREE.DoubleSide,
      emissive: 0x112244, emissiveIntensity: 0.4
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(archW - 0.3, archH - 0.5), glassMat);
    glass.position.set(x, y + archH / 2, z - 0.01);
    scene.add(glass);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Dual Bookshelves — Carved Cedar
// ═══════════════════════════════════════════════════════════════════════════

function buildDualBookshelves() {
  booksGroup = new THREE.Group();
  scene.add(booksGroup);

  buildCedarShelf(-3.8, 0, -4.8, 'Candice');
  buildCedarShelf(3.8, 0, -4.8, 'Michael');

  addShelfNamePlate(-3.8, 4.0, -4.5, "Candice's Books");
  addShelfNamePlate(3.8, 4.0, -4.5, "Michael's Books");
}

function buildCedarShelf(x, y, z, owner) {
  const shelfWidth = 5.0;
  const shelfHeight = 3.8;
  const numShelves = 4;
  const shelfDepth = 0.4;
  const shelfThickness = 0.07;

  // Carved cedar texture
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 256; woodCanvas.height = 256;
  const wCtx = woodCanvas.getContext('2d');
  const baseHue = owner === 'Candice' ? 12 : 20;
  wCtx.fillStyle = 'hsl(' + baseHue + ', 50%, 18%)';
  wCtx.fillRect(0, 0, 256, 256);
  // Wood grain
  for (let i = 0; i < 50; i++) {
    wCtx.strokeStyle = 'hsla(' + baseHue + ', 35%, ' + (12 + Math.random() * 8) + '%, 0.5)';
    wCtx.lineWidth = 1;
    wCtx.beginPath();
    wCtx.moveTo(0, Math.random() * 256);
    wCtx.bezierCurveTo(80, Math.random() * 256, 180, Math.random() * 256, 256, Math.random() * 256);
    wCtx.stroke();
  }
  // Carved geometric border
  wCtx.strokeStyle = 'rgba(196, 160, 53, 0.25)';
  wCtx.lineWidth = 1.5;
  for (let i = 0; i < 256; i += 16) {
    wCtx.beginPath();
    wCtx.moveTo(i, 0); wCtx.lineTo(i + 8, 8); wCtx.lineTo(i + 16, 0);
    wCtx.stroke();
    wCtx.beginPath();
    wCtx.moveTo(i, 256); wCtx.lineTo(i + 8, 248); wCtx.lineTo(i + 16, 256);
    wCtx.stroke();
  }
  const woodTex = new THREE.CanvasTexture(woodCanvas);

  const shelfMat = new THREE.MeshStandardMaterial({
    map: woodTex, color: owner === 'Candice' ? 0x5a2a1a : 0x4a2518,
    roughness: 0.6, metalness: 0.03
  });
  const backMat = new THREE.MeshStandardMaterial({ color: 0x0a0605, roughness: 0.95 });

  const shelf = new THREE.Group();

  // Side panels
  const sideGeo = new THREE.BoxGeometry(0.15, shelfHeight + 0.4, shelfDepth);
  const leftSide = new THREE.Mesh(sideGeo, shelfMat);
  leftSide.position.set(-shelfWidth / 2, (shelfHeight + 0.4) / 2, 0);
  leftSide.castShadow = true; shelf.add(leftSide);
  const rightSide = new THREE.Mesh(sideGeo, shelfMat);
  rightSide.position.set(shelfWidth / 2, (shelfHeight + 0.4) / 2, 0);
  rightSide.castShadow = true; shelf.add(rightSide);

  // Crown with carved detail
  const crownGeo = new THREE.BoxGeometry(shelfWidth + 0.4, 0.2, shelfDepth + 0.1);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x6a3a1a, roughness: 0.5, metalness: 0.05 });
  const crown = new THREE.Mesh(crownGeo, crownMat);
  crown.position.set(0, shelfHeight + 0.3, 0); crown.castShadow = true;
  shelf.add(crown);

  // Brass corner accents
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc4a035, roughness: 0.3, metalness: 0.6 });
  [[-shelfWidth / 2, shelfHeight + 0.3, shelfDepth / 2], [shelfWidth / 2, shelfHeight + 0.3, shelfDepth / 2]].forEach(pos => {
    const accent = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), brassMat);
    accent.position.set(...pos);
    shelf.add(accent);
  });

  // Shelves + books
  for (let s = 0; s <= numShelves; s++) {
    const sy = s * (shelfHeight / numShelves) + 0.1;

    const board = new THREE.Mesh(new THREE.BoxGeometry(shelfWidth - 0.02, shelfThickness, shelfDepth - 0.02), shelfMat);
    board.position.set(0, sy, 0); board.castShadow = true; board.receiveShadow = true;
    shelf.add(board);

    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(shelfWidth - 0.04, shelfHeight / numShelves - 0.08, 0.02), backMat);
    backPanel.position.set(0, sy + (shelfHeight / numShelves) / 2, -shelfDepth / 2 + 0.01);
    shelf.add(backPanel);

    if (s < numShelves) {
      const books = userBooks[owner] || [];
      const booksOnShelf = Math.min(7, Math.max(3, 4 + s));
      const shelfSpace = shelfHeight / numShelves - shelfThickness - 0.02;

      for (let b = 0; b < booksOnShelf; b++) {
        const bookH = shelfSpace * 0.7 + Math.random() * shelfSpace * 0.25;
        const bookW = 0.12 + Math.random() * 0.08;
        const bookD = 0.22 + Math.random() * 0.12;
        const bx = -shelfWidth / 2 + 0.3 + b * (shelfWidth - 0.6) / booksOnShelf;

        const bookData = books[b % Math.max(1, books.length)];
        let bookColor;
        if (bookData && bookData.spineColor) {
          bookColor = new THREE.Color(bookData.spineColor);
        } else {
          const hue = owner === 'Candice' ? (330 + Math.random() * 60) % 360 : (15 + Math.random() * 40);
          bookColor = new THREE.Color('hsl(' + hue + ', ' + (40 + Math.random() * 30) + '%, ' + (20 + Math.random() * 25) + '%)');
        }

        const spineMat = new THREE.MeshStandardMaterial({ color: bookColor, roughness: 0.5, metalness: 0.02 });

        const bookMesh = new THREE.Mesh(new THREE.BoxGeometry(bookW, bookH, bookD), spineMat);
        bookMesh.position.set(bx, sy + shelfThickness / 2 + bookH / 2, Math.random() * 0.05 - 0.02);
        bookMesh.rotation.y = (Math.random() - 0.5) * 0.04;
        bookMesh.castShadow = true; bookMesh.receiveShadow = true;

        // LARGE readable spine text
        const textCanvas = document.createElement('canvas');
        textCanvas.width = 128;
        textCanvas.height = Math.floor(bookH * 400);
        const tCtx = textCanvas.getContext('2d');
        tCtx.fillStyle = bookColor.getStyle();
        tCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);

        // Gold border lines
        tCtx.strokeStyle = 'rgba(253, 203, 110, 0.5)';
        tCtx.lineWidth = 2;
        tCtx.strokeRect(8, 8, textCanvas.width - 16, textCanvas.height - 16);

        // Title text — large and readable
        tCtx.fillStyle = '#ffe8a0';
        const fontSize = Math.max(16, Math.floor(textCanvas.height / 6));
        tCtx.font = 'bold ' + fontSize + 'px "Georgia", serif';
        tCtx.textAlign = 'center';
        tCtx.save();
        tCtx.translate(textCanvas.width / 2, textCanvas.height / 2);
        tCtx.rotate(-Math.PI / 2);
        const titleText = bookData ? bookData.title : '';
        // Word wrap for long titles
        if (titleText.length > 18) {
          const mid = Math.floor(titleText.length / 2);
          const breakIdx = titleText.lastIndexOf(' ', mid);
          const line1 = titleText.substring(0, breakIdx > 0 ? breakIdx : mid);
          const line2 = titleText.substring(breakIdx > 0 ? breakIdx + 1 : mid);
          tCtx.fillText(line1, 0, -fontSize * 0.6);
          tCtx.fillText(line2, 0, fontSize * 0.6);
        } else {
          tCtx.fillText(titleText, 0, fontSize * 0.3);
        }
        tCtx.restore();

        // Small author at bottom
        tCtx.fillStyle = 'rgba(255, 232, 160, 0.6)';
        tCtx.font = Math.max(10, fontSize * 0.5) + 'px serif';
        tCtx.save();
        tCtx.translate(textCanvas.width / 2, textCanvas.height - 20);
        tCtx.rotate(-Math.PI / 2);
        tCtx.fillText(owner, 0, 4);
        tCtx.restore();

        const spineTex = new THREE.CanvasTexture(textCanvas);
        const labelMat = spineMat.clone();
        labelMat.map = spineTex;

        const pageMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.9 });

        bookMesh.material = [
          labelMat,    // right (visible spine)
          spineMat,    // left
          spineMat,    // top
          spineMat,    // bottom
          pageMat,     // front (pages)
          spineMat     // back
        ];

        bookMesh.userData = {
          isBook: true,
          bookIdx: b % Math.max(1, books.length),
          owner: owner,
          originalPosition: bookMesh.position.clone(),
          spineColor: bookColor.getStyle()
        };

        shelf.add(bookMesh);
      }
    }
  }

  shelf.position.set(x, y, z);
  booksGroup.add(shelf);
}

function addShelfNamePlate(x, y, z, text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d');

  // Brass nameplate with ornate border
  const gradient = ctx.createLinearGradient(0, 0, 0, 96);
  gradient.addColorStop(0, '#c4a035');
  gradient.addColorStop(0.3, '#e8c840');
  gradient.addColorStop(0.7, '#d4b030');
  gradient.addColorStop(1, '#a08020');
  ctx.fillStyle = gradient;

  // Rounded ornate shape
  ctx.beginPath();
  ctx.moveTo(30, 10);
  ctx.lineTo(482, 10);
  ctx.quadraticCurveTo(502, 10, 502, 30);
  ctx.lineTo(502, 66);
  ctx.quadraticCurveTo(502, 86, 482, 86);
  ctx.lineTo(30, 86);
  ctx.quadraticCurveTo(10, 86, 10, 66);
  ctx.lineTo(10, 30);
  ctx.quadraticCurveTo(10, 10, 30, 10);
  ctx.fill();

  // Inner border
  ctx.strokeStyle = '#2a1a0a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 18);
  ctx.lineTo(472, 18);
  ctx.quadraticCurveTo(492, 18, 492, 38);
  ctx.lineTo(492, 58);
  ctx.quadraticCurveTo(492, 78, 472, 78);
  ctx.lineTo(40, 78);
  ctx.quadraticCurveTo(20, 78, 20, 58);
  ctx.lineTo(20, 38);
  ctx.quadraticCurveTo(20, 18, 40, 18);
  ctx.stroke();

  ctx.fillStyle = '#1a0a04';
  ctx.font = 'bold 32px "Georgia", serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 256, 58);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x, y, z);
  sprite.scale.set(2.4, 0.45, 1);
  scene.add(sprite);
}

// ═══════════════════════════════════════════════════════════════════════════
// Brass Lanterns (replacing candles)
// ═══════════════════════════════════════════════════════════════════════════

function buildBrassLanterns() {
  lanternsGroup = new THREE.Group();
  scene.add(lanternsGroup);

  const positions = [
    [-4, 0, -3.5], [-1.5, 0, -3.5], [1.5, 0, -3.5], [4, 0, -3.5],
    [-3, 0, 0], [3, 0, 0],
    [-5, 0, 2.5], [5, 0, 2.5], [0, 0, -4.5]
  ];

  positions.forEach((pos, idx) => {
    const isHanging = idx < 4;
    const lanternY = isHanging ? 3.5 : 0.6;

    const brassMat = new THREE.MeshStandardMaterial({ color: 0xc4a035, roughness: 0.3, metalness: 0.6 });
    const darkBrass = new THREE.MeshStandardMaterial({ color: 0x8a6a20, roughness: 0.4, metalness: 0.5 });

    // Lantern body (octagonal approximation)
    const bodyGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.25, 8);
    const body = new THREE.Mesh(bodyGeo, darkBrass);
    body.position.set(pos[0], lanternY, pos[2]);
    body.castShadow = true;
    lanternsGroup.add(body);

    // Top dome
    const domeGeo = new THREE.SphereGeometry(0.09, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, brassMat);
    dome.position.set(pos[0], lanternY + 0.125, pos[2]);
    lanternsGroup.add(dome);

    // Bottom cap
    const capGeo = new THREE.CylinderGeometry(0.1, 0.06, 0.04, 8);
    const cap = new THREE.Mesh(capGeo, brassMat);
    cap.position.set(pos[0], lanternY - 0.125 - 0.02, pos[2]);
    lanternsGroup.add(cap);

    // Chain (for hanging lanterns)
    if (isHanging) {
      const chainMat = new THREE.MeshStandardMaterial({ color: 0x8a6a20, roughness: 0.5, metalness: 0.5 });
      for (let c = 0; c < 5; c++) {
        const link = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.004, 4, 6), chainMat);
        link.position.set(pos[0], lanternY + 0.2 + c * 0.12, pos[2]);
        link.rotation.x = c % 2 === 0 ? 0 : Math.PI / 2;
        lanternsGroup.add(link);
      }
    } else {
      // Base for standing lanterns
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.03, 8), brassMat);
      base.position.set(pos[0], 0.015, pos[2]);
      lanternsGroup.add(base);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, lanternY - 0.15, 6), darkBrass);
      stem.position.set(pos[0], (lanternY - 0.15) / 2 + 0.03, pos[2]);
      lanternsGroup.add(stem);
    }

    // Inner flame glow
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.8 });
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), flameMat);
    flame.position.set(pos[0], lanternY, pos[2]);
    flame.userData.isFlame = true;
    lanternsGroup.add(flame);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3D Dust Particles
// ═══════════════════════════════════════════════════════════════════════════

function buildDustParticles3D() {
  const count = 200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 1] = Math.random() * 5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  dustParticles = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffddaa, size: 0.02, transparent: true, opacity: 0.3,
    sizeAttenuation: true, blending: THREE.AdditiveBlending
  }));
  scene.add(dustParticles);
}

// ═══════════════════════════════════════════════════════════════════════════
// Moroccan Decorations
// ═══════════════════════════════════════════════════════════════════════════

function buildMoroccanDecorations() {
  // Low reading table (Moroccan brass tray table)
  const trayMat = new THREE.MeshStandardMaterial({ color: 0xc4a035, roughness: 0.3, metalness: 0.5 });
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.03, 16), trayMat);
  tray.position.set(0, 0.45, 1.5); tray.castShadow = true;
  scene.add(tray);
  // Tray legs
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.43, 6), trayMat);
    leg.position.set(Math.cos(angle) * 0.4, 0.22, 1.5 + Math.sin(angle) * 0.4);
    scene.add(leg);
  }

  // Open book on tray
  const bookMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.9 });
  const openBook = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.015, 0.3), bookMat);
  openBook.position.set(0, 0.47, 1.5);
  openBook.rotation.y = 0.2;
  scene.add(openBook);

  // Floor cushions (Moroccan poufs)
  const poufColors = [0x8B2252, 0x2a5a4a, 0xc4a035];
  [[-1, 0, 2], [1, 0, 2], [0, 0, 2.8]].forEach((pos, i) => {
    const poufMat = new THREE.MeshStandardMaterial({ color: poufColors[i], roughness: 0.8 });
    const pouf = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), poufMat);
    pouf.position.set(pos[0], 0.15, pos[2]);
    pouf.scale.y = 0.5;
    pouf.castShadow = true;
    scene.add(pouf);
  });

  // Decorative pottery
  const potMat = new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.7 });
  const pot = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.08, 0.02), new THREE.Vector2(0.12, 0.1),
    new THREE.Vector2(0.1, 0.2), new THREE.Vector2(0.06, 0.25), new THREE.Vector2(0.07, 0.3)
  ], 12), potMat);
  pot.position.set(-4.5, 0, -2);
  scene.add(pot);
  const pot2 = pot.clone();
  pot2.position.set(4.5, 0, -2);
  pot2.scale.set(0.8, 1.2, 0.8);
  scene.add(pot2);
}

// ═══════════════════════════════════════════════════════════════════════════
// Interaction
// ═══════════════════════════════════════════════════════════════════════════

function onMouseMove(e) {
  if (currentScreen !== 'library') return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  if (isBookOpen || !scene) return;

  raycaster.setFromCamera(mouse, camera);
  const books = [];
  scene.traverse(obj => { if (obj.userData && obj.userData.isBook) books.push(obj); });
  const hits = raycaster.intersectObjects(books, true);

  if (hits.length > 0) {
    let hit = hits[0].object;
    while (hit && !hit.userData?.isBook) hit = hit.parent;
    if (hit && hit.userData?.isBook) {
      if (hoveredBook !== hit) {
        if (hoveredBook) gsap.to(hoveredBook.position, { z: hoveredBook.userData.originalPosition.z, duration: 0.3 });
        hoveredBook = hit;
        gsap.to(hit.position, { z: hit.userData.originalPosition.z + 0.12, duration: 0.3 });
        renderer.domElement.style.cursor = 'pointer';
      }
    }
  } else {
    if (hoveredBook) {
      gsap.to(hoveredBook.position, { z: hoveredBook.userData.originalPosition.z, duration: 0.3 });
      hoveredBook = null;
    }
    renderer.domElement.style.cursor = 'grab';
  }
}

function onMouseClick(e) {
  if (currentScreen !== 'library' || isBookOpen || !scene) return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const books = [];
  scene.traverse(obj => { if (obj.userData && obj.userData.isBook) books.push(obj); });
  const hits = raycaster.intersectObjects(books, true);
  if (hits.length > 0) {
    let hit = hits[0].object;
    while (hit && !hit.userData?.isBook) hit = hit.parent;
    if (hit && hit.userData?.isBook) pickUpBook3D(hit);
  }
}

async function pickUpBook3D(bookObj) {
  if (isBookOpen) return;
  isBookOpen = true;

  const owner = bookObj.userData.owner;
  const bookIdx = bookObj.userData.bookIdx || 0;
  const bookData = (userBooks[owner] || [])[bookIdx];
  if (!bookData) { isBookOpen = false; return; }

  const allBooks = getAllBooks();
  currentBookIdx = allBooks.findIndex(b => b === bookData);
  if (currentBookIdx < 0) currentBookIdx = 0;
  currentPageIdx = 0;

  const targetPos = camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1.5));
  gsap.to(bookObj.position, { x: targetPos.x, y: targetPos.y - 0.5, z: targetPos.z, duration: 0.8, ease: 'power2.inOut' });
  gsap.to(bookObj.rotation, { y: Math.PI / 6, x: 0.1, duration: 0.6 });
  await sleep(600);
  openBookOverlay(bookData);
  gsap.to(bookObj.scale, { x: 0, y: 0, z: 0, duration: 0.4 });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function darken(hex) {
  try {
    let r = parseInt(hex.slice(1, 3), 16) - 35;
    let g = parseInt(hex.slice(3, 5), 16) - 35;
    let b = parseInt(hex.slice(5, 7), 16) - 35;
    return '#' + [r, g, b].map(v => Math.max(0, v).toString(16).padStart(2, '0')).join('');
  } catch { return '#3e2723'; }
}

// ═══════════════════════════════════════════════════════════════════════════
// Camera — with shelf zoom
// ═══════════════════════════════════════════════════════════════════════════

let orbitAngle = 0;

function setCameraTarget(state) {
  cameraState = state;
  if (state === 'left-shelf') {
    cameraTarget = { x: -2.5, y: 1.8, z: -2, lx: -3.8, ly: 1.8, lz: -4.8 };
  } else if (state === 'right-shelf') {
    cameraTarget = { x: 2.5, y: 1.8, z: -2, lx: 3.8, ly: 1.8, lz: -4.8 };
  } else {
    cameraTarget = null; // resume orbit
    cameraState = 'orbit';
  }
}

function updateCamera() {
  if (isBookOpen || currentScreen !== 'library') return;

  if (cameraState === 'orbit' || !cameraTarget) {
    orbitAngle += 0.00015;
    const r = 6;
    camera.position.x += (Math.sin(orbitAngle) * r - camera.position.x) * 0.02;
    camera.position.z += (Math.cos(orbitAngle) * r - camera.position.z) * 0.02;
    camera.position.y += (1.8 + Math.sin(orbitAngle * 0.5) * 0.15 - camera.position.y) * 0.02;
    camera.lookAt(0, 1.5, -1);
  } else {
    camera.position.x += (cameraTarget.x - camera.position.x) * cameraLerp;
    camera.position.y += (cameraTarget.y - camera.position.y) * cameraLerp;
    camera.position.z += (cameraTarget.z - camera.position.z) * cameraLerp;
    camera.lookAt(cameraTarget.lx, cameraTarget.ly, cameraTarget.lz);
  }
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
}

// ═══════════════════════════════════════════════════════════════════════════
// Animation Loop
// ═══════════════════════════════════════════════════════════════════════════

function animate() {
  requestAnimationFrame(animate);
  if (!clock || currentScreen !== 'library') return;
  const t = clock.getElapsedTime();

  // Lantern flicker
  if (lanternsGroup) {
    lanternsGroup.traverse(obj => {
      if (obj.userData && obj.userData.isFlame) {
        const flicker = 0.85 + Math.sin(t * 5 + obj.position.x * 3) * 0.1 + Math.sin(t * 9 + obj.position.z) * 0.05;
        obj.scale.set(flicker, flicker * 1.2, flicker);
        obj.material.color.setHSL(0.12, 0.9, 0.55 + Math.sin(t * 7) * 0.05);
      }
    });
  }

  // Dust drift
  if (dustParticles) {
    const positions = dustParticles.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += Math.sin(t + i) * 0.0005;
      positions[i + 1] += 0.001;
      positions[i + 2] += Math.cos(t + i) * 0.0003;
      if (positions[i + 1] > 5) positions[i + 1] = 0;
    }
    dustParticles.geometry.attributes.position.needsUpdate = true;
  }

  updateCamera();

  if (composer) {
    if (bloomPass) bloomPass.strength = 0.6 + Math.sin(t * 0.3) * 0.1;
    composer.render();
  } else if (renderer) {
    renderer.render(scene, camera);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Fallback (mobile)
// ═══════════════════════════════════════════════════════════════════════════

function initFallbackLibrary() {
  renderFallbackShelf('Candice', document.getElementById('fallbackCandiceGrid'));
  renderFallbackShelf('Michael', document.getElementById('fallbackMichaelGrid'));
}

function renderFallbackShelf(owner, container) {
  if (!container) return;
  const books = userBooks[owner] || [];
  container.innerHTML = '';
  books.forEach((book) => {
    const el = document.createElement('div');
    el.className = 'fallback-book';
    el.innerHTML = '<div class="fallback-book-color" style="background:' + (book.spineColor || '#5d4037') + '"></div><div class="fallback-book-title">' + book.title + '</div><div class="fallback-book-pages">' + (book.pages ? book.pages.length : 0) + ' pages</div>';
    el.addEventListener('click', () => {
      const allBooks = getAllBooks();
      currentBookIdx = allBooks.findIndex(b => b === book);
      if (currentBookIdx < 0) currentBookIdx = 0;
      currentPageIdx = 0;
      openBookOverlay(book);
    });
    container.appendChild(el);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Screen Navigation
// ═══════════════════════════════════════════════════════════════════════════

function enterLibrary() {
  currentScreen = 'library';
  showScreen('library');
  if (USE_THREE && !threeInitialized) initThree();
  else if (!USE_THREE) {
    document.getElementById('fallback-library').classList.remove('hidden');
    initFallbackLibrary();
  }
  initFlickerOverlay();
  initDustOverlay();
  if (audioEnabled) playAmbientPiano();
}

function backToDashboard() {
  currentScreen = 'dashboard';
  cameraState = 'orbit';
  cameraTarget = null;
  showScreen('dashboard');
  renderDashboard();
}

// ═══════════════════════════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  try { await loadConfig(); } catch (e) {
    CONFIG = { herName: 'Candice', yourName: 'Michael', books: [], countdownDate: new Date(Date.now() + 30 * 86400000).toISOString() };
  }

  initSupabase();
  loadUserBooks();

  const user = await checkSession();

  const loadingScreen = document.getElementById('loading-screen');
  setTimeout(() => {
    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (user) {
      currentScreen = 'dashboard';
      showScreen('dashboard');
      updateDashboardUser();
      renderDashboard();
    } else {
      currentScreen = 'login';
      showScreen('login');
    }
  }, 1800);

  initAuthUI();
  initBookOverlay();
  initAddBookModal();
  initMemoryForm();

  document.getElementById('btn-enter-library')?.addEventListener('click', enterLibrary);
  document.getElementById('btn-back-dashboard')?.addEventListener('click', backToDashboard);
  document.getElementById('btn-toggle-audio')?.addEventListener('click', toggleAudio);

  // Shelf zoom buttons
  document.getElementById('btn-zoom-left')?.addEventListener('click', () => {
    if (cameraState === 'left-shelf') setCameraTarget('orbit');
    else setCameraTarget('left-shelf');
  });
  document.getElementById('btn-zoom-right')?.addEventListener('click', () => {
    if (cameraState === 'right-shelf') setCameraTarget('orbit');
    else setCameraTarget('right-shelf');
  });
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => setCameraTarget('orbit'));
});

window.addEventListener('error', (e) => { console.error('Global error:', e.message); });
