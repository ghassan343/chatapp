// ============================================
// server.js
// السيرفر الخلفي: هذا هو الوسيط الوحيد بين المستخدم (المتصفح) وبين
// كل من Supabase (قاعدة البيانات) و OpenAI (نموذج الذكاء الاصطناعي).
// المتصفح لا يعرف أبداً مفتاح OpenAI ولا مفتاح Supabase السري.
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// ---------- التحقق من المتغيرات البيئية ----------
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ متغير البيئة مفقود: ${key}. تأكد من ملف .env`);
    process.exit(1);
  }
}

// ---------- تهيئة العملاء (Clients) ----------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // مفتاح سري - يعمل فقط هنا على السيرفر
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // مفتاح سري - يعمل فقط هنا على السيرفر
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ---------- تهيئة تطبيق Express ----------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // تقديم ملفات الواجهة الأمامية

// ============================================
// المستخدمون (بسيط جداً - بدون كلمة مرور، فقط اسم لتمييز المحادثات)
// ============================================

// إنشاء أو استرجاع مستخدم بالاسم
app.post('/api/users', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'الاسم مطلوب' });
    }

    // نبحث إذا كان المستخدم موجود مسبقاً بنفس الاسم
    const { data: existing, error: findErr } = await supabase
      .from('users')
      .select('*')
      .eq('name', name.trim())
      .maybeSingle();

    if (findErr) throw findErr;
    if (existing) return res.json(existing);

    const { data, error } = await supabase
      .from('users')
      .insert({ name: name.trim() })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'فشل إنشاء المستخدم' });
  }
});

// ============================================
// المحادثات (Conversations)
// ============================================

// جلب كل محادثات مستخدم معيّن
app.get('/api/conversations', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id مطلوب' });

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user_id)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'فشل جلب المحادثات' });
  }
});

// إنشاء محادثة جديدة
app.post('/api/conversations', async (req, res) => {
  try {
    const { user_id, title } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id مطلوب' });

    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id, title: title || 'محادثة جديدة' })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'فشل إنشاء المحادثة' });
  }
});

// حذف محادثة
app.delete('/api/conversations/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'فشل حذف المحادثة' });
  }
});

// ============================================
// الرسائل (Messages)
// ============================================

// جلب كل رسائل محادثة معيّنة
app.get('/api/conversations/:id/messages', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', req.params.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'فشل جلب الرسائل' });
  }
});

// إرسال رسالة جديدة + الحصول على رد الذكاء الاصطناعي
// هذا هو الـ endpoint الأهم في المشروع
app.post('/api/conversations/:id/messages', async (req, res) => {
  const conversationId = req.params.id;
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'محتوى الرسالة مطلوب' });
    }

    // 1) نخزن رسالة المستخدم في قاعدة البيانات
    const { error: insertUserErr } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, role: 'user', content });

    if (insertUserErr) throw insertUserErr;

    // 2) نجيب كامل تاريخ المحادثة من قاعدة البيانات
    //    (هذا يعطي النموذج "الذاكرة" الكاملة للمحادثة)
    const { data: history, error: historyErr } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (historyErr) throw historyErr;

    // 3) نرسل التاريخ كامل إلى OpenAI ونطلب الرد
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: 'أنت مساعد ذكي ومفيد، ترد باللغة التي يكتب بها المستخدم.' },
        ...history.map(m => ({ role: m.role, content: m.content }))
      ]
    });

    const assistantReply = completion.choices[0].message.content;

    // 4) نخزن رد المساعد في قاعدة البيانات
    const { data: savedAssistantMsg, error: insertAssistantErr } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, role: 'assistant', content: assistantReply })
      .select()
      .single();

    if (insertAssistantErr) throw insertAssistantErr;

    // 5) إذا هذه أول رسالة، نحدّث عنوان المحادثة تلقائياً
    if (history.length <= 1) {
      const autoTitle = content.trim().slice(0, 40);
      await supabase
        .from('conversations')
        .update({ title: autoTitle })
        .eq('id', conversationId);
    }

    res.json(savedAssistantMsg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'فشل معالجة الرسالة. تأكد من صحة مفتاح OpenAI ورصيده.' });
  }
});

// ============================================
// تشغيل السيرفر
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ السيرفر شغال على: http://localhost:${PORT}`);
});
