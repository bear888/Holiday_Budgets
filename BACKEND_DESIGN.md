# Backend Design and Implementation Plan

## Overview
To fulfill the requirements of a managed cloud backend with Google OAuth, offline-first capabilities (cloud as a backup/restore mechanism), and cloud storage for photos, we will use **Firebase** as the Backend-as-a-Service (BaaS). Firebase provides a fully managed infrastructure that requires zero server maintenance while offering built-in support for all the requested features.

## Architecture & Technology Stack
* **Frontend**: The existing Vanilla JS, HTML, CSS application (`index.html`).
* **Backend Platform**: **Firebase** (Google Cloud)
  * **Authentication**: Firebase Auth (Google Provider).
  * **Database**: Cloud Firestore (NoSQL document database).
  * **File Storage**: Firebase Cloud Storage.
  * **Hosting (Optional)**: Firebase Hosting for serving the web app.

## Data Model

### 1. Firestore Database (Backup State)
Since the app currently stores all JSON state in `localStorage`, we will use Firestore primarily as a secure cloud backup.

**Collection**: `users`
* **Document ID**: `uid` (The user's unique ID provided by Firebase Auth).
* **Fields**:
  * `appState`: A JSON string or Map of the user's `app` object (trips, groups, expenses, budgets, settings).
  * `lastUpdated`: A timestamp of when the backup was last synced.

### 2. Cloud Storage (Photos)
Photos can exceed database size limits and are best stored as files.
* **Storage Path**: `users/{uid}/photos/{expenseId}.jpg`

## Synchronization Strategy: "Offline-First, Cloud as Backup"
The app will continue to read and write instantly to local storage (LocalStorage and IndexedDB) ensuring a flawless offline experience.

1. **Authentication**:
   * A "Sign in with Google" button will be added to the Settings tab.
   * When authenticated, the app tracks the `uid`.
2. **Cloud Backup (Upload)**:
   * Whenever `save()` is triggered (user adds an expense, trip, etc.), the app will asynchronously push the updated JSON state to Firestore, provided there is an active internet connection.
   * When a photo is captured, it is saved locally to IndexedDB, and asynchronously uploaded to Firebase Cloud Storage.
3. **Cloud Restore (Download)**:
   * If a user opens the app on a new device (or clears their local data), the app detects an empty local state.
   * Upon logging in with Google, the app checks Firestore. If a backup exists, it downloads the `appState`, populates `localStorage`, and triggers a re-render.
   * For photos, the app will lazily fetch missing images from Firebase Cloud Storage URLs when rendering an expense, and cache them back into IndexedDB.

---

## Step-by-Step Implementation Plan

### Step 1: Firebase Project Configuration
1. Go to the Firebase Console and create a new project.
2. Enable **Authentication** and add the **Google Sign-In** provider.
3. Enable **Firestore Database** (Start in production mode, set security rules to allow read/write only if `request.auth.uid == userId`).
4. Enable **Firebase Cloud Storage** (Set security rules to restrict access to the user's own folder).
5. Register a Web App in Firebase to generate the `firebaseConfig` object.

### Step 2: Integrate Firebase SDK into the Frontend
1. Add the Firebase v10 (modular) SDK via CDN in `index.html` (inside `<script type="module">`).
2. Initialize the Firebase app using the configuration object.
3. Initialize Auth, Firestore, and Storage instances.

### Step 3: Implement Google OAuth
1. Add a "Sign in with Google to Backup" section in the Settings page (`#page-settings`).
2. Implement the `signInWithPopup(auth, googleProvider)` function.
3. Listen to `onAuthStateChanged`. If a user is logged in, show their email and a "Sign Out" button.

### Step 4: Implement Cloud Backup & Restore Logic
1. **Upload State**: Modify the existing `save()` function. If `currentUser` exists, debounce a call to `setDoc(doc(db, "users", uid), { appState: app, lastUpdated: serverTimestamp() })`.
2. **Restore State**: Add a "Restore from Cloud" button in Settings (or prompt automatically on login if local storage is empty).
   * Fetch the document from `users/{uid}`.
   * Merge or overwrite the local `app` variable.
   * Call `save()` locally and `renderAll()`.

### Step 5: Implement Cloud Storage for Photos
1. **Upload Photo**: In the photo saving logic, after storing to `PhotoDB` (IndexedDB), convert the base64/Blob to a file and call `uploadBytes(ref(storage, 'users/' + uid + '/photos/' + expenseId), file)`.
2. **Retrieve Photo**: Modify the photo rendering logic. If `photoCache[id]` is missing but the expense is known to have a photo (via a new flag `hasCloudPhoto`), generate a download URL via `getDownloadURL()` and cache it locally.

### Step 6: Testing & Edge Cases
1. Verify offline behavior (saving works, and syncs to Firebase once online).
2. Verify restore behavior on a clean browser session.
3. Handle conflict resolution (e.g., alert the user if they log in and both Cloud and Local have different data, asking which to keep).