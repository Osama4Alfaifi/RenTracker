# متابعة الإيجارات — دليل الإعداد (RenTracker Setup Guide)

هذا التطبيق ملفات ثابتة (HTML/CSS/JS) تعمل مع Firebase (تسجيل الدخول + قاعدة بيانات).
لا حاجة لأي خادم أو برمجة إضافية — فقط أنشئ مشروع Firebase مجاني وضع بياناته هنا.

This app is static files (HTML/CSS/JS) backed by Firebase (login + database).
No server needed — just create a free Firebase project and paste its config here.

---

## 1. إنشاء مشروع Firebase (Create a Firebase project)

1. اذهب إلى https://console.firebase.google.com وسجّل الدخول بحساب Google.
2. اضغط **Add project** (إضافة مشروع) وأعطه اسمًا مثل `rentracker`.
3. لا حاجة لتفعيل Google Analytics — يمكن تعطيله.

## 2. تفعيل تسجيل الدخول (Enable Authentication)

1. من القائمة الجانبية: **Build > Authentication > Get started**.
2. من تبويب **Sign-in method**، فعّل **Email/Password**.
3. من تبويب **Users**، اضغط **Add user** وأدخل بريدك الإلكتروني وكلمة مرور — هذا هو حسابك لتسجيل الدخول للتطبيق.
   - لإضافة زميل لاحقًا: كرر هذه الخطوة بحسابه فقط (لا حاجة لتعديل أي كود).

## 3. تفعيل قاعدة البيانات (Enable Firestore)

1. من القائمة الجانبية: **Build > Firestore Database > Create database**.
2. اختر **Production mode**، واختر أقرب موقع خادم (مثل `eur3` أو `me-central1` إن توفر).
3. بعد الإنشاء، من تبويب **Rules**، الصق محتوى ملف [`firestore.rules`](firestore.rules) من هذا المشروع، ثم اضغط **Publish**.

## 4. نسخ بيانات الإعداد (Copy the config)

1. من إعدادات المشروع (أيقونة الترس ⚙️ بالأعلى) > **Project settings**.
2. في تبويب **General**، انزل إلى **Your apps**، واضغط أيقونة الويب `</>` لإضافة تطبيق ويب.
3. أعطه اسمًا (مثل `web`) واضغط **Register app**. لا حاجة لـ Firebase Hosting SDK في هذه الخطوة.
4. سينسخ لك كائن `firebaseConfig` — افتح ملف [`js/firebase-config.js`](js/firebase-config.js) في هذا المشروع و:
   - غيّر `USE_EMULATORS` إلى `false`.
   - استبدل القيم داخل `firebaseConfig` بالقيم التي نسختها.

> ملاحظة: هذه القيم (`apiKey` وغيرها) ليست سرية ويمكن أن تكون علنية — الحماية الفعلية تأتي من Firestore Rules (خطوة 3)، لا من إخفاء هذه القيم.

## 5. النشر (Deploy)

اختر طريقة واحدة:

### أ) Firebase Hosting (الأسهل)

```bash
npm install -g firebase-tools
firebase login
firebase deploy
```

(هذا المشروع يحتوي بالفعل على `firebase.json` و `.firebaserc` — عدّل `default` في `.firebaserc` إلى معرّف مشروعك الحقيقي (Project ID) قبل النشر.)

سيعطيك رابطًا مثل `https://rentracker-xxxx.web.app` — هذا هو رابط التطبيق من أي مكان.

### ب) GitHub Pages

1. أنشئ مستودع (repo) على GitHub وارفع محتوى هذا المجلد إليه.
2. من إعدادات المستودع **Settings > Pages**، اختر النشر من الفرع `main` والمجلد الجذر `/`.
3. من Firebase Console: **Authentication > Settings > Authorized domains**، أضف نطاق GitHub Pages الخاص بك (مثل `username.github.io`).

---

## إضافة زميل لاحقًا (Adding a colleague later)

فقط أضف بريده وكلمة مرور من **Authentication > Users** في Firebase Console — لا حاجة لأي تعديل على الكود، وسيتمكن من تسجيل الدخول فورًا بنفس الرابط.

## التجربة المحلية بدون إنشاء حساب (Local testing without a real account)

طالما `USE_EMULATORS = true` في `js/firebase-config.js`، يمكنك تشغيل التطبيق محليًا بمحاكي Firebase بدون أي حساب حقيقي:

```bash
npm install --save-dev firebase-tools
npx firebase emulators:start
```

ثم افتح `index.html` عبر خادم محلي (مثل `npx serve .`) في المتصفح، وأنشئ مستخدم تجريبي من واجهة المحاكي (Emulator UI عادة على `http://127.0.0.1:4000`).
