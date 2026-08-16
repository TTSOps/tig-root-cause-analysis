// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDCx5x5leqv_L2t6Lyzwv96iEglh45yrI8",
  authDomain: "taurus-df709.firebaseapp.com",
  projectId: "taurus-df709",
  storageBucket: "taurus-df709.firebasestorage.app",
  messagingSenderId: "105260480921",
  appId: "1:105260480921:web:5ad42f49d388383b4ffb08",
  measurementId: "G-VJEJS0WZXY"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore and Auth
const db = firebase.firestore();
const auth = firebase.auth();

// Export as globals
window.db = db;
window.auth = auth;
window.currentUserProfile = null;

let appInitialized = false;

// Handle Auth State Changes
auth.onAuthStateChanged(async (user) => {
  const loginOverlay = document.getElementById('login-overlay');
  const appContainer = document.getElementById('app-container');

  if (user) {
    // User is logged in
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';

    try {
      // Fetch user profile from Firestore
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (userDoc.exists) {
        window.currentUserProfile = userDoc.data();
      } else {
        // Auto-create profile on first login
        // Check if any users exist — first user becomes admin
        const allUsers = await db.collection('users').limit(1).get();
        const autoRole = allUsers.empty ? 'admin' : 'viewer';
        const newProfile = {
          email: user.email,
          displayName: user.displayName || user.email.split('@')[0],
          role: autoRole,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('users').doc(user.uid).set(newProfile);
        window.currentUserProfile = newProfile;
        console.log(`Auto-created ${autoRole} profile for ${user.email}`);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
      window.currentUserProfile = null;
    }

    // Initialize main app if not already done
    if (!appInitialized && typeof window.initApp === 'function') {
      window.initApp();
      appInitialized = true;
    }
  } else {
    // User is logged out
    if (loginOverlay) loginOverlay.style.display = 'block';
    if (appContainer) appContainer.style.display = 'none';
    window.currentUserProfile = null;
    appInitialized = false;
  }
});

// Setup Login Form Handler
window.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('login-email');
      const passwordInput = document.getElementById('login-password');
      const errorDiv = document.getElementById('login-error');

      if (!emailInput || !passwordInput) return;

      const email = emailInput.value;
      const password = passwordInput.value;

      auth.signInWithEmailAndPassword(email, password)
        .then(() => {
          if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
          }
        })
        .catch((error) => {
          if (errorDiv) {
            errorDiv.textContent = error.message;
            errorDiv.style.display = 'block';
          }
        });
    });
  }

  // Setup Logout Handler
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      auth.signOut().catch(error => console.error("Error signing out:", error));
    });
  }
});

// Global Helpers
window.isAdmin = () => window.currentUserProfile?.role === 'admin';
window.isViewer = () => window.currentUserProfile?.role === 'viewer';
window.currentUserEmail = () => auth.currentUser?.email || '';
