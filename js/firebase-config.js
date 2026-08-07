// إعدادات Firebase — Firebase configuration
//
// وضع المحاكاة (Emulator mode): اتركه true للتجربة المحلية بدون إنشاء مشروع حقيقي.
// عند الانتقال للاستخدام الفعلي: غيّره إلى false وضع بيانات مشروعك الحقيقي
// (من: Firebase Console > Project settings > General > Your apps > Web app).
export const USE_EMULATORS = false;

// ملاحظة: هذه القيم ليست سرية ويمكن أن تظهر للعامة — الحماية الحقيقية تأتي من Firestore Rules.
export const firebaseConfig = {
  apiKey: "AIzaSyDCt11nl8VTTXLW-E2GyaDn8QeP4_HRsAA",
  authDomain: "rentracker-29a3b.firebaseapp.com",
  projectId: "rentracker-29a3b",
  storageBucket: "rentracker-29a3b.firebasestorage.app",
  messagingSenderId: "368758785221",
  appId: "1:368758785221:web:d0365fb61166cfd86ddcac",
};

export const EMULATOR_HOSTS = {
  auth: "http://127.0.0.1:9099",
  firestorePort: 8080,
  firestoreHost: "127.0.0.1",
};
