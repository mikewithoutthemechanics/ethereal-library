/**
 * ETHEREAL LIBRARY — Immersive 3D Library Experience
 * Enhanced Three.js room with realistic bookshelves for Candice & Michael
 * Full book upload, page creation, and reading functionality
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
let candlesGroup = null;
let dustParticles = null;
let raycaster, mouse;
let hoveredBook = null;
let selectedBook = null;
let ambientSource, audioCtx, audioGain, audioEnabled = true;
let isBookOpen = false;
let currentPageIdx = 0;
let currentBookIdx = 0;
let currentShelf = 'all';
let threeInitialized = false;
let currentScreen = 'loading';

// Book storage
let userBooks = { Candice: [], Michael: [] };

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
    if (saved) {
      userBooks = JSON.parse(saved);
    }
  } catch {}

  // Merge config books into appropriate shelves if not already present
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
  try {
    localStorage.setItem('ethereal_books', JSON.stringify(userBooks));
  } catch {}
}

function getAllBooks() {
  return [...(userBooks.Candice || []), ...(userBooks.Michael || [])];
}

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard — Book Shelves UI
// ═══════════════════════════════════════════════════════════════════════════

function renderDashboard() {
  renderShelfBooks('Candice', document.getElementById('candice-books'));
  renderShelfBooks('Michael', document.getElementById('michael-books'));
}

function renderShelfBooks(owner, container) {
  if (!container) return;
  const books = userBooks[owner] || [];
  container.innerHTML = '';

  if (books.length === 0) {
    container.innerHTML = `<div class="empty-shelf"><p>No books yet. Add one!</p></div>`;
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
        ${!book.isDefault ? `<button class="btn-delete-book" data-owner="${owner}" data-idx="${idx}">Delete</button>` : ''}
      </div>
    `;
    container.appendChild(el);
  });

  // Attach event listeners
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

  // Find global index
  const allBooks = getAllBooks();
  const globalIdx = allBooks.findIndex(b => b.title === book.title && b.owner === owner);
  currentBookIdx = globalIdx >= 0 ? globalIdx : 0;
  currentPageIdx = 0;

  openBookOverlay(book);
}

function openBookOverlay(book) {
  const overlay = document.getElementById('book-overlay');
  const cover = document.getElementById('book-cover');
  const title = document.getElementById('book-title-cover');
  const author = document.getElementById('book-author');

  title.textContent = book.title;
  author.textContent = `by ${book.owner || CONFIG.yourName}`;
  const sc = book.spineColor || '#5d4037';
  document.querySelector('.cover-front').style.background =
    `linear-gradient(145deg, ${sc}, ${darken(sc)})`;
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
// Add Book Modal
// ═══════════════════════════════════════════════════════════════════════════

function initAddBookModal() {
  const modal = document.getElementById('add-book-modal');
  const form = document.getElementById('add-book-form');

  // Open modal
  document.getElementById('btn-add-book')?.addEventListener('click', () => {
    modal.classList.remove('hidden');
  });
  document.querySelectorAll('.btn-add-to-shelf').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('book-owner-select').value = btn.dataset.owner;
      modal.classList.remove('hidden');
    });
  });

  // Close modal
  document.getElementById('modal-close-add')?.addEventListener('click', () => {
    modal.classList.add('hidden');
    form.reset();
    resetPagesEditor();
  });
  document.getElementById('btn-cancel-book')?.addEventListener('click', () => {
    modal.classList.add('hidden');
    form.reset();
    resetPagesEditor();
  });
  modal.querySelector('.modal-backdrop')?.addEventListener('click', () => {
    modal.classList.add('hidden');
    form.reset();
    resetPagesEditor();
  });

  // Add page button
  document.getElementById('btn-add-page')?.addEventListener('click', addPageEntry);

  // Page type toggle
  document.getElementById('pages-editor')?.addEventListener('change', (e) => {
    if (e.target.classList.contains('page-type-select')) {
      const entry = e.target.closest('.page-entry');
      togglePageFields(entry, e.target.value);
    }
  });

  // Photo upload preview
  document.getElementById('pages-editor')?.addEventListener('change', (e) => {
    if (e.target.classList.contains('page-photo-input')) {
      handlePhotoUpload(e.target);
    }
  });

  // Submit form
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    createNewBook();
  });
}

function togglePageFields(entry, type) {
  const textarea = entry.querySelector('.page-text');
  const photoInput = entry.querySelector('.page-photo-input');
  const photoPreview = entry.querySelector('.page-photo-preview');
  const fromInput = entry.querySelector('.page-from');

  textarea.classList.toggle('hidden', type === 'photo');
  photoInput.classList.toggle('hidden', type !== 'photo');
  photoPreview.classList.toggle('hidden', type !== 'photo');
  fromInput.classList.toggle('hidden', type !== 'note');
}

function addPageEntry() {
  const editor = document.getElementById('pages-editor');
  const count = editor.querySelectorAll('.page-entry').length;
  const entry = document.createElement('div');
  entry.className = 'page-entry';
  entry.dataset.pageIdx = count;
  entry.innerHTML = `
    <select class="page-type-select">
      <option value="letter">Letter/Text</option>
      <option value="photo">Photo</option>
      <option value="note">Note</option>
    </select>
    <textarea class="page-text" placeholder="Write your text here..."></textarea>
    <input type="file" class="page-photo-input hidden" accept="image/*" />
    <div class="page-photo-preview hidden"></div>
    <input type="text" class="page-from hidden" placeholder="From (name)" />
    <select class="page-align">
      <option value="center">Center</option>
      <option value="left">Left</option>
      <option value="right">Right</option>
    </select>
    <button type="button" class="btn-remove-page" title="Remove page">&times;</button>
  `;
  editor.appendChild(entry);

  entry.querySelector('.btn-remove-page').addEventListener('click', () => {
    entry.remove();
  });
}

function resetPagesEditor() {
  const editor = document.getElementById('pages-editor');
  editor.innerHTML = `
    <div class="page-entry" data-page-idx="0">
      <select class="page-type-select">
        <option value="letter">Letter/Text</option>
        <option value="photo">Photo</option>
        <option value="note">Note</option>
      </select>
      <textarea class="page-text" placeholder="Write your text here..."></textarea>
      <input type="file" class="page-photo-input hidden" accept="image/*" />
      <div class="page-photo-preview hidden"></div>
      <input type="text" class="page-from hidden" placeholder="From (name)" />
      <select class="page-align">
        <option value="center">Center</option>
        <option value="left">Left</option>
        <option value="right">Right</option>
      </select>
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
    preview.innerHTML = `<img src="${e.target.result}" alt="Preview" />`;
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
      if (photoData) {
        pages.push({ type: 'photo', file: photoData, caption: entry.querySelector('.page-text').value.trim() || 'Photo', isDataUrl: true });
      }
    } else if (type === 'note') {
      const text = entry.querySelector('.page-text').value.trim();
      const from = entry.querySelector('.page-from').value.trim() || owner;
      if (text) pages.push({ type: 'note', from, text, align });
    }
  });

  if (pages.length === 0) {
    alert('Please add at least one page with content.');
    return;
  }

  const newBook = { title, spineColor, owner, pages, isDefault: false, createdAt: Date.now() };

  if (!userBooks[owner]) userBooks[owner] = [];
  userBooks[owner].push(newBook);
  saveUserBooks();

  // Close modal and refresh
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

  const p0 = book.pages[idx];
  const p1 = book.pages[idx + 1];

  leftContent.innerHTML = buildPageHTML(p0);
  rightContent.innerHTML = buildPageHTML(p1 || { type: 'end' });

  counter.textContent = `${idx + 1} / ${book.pages.length}`;

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
  const pct = ((currentPageIdx + 1) / book.pages.length) * 100;
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = pct + '%';
}

function buildPageHTML(page) {
  if (!page) return '<div class="page-empty">~</div>';
  if (page.type === 'end') return '<div class="page-end">The End</div>';

  let html = '';
  if (page.type === 'letter') {
    const align = page.align === 'center' ? 'center' : 'left';
    html = `<div class="page-letter" style="text-align:${align}">${escapeHtml(page.text).replace(/\n/g, '<br>')}</div>`;
  } else if (page.type === 'photo') {
    const src = page.isDataUrl ? page.file : `assets/${page.file}`;
    html = `
      <img src="${src}" alt="${escapeHtml(page.caption || '')}" onerror="this.style.display='none'">
      <div class="page-caption">${escapeHtml(page.caption || '')}</div>
    `;
  } else if (page.type === 'note') {
    const align = page.align === 'right' ? 'right' : 'left';
    html = `
      <p class="page-note-from">&mdash; ${escapeHtml(page.from || 'Anonymous')}</p>
      <div class="page-letter" style="text-align:${align}">${escapeHtml(page.text).replace(/\n/g, '<br>')}</div>
    `;
  }
  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getCurrentBook() {
  const allBooks = getAllBooks();
  return allBooks[currentBookIdx] || null;
}

function nextPage() {
  const book = getCurrentBook();
  if (book && currentPageIdx + 2 < book.pages.length) {
    currentPageIdx += 2;
    showPage(book, currentPageIdx);
  }
}

function prevPage() {
  const book = getCurrentBook();
  if (book && currentPageIdx > 0) {
    currentPageIdx = Math.max(0, currentPageIdx - 2);
    showPage(book, currentPageIdx);
  }
}

function closeBook() {
  const overlay = document.getElementById('book-overlay');
  const cover = document.getElementById('book-cover');

  cover.classList.add('closing');
  setTimeout(() => {
    cover.classList.remove('opened');
    cover.classList.remove('closing');
    document.getElementById('book-pages').classList.add('hidden');
    overlay.classList.add('hidden');
    isBookOpen = false;
  }, 600);
}

function initBookOverlay() {
  document.getElementById('close-book')?.addEventListener('click', closeBook);
  document.getElementById('next-page')?.addEventListener('click', nextPage);
  document.getElementById('prev-page')?.addEventListener('click', prevPage);
  document.getElementById('book-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeBook();
  });

  // Swipe gestures for pages
  const pages = document.getElementById('book-pages');
  if (pages) {
    let sx, sy;
    pages.addEventListener('touchstart', (e) => {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    }, { passive: true });
    pages.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) nextPage();
        else prevPage();
      }
    }, { passive: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Ambient Audio
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
  if (!audioGain || !audioCtx) {
    playAmbientPiano();
    return;
  }
  const v = audioGain.gain.value;
  audioGain.gain.linearRampToValueAtTime(v > 0.01 ? 0 : 0.2, audioCtx.currentTime + 0.5);
}

// ═══════════════════════════════════════════════════════════════════════════
// Dust Particle Overlay
// ═══════════════════════════════════════════════════════════════════════════

function initDustOverlay() {
  const canvas = document.getElementById('dust-overlay');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const particles = [];
  for (let i = 0; i < 80; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 2 + 0.5,
      speedX: (Math.random() - 0.5) * 0.3,
      speedY: -Math.random() * 0.4 - 0.1,
      opacity: Math.random() * 0.5 + 0.1,
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
      ctx.fillStyle = `rgba(255, 220, 150, ${p.opacity * (0.5 + Math.sin(t * 2 + p.drift) * 0.3)})`;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }
  draw();
}

// ═══════════════════════════════════════════════════════════════════════════
// Candle Flicker Overlay
// ═══════════════════════════════════════════════════════════════════════════

function initFlickerOverlay() {
  const canvas = document.getElementById('flicker-overlay');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const time = Date.now() * 0.001;
    const numCandles = 8;

    for (let i = 0; i < numCandles; i++) {
      const cx = 0.08 + (i / numCandles) * 0.84;
      const cy = 0.25 + Math.sin(time * 0.4 + i * 1.8) * 0.12;
      const flicker = 0.6 + Math.sin(time * 4 + i * 2.3) * 0.2 + Math.sin(time * 9.1 + i) * 0.1;
      const radius = canvas.width * (0.1 + Math.sin(time * 0.6 + i) * 0.03);

      const gradient = ctx.createRadialGradient(
        canvas.width * cx, canvas.height * cy, 0,
        canvas.width * cx, canvas.height * cy, radius
      );
      gradient.addColorStop(0, `rgba(255, 150, 40, ${0.07 * flicker})`);
      gradient.addColorStop(0.4, `rgba(255, 100, 20, ${0.04 * flicker})`);
      gradient.addColorStop(1, 'rgba(255, 60, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// ═══════════════════════════════════════════════════════════════════════════
// Three.js — Enhanced Immersive Library
// ═══════════════════════════════════════════════════════════════════════════

function initThree() {
  if (threeInitialized) return;
  threeInitialized = true;

  const container = document.getElementById('canvas-container');
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x080610, 0.025);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.8, 6);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x080610, 1);
  container.appendChild(renderer.domElement);

  // Post-processing bloom
  try {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.5, 0.82
    );
    composer.addPass(bloomPass);
  } catch (e) {
    console.warn('Post-processing unavailable:', e.message);
    composer = null;
  }

  clock = new THREE.Clock();

  buildEnhancedRoom();
  buildDualBookshelves();
  buildEnhancedCandles();
  buildDustParticles3D();
  buildDecorations();

  // Lighting
  const ambient = new THREE.AmbientLight(0x2a1a3a, 0.3);
  scene.add(ambient);

  const moonLight = new THREE.DirectionalLight(0x5577aa, 0.15);
  moonLight.position.set(2, 8, 4);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  scene.add(moonLight);

  // Warm candle point lights
  const candleLightPositions = [
    [-3.5, 2.2, -4], [-1.5, 2.2, -4], [0.5, 2.2, -4], [2.5, 2.2, -4],
    [-2.5, 1.0, -4.2], [1.5, 1.0, -4.2], [0, 3.5, -3],
    [-4, 1.5, 0], [4, 1.5, 0]
  ];
  candleLightPositions.forEach((pos, i) => {
    const light = new THREE.PointLight(0xffaa33, 2.5, 7, 1.8);
    light.position.set(...pos);
    light.castShadow = i < 4;
    if (light.castShadow) light.shadow.mapSize.set(256, 256);
    scene.add(light);
  });

  // Interaction
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  window.addEventListener('resize', onResize);
  window.addEventListener('click', onMouseClick);
  window.addEventListener('mousemove', onMouseMove);

  // Parallax moonlight
  const moonlight = document.getElementById('moonlight');
  if (moonlight) {
    document.addEventListener('mousemove', (e) => {
      if (isBookOpen) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 50;
      const y = (e.clientY / window.innerHeight - 0.5) * 25;
      moonlight.style.transform = `translateX(calc(-50% + ${x}px)) perspective(800px) rotateX(${20 + y}deg)`;
    });
  }

  animate();
}

function buildEnhancedRoom() {
  // Realistic wood floor with procedural texture
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 512; floorCanvas.height = 512;
  const fCtx = floorCanvas.getContext('2d');
  // Wood grain pattern
  fCtx.fillStyle = '#1a120a';
  fCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 20; i++) {
    const y = i * 26;
    fCtx.fillStyle = `hsl(${25 + Math.random() * 10}, ${40 + Math.random() * 20}%, ${12 + Math.random() * 8}%)`;
    fCtx.fillRect(0, y, 512, 24);
    // Grain lines
    for (let j = 0; j < 8; j++) {
      fCtx.strokeStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.15})`;
      fCtx.lineWidth = 0.5;
      fCtx.beginPath();
      fCtx.moveTo(0, y + Math.random() * 24);
      fCtx.lineTo(512, y + Math.random() * 24);
      fCtx.stroke();
    }
  }
  const floorTex = new THREE.CanvasTexture(floorCanvas);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(4, 4);

  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex, roughness: 0.85, metalness: 0.0, color: 0x3a2a1a
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Walls with subtle wallpaper texture
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = 256; wallCanvas.height = 256;
  const wCtx = wallCanvas.getContext('2d');
  wCtx.fillStyle = '#1a1420';
  wCtx.fillRect(0, 0, 256, 256);
  // Subtle damask pattern
  for (let i = 0; i < 100; i++) {
    wCtx.fillStyle = `rgba(40, 25, 50, ${Math.random() * 0.3})`;
    wCtx.beginPath();
    wCtx.arc(Math.random() * 256, Math.random() * 256, Math.random() * 8 + 2, 0, Math.PI * 2);
    wCtx.fill();
  }
  const wallTex = new THREE.CanvasTexture(wallCanvas);
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  wallTex.repeat.set(3, 2);

  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex, roughness: 0.9, metalness: 0.0, color: 0x1a1420
  });

  const w = 12, h = 6;

  // Ceiling
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0f0a15, roughness: 0.95 });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, w * 2), ceilMat);
  ceil.position.y = h;
  ceil.rotation.x = Math.PI / 2;
  scene.add(ceil);

  // Back wall
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), wallMat);
  back.position.set(0, h / 2, -w / 2);
  back.receiveShadow = true;
  scene.add(back);

  // Side walls
  const sideGeo = new THREE.BoxGeometry(0.3, h, w);
  const leftWall = new THREE.Mesh(sideGeo, wallMat);
  leftWall.position.set(-w / 2, h / 2, 0);
  leftWall.receiveShadow = true;
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(sideGeo, wallMat);
  rightWall.position.set(w / 2, h / 2, 0);
  rightWall.receiveShadow = true;
  scene.add(rightWall);

  // Arched window in back wall
  const windowGeo = new THREE.PlaneGeometry(3, 4);
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x4466aa, transparent: true, opacity: 0.12,
    roughness: 0.0, metalness: 0.5, side: THREE.DoubleSide, emissive: 0x223344, emissiveIntensity: 0.3
  });
  const windowMesh = new THREE.Mesh(windowGeo, windowMat);
  windowMesh.position.set(0, 3.5, -w / 2 + 0.2);
  scene.add(windowMesh);

  // Window frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.6 });
  const frameH = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.15), frameMat);
  frameH.position.set(0, 5.5, -w / 2 + 0.2);
  scene.add(frameH);
  const frameH2 = frameH.clone();
  frameH2.position.y = 1.5;
  scene.add(frameH2);
  const frameV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.2, 0.15), frameMat);
  frameV.position.set(-1.7, 3.5, -w / 2 + 0.2);
  scene.add(frameV);
  const frameV2 = frameV.clone();
  frameV2.position.x = 1.7;
  scene.add(frameV2);

  // Persian rug
  const rugCanvas = document.createElement('canvas');
  rugCanvas.width = 256; rugCanvas.height = 384;
  const rCtx = rugCanvas.getContext('2d');
  rCtx.fillStyle = '#3a1515';
  rCtx.fillRect(0, 0, 256, 384);
  // Border
  rCtx.strokeStyle = '#8B6914';
  rCtx.lineWidth = 12;
  rCtx.strokeRect(15, 15, 226, 354);
  rCtx.strokeStyle = '#5a2020';
  rCtx.lineWidth = 4;
  rCtx.strokeRect(30, 30, 196, 324);
  // Center pattern
  for (let i = 0; i < 6; i++) {
    rCtx.fillStyle = `hsl(${15 + i * 20}, ${50 + Math.random() * 20}%, ${25 + Math.random() * 10}%)`;
    rCtx.beginPath();
    rCtx.arc(128, 192, 30 + i * 15, 0, Math.PI * 2);
    rCtx.fill();
  }

  const rugTex = new THREE.CanvasTexture(rugCanvas);
  const rugMat = new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 });
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.01, 0);
  rug.receiveShadow = true;
  scene.add(rug);

  // Crown molding
  const moldMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.5, metalness: 0.05 });
  const moldGeo = new THREE.BoxGeometry(w + 0.6, 0.2, 0.25);
  const topMold = new THREE.Mesh(moldGeo, moldMat);
  topMold.position.set(0, h - 0.1, -w / 2 + 0.15);
  scene.add(topMold);

  // Baseboards
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.7 });
  const baseGeo = new THREE.BoxGeometry(w + 0.6, 0.15, 0.1);
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.set(0, 0.075, -w / 2 + 0.1);
  scene.add(baseMesh);
}

function buildDualBookshelves() {
  booksGroup = new THREE.Group();
  scene.add(booksGroup);

  // Candice's bookshelf (LEFT)
  buildRealisticShelf(-3.8, 0, -4.5, 'Candice');
  // Michael's bookshelf (RIGHT)
  buildRealisticShelf(3.8, 0, -4.5, 'Michael');

  // Shelf name plates
  addShelfNamePlate(-3.8, 3.8, -4.3, "Candice's Books");
  addShelfNamePlate(3.8, 3.8, -4.3, "Michael's Books");
}

function buildRealisticShelf(x, y, z, owner) {
  const shelfWidth = 4.8;
  const shelfHeight = 3.5;
  const numShelves = 4;
  const shelfDepth = 0.35;
  const shelfThickness = 0.06;
  const sideWidth = 0.15;

  // Realistic wood material
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 128; woodCanvas.height = 128;
  const wCtx = woodCanvas.getContext('2d');
  const baseHue = owner === 'Candice' ? 18 : 25;
  wCtx.fillStyle = `hsl(${baseHue}, 55%, 22%)`;
  wCtx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 30; i++) {
    wCtx.strokeStyle = `hsla(${baseHue}, 40%, ${15 + Math.random() * 10}%, 0.4)`;
    wCtx.lineWidth = 1;
    wCtx.beginPath();
    wCtx.moveTo(0, Math.random() * 128);
    wCtx.bezierCurveTo(40, Math.random() * 128, 90, Math.random() * 128, 128, Math.random() * 128);
    wCtx.stroke();
  }
  const woodTex = new THREE.CanvasTexture(woodCanvas);

  const shelfMat = new THREE.MeshStandardMaterial({
    map: woodTex, color: owner === 'Candice' ? 0x5a3a2a : 0x4a3020,
    roughness: 0.65, metalness: 0.03
  });
  const backMat = new THREE.MeshStandardMaterial({ color: 0x0a0805, roughness: 0.95 });

  const shelf = new THREE.Group();

  // Side panels with carved detail
  const sideGeo = new THREE.BoxGeometry(sideWidth, shelfHeight + 0.4, shelfDepth);
  const leftSide = new THREE.Mesh(sideGeo, shelfMat);
  leftSide.position.set(-shelfWidth / 2, (shelfHeight + 0.4) / 2, 0);
  leftSide.castShadow = true;
  shelf.add(leftSide);

  const rightSide = new THREE.Mesh(sideGeo, shelfMat);
  rightSide.position.set(shelfWidth / 2, (shelfHeight + 0.4) / 2, 0);
  rightSide.castShadow = true;
  shelf.add(rightSide);

  // Top piece (crown)
  const topGeo = new THREE.BoxGeometry(shelfWidth + sideWidth * 2, 0.12, shelfDepth + 0.06);
  const topPiece = new THREE.Mesh(topGeo, shelfMat);
  topPiece.position.set(0, shelfHeight + 0.26, 0);
  topPiece.castShadow = true;
  shelf.add(topPiece);

  // Decorative crown molding
  const crownGeo = new THREE.BoxGeometry(shelfWidth + sideWidth * 2 + 0.1, 0.06, 0.08);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x6d4a2a, roughness: 0.5 });
  const crown = new THREE.Mesh(crownGeo, crownMat);
  crown.position.set(0, shelfHeight + 0.35, shelfDepth / 2);
  shelf.add(crown);

  // Shelves and books
  for (let s = 0; s <= numShelves; s++) {
    const sy = s * (shelfHeight / numShelves) + 0.1;

    // Shelf board
    const boardGeo = new THREE.BoxGeometry(shelfWidth - 0.02, shelfThickness, shelfDepth - 0.02);
    const board = new THREE.Mesh(boardGeo, shelfMat);
    board.position.set(0, sy, 0);
    board.castShadow = true;
    board.receiveShadow = true;
    shelf.add(board);

    // Back panel
    const backGeo = new THREE.BoxGeometry(shelfWidth - 0.04, shelfHeight / numShelves - 0.08, 0.02);
    const backPanel = new THREE.Mesh(backGeo, backMat);
    backPanel.position.set(0, sy + (shelfHeight / numShelves) / 2, -shelfDepth / 2 + 0.01);
    shelf.add(backPanel);

    // Add books on this shelf
    if (s < numShelves) {
      const books = owner === 'Candice' ? (userBooks.Candice || []) : (userBooks.Michael || []);
      const booksOnShelf = Math.min(8, Math.max(4, 5 + s));

      for (let b = 0; b < booksOnShelf; b++) {
        const bookH = 0.5 + Math.random() * 0.25;
        const bookW = 0.08 + Math.random() * 0.06;
        const bookD = 0.18 + Math.random() * 0.1;
        const bx = -shelfWidth / 2 + 0.3 + b * (shelfWidth - 0.6) / booksOnShelf;

        // Use actual book colors if available
        const bookData = books[b % Math.max(1, books.length)];
        let bookColor;
        if (bookData && bookData.spineColor) {
          bookColor = new THREE.Color(bookData.spineColor);
        } else {
          const hue = owner === 'Candice' ? (330 + Math.random() * 60) % 360 : (15 + Math.random() * 40);
          const sat = 40 + Math.random() * 30;
          const lit = 20 + Math.random() * 25;
          bookColor = new THREE.Color(`hsl(${hue}, ${sat}%, ${lit}%)`);
        }

        // Book spine with leather-like material
        const spineMat = new THREE.MeshStandardMaterial({
          color: bookColor, roughness: 0.55, metalness: 0.02
        });

        const bookMesh = new THREE.Mesh(
          new THREE.BoxGeometry(bookW, bookH, bookD), spineMat
        );
        bookMesh.position.set(bx, sy + shelfThickness / 2 + bookH / 2, Math.random() * 0.05 - 0.02);
        bookMesh.rotation.y = (Math.random() - 0.5) * 0.05;
        bookMesh.castShadow = true;
        bookMesh.receiveShadow = true;

        // Gold text on spine
        const textCanvas = document.createElement('canvas');
        textCanvas.width = 32; textCanvas.height = Math.floor(bookH * 180);
        const tCtx = textCanvas.getContext('2d');
        tCtx.fillStyle = bookColor.getStyle();
        tCtx.fillRect(0, 0, 32, textCanvas.height);
        tCtx.fillStyle = '#ffe8a0';
        tCtx.font = `bold ${Math.max(7, textCanvas.height / 8)}px serif`;
        tCtx.textAlign = 'center';
        tCtx.save();
        tCtx.translate(16, textCanvas.height / 2);
        tCtx.rotate(-Math.PI / 2);
        const titleText = bookData ? bookData.title.substring(0, 12) : '';
        tCtx.fillText(titleText, 0, 5);
        tCtx.restore();

        const spineTex = new THREE.CanvasTexture(textCanvas);
        const labelMat = spineMat.clone();
        labelMat.map = spineTex;

        // Pages (cream colored edge)
        const pageMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.9 });

        bookMesh.material = [
          labelMat,   // right
          spineMat,   // left
          spineMat,   // top
          spineMat,   // bottom
          pageMat,    // front (pages)
          spineMat    // back
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
  canvas.width = 512; canvas.height = 80;
  const ctx = canvas.getContext('2d');

  // Brass nameplate
  const gradient = ctx.createLinearGradient(0, 0, 0, 80);
  gradient.addColorStop(0, '#c4a035');
  gradient.addColorStop(0.5, '#e8c840');
  gradient.addColorStop(1, '#a08020');
  ctx.fillStyle = gradient;
  ctx.roundRect(10, 10, 492, 60, 6);
  ctx.fill();

  ctx.fillStyle = '#2a1a0a';
  ctx.font = 'bold 28px "Cormorant Garamond", serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 256, 50);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x, y, z);
  sprite.scale.set(2.2, 0.35, 1);
  scene.add(sprite);
}

function buildEnhancedCandles() {
  candlesGroup = new THREE.Group();
  scene.add(candlesGroup);

  const candlePositions = [
    [-4, 0, -3.5], [-2, 0, -3.5], [0, 0, -4], [2, 0, -3.5], [4, 0, -3.5],
    [-3, 0, -1], [3, 0, -1],
    [-5, 0, 2], [5, 0, 2]
  ];

  candlePositions.forEach(pos => {
    // Candle holder (ornate brass)
    const holderMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.4, metalness: 0.5 });
    const holderBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.04, 12), holderMat);
    holderBase.position.set(pos[0], 0.02, pos[2]);
    holderBase.castShadow = true;
    candlesGroup.add(holderBase);

    const holderStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.15, 8), holderMat);
    holderStem.position.set(pos[0], 0.12, pos[2]);
    candlesGroup.add(holderStem);

    const holderCup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.04, 12), holderMat);
    holderCup.position.set(pos[0], 0.21, pos[2]);
    candlesGroup.add(holderCup);

    // Candle body (realistic wax)
    const waxMat = new THREE.MeshStandardMaterial({
      color: 0xfff8e8, roughness: 0.3, metalness: 0.0,
      transparent: true, opacity: 0.95
    });
    const candleH = 0.3 + Math.random() * 0.2;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, candleH, 12), waxMat);
    body.position.set(pos[0], 0.23 + candleH / 2, pos[2]);
    body.castShadow = true;
    candlesGroup.add(body);

    // Wick
    const wickMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.03, 4), wickMat);
    wick.position.set(pos[0], 0.23 + candleH + 0.015, pos[2]);
    candlesGroup.add(wick);

    // Flame (teardrop shape using sphere + cone)
    const flameGroup = new THREE.Group();
    const flameCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffffee, transparent: true, opacity: 0.95
    });
    const flameCore = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), flameCoreMat);

    const flameOuterMat = new THREE.MeshBasicMaterial({
      color: 0xffaa33, transparent: true, opacity: 0.7
    });
    const flameOuter = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), flameOuterMat);
    flameOuter.scale.set(0.7, 1.4, 0.7);

    const flameTipMat = new THREE.MeshBasicMaterial({
      color: 0xff6600, transparent: true, opacity: 0.4
    });
    const flameTip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 8), flameTipMat);
    flameTip.position.y = 0.035;

    flameGroup.add(flameCore);
    flameGroup.add(flameOuter);
    flameGroup.add(flameTip);
    flameGroup.position.set(pos[0], 0.23 + candleH + 0.05, pos[2]);
    flameGroup.userData.isFlame = true;
    candlesGroup.add(flameGroup);
  });
}

function buildDustParticles3D() {
  const count = 200;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 1] = Math.random() * 5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
    sizes[i] = Math.random() * 3 + 1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    color: 0xffddaa, size: 0.015, transparent: true, opacity: 0.3,
    sizeAttenuation: true, blending: THREE.AdditiveBlending
  });

  dustParticles = new THREE.Points(geo, mat);
  scene.add(dustParticles);
}

function buildDecorations() {
  // Reading table
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x3a2518, roughness: 0.7, metalness: 0.02 });
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 1.2), tableMat);
  tableTop.position.set(0, 0.7, 1);
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  scene.add(tableTop);

  // Table legs
  const legGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.7, 8);
  const legPositions = [[-1, 0.35, 0.5], [1, 0.35, 0.5], [-1, 0.35, 1.5], [1, 0.35, 1.5]];
  legPositions.forEach(pos => {
    const leg = new THREE.Mesh(legGeo, tableMat);
    leg.position.set(...pos);
    leg.castShadow = true;
    scene.add(leg);
  });

  // Open book on table
  const openBookMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.9 });
  const openBook = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.4), openBookMat);
  openBook.position.set(0, 0.76, 1);
  openBook.rotation.y = 0.1;
  scene.add(openBook);

  // Globe decoration
  const globeMat = new THREE.MeshStandardMaterial({ color: 0x2a4a6a, roughness: 0.4, metalness: 0.2 });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), globeMat);
  globe.position.set(-4.5, 1.2, -2);
  scene.add(globe);
  const globeStand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x8B7355, metalness: 0.5 }));
  globeStand.position.set(-4.5, 0.95, -2);
  scene.add(globeStand);

  // Armchair silhouette
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x2a1510, roughness: 0.8 });
  const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.8), chairMat);
  chairSeat.position.set(0, 0.4, 2.5);
  scene.add(chairSeat);
  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.12), chairMat);
  chairBack.position.set(0, 0.85, 2.9);
  scene.add(chairBack);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.8), chairMat);
  armL.position.set(-0.45, 0.55, 2.5);
  scene.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.45;
  scene.add(armR);
}

// ═══════════════════════════════════════════════════════════════════════════
// Interaction — Raycasting
// ═══════════════════════════════════════════════════════════════════════════

function onMouseMove(e) {
  if (currentScreen !== 'library') return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  if (isBookOpen || !scene) return;

  raycaster.setFromCamera(mouse, camera);
  const books = [];
  scene.traverse(obj => {
    if (obj.userData && obj.userData.isBook) books.push(obj);
  });

  const hits = raycaster.intersectObjects(books, true);

  if (hits.length > 0) {
    let hit = hits[0].object;
    while (hit && !hit.userData?.isBook) hit = hit.parent;
    if (hit && hit.userData?.isBook) {
      if (hoveredBook !== hit) {
        if (hoveredBook) gsap.to(hoveredBook.position, { z: hoveredBook.userData.originalPosition.z, duration: 0.3 });
        hoveredBook = hit;
        gsap.to(hit.position, { z: hit.userData.originalPosition.z + 0.08, duration: 0.3 });
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
  scene.traverse(obj => {
    if (obj.userData && obj.userData.isBook) books.push(obj);
  });

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
  const books = userBooks[owner] || [];
  const bookData = books[bookIdx];

  if (!bookData) { isBookOpen = false; return; }

  // Find global index
  const allBooks = getAllBooks();
  currentBookIdx = allBooks.findIndex(b => b === bookData);
  if (currentBookIdx < 0) currentBookIdx = 0;
  currentPageIdx = 0;

  // Animate book flying toward camera
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
// Camera
// ═══════════════════════════════════════════════════════════════════════════

let orbitAngle = 0;
let targetOrbitAngle = 0;

function updateCamera() {
  if (isBookOpen || currentScreen !== 'library') return;
  orbitAngle += 0.0002;
  const r = 6;
  camera.position.x = Math.sin(orbitAngle) * r;
  camera.position.z = Math.cos(orbitAngle) * r;
  camera.position.y = 1.8 + Math.sin(orbitAngle * 0.5) * 0.2;
  camera.lookAt(0, 1.5, -1);
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

  // Candle flicker
  if (candlesGroup) {
    candlesGroup.traverse(obj => {
      if (obj.userData && obj.userData.isFlame) {
        const flicker = 0.85 + Math.sin(t * 6 + obj.position.x * 3) * 0.1 + Math.sin(t * 11 + obj.position.z) * 0.05;
        obj.scale.set(flicker * 0.8, flicker * 1.3, flicker * 0.8);
        obj.position.y += Math.sin(t * 8 + obj.position.x) * 0.0002;
      }
    });
  }

  // Dust particle drift
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
// Fallback Library (mobile)
// ═══════════════════════════════════════════════════════════════════════════

function initFallbackLibrary() {
  renderFallbackShelf('Candice', document.getElementById('fallbackCandiceGrid'));
  renderFallbackShelf('Michael', document.getElementById('fallbackMichaelGrid'));
}

function renderFallbackShelf(owner, container) {
  if (!container) return;
  const books = userBooks[owner] || [];
  container.innerHTML = '';

  books.forEach((book, idx) => {
    const el = document.createElement('div');
    el.className = 'fallback-book';
    el.innerHTML = `
      <div class="fallback-book-color" style="background:${book.spineColor || '#5d4037'}"></div>
      <div class="fallback-book-title">${book.title}</div>
      <div class="fallback-book-pages">${book.pages ? book.pages.length : 0} pages</div>
    `;
    el.addEventListener('click', () => {
      const allBooks = getAllBooks();
      const globalIdx = allBooks.findIndex(b => b === book);
      currentBookIdx = globalIdx >= 0 ? globalIdx : 0;
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
  if (USE_THREE && !threeInitialized) {
    initThree();
  } else if (!USE_THREE) {
    document.getElementById('fallback-library').classList.remove('hidden');
    initFallbackLibrary();
  }
  initFlickerOverlay();
  initDustOverlay();
  if (audioEnabled) playAmbientPiano();
}

function backToDashboard() {
  currentScreen = 'dashboard';
  showScreen('dashboard');
  renderDashboard();
}

// ═══════════════════════════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  try { await loadConfig(); } catch (e) {
    console.warn('Config load failed:', e.message);
    CONFIG = { herName: 'Candice', yourName: 'Michael', books: [], countdownDate: new Date(Date.now() + 30 * 86400000).toISOString() };
  }

  initSupabase();
  loadUserBooks();

  // Check auth
  const user = await checkSession();

  // Hide loading screen with animation
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

  // Init UI
  initAuthUI();
  initBookOverlay();
  initAddBookModal();

  // Dashboard buttons
  document.getElementById('btn-enter-library')?.addEventListener('click', enterLibrary);
  document.getElementById('btn-back-dashboard')?.addEventListener('click', backToDashboard);
  document.getElementById('btn-toggle-audio')?.addEventListener('click', toggleAudio);
});

// Global error handler
window.addEventListener('error', (e) => {
  console.error('Global error:', e.message);
});
