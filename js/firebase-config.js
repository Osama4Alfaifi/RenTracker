// إعدادات Firebase — Firebase configuration
//
// وضع المحاكاة (Emulator mode): اتركه true للتجربة المحلية بدون إنشاء مشروع حقيقي.
// عند الانتقال للاستخدام الفعلي: غيّره إلى false وضع بيانات مشروعك الحقيقي
// (من: Firebase Console > Project settings > General > Your apps > Web app).
export const USE_EMULATORS = true;

// هذه القيم مجرد أمثلة لوضع المحاكاة. استبدلها ببيانات مشروعك الحقيقي عندما تكون جاهزًا.
// ملاحظة: هذه القيم ليست سرية ويمكن أن تظهر للعامة — الحماية الحقيقية تأتي من Firestore Rules.
export const firebaseConfig = {
  apiKey: "demo-api-key",
  authDomain: "demo-rentracker.firebaseapp.com",
  projectId: "demo-rentracker",
  storageBucket: "demo-rentracker.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000",
};

export const EMULATOR_HOSTS = {
  auth: "http://127.0.0.1:9099",
  firestorePort: 8080,
  firestoreHost: "127.0.0.1",
};
