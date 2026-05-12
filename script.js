/**
 * ETHEREAL LIBRARY — Advanced Moroccan Immersive 3D Experience
 * WASD free-roam, keyboard shortcuts, search/filter, favorites,
 * bookmarks, countdown timer, interactive lanterns, photo gallery wall
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
let cameraState = 'orbit'; // 'orbit', 'left-shelf', 'right-shelf', 'free'
let cameraTarget = { x: 0, y: 1.8, z: 6, lx: 0, ly: 1.5, lz: -1 };
let cameraLerp = 0.03;

// WASD free-roam
let keys = {};
let cameraYaw = Math.PI; // facing -z initially
let cameraPitch = 0;
let mouseDown = false;
let lastMouseX = 0, lastMouseY = 0;

// Book storage + memories + favorites + bookmarks
let userBooks = { Candice: [], Michael: [] };
let sharedMemories = [];
let favorites = [];
let bookmarks = {};
let readingProgress = {};
let searchQuery = '';
let filterOwner = 'all';
let filterTag = '';

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
  try { const s = localStorage.getItem('ethereal_books'); if (s) userBooks = JSON.parse(s); } catch {}
  try { const m = localStorage.getItem('ethereal_memories'); if (m) sharedMemories = JSON.parse(m); } catch {}
  try { const f = localStorage.getItem('ethereal_favorites'); if (f) favorites = JSON.parse(f); } catch {}
  try { const b = localStorage.getItem('ethereal_bookmarks'); if (b) bookmarks = JSON.parse(b); } catch {}
  try { const r = localStorage.getItem('ethereal_reading'); if (r) readingProgress = JSON.parse(r); } catch {}

  if (CONFIG.books && CONFIG.books.length > 0) {
    CONFIG.books.forEach(book => {
      const owner = book.owner || 'Michael';
      if (!userBooks[owner]) userBooks[owner] = [];
      const exists = userBooks[owner].find(b => b.title === book.title && b.isDefault);
      if (!exists) userBooks[owner].push({ ...book, isDefault: true, owner });
    });
  }
}

function saveUserBooks() { try { localStorage.setItem('ethereal_books', JSON.stringify(userBooks)); } catch {} }
function saveMemories() { try { localStorage.setItem('ethereal_memories', JSON.stringify(sharedMemories)); } catch {} }
function saveFavorites() { try { localStorage.setItem('ethereal_favorites', JSON.stringify(favorites)); } catch {} }
function saveBookmarks() { try { localStorage.setItem('ethereal_bookmarks', JSON.stringify(bookmarks)); } catch {} }
function saveReadingProgress() { try { localStorage.setItem('ethereal_reading', JSON.stringify(readingProgress)); } catch {} }

function getAllBooks() { return [...(userBooks.Candice || []), ...(userBooks.Michael || [])]; }

function isFavorite(title, owner) { return favorites.some(f => f.title === title && f.owner === owner); }

function toggleFavorite(title, owner) {
  const idx = favorites.findIndex(f => f.title === title && f.owner === owner);
  if (idx >= 0) favorites.splice(idx, 1);
  else favorites.push({ title, owner });
  saveFavorites();
}

function getBookmark(title, owner) { return bookmarks[owner + ':' + title] || 0; }
function setBookmark(title, owner, page) { bookmarks[owner + ':' + title] = page; saveBookmarks(); }

function getReadPct(title, owner) { return readingProgress[owner + ':' + title] || 0; }
function setReadPct(title, owner, pct) { readingProgress[owner + ':' + title] = Math.round(pct); saveReadingProgress(); }

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════════════════════════════════════════

function renderDashboard() {
  renderCountdown();
  renderShelfBooks('Candice', document.getElementById('candice-books'));
  renderShelfBooks('Michael', document.getElementById('michael-books'));
  renderMemories();
  renderStats();
}

function getFilteredBooks(owner) {
  let books = userBooks[owner] || [];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    books = books.filter(b => b.title.toLowerCase().includes(q) || (b.tags && b.tags.some(t => t.toLowerCase().includes(q))));
  }
  if (filterTag) books = books.filter(b => b.tags && b.tags.includes(filterTag));
  return books;
}

function renderShelfBooks(owner, container) {
  if (!container) return;
  const books = getFilteredBooks(owner);
  container.innerHTML = '';

  if (books.length === 0) {
    container.innerHTML = '<div class="empty-shelf"><p>' + (searchQuery ? 'No books match your search.' : 'No books yet. Add one!') + '</p></div>';
    return;
  }

  books.forEach((book, idx) => {
    const realIdx = (userBooks[owner] || []).indexOf(book);
    const fav = isFavorite(book.title, owner);
    const pct = getReadPct(book.title, owner);
    const bm = getBookmark(book.title, owner);
    const el = document.createElement('div');
    el.className = 'dash-book' + (fav ? ' is-favorite' : '');
    el.innerHTML =
      '<div class="dash-book-spine" style="background:' + (book.spineColor || '#8B4513') + '">' +
        '<span class="dash-book-title-spine">' + escapeHtml(book.title) + '</span>' +
      '</div>' +
      '<div class="dash-book-info">' +
        '<h4>' + escapeHtml(book.title) + '</h4>' +
        '<p>' + (book.pages ? book.pages.length : 0) + ' pages' + (bm > 0 ? ' &middot; Bookmarked p.' + (bm + 1) : '') + '</p>' +
        (book.tags && book.tags.length ? '<div class="dash-book-tags">' + book.tags.map(t => '<span class="tag">' + escapeHtml(t) + '</span>').join('') + '</div>' : '') +
        (pct > 0 ? '<div class="reading-bar"><div class="reading-bar-fill" style="width:' + pct + '%"></div><span>' + pct + '% read</span></div>' : '') +
      '</div>' +
      '<div class="dash-book-actions">' +
        '<button class="btn-fav-book" data-owner="' + owner + '" data-idx="' + realIdx + '" title="' + (fav ? 'Unfavorite' : 'Favorite') + '">' + (fav ? '★' : '☆') + '</button>' +
        '<button class="btn-read-book" data-owner="' + owner + '" data-idx="' + realIdx + '">Read</button>' +
        (!book.isDefault ? '<button class="btn-delete-book" data-owner="' + owner + '" data-idx="' + realIdx + '">Delete</button>' : '') +
      '</div>';
    container.appendChild(el);
  });

  container.querySelectorAll('.btn-read-book').forEach(btn => {
    btn.addEventListener('click', (e) => openBookFromDashboard(e.target.dataset.owner, parseInt(e.target.dataset.idx)));
  });
  container.querySelectorAll('.btn-delete-book').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const o = e.target.dataset.owner, i = parseInt(e.target.dataset.idx);
      if (confirm('Delete this book?')) { userBooks[o].splice(i, 1); saveUserBooks(); renderDashboard(); }
    });
  });
  container.querySelectorAll('.btn-fav-book').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const o = e.target.dataset.owner, i = parseInt(e.target.dataset.idx);
      const book = (userBooks[o] || [])[i];
      if (book) { toggleFavorite(book.title, o); renderDashboard(); }
    });
  });
}

function renderStats() {
  const el = document.getElementById('library-stats');
  if (!el) return;
  const allBooks = getAllBooks();
  const totalPages = allBooks.reduce((sum, b) => sum + (b.pages ? b.pages.length : 0), 0);
  const favCount = favorites.length;
  const memCount = sharedMemories.length;
  el.innerHTML =
    '<div class="stat"><span class="stat-num">' + allBooks.length + '</span><span class="stat-label">Books</span></div>' +
    '<div class="stat"><span class="stat-num">' + totalPages + '</span><span class="stat-label">Pages</span></div>' +
    '<div class="stat"><span class="stat-num">' + favCount + '</span><span class="stat-label">Favorites</span></div>' +
    '<div class="stat"><span class="stat-num">' + memCount + '</span><span class="stat-label">Memories</span></div>';
}

function renderCountdown() {
  const el = document.getElementById('countdown-display');
  if (!el || !CONFIG.countdownDate) return;
  const target = new Date(CONFIG.countdownDate).getTime();
  const now = Date.now();
  const diff = target - now;
  if (diff <= 0) { el.innerHTML = '<span class="countdown-label">The day has arrived!</span>'; return; }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  el.innerHTML =
    '<span class="countdown-label">Countdown</span>' +
    '<div class="countdown-digits">' +
      '<div class="cd-unit"><span class="cd-num">' + days + '</span><span class="cd-lbl">days</span></div>' +
      '<div class="cd-unit"><span class="cd-num">' + hours + '</span><span class="cd-lbl">hrs</span></div>' +
      '<div class="cd-unit"><span class="cd-num">' + mins + '</span><span class="cd-lbl">min</span></div>' +
    '</div>';
}

function initSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;
  input.addEventListener('input', (e) => { searchQuery = e.target.value; renderDashboard(); });
  const ownerFilter = document.getElementById('filter-owner');
  if (ownerFilter) ownerFilter.addEventListener('change', (e) => { filterOwner = e.target.value; renderDashboard(); });
}

function openBookFromDashboard(owner, idx) {
  const books = userBooks[owner] || [];
  const book = books[idx];
  if (!book) return;
  const allBooks = getAllBooks();
  currentBookIdx = allBooks.findIndex(b => b.title === book.title && b.owner === owner);
  if (currentBookIdx < 0) currentBookIdx = 0;
  const bm = getBookmark(book.title, owner);
  currentPageIdx = bm > 0 ? bm : 0;
  openBookOverlay(book);
}

function openBookOverlay(book) {
  const overlay = document.getElementById('book-overlay');
  const cover = document.getElementById('book-cover');
  document.getElementById('book-title-cover').textContent = book.title;
  document.getElementById('book-author').textContent = 'by ' + (book.owner || CONFIG.yourName);
  const sc = book.spineColor || '#5d4037';
  document.querySelector('.cover-front').style.background = 'linear-gradient(145deg, ' + sc + ', ' + darken(sc) + ')';
  cover.style.borderColor = sc;
  overlay.classList.remove('hidden');
  isBookOpen = true;
  setTimeout(() => {
    cover.classList.add('opened');
    showPage(book, currentPageIdx);
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
    el.innerHTML =
      '<div class="memory-header">' +
        '<span class="memory-type ' + (mem.type || 'memory') + '">' + (mem.type === 'wish' ? 'Wish' : mem.type === 'milestone' ? 'Milestone' : 'Memory') + '</span>' +
        (dateStr ? '<span class="memory-date">' + dateStr + '</span>' : '') +
        (mem.location ? '<span class="memory-location">' + escapeHtml(mem.location) + '</span>' : '') +
      '</div>' +
      '<p class="memory-text">' + escapeHtml(mem.text) + '</p>' +
      (mem.image ? '<img src="' + mem.image + '" class="memory-image" alt="Memory" />' : '') +
      '<div class="memory-by">by ' + escapeHtml(mem.by || 'Anonymous') + '</div>' +
      '<button class="btn-delete-memory" data-idx="' + idx + '">&times;</button>';
    container.appendChild(el);
  });

  container.querySelectorAll('.btn-delete-memory').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const i = parseInt(e.target.dataset.idx);
      sharedMemories.splice(i, 1); saveMemories(); renderMemories();
    });
  });
}

function initMemoryForm() {
  const form = document.getElementById('memory-form');
  if (!form) return;
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
    if (!text) return;
    const memory = {
      text, type: document.getElementById('memory-type').value,
      by: document.getElementById('memory-by-input').value.trim() || 'Anonymous',
      location: document.getElementById('memory-location').value.trim(),
      date: document.getElementById('memory-date-input').value ? new Date(document.getElementById('memory-date-input').value).getTime() : Date.now(),
      image: photoInput && photoInput.dataset.dataUrl ? photoInput.dataset.dataUrl : null
    };
    sharedMemories.push(memory); saveMemories(); form.reset();
    const preview = document.getElementById('memory-photo-preview');
    if (preview) { preview.innerHTML = ''; preview.classList.add('hidden'); }
    if (photoInput) delete photoInput.dataset.dataUrl;
    renderMemories();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Add Book Modal (with tags)
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
    if (e.target.classList.contains('page-type-select')) togglePageFields(e.target.closest('.page-entry'), e.target.value);
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
  const entry = document.createElement('div');
  entry.className = 'page-entry';
  entry.innerHTML =
    '<select class="page-type-select"><option value="letter">Letter/Text</option><option value="photo">Photo</option><option value="note">Note</option></select>' +
    '<textarea class="page-text" placeholder="Write your text here..."></textarea>' +
    '<input type="file" class="page-photo-input hidden" accept="image/*" />' +
    '<div class="page-photo-preview hidden"></div>' +
    '<input type="text" class="page-from hidden" placeholder="From (name)" />' +
    '<select class="page-align"><option value="center">Center</option><option value="left">Left</option><option value="right">Right</option></select>' +
    '<button type="button" class="btn-remove-page" title="Remove page">&times;</button>';
  editor.appendChild(entry);
  entry.querySelector('.btn-remove-page').addEventListener('click', () => entry.remove());
}

function resetPagesEditor() {
  const editor = document.getElementById('pages-editor');
  editor.innerHTML =
    '<div class="page-entry"><select class="page-type-select"><option value="letter">Letter/Text</option><option value="photo">Photo</option><option value="note">Note</option></select>' +
    '<textarea class="page-text" placeholder="Write your text here..."></textarea>' +
    '<input type="file" class="page-photo-input hidden" accept="image/*" />' +
    '<div class="page-photo-preview hidden"></div>' +
    '<input type="text" class="page-from hidden" placeholder="From (name)" />' +
    '<select class="page-align"><option value="center">Center</option><option value="left">Left</option><option value="right">Right</option></select>' +
    '<button type="button" class="btn-remove-page" title="Remove page">&times;</button></div>';
}

function handlePhotoUpload(input) {
  const entry = input.closest('.page-entry');
  const preview = entry.querySelector('.page-photo-preview');
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => { preview.innerHTML = '<img src="' + e.target.result + '" alt="Preview" />'; preview.classList.remove('hidden'); entry.dataset.photoData = e.target.result; };
  reader.readAsDataURL(file);
}

function createNewBook() {
  const title = document.getElementById('book-new-title').value.trim();
  const owner = document.getElementById('book-owner-select').value;
  const spineColor = document.getElementById('book-spine-color').value;
  const tagsRaw = document.getElementById('book-tags')?.value.trim() || '';
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
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
  userBooks[owner].push({ title, spineColor, owner, pages, tags, isDefault: false, createdAt: Date.now() });
  saveUserBooks();
  document.getElementById('add-book-modal').classList.add('hidden');
  document.getElementById('add-book-form').reset();
  resetPagesEditor();
  renderDashboard();
}

// ═══════════════════════════════════════════════════════════════════════════
// Page Reading (with bookmarks + progress tracking)
// ═══════════════════════════════════════════════════════════════════════════

function showPage(book, idx) {
  if (!book || !book.pages || !book.pages[idx]) return;
  currentPageIdx = idx;
  document.getElementById('page-left-content').innerHTML = buildPageHTML(book.pages[idx]);
  document.getElementById('page-right-content').innerHTML = buildPageHTML(book.pages[idx + 1] || { type: 'end' });
  document.getElementById('page-counter').textContent = (idx + 1) + ' / ' + book.pages.length;
  document.getElementById('prev-page').disabled = idx === 0;
  document.getElementById('next-page').disabled = idx + 2 >= book.pages.length;
  updateProgress(book);
  animatePageTurn();

  // Save reading progress
  const pct = Math.round(((idx + 1) / book.pages.length) * 100);
  setReadPct(book.title, book.owner, pct);
}

function animatePageTurn() {
  const l = document.getElementById('page-left'), r = document.getElementById('page-right');
  l.classList.remove('page-transition-in'); r.classList.remove('page-transition-in');
  l.classList.add('page-transition-out'); r.classList.add('page-transition-out');
  setTimeout(() => { l.classList.remove('page-transition-out'); r.classList.remove('page-transition-out'); l.classList.add('page-transition-in'); r.classList.add('page-transition-in'); }, 10);
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
    return '<div class="page-letter" style="text-align:' + (page.align === 'center' ? 'center' : 'left') + '">' + escapeHtml(page.text).replace(/\n/g, '<br>') + '</div>';
  } else if (page.type === 'photo') {
    const src = page.isDataUrl ? page.file : 'assets/' + page.file;
    return '<img src="' + src + '" alt="' + escapeHtml(page.caption || '') + '" onerror="this.style.display=\'none\'" class="page-photo-full"><div class="page-caption">' + escapeHtml(page.caption || '') + '</div>';
  } else if (page.type === 'note') {
    return '<p class="page-note-from">&mdash; ' + escapeHtml(page.from || 'Anonymous') + '</p><div class="page-letter" style="text-align:' + (page.align === 'right' ? 'right' : 'left') + '">' + escapeHtml(page.text).replace(/\n/g, '<br>') + '</div>';
  }
  return '';
}

function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
function getCurrentBook() { return getAllBooks()[currentBookIdx] || null; }
function nextPage() { const b = getCurrentBook(); if (b && currentPageIdx + 2 < b.pages.length) { currentPageIdx += 2; showPage(b, currentPageIdx); } }
function prevPage() { const b = getCurrentBook(); if (b && currentPageIdx > 0) { currentPageIdx = Math.max(0, currentPageIdx - 2); showPage(b, currentPageIdx); } }

function bookmarkCurrentPage() {
  const book = getCurrentBook();
  if (book) { setBookmark(book.title, book.owner, currentPageIdx); showToast('Bookmarked page ' + (currentPageIdx + 1)); }
}

function closeBook() {
  const overlay = document.getElementById('book-overlay');
  const cover = document.getElementById('book-cover');
  cover.classList.add('closing');
  setTimeout(() => { cover.classList.remove('opened', 'closing'); document.getElementById('book-pages').classList.add('hidden'); overlay.classList.add('hidden'); isBookOpen = false; }, 600);
}

function initBookOverlay() {
  document.getElementById('close-book')?.addEventListener('click', closeBook);
  document.getElementById('next-page')?.addEventListener('click', nextPage);
  document.getElementById('prev-page')?.addEventListener('click', prevPage);
  document.getElementById('btn-bookmark')?.addEventListener('click', bookmarkCurrentPage);
  document.getElementById('book-overlay')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeBook(); });

  const pages = document.getElementById('book-pages');
  if (pages) {
    let sx;
    pages.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    pages.addEventListener('touchend', (e) => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 60) { dx < 0 ? nextPage() : prevPage(); } }, { passive: true });
  }
}

// Toast notification
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg; toast.className = 'toast show';
  setTimeout(() => { toast.className = 'toast'; }, 2500);
}

// ═══════════════════════════════════════════════════════════════════════════
// Audio
// ═══════════════════════════════════════════════════════════════════════════

async function playAmbientPiano() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioGain = audioCtx.createGain(); audioGain.connect(audioCtx.destination);
    audioGain.gain.setValueAtTime(0, audioCtx.currentTime);
    const resp = await fetch('assets/ambient.mp3'); if (!resp.ok) return;
    const buf = await audioCtx.decodeAudioData(await resp.arrayBuffer());
    ambientSource = audioCtx.createBufferSource(); ambientSource.buffer = buf; ambientSource.loop = true;
    ambientSource.connect(audioGain); ambientSource.start(0);
    audioGain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 3);
  } catch (e) { console.log('Audio unavailable:', e.message); }
}

function toggleAudio() {
  if (!audioGain || !audioCtx) { playAmbientPiano(); return; }
  audioGain.gain.linearRampToValueAtTime(audioGain.gain.value > 0.01 ? 0 : 0.2, audioCtx.currentTime + 0.5);
}

// ═══════════════════════════════════════════════════════════════════════════
// Dust & Flicker Overlays
// ═══════════════════════════════════════════════════════════════════════════

function initDustOverlay() {
  const canvas = document.getElementById('dust-overlay');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize(); window.addEventListener('resize', resize);

  const particles = [];
  for (let i = 0; i < 80; i++) {
    particles.push({ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
      size: Math.random() * 2 + 0.5, speedX: (Math.random() - 0.5) * 0.3, speedY: -Math.random() * 0.4 - 0.1,
      opacity: Math.random() * 0.5 + 0.1, drift: Math.random() * Math.PI * 2 });
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = Date.now() * 0.001;
    particles.forEach(p => {
      p.x += p.speedX + Math.sin(t + p.drift) * 0.2; p.y += p.speedY;
      if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
      if (p.x < -10) p.x = canvas.width + 10; if (p.x > canvas.width + 10) p.x = -10;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 200, 120, ' + (p.opacity * (0.5 + Math.sin(t * 2 + p.drift) * 0.3)) + ')';
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}

function initFlickerOverlay() {
  const canvas = document.getElementById('flicker-overlay');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize(); window.addEventListener('resize', resize);
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const time = Date.now() * 0.001;
    for (let i = 0; i < 8; i++) {
      const cx = 0.08 + (i / 8) * 0.84, cy = 0.25 + Math.sin(time * 0.4 + i * 1.8) * 0.12;
      const flicker = 0.6 + Math.sin(time * 4 + i * 2.3) * 0.2 + Math.sin(time * 9.1 + i) * 0.1;
      const radius = canvas.width * (0.1 + Math.sin(time * 0.6 + i) * 0.03);
      const gradient = ctx.createRadialGradient(canvas.width * cx, canvas.height * cy, 0, canvas.width * cx, canvas.height * cy, radius);
      gradient.addColorStop(0, 'rgba(255, 150, 40, ' + (0.07 * flicker) + ')');
      gradient.addColorStop(0.4, 'rgba(255, 100, 20, ' + (0.04 * flicker) + ')');
      gradient.addColorStop(1, 'rgba(255, 60, 0, 0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
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
  scene.fog = new THREE.FogExp2(0x0a0608, 0.018);

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
  } catch (e) { composer = null; }

  clock = new THREE.Clock();

  buildMoroccanRoom();
  buildDualBookshelves();
  buildBrassLanterns();
  buildDustParticles3D();
  buildMoroccanDecorations();
  buildPhotoGalleryWall();

  // Lighting
  scene.add(new THREE.AmbientLight(0x2a1515, 0.35));
  const moonLight = new THREE.DirectionalLight(0x4466aa, 0.1);
  moonLight.position.set(0, 8, 4); moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024); scene.add(moonLight);

  [[-4, 3, -4.5], [-1.5, 3, -4.5], [1.5, 3, -4.5], [4, 3, -4.5],
   [-3, 1.5, -4], [3, 1.5, -4], [0, 4, -2], [-5, 2, 1], [5, 2, 1]].forEach((pos, i) => {
    const light = new THREE.PointLight(0xffaa44, 2.5, 8, 1.5);
    light.position.set(...pos);
    light.castShadow = i < 4;
    if (light.castShadow) light.shadow.mapSize.set(256, 256);
    scene.add(light);
  });

  raycaster = new THREE.Raycaster(); mouse = new THREE.Vector2();
  window.addEventListener('resize', onResize);
  window.addEventListener('click', onMouseClick);
  window.addEventListener('mousemove', onMouseMove);

  // WASD + mouse look
  window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (cameraState === 'free' && e.button === 0) { mouseDown = true; lastMouseX = e.clientX; lastMouseY = e.clientY; renderer.domElement.requestPointerLock?.(); }
  });
  renderer.domElement.addEventListener('mouseup', () => { mouseDown = false; });
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== renderer.domElement) mouseDown = false; });
  document.addEventListener('mousemove', (e) => {
    if (cameraState === 'free' && document.pointerLockElement === renderer.domElement) {
      cameraYaw -= e.movementX * 0.002;
      cameraPitch -= e.movementY * 0.002;
      cameraPitch = Math.max(-1.2, Math.min(1.2, cameraPitch));
    }
  });

  const moonlightEl = document.getElementById('moonlight');
  if (moonlightEl) {
    document.addEventListener('mousemove', (e) => {
      if (isBookOpen || cameraState === 'free') return;
      const x = (e.clientX / window.innerWidth - 0.5) * 50;
      const y = (e.clientY / window.innerHeight - 0.5) * 25;
      moonlightEl.style.transform = 'translateX(calc(-50% + ' + x + 'px)) perspective(800px) rotateX(' + (20 + y) + 'deg)';
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
  fCtx.fillStyle = '#1a0f08'; fCtx.fillRect(0, 0, 512, 512);
  const tileSize = 32;
  const tileColors = ['#1a3a4a', '#2a1a0a', '#0a2a2a', '#3a2a1a', '#1a2a3a', '#2a3a2a'];
  for (let x = 0; x < 512; x += tileSize) {
    for (let y = 0; y < 512; y += tileSize) {
      fCtx.fillStyle = tileColors[Math.floor(Math.random() * tileColors.length)];
      fCtx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
      if (Math.random() > 0.6) {
        fCtx.strokeStyle = 'rgba(196, 160, 53, 0.3)'; fCtx.lineWidth = 0.5;
        const cx = x + tileSize / 2, cy = y + tileSize / 2;
        for (let a = 0; a < 8; a++) { const angle = (a / 8) * Math.PI * 2; fCtx.beginPath(); fCtx.moveTo(cx, cy); fCtx.lineTo(cx + Math.cos(angle) * tileSize * 0.4, cy + Math.sin(angle) * tileSize * 0.4); fCtx.stroke(); }
      }
      fCtx.strokeStyle = 'rgba(0, 0, 0, 0.4)'; fCtx.lineWidth = 1; fCtx.strokeRect(x, y, tileSize, tileSize);
    }
  }
  const floorTex = new THREE.CanvasTexture(floorCanvas);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(3, 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6, metalness: 0.1, color: 0x3a2a1a }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // Walls
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = 512; wallCanvas.height = 512;
  const wCtx = wallCanvas.getContext('2d');
  wCtx.fillStyle = '#2a1a12'; wCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 300; i++) { wCtx.fillStyle = 'rgba(' + (30 + Math.random() * 20) + ',' + (15 + Math.random() * 15) + ',' + (8 + Math.random() * 10) + ',0.3)'; wCtx.beginPath(); wCtx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 6 + 1, 0, Math.PI * 2); wCtx.fill(); }
  wCtx.strokeStyle = '#c4a035'; wCtx.lineWidth = 2;
  for (let x = 0; x < 512; x += 24) { wCtx.beginPath(); wCtx.moveTo(x, 20); wCtx.lineTo(x + 12, 8); wCtx.lineTo(x + 24, 20); wCtx.stroke(); }
  const wallTex = new THREE.CanvasTexture(wallCanvas);
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(2, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, color: 0x2a1a12 });
  const w = 12, h = 6;

  // Ceiling
  const ceilCanvas = document.createElement('canvas');
  ceilCanvas.width = 256; ceilCanvas.height = 256;
  const cCtx = ceilCanvas.getContext('2d');
  cCtx.fillStyle = '#0f0808'; cCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) { cCtx.fillStyle = 'hsl(15, 40%, ' + (8 + Math.random() * 6) + '%)'; cCtx.fillRect(0, i * 32, 256, 28); }
  const ceilTex = new THREE.CanvasTexture(ceilCanvas);
  ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping; ceilTex.repeat.set(4, 4);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, w * 2), new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.9, color: 0x1a0f0a }));
  ceil.position.y = h; ceil.rotation.x = Math.PI / 2; scene.add(ceil);

  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), wallMat);
  back.position.set(0, h / 2, -w / 2); back.receiveShadow = true; scene.add(back);
  const sideGeo = new THREE.BoxGeometry(0.3, h, w);
  const leftWall = new THREE.Mesh(sideGeo, wallMat); leftWall.position.set(-w / 2, h / 2, 0); leftWall.receiveShadow = true; scene.add(leftWall);
  const rightWall = new THREE.Mesh(sideGeo, wallMat); rightWall.position.set(w / 2, h / 2, 0); rightWall.receiveShadow = true; scene.add(rightWall);

  buildMoorishArch(0, 1.5, -w / 2 + 0.2, 3, 4);
  buildMoorishArch(-w / 2 + 0.2, 1, 0, 2, 3, true);
  buildMoorishArch(w / 2 - 0.2, 1, 0, 2, 3, true);

  // Beni Ourain rug
  const rugCanvas = document.createElement('canvas');
  rugCanvas.width = 256; rugCanvas.height = 384;
  const rCtx = rugCanvas.getContext('2d');
  rCtx.fillStyle = '#e8dcc8'; rCtx.fillRect(0, 0, 256, 384);
  rCtx.strokeStyle = '#2a1a0a'; rCtx.lineWidth = 3;
  for (let y = 20; y < 384; y += 40) { for (let x = 20; x < 256; x += 40) { rCtx.beginPath(); rCtx.moveTo(x, y - 15); rCtx.lineTo(x + 15, y); rCtx.lineTo(x, y + 15); rCtx.lineTo(x - 15, y); rCtx.closePath(); rCtx.stroke(); } }
  rCtx.fillStyle = '#2a1a0a';
  for (let x = 0; x < 256; x += 8) { rCtx.fillRect(x, 0, 3, 12); rCtx.fillRect(x, 372, 3, 12); }
  const rugTex = new THREE.CanvasTexture(rugCanvas);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 0); rug.receiveShadow = true; scene.add(rug);

  // Cedar beams
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x3a1a0a, roughness: 0.7 });
  for (let i = -2; i <= 2; i++) { const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.15, 0.2), beamMat); beam.position.set(0, h - 0.1, i * 2.5); beam.castShadow = true; scene.add(beam); }
}

function buildMoorishArch(x, y, z, archW, archH, isSide) {
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.5, metalness: 0.05 });
  const pillarGeo = new THREE.CylinderGeometry(0.08, 0.1, archH - 1, 8);
  const lp = new THREE.Mesh(pillarGeo, frameMat); lp.position.set(x - archW / 2, y + (archH - 1) / 2, z);
  if (isSide) lp.rotation.y = Math.PI / 2; scene.add(lp);
  const rp = lp.clone(); rp.position.set(x + archW / 2, y + (archH - 1) / 2, z); scene.add(rp);
  const archMat = new THREE.MeshStandardMaterial({ color: 0x4a2a12, roughness: 0.6 });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(archW / 2, 0.08, 8, 16, Math.PI), archMat);
  arch.position.set(x, y + archH - 1, z); if (isSide) arch.rotation.y = Math.PI / 2; scene.add(arch);
  const ks = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.1), new THREE.MeshStandardMaterial({ color: 0xc4a035, roughness: 0.3, metalness: 0.4 }));
  ks.position.set(x, y + archH - 0.85, z + 0.05); scene.add(ks);
  if (!isSide) {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(archW - 0.3, archH - 0.5), new THREE.MeshStandardMaterial({ color: 0x3355aa, transparent: true, opacity: 0.1, roughness: 0.0, metalness: 0.4, side: THREE.DoubleSide, emissive: 0x112244, emissiveIntensity: 0.4 }));
    glass.position.set(x, y + archH / 2, z - 0.01); scene.add(glass);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Dual Bookshelves
// ═══════════════════════════════════════════════════════════════════════════

function buildDualBookshelves() {
  booksGroup = new THREE.Group(); scene.add(booksGroup);
  buildCedarShelf(-3.8, 0, -4.8, 'Candice');
  buildCedarShelf(3.8, 0, -4.8, 'Michael');
  addShelfNamePlate(-3.8, 4.0, -4.5, "Candice's Books");
  addShelfNamePlate(3.8, 4.0, -4.5, "Michael's Books");
}

function buildCedarShelf(x, y, z, owner) {
  const shelfWidth = 5.0, shelfHeight = 3.8, numShelves = 4, shelfDepth = 0.4, shelfThickness = 0.07;
  const woodCanvas = document.createElement('canvas'); woodCanvas.width = 256; woodCanvas.height = 256;
  const wCtx = woodCanvas.getContext('2d');
  const baseHue = owner === 'Candice' ? 12 : 20;
  wCtx.fillStyle = 'hsl(' + baseHue + ', 50%, 18%)'; wCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 50; i++) { wCtx.strokeStyle = 'hsla(' + baseHue + ', 35%, ' + (12 + Math.random() * 8) + '%, 0.5)'; wCtx.lineWidth = 1; wCtx.beginPath(); wCtx.moveTo(0, Math.random() * 256); wCtx.bezierCurveTo(80, Math.random() * 256, 180, Math.random() * 256, 256, Math.random() * 256); wCtx.stroke(); }
  wCtx.strokeStyle = 'rgba(196, 160, 53, 0.25)'; wCtx.lineWidth = 1.5;
  for (let i = 0; i < 256; i += 16) { wCtx.beginPath(); wCtx.moveTo(i, 0); wCtx.lineTo(i + 8, 8); wCtx.lineTo(i + 16, 0); wCtx.stroke(); wCtx.beginPath(); wCtx.moveTo(i, 256); wCtx.lineTo(i + 8, 248); wCtx.lineTo(i + 16, 256); wCtx.stroke(); }
  const woodTex = new THREE.CanvasTexture(woodCanvas);
  const shelfMat = new THREE.MeshStandardMaterial({ map: woodTex, color: owner === 'Candice' ? 0x5a2a1a : 0x4a2518, roughness: 0.6, metalness: 0.03 });
  const backMat = new THREE.MeshStandardMaterial({ color: 0x0a0605, roughness: 0.95 });
  const shelf = new THREE.Group();

  const sideGeo = new THREE.BoxGeometry(0.15, shelfHeight + 0.4, shelfDepth);
  const ls = new THREE.Mesh(sideGeo, shelfMat); ls.position.set(-shelfWidth / 2, (shelfHeight + 0.4) / 2, 0); ls.castShadow = true; shelf.add(ls);
  const rs = new THREE.Mesh(sideGeo, shelfMat); rs.position.set(shelfWidth / 2, (shelfHeight + 0.4) / 2, 0); rs.castShadow = true; shelf.add(rs);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(shelfWidth + 0.4, 0.2, shelfDepth + 0.1), new THREE.MeshStandardMaterial({ color: 0x6a3a1a, roughness: 0.5, metalness: 0.05 }));
  crown.position.set(0, shelfHeight + 0.3, 0); crown.castShadow = true; shelf.add(crown);

  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc4a035, roughness: 0.3, metalness: 0.6 });
  [[-shelfWidth / 2, shelfHeight + 0.3, shelfDepth / 2], [shelfWidth / 2, shelfHeight + 0.3, shelfDepth / 2]].forEach(pos => {
    const acc = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), brassMat); acc.position.set(...pos); shelf.add(acc);
  });

  for (let s = 0; s <= numShelves; s++) {
    const sy = s * (shelfHeight / numShelves) + 0.1;
    const board = new THREE.Mesh(new THREE.BoxGeometry(shelfWidth - 0.02, shelfThickness, shelfDepth - 0.02), shelfMat);
    board.position.set(0, sy, 0); board.castShadow = true; board.receiveShadow = true; shelf.add(board);
    const bp = new THREE.Mesh(new THREE.BoxGeometry(shelfWidth - 0.04, shelfHeight / numShelves - 0.08, 0.02), backMat);
    bp.position.set(0, sy + (shelfHeight / numShelves) / 2, -shelfDepth / 2 + 0.01); shelf.add(bp);

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
        if (bookData && bookData.spineColor) bookColor = new THREE.Color(bookData.spineColor);
        else { const hue = owner === 'Candice' ? (330 + Math.random() * 60) % 360 : (15 + Math.random() * 40); bookColor = new THREE.Color('hsl(' + hue + ', ' + (40 + Math.random() * 30) + '%, ' + (20 + Math.random() * 25) + '%)'); }

        const spineMat = new THREE.MeshStandardMaterial({ color: bookColor, roughness: 0.5, metalness: 0.02 });
        const bookMesh = new THREE.Mesh(new THREE.BoxGeometry(bookW, bookH, bookD), spineMat);
        bookMesh.position.set(bx, sy + shelfThickness / 2 + bookH / 2, Math.random() * 0.05 - 0.02);
        bookMesh.rotation.y = (Math.random() - 0.5) * 0.04;
        bookMesh.castShadow = true; bookMesh.receiveShadow = true;

        // Large spine text
        const textCanvas = document.createElement('canvas'); textCanvas.width = 128; textCanvas.height = Math.floor(bookH * 400);
        const tCtx = textCanvas.getContext('2d');
        tCtx.fillStyle = bookColor.getStyle(); tCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);
        tCtx.strokeStyle = 'rgba(253, 203, 110, 0.5)'; tCtx.lineWidth = 2; tCtx.strokeRect(8, 8, textCanvas.width - 16, textCanvas.height - 16);
        tCtx.fillStyle = '#ffe8a0';
        const fontSize = Math.max(16, Math.floor(textCanvas.height / 6));
        tCtx.font = 'bold ' + fontSize + 'px "Georgia", serif'; tCtx.textAlign = 'center';
        tCtx.save(); tCtx.translate(textCanvas.width / 2, textCanvas.height / 2); tCtx.rotate(-Math.PI / 2);
        const titleText = bookData ? bookData.title : '';
        if (titleText.length > 18) {
          const mid = Math.floor(titleText.length / 2);
          const br = titleText.lastIndexOf(' ', mid);
          tCtx.fillText(titleText.substring(0, br > 0 ? br : mid), 0, -fontSize * 0.6);
          tCtx.fillText(titleText.substring(br > 0 ? br + 1 : mid), 0, fontSize * 0.6);
        } else { tCtx.fillText(titleText, 0, fontSize * 0.3); }
        tCtx.restore();
        tCtx.fillStyle = 'rgba(255, 232, 160, 0.6)'; tCtx.font = Math.max(10, fontSize * 0.5) + 'px serif';
        tCtx.save(); tCtx.translate(textCanvas.width / 2, textCanvas.height - 20); tCtx.rotate(-Math.PI / 2); tCtx.fillText(owner, 0, 4); tCtx.restore();

        const spineTex = new THREE.CanvasTexture(textCanvas);
        const labelMat = spineMat.clone(); labelMat.map = spineTex;
        const pageMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.9 });
        bookMesh.material = [labelMat, spineMat, spineMat, spineMat, pageMat, spineMat];
        bookMesh.userData = { isBook: true, bookIdx: b % Math.max(1, books.length), owner: owner, originalPosition: bookMesh.position.clone(), spineColor: bookColor.getStyle() };
        shelf.add(bookMesh);
      }
    }
  }
  shelf.position.set(x, y, z); booksGroup.add(shelf);
}

function addShelfNamePlate(x, y, z, text) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 96);
  gradient.addColorStop(0, '#c4a035'); gradient.addColorStop(0.3, '#e8c840'); gradient.addColorStop(0.7, '#d4b030'); gradient.addColorStop(1, '#a08020');
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.moveTo(30, 10); ctx.lineTo(482, 10); ctx.quadraticCurveTo(502, 10, 502, 30); ctx.lineTo(502, 66); ctx.quadraticCurveTo(502, 86, 482, 86); ctx.lineTo(30, 86); ctx.quadraticCurveTo(10, 86, 10, 66); ctx.lineTo(10, 30); ctx.quadraticCurveTo(10, 10, 30, 10); ctx.fill();
  ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(40, 18); ctx.lineTo(472, 18); ctx.quadraticCurveTo(492, 18, 492, 38); ctx.lineTo(492, 58); ctx.quadraticCurveTo(492, 78, 472, 78); ctx.lineTo(40, 78); ctx.quadraticCurveTo(20, 78, 20, 58); ctx.lineTo(20, 38); ctx.quadraticCurveTo(20, 18, 40, 18); ctx.stroke();
  ctx.fillStyle = '#1a0a04'; ctx.font = 'bold 32px "Georgia", serif'; ctx.textAlign = 'center'; ctx.fillText(text, 256, 58);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.position.set(x, y, z); sprite.scale.set(2.4, 0.45, 1); scene.add(sprite);
}

// ═══════════════════════════════════════════════════════════════════════════
// Brass Lanterns (interactive — click to toggle)
// ═══════════════════════════════════════════════════════════════════════════

function buildBrassLanterns() {
  lanternsGroup = new THREE.Group(); scene.add(lanternsGroup);
  const positions = [[-4, 0, -3.5], [-1.5, 0, -3.5], [1.5, 0, -3.5], [4, 0, -3.5], [-3, 0, 0], [3, 0, 0], [-5, 0, 2.5], [5, 0, 2.5], [0, 0, -4.5]];

  positions.forEach((pos, idx) => {
    const isHanging = idx < 4;
    const lanternY = isHanging ? 3.5 : 0.6;
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xc4a035, roughness: 0.3, metalness: 0.6 });
    const darkBrass = new THREE.MeshStandardMaterial({ color: 0x8a6a20, roughness: 0.4, metalness: 0.5 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.25, 8), darkBrass);
    body.position.set(pos[0], lanternY, pos[2]); body.castShadow = true;
    body.userData = { isLantern: true, lanternIdx: idx, lit: true };
    lanternsGroup.add(body);

    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), brassMat);
    dome.position.set(pos[0], lanternY + 0.125, pos[2]); lanternsGroup.add(dome);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.04, 8), brassMat);
    cap.position.set(pos[0], lanternY - 0.145, pos[2]); lanternsGroup.add(cap);

    if (isHanging) {
      const chainMat = new THREE.MeshStandardMaterial({ color: 0x8a6a20, roughness: 0.5, metalness: 0.5 });
      for (let c = 0; c < 5; c++) { const link = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.004, 4, 6), chainMat); link.position.set(pos[0], lanternY + 0.2 + c * 0.12, pos[2]); link.rotation.x = c % 2 === 0 ? 0 : Math.PI / 2; lanternsGroup.add(link); }
    } else {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.03, 8), brassMat); base.position.set(pos[0], 0.015, pos[2]); lanternsGroup.add(base);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, lanternY - 0.15, 6), darkBrass); stem.position.set(pos[0], (lanternY - 0.15) / 2 + 0.03, pos[2]); lanternsGroup.add(stem);
    }

    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.8 }));
    flame.position.set(pos[0], lanternY, pos[2]);
    flame.userData.isFlame = true; flame.userData.lanternIdx = idx;
    lanternsGroup.add(flame);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Photo Gallery Wall
// ═══════════════════════════════════════════════════════════════════════════

function buildPhotoGalleryWall() {
  // Place photo frames on the right wall
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xc4a035, roughness: 0.4, metalness: 0.4 });
  const positions = [[5.7, 3.5, -3], [5.7, 3.5, -1], [5.7, 3.5, 1], [5.7, 2, -2], [5.7, 2, 0], [5.7, 2, 2]];

  positions.forEach(pos => {
    // Frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.7), frameMat);
    frame.position.set(...pos); frame.castShadow = true; scene.add(frame);
    // Inner dark
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.75, 0.55), new THREE.MeshStandardMaterial({ color: 0x1a0a04, roughness: 0.95 }));
    inner.position.set(pos[0] - 0.02, pos[1], pos[2]); scene.add(inner);
  });

  // Gallery label
  const labelCanvas = document.createElement('canvas'); labelCanvas.width = 256; labelCanvas.height = 48;
  const lCtx = labelCanvas.getContext('2d');
  lCtx.fillStyle = 'rgba(10, 6, 4, 0.8)'; lCtx.fillRect(0, 0, 256, 48);
  lCtx.fillStyle = '#c4a035'; lCtx.font = 'bold 18px "Georgia", serif'; lCtx.textAlign = 'center';
  lCtx.fillText('Our Gallery', 128, 32);
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true }));
  labelSprite.position.set(5.6, 4.5, -1); labelSprite.scale.set(1.5, 0.3, 1); scene.add(labelSprite);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3D Dust Particles
// ═══════════════════════════════════════════════════════════════════════════

function buildDustParticles3D() {
  const count = 200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { positions[i * 3] = (Math.random() - 0.5) * 10; positions[i * 3 + 1] = Math.random() * 5; positions[i * 3 + 2] = (Math.random() - 0.5) * 10; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  dustParticles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffddaa, size: 0.02, transparent: true, opacity: 0.3, sizeAttenuation: true, blending: THREE.AdditiveBlending }));
  scene.add(dustParticles);
}

// ═══════════════════════════════════════════════════════════════════════════
// Moroccan Decorations
// ═══════════════════════════════════════════════════════════════════════════

function buildMoroccanDecorations() {
  const trayMat = new THREE.MeshStandardMaterial({ color: 0xc4a035, roughness: 0.3, metalness: 0.5 });
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.03, 16), trayMat);
  tray.position.set(0, 0.45, 1.5); tray.castShadow = true; scene.add(tray);
  for (let i = 0; i < 3; i++) { const angle = (i / 3) * Math.PI * 2; const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.43, 6), trayMat); leg.position.set(Math.cos(angle) * 0.4, 0.22, 1.5 + Math.sin(angle) * 0.4); scene.add(leg); }

  const openBook = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.015, 0.3), new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.9 }));
  openBook.position.set(0, 0.47, 1.5); openBook.rotation.y = 0.2; scene.add(openBook);

  const poufColors = [0x8B2252, 0x2a5a4a, 0xc4a035];
  [[-1, 0, 2], [1, 0, 2], [0, 0, 2.8]].forEach((pos, i) => {
    const pouf = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: poufColors[i], roughness: 0.8 }));
    pouf.position.set(pos[0], 0.15, pos[2]); pouf.scale.y = 0.5; pouf.castShadow = true; scene.add(pouf);
  });

  const potMat = new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.7 });
  const pot = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.08, 0.02), new THREE.Vector2(0.12, 0.1), new THREE.Vector2(0.1, 0.2), new THREE.Vector2(0.06, 0.25), new THREE.Vector2(0.07, 0.3)], 12), potMat);
  pot.position.set(-4.5, 0, -2); scene.add(pot);
  const pot2 = pot.clone(); pot2.position.set(4.5, 0, -2); pot2.scale.set(0.8, 1.2, 0.8); scene.add(pot2);
}

// ═══════════════════════════════════════════════════════════════════════════
// Interaction
// ═══════════════════════════════════════════════════════════════════════════

function onMouseMove(e) {
  if (currentScreen !== 'library') return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  if (isBookOpen || !scene || cameraState === 'free') return;
  raycaster.setFromCamera(mouse, camera);
  const interactive = [];
  scene.traverse(obj => { if (obj.userData && (obj.userData.isBook || obj.userData.isLantern)) interactive.push(obj); });
  const hits = raycaster.intersectObjects(interactive, true);
  if (hits.length > 0) {
    let hit = hits[0].object;
    while (hit && !hit.userData?.isBook && !hit.userData?.isLantern) hit = hit.parent;
    if (hit && hit.userData?.isBook) {
      if (hoveredBook !== hit) {
        if (hoveredBook) gsap.to(hoveredBook.position, { z: hoveredBook.userData.originalPosition.z, duration: 0.3 });
        hoveredBook = hit;
        gsap.to(hit.position, { z: hit.userData.originalPosition.z + 0.12, duration: 0.3 });
      }
      renderer.domElement.style.cursor = 'pointer';
    } else if (hit && hit.userData?.isLantern) {
      renderer.domElement.style.cursor = 'pointer';
    }
  } else {
    if (hoveredBook) { gsap.to(hoveredBook.position, { z: hoveredBook.userData.originalPosition.z, duration: 0.3 }); hoveredBook = null; }
    renderer.domElement.style.cursor = cameraState === 'free' ? 'crosshair' : 'grab';
  }
}

function onMouseClick(e) {
  if (currentScreen !== 'library' || isBookOpen || !scene) return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const interactive = [];
  scene.traverse(obj => { if (obj.userData && (obj.userData.isBook || obj.userData.isLantern)) interactive.push(obj); });
  const hits = raycaster.intersectObjects(interactive, true);
  if (hits.length > 0) {
    let hit = hits[0].object;
    while (hit && !hit.userData?.isBook && !hit.userData?.isLantern) hit = hit.parent;
    if (hit && hit.userData?.isBook) pickUpBook3D(hit);
    else if (hit && hit.userData?.isLantern) toggleLantern(hit.userData.lanternIdx);
  }
}

function toggleLantern(idx) {
  lanternsGroup.traverse(obj => {
    if (obj.userData && obj.userData.isLantern && obj.userData.lanternIdx === idx) {
      obj.userData.lit = !obj.userData.lit;
    }
    if (obj.userData && obj.userData.isFlame && obj.userData.lanternIdx === idx) {
      obj.visible = !obj.visible;
    }
  });
  showToast(idx !== undefined ? 'Lantern toggled' : '');
}

async function pickUpBook3D(bookObj) {
  if (isBookOpen) return; isBookOpen = true;
  const owner = bookObj.userData.owner;
  const bookIdx = bookObj.userData.bookIdx || 0;
  const bookData = (userBooks[owner] || [])[bookIdx];
  if (!bookData) { isBookOpen = false; return; }
  const allBooks = getAllBooks();
  currentBookIdx = allBooks.findIndex(b => b === bookData);
  if (currentBookIdx < 0) currentBookIdx = 0;
  const bm = getBookmark(bookData.title, owner);
  currentPageIdx = bm > 0 ? bm : 0;
  const targetPos = camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1.5));
  gsap.to(bookObj.position, { x: targetPos.x, y: targetPos.y - 0.5, z: targetPos.z, duration: 0.8, ease: 'power2.inOut' });
  gsap.to(bookObj.rotation, { y: Math.PI / 6, x: 0.1, duration: 0.6 });
  await sleep(600);
  openBookOverlay(bookData);
  gsap.to(bookObj.scale, { x: 0, y: 0, z: 0, duration: 0.4 });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function darken(hex) { try { let r = parseInt(hex.slice(1, 3), 16) - 35; let g = parseInt(hex.slice(3, 5), 16) - 35; let b = parseInt(hex.slice(5, 7), 16) - 35; return '#' + [r, g, b].map(v => Math.max(0, v).toString(16).padStart(2, '0')).join(''); } catch { return '#3e2723'; } }

// ═══════════════════════════════════════════════════════════════════════════
// Camera — WASD free-roam + shelf zoom
// ═══════════════════════════════════════════════════════════════════════════

let orbitAngle = 0;

function setCameraTarget(state) {
  cameraState = state;
  if (state === 'left-shelf') cameraTarget = { x: -2.5, y: 1.8, z: -2, lx: -3.8, ly: 1.8, lz: -4.8 };
  else if (state === 'right-shelf') cameraTarget = { x: 2.5, y: 1.8, z: -2, lx: 3.8, ly: 1.8, lz: -4.8 };
  else if (state === 'free') { cameraTarget = null; cameraYaw = Math.atan2(camera.position.x, camera.position.z); }
  else { cameraTarget = null; cameraState = 'orbit'; }
  updateModeIndicator();
}

function updateModeIndicator() {
  const el = document.getElementById('mode-indicator');
  if (!el) return;
  if (cameraState === 'free') el.textContent = 'Free Roam (WASD) — Click to look — ESC to exit';
  else if (cameraState === 'left-shelf') el.textContent = "Viewing Candice's Shelf";
  else if (cameraState === 'right-shelf') el.textContent = "Viewing Michael's Shelf";
  else el.textContent = 'Orbit Mode — Press F for free roam';
  el.classList.remove('hidden');
}

function updateCamera() {
  if (isBookOpen || currentScreen !== 'library') return;

  if (cameraState === 'free') {
    const speed = 0.06;
    const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    const right = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    if (keys['w'] || keys['arrowup']) camera.position.add(forward.clone().multiplyScalar(speed));
    if (keys['s'] || keys['arrowdown']) camera.position.add(forward.clone().multiplyScalar(-speed));
    if (keys['a'] || keys['arrowleft']) camera.position.add(right.clone().multiplyScalar(-speed));
    if (keys['d'] || keys['arrowright']) camera.position.add(right.clone().multiplyScalar(speed));
    // Clamp to room bounds
    camera.position.x = Math.max(-5.5, Math.min(5.5, camera.position.x));
    camera.position.z = Math.max(-5.5, Math.min(5.5, camera.position.z));
    camera.position.y = 1.8;
    const lookTarget = camera.position.clone().add(new THREE.Vector3(-Math.sin(cameraYaw) * Math.cos(cameraPitch), Math.sin(cameraPitch), -Math.cos(cameraYaw) * Math.cos(cameraPitch)));
    camera.lookAt(lookTarget);
  } else if (cameraState === 'orbit' || !cameraTarget) {
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

  if (lanternsGroup) {
    lanternsGroup.traverse(obj => {
      if (obj.userData && obj.userData.isFlame && obj.visible) {
        const flicker = 0.85 + Math.sin(t * 5 + obj.position.x * 3) * 0.1 + Math.sin(t * 9 + obj.position.z) * 0.05;
        obj.scale.set(flicker, flicker * 1.2, flicker);
        obj.material.color.setHSL(0.12, 0.9, 0.55 + Math.sin(t * 7) * 0.05);
      }
    });
  }

  if (dustParticles) {
    const positions = dustParticles.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += Math.sin(t + i) * 0.0005; positions[i + 1] += 0.001; positions[i + 2] += Math.cos(t + i) * 0.0003;
      if (positions[i + 1] > 5) positions[i + 1] = 0;
    }
    dustParticles.geometry.attributes.position.needsUpdate = true;
  }

  updateCamera();
  if (composer) { if (bloomPass) bloomPass.strength = 0.6 + Math.sin(t * 0.3) * 0.1; composer.render(); }
  else if (renderer) renderer.render(scene, camera);
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
    const el = document.createElement('div'); el.className = 'fallback-book';
    el.innerHTML = '<div class="fallback-book-color" style="background:' + (book.spineColor || '#5d4037') + '"></div><div class="fallback-book-title">' + book.title + '</div><div class="fallback-book-pages">' + (book.pages ? book.pages.length : 0) + ' pages</div>';
    el.addEventListener('click', () => { const allBooks = getAllBooks(); currentBookIdx = allBooks.findIndex(b => b === book); if (currentBookIdx < 0) currentBookIdx = 0; currentPageIdx = 0; openBookOverlay(book); });
    container.appendChild(el);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Screen Navigation
// ═══════════════════════════════════════════════════════════════════════════

function enterLibrary() {
  currentScreen = 'library'; showScreen('library');
  if (USE_THREE && !threeInitialized) initThree();
  else if (!USE_THREE) { document.getElementById('fallback-library').classList.remove('hidden'); initFallbackLibrary(); }
  initFlickerOverlay(); initDustOverlay();
  if (audioEnabled) playAmbientPiano();
  updateModeIndicator();
}

function backToDashboard() {
  currentScreen = 'dashboard'; cameraState = 'orbit'; cameraTarget = null;
  if (document.pointerLockElement) document.exitPointerLock();
  showScreen('dashboard'); renderDashboard();
}

// ═══════════════════════════════════════════════════════════════════════════
// Keyboard Shortcuts
// ═══════════════════════════════════════════════════════════════════════════

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Escape — close book or go back
    if (e.key === 'Escape') {
      if (isBookOpen) closeBook();
      else if (currentScreen === 'library') {
        if (cameraState === 'free') { setCameraTarget('orbit'); if (document.pointerLockElement) document.exitPointerLock(); }
        else backToDashboard();
      }
      else if (document.querySelector('.modal:not(.hidden)')) {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      }
    }
    // Arrow keys for pages when book open
    if (isBookOpen) {
      if (e.key === 'ArrowRight') nextPage();
      if (e.key === 'ArrowLeft') prevPage();
      if (e.key === 'b' || e.key === 'B') bookmarkCurrentPage();
    }
    // F for free roam
    if (e.key === 'f' || e.key === 'F') {
      if (currentScreen === 'library' && !isBookOpen) {
        if (cameraState === 'free') setCameraTarget('orbit');
        else setCameraTarget('free');
      }
    }
    // 1,2 for shelf zoom
    if (e.key === '1' && currentScreen === 'library' && !isBookOpen) setCameraTarget(cameraState === 'left-shelf' ? 'orbit' : 'left-shelf');
    if (e.key === '2' && currentScreen === 'library' && !isBookOpen) setCameraTarget(cameraState === 'right-shelf' ? 'orbit' : 'right-shelf');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  try { await loadConfig(); } catch { CONFIG = { herName: 'Candice', yourName: 'Michael', books: [], countdownDate: new Date(Date.now() + 30 * 86400000).toISOString() }; }
  initSupabase(); loadUserBooks();
  const user = await checkSession();
  const loadingScreen = document.getElementById('loading-screen');
  setTimeout(() => {
    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (user) { currentScreen = 'dashboard'; showScreen('dashboard'); updateDashboardUser(); renderDashboard(); }
    else { currentScreen = 'login'; showScreen('login'); }
  }, 1800);

  initAuthUI(); initBookOverlay(); initAddBookModal(); initMemoryForm(); initSearch(); initKeyboardShortcuts();

  document.getElementById('btn-enter-library')?.addEventListener('click', enterLibrary);
  document.getElementById('btn-back-dashboard')?.addEventListener('click', backToDashboard);
  document.getElementById('btn-toggle-audio')?.addEventListener('click', toggleAudio);
  document.getElementById('btn-zoom-left')?.addEventListener('click', () => { setCameraTarget(cameraState === 'left-shelf' ? 'orbit' : 'left-shelf'); });
  document.getElementById('btn-zoom-right')?.addEventListener('click', () => { setCameraTarget(cameraState === 'right-shelf' ? 'orbit' : 'right-shelf'); });
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => setCameraTarget('orbit'));
  document.getElementById('btn-free-roam')?.addEventListener('click', () => { setCameraTarget(cameraState === 'free' ? 'orbit' : 'free'); });

  // Countdown update every minute
  setInterval(renderCountdown, 60000);
});

window.addEventListener('error', (e) => { console.error('Global error:', e.message); });
