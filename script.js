/**
 * ATHEREAL LIBRARY — Candlelit Interactive Books for Candice
 * Three.js room, pickable books, page reading, photos & letters
 * Graceful degradation for mobile / no-WebGL devices
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
let raycaster, mouse;
let hoveredBook = null;
let selectedBook = null;
let ambientSource, audioCtx, audioGain, audioEnabled = true;
let isBookOpen = false;
let currentPageIdx = 0;
let currentBookIdx = 0;
let scrollTimeout;

// ═══════════════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════════════

async function loadConfig() {
  try {
    CONFIG = await (await fetch('config.json')).json();
  } catch {
    CONFIG = {
      herName: 'Candice', yourName: 'Michael',
      tagline: 'A library of our love, candlelit and yours to explore.',
      books: [{
        title: 'Our Love Story', spineColor: '#8B4513',
        pages: [
          { type: 'letter', text: 'Dear Candice...', align: 'center' },
          { type: 'note', from: 'Michael', text: 'You are amazing.', align: 'left' },
          { type: 'note', from: 'Candice', text: 'You are my everything.', align: 'right' }
        ]
      }],
      countdownDate: new Date(Date.now() + 30 * 86400000).toISOString()
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Minimal Smooth Scroll Polyfill
// ═══════════════════════════════════════════════════════════════════════════

function initBasicScroll() {
  let ticking = false;
  window.addEventListener('wheel', (e) => {
    if (ticking || isBookOpen) return;
    ticking = true;
    window.scrollBy({ top: (e.deltaY > 0 ? 1 : -1) * 60, behavior: 'smooth' });
    setTimeout(() => ticking = false, 100);
  }, { passive: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Fallback Book Rendering (mobile / no WebGL)
// ═══════════════════════════════════════════════════════════════════════════

function initFallbackLibrary() {
  const grid = document.getElementById('fallbackBookGrid');
  if (!grid || !CONFIG.books) return;

  CONFIG.books.forEach((book, idx) => {
    const el = document.createElement('div');
    el.className = 'fallback-book';
    el.innerHTML = `
      <div class="fallback-book-color" style="background:${book.spineColor || '#5d4037'}"></div>
      <div class="fallback-book-title">${book.title}</div>
      <div class="fallback-book-pages">${book.pages.length} pages</div>
    `;
    el.addEventListener('click', () => openFallbackBook(idx));
    grid.appendChild(el);
  });
}

function openFallbackBook(idx) {
  currentBookIdx = idx;
  currentPageIdx = 0;
  const book = CONFIG.books[idx];
  const overlay = document.getElementById('book-overlay');
  const cover = document.getElementById('book-cover');
  const title = document.getElementById('book-title-cover');
  const author = document.getElementById('book-author');

  title.textContent = book.title;
  cover.style.borderColor = book.spineColor || '#5d4037';
  document.querySelector('.cover-front').style.background =
    `linear-gradient(145deg, ${book.spineColor || '#8d6e63'}, ${darken(book.spineColor || '#5d4037')})`;
  author.textContent = 'for ' + CONFIG.herName;

  overlay.classList.remove('hidden');
  setTimeout(() => overlay.classList.add('show'), 10);
  setTimeout(() => {
    cover.classList.add('opened');
    showFallbackPage(0);
    document.getElementById('book-pages').classList.remove('hidden');
    initSwipeGestures();
  }, 400);
}

function showFallbackPage(idx) {
  const book = CONFIG.books[currentBookIdx];
  if (!book || !book.pages[idx]) return;

  const leftEl = document.getElementById('page-left');
  const rightEl = document.getElementById('page-right');
  const leftContent = document.getElementById('page-left-content');
  const rightContent = document.getElementById('page-right-content');
  const counter = document.getElementById('page-counter');

  // Spread: two pages
  const p0 = book.pages[idx];
  const p1 = book.pages[idx + 1];

  leftContent.innerHTML = buildPageHTML(p0);
  rightContent.innerHTML = buildPageHTML(p1 || { type: 'end' });

  counter.textContent = `${idx + 1} / ${book.pages.length}`;

  // Nav button states
  document.getElementById('prev-page').disabled = idx === 0;
  document.getElementById('next-page').disabled = idx + 2 >= book.pages.length;

  // Update reading progress
  updateProgress();

  // Page transition animation
  animatePageTurn(leftEl, rightEl);
}

function animatePageTurn(leftEl, rightEl) {
  // Quick page-flip effect
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

function updateProgress() {
  const book = CONFIG.books[currentBookIdx];
  if (!book) return;
  const pct = ((currentPageIdx + 1) / book.pages.length) * 100;
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = pct + '%';
}

function buildPageHTML(page) {
  if (!page) return '<div style="color:var(--ink-faded);font-style:italic;">~</div>';
  if (page.type === 'end') return '<div style="color:var(--ink-faded);font-style:italic;font-size:1.2rem;">The End 💖</div>';

  let html = '';
  if (page.type === 'letter') {
    const align = page.align === 'center' ? 'center' : 'left';
    const salutation = page.align === 'center' ? '' : `<p class="page-salutation">Dear ${CONFIG.herName},</p>`;
    const sign = page.align === 'center' ?
      `<p class="page-signature">— ${CONFIG.yourName}</p>` :
      `<p class="page-signature">— ${page.from || CONFIG.yourName}</p>`;
    html = `
      ${salutation}
      <div class="page-content" style="text-align:${align}">${page.text}</div>
      ${sign}
    `;
  } else if (page.type === 'photo') {
    html = `
      <img src="assets/${page.file}" alt="${page.caption}" onerror="this.style.display='none'">
      <div class="page-caption">${page.caption}</div>
    `;
  } else if (page.type === 'note') {
    const align = page.align === 'right' ? 'right' : 'left';
    html = `
      <p class="page-note-from">— ${page.from || CONFIG.herName}</p>
      <div class="page-content" style="text-align:${align}">${page.text}</div>
    `;
  }
  return html;
}

function darken(hex) {
  try {
    let r = parseInt(hex.slice(1, 3), 16) - 30;
    let g = parseInt(hex.slice(3, 5), 16) - 30;
    let b = parseInt(hex.slice(5, 7), 16) - 30;
    return '#' + [r, g, b].map(v => Math.max(0, v).toString(16).padStart(2, '0')).join('');
  } catch { return '#3e2723'; }
}

function closeBook() {
  const overlay = document.getElementById('book-overlay');
  const cover = document.getElementById('book-cover');
  
  // Closing animation
  cover.classList.add('closing');
  setTimeout(() => {
    cover.classList.remove('opened');
    cover.classList.remove('closing');
    document.getElementById('book-pages').classList.add('hidden');
    overlay.classList.add('hidden');
    overlay.classList.remove('show');
    isBookOpen = false;
  }, 600);
}

function nextPage() {
  const book = CONFIG.books[currentBookIdx];
  if (currentPageIdx + 2 < book.pages.length) {
    currentPageIdx += 2;
    showFallbackPage(currentPageIdx);
  }
}

function prevPage() {
  if (currentPageIdx > 0) {
    currentPageIdx = Math.max(0, currentPageIdx - 2);
    showFallbackPage(currentPageIdx);
  }
}

function initBookOverlay() {
  document.getElementById('close-book').addEventListener('click', closeBook);
  document.getElementById('next-page').addEventListener('click', nextPage);
  document.getElementById('prev-page').addEventListener('click', prevPage);

  // Close on overlay background click
  document.getElementById('book-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeBook();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Ambient Piano
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
    audioGain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 5);
  } catch (e) { console.log('Audio unavailable:', e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// Candle Flicker Overlay
// ═══════════════════════════════════════════════════════════════════════════

function initFlickerOverlay() {
  const canvas = document.getElementById('flicker-overlay');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  resize();
  window.addEventListener('resize', resize);

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw warm candlelight glow spots that flicker
    const time = Date.now() * 0.001;
    const numCandles = 6;

    for (let i = 0; i < numCandles; i++) {
      // Spread candles across the scene
      const cx = 0.1 + (i / numCandles) * 0.8;
      const cy = 0.3 + Math.sin(time * 0.5 + i * 2.1) * 0.1;
      const flicker = 0.7 + Math.sin(time * 3 + i * 1.7) * 0.15 + Math.sin(time * 7.3 + i) * 0.08;
      const radius = canvas.width * (0.08 + Math.sin(time * 0.8 + i) * 0.02);

      const gradient = ctx.createRadialGradient(
        canvas.width * cx, canvas.height * cy, 0,
        canvas.width * cx, canvas.height * cy, radius
      );

      gradient.addColorStop(0, `rgba(255, 160, 50, ${0.06 * flicker})`);
      gradient.addColorStop(0.5, `rgba(255, 120, 20, ${0.03 * flicker})`);
      gradient.addColorStop(1, 'rgba(255, 80, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    requestAnimationFrame(draw);
  }

  draw();
}

// ═══════════════════════════════════════════════════════════════════════════
// Smooth Scroll
// ═══════════════════════════════════════════════════════════════════════════

function initScroll() {
  try {
    const lenis = new Lenis({
      duration: IS_MOBILE ? 0.8 : 1.2,
      easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smooth: true, smoothTouch: false, touchMultiplier: 2
    });
    function raf(t) { lenis.raf(t); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    document.body.classList.add('smooth-scroll');
  } catch (e) {
    console.warn('Lenis failed, using basic scroll:', e.message);
    initBasicScroll();
  }

  gsap.registerPlugin(ScrollTrigger);

  // Reveal any visible sections on scroll
  gsap.utils.toArray('.reveal').forEach(el => {
    gsap.to(el, {
      opacity: 1, y: 0,
      duration: 1.2, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none reverse' }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Three.js — Candlelit Library Room
// ═══════════════════════════════════════════════════════════════════════════

function initThree() {
  const container = document.getElementById('canvas-container');

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0810, 0.035);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, 5);

  renderer = new THREE.WebGLRenderer({ antialias: !IS_MOBILE, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 1.5 : 2));
  renderer.shadowMap.enabled = !IS_MOBILE;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // Post-processing (wrapped in try/catch for resilience)
  if (!IS_MOBILE) {
    try {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.4, 0.85
      );
      composer.addPass(bloomPass);
      console.log('Post-processing initialized');
    } catch (e) {
      console.warn('Post-processing failed, rendering without bloom:', e.message);
      composer = null;
      bloomPass = null;
    }
  }

  clock = new THREE.Clock();

  buildRoom();
  buildBookshelves();
  buildCandles();
  buildBookCovers();

  // Lights
  scene.add(new THREE.AmbientLight(0x3a2a4a, 0.35));

  const moonLight = new THREE.DirectionalLight(0x6688aa, 0.2);
  moonLight.position.set(3, 8, -2);
  scene.add(moonLight);

  // Candle lights (warm, flickering)
  for (let i = 0; i < 6; i++) {
    const light = new THREE.PointLight(0xffaa33, 3, 8, 1.5);
    light.position.set(
      -2.2 + (i % 3) * 2.2,
      1.5 + (i < 3 ? 0 : 0.3),
      -3.5 + Math.floor(i / 3) * 1.5
    );
    scene.add(light);
  }

  // Interaction
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  window.addEventListener('resize', onResize);
  window.addEventListener('click', onMouseClick);
  window.addEventListener('mousemove', onMouseMove);

  // Gyroscope support (mobile)
  if (IS_MOBILE) {
    let gyroReady = false;
    document.addEventListener('click', function gyroRequest() {
      if (gyroReady) { document.removeEventListener('click', gyroRequest); return; }
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(r => {
          gyroReady = r === 'granted';
        }).catch(() => {});
      } else { gyroReady = true; }
      document.removeEventListener('click', gyroRequest);
    }, { once: true });
    window.addEventListener('deviceorientation', (e) => {
      if (!e.gamma || isBookOpen) return;
      orbitAngle = e.gamma * 0.01;
    });
  }

  // Parallax moonlight follow (desktop mouse)
  const moonlight = document.getElementById('moonlight');
  if (moonlight && !IS_MOBILE) {
    document.addEventListener('mousemove', (e) => {
      if (isBookOpen) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 40;
      const y = (e.clientY / window.innerHeight - 0.5) * 20;
      moonlight.style.transform = `translateX(calc(-50% + ${x}px)) perspective(800px) rotateX(${20 + y}deg)`;
    });
  }

  document.body.classList.add('three-active');

  animate();
}

function buildRoom() {
  const materials = {
    walls: new THREE.MeshStandardMaterial({
      color: 0x1a1420, roughness: 0.85, metalness: 0.0
    }),
    wallAccent: new THREE.MeshStandardMaterial({
      color: 0x231a2e, roughness: 0.7, metalness: 0.05
    }),
    floor: new THREE.MeshStandardMaterial({
      color: 0x2a1f14, roughness: 0.9, metalness: 0.0
    }),
    wood: new THREE.MeshStandardMaterial({
      color: 0x5d4037, roughness: 0.75, metalness: 0.02
    })
  };

  // Floor
  const floorGeo = new THREE.PlaneGeometry(20, 20);
  const floor = new THREE.Mesh(floorGeo, materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), materials.walls);
  ceil.position.y = 5;
  ceil.rotation.x = Math.PI / 2;
  scene.add(ceil);

  // Walls
  const wallThickness = 0.3;
  const w = 10, h = 5;

  // Back wall
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallThickness), materials.walls);
  back.position.set(0, h / 2, -w / 2);
  back.receiveShadow = true;
  scene.add(back);

  // Left wall (shelf side)
  const left = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, h, w), materials.walls);
  left.position.set(-w / 2, h / 2, 0);
  left.receiveShadow = true;
  scene.add(left);

  // Right wall
  const right = left.clone();
  right.position.set(w / 2, h / 2, 0);
  scene.add(right);

  // Front wall (with window arch)
  const frontGeo = new THREE.Shape();
  frontGeo.moveTo(-w / 2, 0);
  frontGeo.lineTo(-w / 2, h);
  frontGeo.lineTo(-2, h);
  frontGeo.lineTo(-2, 3.5);
  frontGeo.quadraticCurveTo(0, 3.8, 2, 3.5);
  frontGeo.lineTo(2, h);
  frontGeo.lineTo(w / 2, h);
  frontGeo.lineTo(w / 2, 0);
  frontGeo.lineTo(-w / 2, 0);

  const frontExtrude = new THREE.ExtrudeGeometry(frontGeo, { depth: wallThickness, bevelEnabled: false });
  const front = new THREE.Mesh(frontExtrude, materials.walls);
  front.position.z = w / 2;
  front.receiveShadow = true;
  scene.add(front);

  // Window glass
  const windowGeo = new THREE.PlaneGeometry(3.2, 3);
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x8899bb, transparent: true, opacity: 0.15,
    roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide
  });
  const windowMesh = new THREE.Mesh(windowGeo, windowMat);
  windowMesh.position.set(0, 3.2, w / 2 - wallThickness / 2 - 0.01);
  scene.add(windowMesh);

  // Wood trim / crown molding
  const trimGeo = new THREE.BoxGeometry(w + wallThickness * 2, 0.15, wallThickness);
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x6d553a, roughness: 0.6 });
  const topTrim = new THREE.Mesh(trimGeo, trimMat);
  topTrim.position.set(0, h - 0.075, -w / 2 + wallThickness / 2);
  scene.add(topTrim);

  // Floor rug
  const rugGeo = new THREE.PlaneGeometry(4, 6);
  const rugMat = new THREE.MeshStandardMaterial({ color: 0x3e2020, roughness: 0.9 });
  const rug = new THREE.Mesh(rugGeo, rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.01, -1);
  rug.receiveShadow = true;
  scene.add(rug);
}

function buildBookshelves() {
  booksGroup = new THREE.Group();
  scene.add(booksGroup);

  const shelfMaterial = new THREE.MeshStandardMaterial({
    color: 0x5d4037, roughness: 0.7, metalness: 0.03
  });
  const backMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1008, roughness: 0.9, metalness: 0.0
  });

  const shelfWidth = 5.6;
  const shelfHeight = 3.2;
  const numShelves = 4;
  const shelfThickness = 0.08;
  const sideWidth = 0.3;
  const spacing = 0.45;

  // Left bookshelf (close to camera)
  addBookshelf(-3.5, 0, -3.8, 'left');
  // Right bookshelf
  addBookshelf(3.5, 0, -3.8, 'right');

  function addBookshelf(x, y, z, side) {
    const shelfDepth = 0.22;
    const shelf = new THREE.Group();

    // Side panels
    const sideGeo = new THREE.BoxGeometry(sideWidth, shelfHeight + 0.3, shelfDepth);
    const leftSide = new THREE.Mesh(sideGeo, shelfMaterial);
    leftSide.position.set(0, (shelfHeight + 0.3) / 2, -0.05);
    leftSide.castShadow = true;
    leftSide.receiveShadow = true;
    shelf.add(leftSide);

    const rightSide = leftSide.clone();
    rightSide.position.set(shelfWidth, (shelfHeight + 0.3) / 2, -0.05);
    shelf.add(rightSide);

    // Shelves and book backs
    for (let s = 0; s <= numShelves; s++) {
      const sy = s * (shelfHeight / numShelves) + 0.1;

      // Shelf
      const shelfBoard = new THREE.Mesh(
        new THREE.BoxGeometry(shelfWidth, shelfThickness, 0.2),
        shelfMaterial
      );
      shelfBoard.position.set(shelfWidth / 2, sy, -0.1);
      shelfBoard.castShadow = true;
      shelfBoard.receiveShadow = true;
      shelf.add(shelfBoard);

      // Book backs
      const backBoard = new THREE.Mesh(
        new THREE.BoxGeometry(shelfWidth - 0.1, shelfHeight / numShelves - 0.1, 0.02),
        backMaterial
      );
      backBoard.position.set(shelfWidth / 2, sy + (shelfHeight / numShelves) / 2, -0.18);
      shelf.add(backBoard);
    }

    shelf.position.set(x, y, z);
    booksGroup.add(shelf);

    // Place books on each shelf
    for (let s = 0; s < numShelves; s++) {
      const sy = s * (shelfHeight / numShelves) + 0.22;
      const booksPerShelf = 5 + s;
      for (let b = 0; b < booksPerShelf; b++) {
        const bx = 0.25 + b * (shelfWidth - 0.5) / (booksPerShelf);
        const bz = -0.02 - Math.random() * 0.04;
        const bookH = 0.12 + Math.random() * 0.18;
        const bookD = 0.06 + Math.random() * 0.12;

        const hue = Math.random() * 60 + 15; // warm browns/reds
        const sat = 30 + Math.random() * 40;
        const lit = 25 + Math.random() * 25;
        const color = new THREE.Color(`hsl(${hue}, ${sat}%, ${lit}%)`);

        const spineMat = new THREE.MeshStandardMaterial({
          color: color, roughness: 0.6, metalness: 0.0
        });

        const book = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, bookH, bookD),
          spineMat
        );

        book.position.set(bx, sy + bookH / 2, bz);
        book.castShadow = !IS_MOBILE;
        book.receiveShadow = !IS_MOBILE;

        // Title texture for spine
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = Math.floor(bookH * 200);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color.getStyle();
        ctx.fillRect(0, 0, 64, canvas.height);
        ctx.fillStyle = '#ffe8c0';
        ctx.font = `bold ${Math.max(8, canvas.height / 6)}px serif`;
        ctx.textAlign = 'center';
        ctx.fillText('📖', 32, canvas.height * 0.55);

        const spineTex = new THREE.CanvasTexture(canvas);
        const spineMat2 = spineMat.clone();
        spineMat2.map = spineTex;

        const spineBook = new THREE.Mesh(
          new THREE.BoxGeometry(bookD, bookH, 0.03),
          [spineMat2, spineMat2.clone(), new THREE.MeshStandardMaterial({ color: 0x111 }), new THREE.MeshStandardMaterial({ color: 0x111 }), new THREE.MeshStandardMaterial({ color: '#f5f0e0' }), new THREE.MeshStandardMaterial({ color: '#f5f0e0' })]
        );

        book.userData = {
          isBook: true,
          bookIdx: booksGroup.children.length % (CONFIG.books?.length || 1),
          originalPosition: book.position.clone(),
          spineColor: color.getStyle()
        };

        book.add(spineBook);
        shelf.add(book);
      }
    }
  }
}

function buildCandles() {
  candlesGroup = new THREE.Group();
  scene.add(candlesGroup);

  const candlePositions = [
    [-2, 0.8, -3.8], [0, 0.8, -3.8], [2, 0.8, -3.8],
    [-1, 0.7, -3.8], [1, 0.7, -3.8], [0, 0.6, -4.2]
  ];

  candlePositions.forEach(pos => {
    // Candle body
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xfff8e0, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.6, 8), bodyMat);
    body.position.set(pos[0], 0.3, pos[2]);
    body.castShadow = !IS_MOBILE;
    candlesGroup.add(body);

    // Candle base
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.7 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8), baseMat);
    base.position.set(pos[0], 0.015, pos[2]);
    candlesGroup.add(base);

    // Flame
    const flameGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xffaa33, transparent: true, opacity: 0.85
    });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(pos[0], 0.7, pos[2]);
    flame.userData.isFlame = true;
    candlesGroup.add(flame);

    // Point light at flame
    const light = new THREE.PointLight(0xffaa33, 2, 5, 1.5);
    light.position.set(pos[0], 0.7, pos[2]);
    candlesGroup.add(light);
  });
}

function buildBookCovers() {
  // Floating book cover sprites near the shelves (visual interest)
  if (!CONFIG.books) return;

  CONFIG.books.forEach((book, i) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 300;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = book.spineColor || '#5d4037';
    ctx.fillRect(0, 0, 512, 300);

    ctx.fillStyle = '#ffe8c0';
    ctx.font = 'bold 42px "Cormorant Garamond", serif';
    ctx.textAlign = 'center';
    ctx.fillText(book.title, 256, 120);

    ctx.font = 'italic 24px "Dancing Script", cursive';
    ctx.fillStyle = '#fdcb6e';
    ctx.fillText('for ' + CONFIG.herName, 256, 180);

    ctx.font = '16px serif';
    ctx.fillStyle = '#ffe8c0';
    ctx.fillText('— ' + CONFIG.books.length + ' books in our library —', 256, 230);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);

    const x = -2 + i * 2;
    sprite.position.set(x, 3.5, -3.7);
    sprite.scale.set(1.8, 1.05, 1);
    sprite.renderOrder = 10;

    const coverLight = new THREE.PointLight(0xffaa33, 0.5, 3);
    coverLight.position.set(x, 3.5, -3.7);

    scene.add(sprite);
    scene.add(coverLight);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Interaction — Raycasting
// ═══════════════════════════════════════════════════════════════════════════

function onMouseMove(e) {
  if (IS_MOBILE) return;
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
    const hit = hits[0].object;
    if (hoveredBook !== hit) {
      if (hoveredBook) {
        gsap.to(hoveredBook.scale, { x: 1, y: 1, z: 1, duration: 0.3 });
      }
      hoveredBook = hit;
      gsap.to(hit.scale, { x: 1.15, y: 1.15, z: 1.15, duration: 0.3 });
      renderer.domElement.style.cursor = 'pointer';
    }
  } else {
    if (hoveredBook) {
      gsap.to(hoveredBook.scale, { x: 1, y: 1, z: 1, duration: 0.3 });
      hoveredBook = null;
    }
    renderer.domElement.style.cursor = 'grab';
  }
}

function tryPickBook(clientX, clientY) {
  if (isBookOpen || !scene) return;
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const books = [];
  scene.traverse(obj => {
    if (obj.userData && obj.userData.isBook) books.push(obj);
  });
  const hits = raycaster.intersectObjects(books, true);
  if (hits.length > 0) {
    const book = hits[0].object;
    if (book.userData.isBook) pickUpBook(book);
  }
}

function onMouseClick(e) {
  if (IS_MOBILE) return;
  tryPickBook(e.clientX, e.clientY);
}

// ═══════════════════════════════════════════════════════════════════════════
// Touch Support (Mobile)
// ═══════════════════════════════════════════════════════════════════════════

let touchStartX, touchStartY, touchStartTime, isSwiping = false;

window.addEventListener('touchstart', onTouchStart, { passive: false });
window.addEventListener('touchmove', onTouchMove, { passive: false });
window.addEventListener('touchend', onTouchEnd, { passive: false });

function onTouchStart(e) {
  if (isBookOpen) return;
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  touchStartTime = Date.now();
  isSwiping = false;
}

function onTouchMove(e) {
  if (isBookOpen) return;
  const touch = e.touches[0];
  if (Math.abs(touch.clientX - touchStartX) > 10 || Math.abs(touch.clientY - touchStartY) > 10) {
    isSwiping = true;
  }
}

function onTouchEnd(e) {
  if (isBookOpen) return;
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dt = Date.now() - touchStartTime;

  // Tap: pick a book
  if (!isSwiping && dt < 300) {
    tryPickBook(touch.clientX, touch.clientY);
  }
  // Swipe: orbit camera
  else if (isSwiping && Math.abs(dx) > 60) {
    orbitAngle += dx * 0.005;
  }
  isSwiping = false;
}

function initSwipeGestures() {
  const pages = document.getElementById('book-pages');
  if (!pages) return;
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
      try { navigator.vibrate(30); } catch {}
    }
  }, { passive: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Book Pick-up Animation
// ═══════════════════════════════════════════════════════════════════════════

async function pickUpBook(bookObj) {
  if (isBookOpen) return;
  isBookOpen = true;

  const bookIdx = bookObj.userData.bookIdx || 0;
  currentBookIdx = bookIdx;
  currentPageIdx = 0;

  // Animate book coming toward camera
  const targetPos = camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1.5));
  targetPos.y -= 0.5;

  gsap.to(bookObj.position, {
    x: targetPos.x, y: targetPos.y, z: targetPos.z,
    duration: 1.0, ease: 'power2.inOut'
  });

  gsap.to(bookObj.rotation, {
    y: Math.PI / 8, x: 0.1,
    duration: 0.8, ease: 'power2.out'
  });

  await sleep(800);

  // Show overlay
  const overlay = document.getElementById('book-overlay');
  const cover = document.getElementById('book-cover');
  const title = document.getElementById('book-title-cover');
  const author = document.getElementById('book-author');
  const bookData = CONFIG.books[bookIdx];

  if (bookData) {
    title.textContent = bookData.title;
    author.textContent = 'for ' + CONFIG.herName;

    const coverEl = document.querySelector('.cover-front');
    const sc = bookData.spineColor || '#5d4037';
    coverEl.style.background = `linear-gradient(145deg, ${sc}, ${darken(sc)})`;
    cover.style.borderColor = sc;
  }

  overlay.classList.remove('hidden');
  setTimeout(() => {
    cover.classList.add('opened');
    showFallbackPage(0);
    document.getElementById('book-pages').classList.remove('hidden');
    initSwipeGestures();
  }, 500);

  // Hide 3D book
  gsap.to(bookObj.scale, { x: 0, y: 0, z: 0, duration: 0.5, delay: 0.4 });
  gsap.to(bookObj, { opacity: 0, duration: 0.5, delay: 0.4 });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function darken(hex) {
  try {
    let r = parseInt(hex.slice(1, 3), 16) - 30;
    let g = parseInt(hex.slice(3, 5), 16) - 30;
    let b = parseInt(hex.slice(5, 7), 16) - 30;
    return '#' + [r, g, b].map(v => Math.max(0, v).toString(16).padStart(2, '0')).join('');
  } catch { return '#3e2723'; }
}

// ═══════════════════════════════════════════════════════════════════════════
// Camera Orbit (idle)
// ═══════════════════════════════════════════════════════════════════════════

let orbitAngle = 0;
let lastFrameTime = 0;

function updateCamera() {
  if (isBookOpen) return;
  // Very slow orbit
  orbitAngle += 0.0003;
  const r = 5.5;
  camera.position.x = Math.sin(orbitAngle) * r;
  camera.position.z = Math.cos(orbitAngle) * r;
  camera.lookAt(0, 1.2, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Animation Loop
// ═══════════════════════════════════════════════════════════════════════════

function animate() {
  requestAnimationFrame(animate);

  if (IS_MOBILE) {
    const now = performance.now();
    if (now - lastFrameTime < 33) return;
    lastFrameTime = now;
  }

  const delta = clock.getDelta();
  const t = clock.getElapsedTime();

  // Flicker candles
  if (candlesGroup) {
    candlesGroup.traverse(obj => {
      if (obj.userData && obj.userData.isFlame) {
        const flicker = 0.7 + Math.sin(t * 5 + obj.position.x) * 0.15 + Math.sin(t * 8.3 + obj.position.z) * 0.1;
        obj.scale.set(flicker, flicker * 1.2, flicker);
        obj.material.color.setHSL(0.1, 0.9, 0.5 + Math.sin(t * 10) * 0.05);
      }
    });
  }

  updateCamera();

  if (composer) {
    // Gentle bloom pulse
    if (bloomPass) {
      bloomPass.strength = 0.5 + Math.sin(t * 0.3) * 0.1;
    }
    composer.render();
  } else if (renderer) {
    renderer.render(scene, camera);
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
// Bootstrap
function initAudioButton() {
  const btn = document.getElementById('enable-audio');
  if (!btn) return;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    audioEnabled = true;
    try {
      if (!audioCtx || audioCtx.state === 'suspended') await playAmbientPiano();
      else if (audioGain) audioGain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 1);
    } catch {}
    btn.classList.add('hidden');
  });
  if (!IS_MOBILE) btn.classList.add('hidden');
}

// Spotify playlist button
function initSpotifyButton() {
  const btn = document.getElementById('spotify-btn');
  if (!btn) return;
  if (CONFIG.spotifyPlaylist && CONFIG.spotifyPlaylist !== 'https://open.spotify.com/playlist/YOUR_PLAYLIST_HERE') {
    btn.href = CONFIG.spotifyPlaylist;
  } else {
    btn.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════════════════════

function initAudioButton() {
  const btn = document.getElementById('enable-audio');
  if (!btn) return;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    audioEnabled = true;
    try {
      if (!audioCtx || audioCtx.state === 'suspended') await playAmbientPiano();
      else if (audioGain) audioGain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 1);
    } catch {}
    btn.classList.add('hidden');
  });
  if (!IS_MOBILE) btn.classList.add('hidden');
}

// Spotify playlist button

function initSpotifyButton() {
  const btn = document.getElementById('spotify-btn');
  if (!btn) return;
  if (CONFIG.spotifyPlaylist && CONFIG.spotifyPlaylist !== 'https://open.spotify.com/playlist/YOUR_PLAYLIST_HERE') {
    btn.href = CONFIG.spotifyPlaylist;
  } else {
    btn.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();

  // Lightweight scroll init (no heavy Lenis dependency on Three.js pages)
  try { initBasicScroll(); } catch (e) { console.warn('Scroll:', e.message); }

  // Candlelight overlay
  try { initFlickerOverlay(); } catch (e) { console.warn('Flicker:', e.message); }

  // Book overlay
  try { initBookOverlay(); } catch (e) { console.warn('Book overlay:', e.message); }

  // UI buttons
  try { initAudioButton(); } catch (e) { console.warn('Audio:', e.message); }
  try { initSpotifyButton(); } catch (e) { console.warn('Spotify:', e.message); }

  // Loading screen
  let loadingScreen = document.getElementById('loading-screen');
  if (!loadingScreen) {
    loadingScreen = document.createElement('div');
    loadingScreen.id = 'loading-screen';
    loadingScreen.innerHTML = '<h1>Our Library</h1><p>loading...</p>';
    loadingScreen.style.cssText = 'position:fixed;inset:0;background:#0a0810;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;transition:opacity 1s,visibility 1s;color:#ff8f00;';
    document.body.prepend(loadingScreen);
  }

  // Three.js
  if (USE_THREE) {
    try {
      await sleep(400);
      initThree();
      console.log('Three.js ready');
    } catch (e) {
      console.warn('Three.js failed:', e.message);
      USE_THREE = false;
    }
  }

  if (!USE_THREE) {
    const fb = document.getElementById('fallback-library');
    if (fb) fb.classList.remove('hidden');
    try { initFallbackLibrary(); } catch (e) { console.warn('Fallback:', e.message); }
  }

  // Hide loading screen after paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (loadingScreen) loadingScreen.classList.add('hidden');
    });
  });

  // Ambient audio
  if (!IS_MOBILE && audioEnabled) {
    try { await playAmbientPiano(); } catch {}
  }
});

// Debug
window.CONFIG = null;
window.toggleAudio = () => {
  if (!audioGain) return;
  const v = audioGain.gain.value;
  audioGain.gain.linearRampToValueAtTime(v > 0 ? 0 : 0.25, audioCtx.currentTime + 0.5);
};

const _origPickUp = pickUpBook;
pickUpBook = async function(bookObj) {
  if (isBookOpen) return;
  await _origPickUp(bookObj);
  updateProgress();
};

