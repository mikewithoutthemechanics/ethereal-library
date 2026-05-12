/**
 * ETHEREAL LIBRARY — Authentication Module
 * Supabase OAuth + Email/Password + Guest mode
 */

const SUPABASE_URL = 'https://sehweutpfftnrcbqshsn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder';

let supabaseClient = null;
let currentUser = null;
let isGuest = false;

// Initialize Supabase client
function initSupabase() {
  try {
    if (window.supabase && window.supabase.createClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  } catch (e) {
    console.warn('Supabase init failed:', e.message);
  }
}

// Check existing session
async function checkSession() {
  // Check localStorage for guest session
  const guestSession = localStorage.getItem('ethereal_guest');
  if (guestSession) {
    isGuest = true;
    currentUser = JSON.parse(guestSession);
    return currentUser;
  }

  // Check Supabase session
  if (supabaseClient) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session && session.user) {
        currentUser = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User'
        };
        return currentUser;
      }
    } catch (e) {
      console.warn('Session check failed:', e.message);
    }
  }

  return null;
}

// Google OAuth login
async function loginWithGoogle() {
  if (!supabaseClient) {
    showLoginError('Authentication service unavailable. Try guest mode.');
    return;
  }
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (error) showLoginError(error.message);
  } catch (e) {
    showLoginError('Google sign-in failed: ' + e.message);
  }
}

// Email/Password login
async function loginWithEmail(email, password) {
  if (!supabaseClient) {
    showLoginError('Authentication service unavailable. Try guest mode.');
    return;
  }
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      showLoginError(error.message);
      return;
    }
    if (data.user) {
      currentUser = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.full_name || email.split('@')[0]
      };
      onLoginSuccess();
    }
  } catch (e) {
    showLoginError('Login failed: ' + e.message);
  }
}

// Email/Password signup
async function signupWithEmail(email, password) {
  if (!supabaseClient) {
    showLoginError('Authentication service unavailable. Try guest mode.');
    return;
  }
  try {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
      showLoginError(error.message);
      return;
    }
    if (data.user) {
      currentUser = {
        id: data.user.id,
        email: data.user.email,
        name: email.split('@')[0]
      };
      onLoginSuccess();
    }
  } catch (e) {
    showLoginError('Signup failed: ' + e.message);
  }
}

// Guest login
function loginAsGuest() {
  isGuest = true;
  currentUser = {
    id: 'guest_' + Date.now(),
    email: null,
    name: 'Guest'
  };
  localStorage.setItem('ethereal_guest', JSON.stringify(currentUser));
  onLoginSuccess();
}

// Logout
async function logout() {
  if (supabaseClient && !isGuest) {
    try { await supabaseClient.auth.signOut(); } catch (e) {}
  }
  localStorage.removeItem('ethereal_guest');
  currentUser = null;
  isGuest = false;
  showScreen('login');
}

// UI helpers
function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  }
}

function onLoginSuccess() {
  showScreen('dashboard');
  updateDashboardUser();
  if (typeof renderDashboard === 'function') renderDashboard();
}

function updateDashboardUser() {
  const nameEl = document.getElementById('dash-user-name');
  if (nameEl && currentUser) {
    nameEl.textContent = currentUser.name || currentUser.email || 'Guest';
  }
}

function showScreen(screen) {
  document.getElementById('login-screen').classList.toggle('hidden', screen !== 'login');
  document.getElementById('dashboard').classList.toggle('hidden', screen !== 'dashboard');
  document.getElementById('canvas-container').classList.toggle('hidden', screen !== 'library');
  document.getElementById('flicker-overlay').classList.toggle('hidden', screen !== 'library');
  document.getElementById('dust-overlay').classList.toggle('hidden', screen !== 'library');
  document.getElementById('moonlight').classList.toggle('hidden', screen !== 'library');
  const sceneControls = document.getElementById('scene-controls');
  if (sceneControls) sceneControls.classList.toggle('hidden', screen !== 'library');
}

// Initialize auth UI
function initAuthUI() {
  document.getElementById('btn-login-google')?.addEventListener('click', loginWithGoogle);
  document.getElementById('btn-login-email')?.addEventListener('click', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if (email && password) loginWithEmail(email, password);
    else showLoginError('Please enter email and password');
  });
  document.getElementById('btn-signup-email')?.addEventListener('click', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if (email && password) signupWithEmail(email, password);
    else showLoginError('Please enter email and password to sign up');
  });
  document.getElementById('btn-guest')?.addEventListener('click', loginAsGuest);
  document.getElementById('btn-logout')?.addEventListener('click', logout);
}
