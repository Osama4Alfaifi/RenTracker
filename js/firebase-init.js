import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { USE_EMULATORS, firebaseConfig, EMULATOR_HOSTS } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (USE_EMULATORS) {
  connectAuthEmulator(auth, EMULATOR_HOSTS.auth, { disableWarnings: true });
  connectFirestoreEmulator(db, EMULATOR_HOSTS.firestoreHost, EMULATOR_HOSTS.firestorePort);
}
