import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// Placeholder Firebase configuration
// REPLACE THESE WITH YOUR ACTUAL FIREBASE PROJECT CONFIGURATION
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

let currentUser = null;
let isRestoring = false; // Prevent circular sync during restore

// --- Authentication ---

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Login failed:", error);
    window.holidayApp?.toast("Login failed");
  }
}

export async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout failed:", error);
  }
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  const event = new CustomEvent('auth-changed', { detail: { user } });
  window.dispatchEvent(event);

  if (user) {
    await syncInitialState();
  }
});

// --- State Synchronization (Local First) ---

// This gets called right after a successful login
async function syncInitialState() {
  if (!currentUser) return;

  const localApp = window.holidayApp.app;
  const hasLocalTrips = localApp && localApp.trips && localApp.trips.length > 0;

  try {
    const docRef = doc(db, "users", currentUser.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const cloudData = docSnap.data();
      const cloudApp = cloudData.appState;

      // Local First Resolution:
      // If the user has local data, we assume it's the most recent/relevant data
      // because they have been using it offline. We upload local to cloud.
      // If local is completely empty (no trips), we download from cloud.
      if (!hasLocalTrips && cloudApp && cloudApp.trips && cloudApp.trips.length > 0) {
        // Restore from cloud
        isRestoring = true;
        window.holidayApp.app = cloudApp;

        // Persist to local storage directly to avoid triggering the 'app-saved' listener immediately
        localStorage.setItem(window.holidayApp.STORAGE_KEY, JSON.stringify(cloudApp));

        window.holidayApp.renderAll();
        window.holidayApp.toast("✅ Restored data from cloud");

        // Restore photos lazily
        restorePhotosFromCloud(cloudApp);
        isRestoring = false;
      } else if (hasLocalTrips) {
        // We have local data, so we push to cloud to ensure it's backed up
        await backupToCloud(localApp);
      }
    } else {
      // No cloud data exists yet, but we might have local data to backup
      if (hasLocalTrips) {
        await backupToCloud(localApp);
      }
    }
  } catch (error) {
    console.error("Error during initial sync:", error);
  }
}

// Listen to local saves
let backupTimeout = null;
window.addEventListener('app-saved', (e) => {
  if (!currentUser || isRestoring) return;

  const updatedApp = e.detail.app;

  // Debounce cloud writes
  clearTimeout(backupTimeout);
  backupTimeout = setTimeout(() => {
    backupToCloud(updatedApp);
  }, 2000);
});

async function backupToCloud(appState) {
  if (!currentUser) return;

  try {
    const docRef = doc(db, "users", currentUser.uid);
    await setDoc(docRef, {
      appState: appState,
      lastUpdated: serverTimestamp()
    }, { merge: true });

    // Also backup photos that might be new
    backupPhotosToCloud(appState);
  } catch (error) {
    console.error("Backup failed:", error);
  }
}

// --- Photo Synchronization ---

async function backupPhotosToCloud(appState) {
  if (!currentUser || !window.holidayApp.PhotoDB) return;

  const trips = appState.trips || [];
  for (const trip of trips) {
    const expenses = trip.expenses || [];
    for (const exp of expenses) {
      const photoDataUrl = window.holidayApp.photoCache[exp.id];
      if (photoDataUrl && photoDataUrl.startsWith('data:image')) {
        // Only upload if it's a local data URL (not already a firebase URL)
        try {
          const storageRef = ref(storage, `users/${currentUser.uid}/photos/${exp.id}.jpg`);
          await uploadString(storageRef, photoDataUrl, 'data_url');
          // In a more robust system, we might mark `exp.hasCloudPhoto = true`
        } catch (error) {
          console.error(`Failed to upload photo for ${exp.id}:`, error);
        }
      }
    }
  }
}

async function restorePhotosFromCloud(appState) {
  if (!currentUser || !window.holidayApp.PhotoDB) return;

  const trips = appState.trips || [];
  for (const trip of trips) {
    const expenses = trip.expenses || [];
    for (const exp of expenses) {
      if (!window.holidayApp.photoCache[exp.id]) {
        // Attempt to fetch from cloud
        try {
          const storageRef = ref(storage, `users/${currentUser.uid}/photos/${exp.id}.jpg`);
          const url = await getDownloadURL(storageRef);

          // Cache locally in memory
          window.holidayApp.photoCache[exp.id] = url;

          // Render updates
          window.holidayApp.renderAll();

          // Try to save to IndexedDB as well so it's fully offline again
          // (Requires fetching the blob, converting to base64, etc.
          // For simplicity, we just use the cloud URL, but a true offline-first app
          // would fetch() the blob and store it via PhotoDB.put)
        } catch (error) {
          // It's normal for photos not to exist, so we silently ignore 404s
          if (error.code !== 'storage/object-not-found') {
             console.error(`Failed to download photo for ${exp.id}:`, error);
          }
        }
      }
    }
  }
}

// Expose manual triggers to UI
window.holidayApp.firebase = {
  login: loginWithGoogle,
  logout: logout
};
