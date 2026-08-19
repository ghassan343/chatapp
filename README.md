# محادثتي — تطبيق شات شبيه بـ ChatGPT

تطبيق شات كامل: **واجهة ← سيرفرك الخلفي ← Supabase + OpenAI**
المستخدم لا يتكلم أبداً مع OpenAI مباشرة، فقط مع سيرفرك، وسيرفرك هو من يحفظ كل شيء في قاعدة البيانات ويطلب الرد من OpenAI.

```
المتصفح  --->  السيرفر (server.js)  --->  Supabase (تخزين المحادثات)
                        |
                        ---> OpenAI (توليد الردود)
```

---

## 1) إنشاء مشروع Supabase (قاعدة البيانات)

1. روح لـ https://supabase.com وسوّي حساب مجاني، ثم أنشئ مشروع جديد (New Project).
2. بعد ما يجهز المشروع، روح لـ **SQL Editor** من القائمة الجانبية.
3. افتح ملف `supabase/schema.sql` الموجود في هذا المشروع، انسخ محتواه كامل، الصقه في SQL Editor واضغط **Run**.
   - هذا بينشئ 3 جداول: `users`, `conversations`, `messages`.
4. روح لـ **Project Settings > API** وخذ منها:
   - **Project URL** → هذا هو `SUPABASE_URL`
   - **service_role key** (وليس anon key) → هذا هو `SUPABASE_SERVICE_ROLE_KEY`

⚠️ **مهم جداً**: `service_role key` مفتاح قوي جداً (يقدر يقرأ ويعدل كل شيء في القاعدة). لا تحطه أبداً في كود الواجهة الأمامية (public/) ولا تشاركه مع أحد. هو يُستخدم فقط داخل `server.js` على السيرفر.

---

## 2) الحصول على مفتاح OpenAI

1. روح لـ https://platform.openai.com/api-keys وسجل دخول.
2. أنشئ مفتاح جديد (Create new secret key) وانسخه — هذا هو `OPENAI_API_KEY`.
3. تأكد أن حسابك فيه رصيد (Billing) عشان الطلبات تشتغل.

---

## 3) إعداد المشروع محلياً

```bash
# داخل مجلد المشروع
npm install
cp .env.example .env
```

افتح ملف `.env` واملأ القيم:

```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi....
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini
PORT=3000
```

ثم شغّل السيرفر:

```bash
npm start
```

افتح المتصفح على: **http://localhost:3000**

---

## 4) كيف يشتغل المشروع (نظرة سريعة على الكود)

| الملف | وظيفته |
|---|---|
| `public/index.html` `style.css` `app.js` | الواجهة الأمامية (اللي يشوفها المستخدم في المتصفح) |
| `server.js` | السيرفر الخلفي — فيه كل الـ API endpoints، وهو الوحيد اللي يعرف مفاتيح OpenAI و Supabase |
| `supabase/schema.sql` | تعريف جداول قاعدة البيانات |

تدفق إرسال رسالة:
1. المستخدم يكتب رسالة → تروح لـ `POST /api/conversations/:id/messages`
2. السيرفر يخزن رسالة المستخدم في جدول `messages`
3. السيرفر يجيب **كامل تاريخ المحادثة** من قاعدة البيانات (عشان يكون عند النموذج سياق كامل، وليس فقط آخر رسالة)
4. السيرفر يرسل التاريخ لـ OpenAI ويستقبل الرد
5. السيرفر يخزن رد الذكاء الاصطناعي في `messages` ويرجعه للواجهة

---

## 5) تسليم التطبيق لشخص يستخدمه (النشر)

أسهل طريقة مجانية: **Render.com** أو **Railway.app**

### عبر Render.com (خطوات مختصرة):
1. ارفع هذا المشروع إلى GitHub (repo خاص أفضل).
2. في Render: **New > Web Service** → اربطه بالـ repo.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. في تبويب **Environment**، أضف نفس متغيرات ملف `.env` (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, OPENAI_MODEL).
6. اضغط Deploy — بيعطيك رابط عام مثل `https://your-app.onrender.com` تقدر تشاركه مع أي شخص.

> ملاحظة: لا ترفع ملف `.env` نفسه إلى GitHub أبداً (تأكد أن فيه `.gitignore` يستثنيه — مضاف تلقائياً بالأسفل).

---

## 6) ملاحظات أمان مهمة

- المستخدم لا يملك ولا يشوف أي مفتاح API أبداً — كله على السيرفر فقط.
- إذا بتوزع التطبيق على أكثر من شخص فعلياً (إنتاج حقيقي)، يُفضل لاحقاً إضافة نظام تسجيل دخول حقيقي (بريد + كلمة مرور أو Supabase Auth) بدل الاسم البسيط الحالي.
- راقب استهلاكك في OpenAI Dashboard عشان ما تتفاجأ بفاتورة عالية إذا استخدمه أكثر من شخص.

---

## 7) تخصيصات سريعة ممكن تسويها

- تغيير الموديل: عدّل `OPENAI_MODEL` في `.env` (مثلاً `gpt-4o` بدل `gpt-4o-mini`).
- تغيير رسالة النظام (شخصية المساعد): عدّل السطر `system` داخل `server.js`.
- تغيير الألوان: كل الألوان معرّفة في أعلى ملف `public/style.css` تحت `:root`.
