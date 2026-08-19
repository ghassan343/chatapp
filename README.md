# محادثتي — تطبيق شات شبيه بـ ChatGPT (نسخة Netlify)

نفس فكرة المشروع الأصلي: **واجهة ← فنكشن خلفي على Netlify ← Supabase + OpenAI**
المستخدم لا يتكلم أبداً مع OpenAI مباشرة، فقط مع الفنكشن، وهو من يحفظ كل شيء في قاعدة البيانات ويطلب الرد من OpenAI.

```
المتصفح (public/)  --->  Netlify Function (netlify/functions/server.js)  --->  Supabase (تخزين)
                                          |
                                          ---> OpenAI (توليد الردود)
```

## الفرق عن نسخة السيرفر التقليدي (Express/Render)

Netlify ما يشغّل سيرفر دائم (زي `node server.js`). بدلها، كل طلب على `/api/...`
يشغّل **Netlify Function** لحظياً ثم يطفي. لهذا حولنا `server.js` إلى
`netlify/functions/server.js` باستخدام مكتبة `serverless-http` اللي تغلّف
تطبيق Express كامل وتشغّله كفنكشن واحد.

الواجهة (`public/index.html`, `app.js`, `style.css`) ما تغيرت — لسا تتكلم
مع `/api/...` بالضبط زي قبل، بس Netlify يوجّه الطلب تلقائياً للفنكشن
(الإعداد موجود في `netlify.toml`).

---

## 1) إنشاء مشروع Supabase (قاعدة البيانات)

1. روح لـ https://supabase.com وسوّي مشروع جديد.
2. من **SQL Editor**، افتح ملف `schema.sql` في هذا المشروع، انسخه كامل، الصقه واضغط **Run**.
3. من **Project Settings > API** خذ:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (وليس anon key) → `SUPABASE_SERVICE_ROLE_KEY`

⚠️ **لا تحط `service_role key` أبداً في كود الواجهة (`public/`)** — يُستخدم فقط
داخل `netlify/functions/server.js`.

## 2) مفتاح OpenAI

من https://platform.openai.com/api-keys أنشئ مفتاح جديد → `OPENAI_API_KEY`،
وتأكد أن حسابك فيه رصيد.

---

## 3) التجربة محلياً قبل النشر (اختياري لكن يُنصح فيه)

```bash
npm install -g netlify-cli   # مرة وحدة بس، إذا ما كانت مثبتة
npm install
cp .env.example .env
```

املأ `.env` بنفس القيم (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, OPENAI_MODEL).

```bash
netlify dev
```

بيشغّل الواجهة + الفنكشن مع بعض محلياً (عادة على `http://localhost:8888`).

---

## 4) النشر الفعلي على Netlify

### الطريقة الأسهل (ربط GitHub):

1. ارفع هذا المجلد كامل إلى GitHub repo.
2. روح لـ https://app.netlify.com → **Add new site > Import an existing project**.
3. اربط الـ repo. Netlify بيقرأ `netlify.toml` تلقائياً (Build command: `npm install`, Publish: `public`, Functions: `netlify/functions`) — ما تحتاج تغيّر شي.
4. قبل أول Deploy، روح **Site configuration > Environment variables** وأضف:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (مثلاً `gpt-4o-mini`)
5. اضغط **Deploy site**. بيعطيك رابط مثل `https://your-site.netlify.app`.

### أو عن طريق Netlify CLI مباشرة (بدون GitHub):

```bash
netlify login
netlify init
netlify deploy --prod
```

بيسألك عن متغيرات البيئة أثناء الإعداد، أو تقدر تضيفها بعدين من نفس شاشة
Environment variables المذكورة فوق.

---

## 5) كيف يشتغل المشروع

| الملف | وظيفته |
|---|---|
| `public/index.html` `style.css` `app.js` | الواجهة الأمامية — تنشر كموقع static |
| `netlify/functions/server.js` | كل منطق الـ API (نفس أكواد السيرفر القديم) — يعمل فقط عند استدعاء `/api/...` |
| `netlify.toml` | يخبر Netlify وين ملفات الواجهة، ووين الفنكشنز، ويوجّه `/api/*` للفنكشن |
| `schema.sql` | تعريف جداول قاعدة البيانات في Supabase |

تدفق إرسال رسالة: نفس التدفق القديم بالضبط، بس بدل ما يتعامل معه سيرفر
Express دائم الاشتغال، يتعامل معه الفنكشن اللي يشتغل لحظياً مع كل طلب.

---

## 6) ملاحظات أمان مهمة

- المستخدم لا يشوف أي مفتاح API أبداً — كله داخل الفنكشن على سيرفرات Netlify.
- لا ترفع ملف `.env` إلى GitHub أبداً (`.gitignore` يستثنيه تلقائياً).
- إذا صار عندك استخدام حقيقي من أكثر من شخص، يُفضل لاحقاً إضافة نظام دخول
  حقيقي (Supabase Auth) بدل الاسم البسيط الحالي.
- راقب استهلاكك في OpenAI Dashboard.

## 7) تخصيصات سريعة

- تغيير الموديل: عدّل `OPENAI_MODEL` في متغيرات البيئة على Netlify.
- تغيير شخصية المساعد: عدّل سطر `system` داخل `netlify/functions/server.js`.
- تغيير الألوان: كل الألوان في أعلى `public/style.css` تحت `:root`.
