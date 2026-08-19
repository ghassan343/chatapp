// ============================================
// netlify/functions/server.js
// نفس منطق السيرفر القديم (server.js) لكن بصيغة Netlify Function.
// Netlify يشغّل هذا الملف كـ endpoint واحد يستقبل كل طلبات /api/*
// (بدل سيرفر Express دائم الاشتغال، هنا كل طلب يشغّل الفنكشن لحظياً).
// ============================================

const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// ---------- التحقق من المتغيرات البيئية ----------
// تُضاف من: Netlify Dashboard > Site configuration > Environment variables
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ متغير البيئة مفقود: ${key}`);
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
// نرفع الحد الافتراضي لحجم الطلب (100kb) عشان يتحمل صور Base64 المرفقة مع الرسائل
app.use(express.json({ limit: '10mb' }));

// ملاحظة مهمة: كل الـ routes هنا لازم تبدأ بـ /api لأن Netlify يوجّه
// أي طلب على /api/* إلى هذا الملف كامل (شوف netlify.toml للتفاصيل).
const router = express.Router();

// ============================================
// المستخدمون
// ============================================
router.post('/users', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'الاسم مطلوب' });
    }

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
router.get('/conversations', async (req, res) => {
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

router.post('/conversations', async (req, res) => {
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

router.delete('/conversations/:id', async (req, res) => {
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

// إعادة تسمية محادثة (يدوياً من المستخدم)
router.patch('/conversations/:id', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'العنوان مطلوب' });
    }

    const { data, error } = await supabase
      .from('conversations')
      .update({ title: title.trim().slice(0, 60) })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'فشل تعديل اسم المحادثة' });
  }
});

// ============================================
// الرسائل (Messages)
// ============================================
router.get('/conversations/:id/messages', async (req, res) => {
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

router.post('/conversations/:id/messages', async (req, res) => {
  const conversationId = req.params.id;
  try {
    const { content, image } = req.body;
    // لازم يكون فيه نص أو صورة على الأقل
    if ((!content || !content.trim()) && !image) {
      return res.status(400).json({ error: 'محتوى الرسالة مطلوب' });
    }

    // 1) نخزن رسالة المستخدم في قاعدة البيانات (مع الصورة إن وجدت)
    const { error: insertUserErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: content || '',
        image_data: image || null,
      });

    if (insertUserErr) throw insertUserErr;

    // 2) نجيب كامل تاريخ المحادثة من قاعدة البيانات
    const { data: history, error: historyErr } = await supabase
      .from('messages')
      .select('role, content, image_data')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (historyErr) throw historyErr;

    // 3) نجهّز الرسائل لصيغة OpenAI. أي رسالة فيها صورة تتحول لصيغة
    //    multimodal (نص + صورة) عشان الموديل يقدر "يشوفها" ويوصفها.
    const openaiMessages = history.map((m) => {
      if (m.image_data) {
        const contentParts = [];
        if (m.content) contentParts.push({ type: 'text', text: m.content });
        contentParts.push({ type: 'image_url', image_url: { url: m.image_data } });
        return { role: m.role, content: contentParts };
      }
      return { role: m.role, content: m.content };
    });

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'أنت مساعد ذكي ومفيد، ترد باللغة التي يكتب بها المستخدم. إذا أرسل المستخدم صورة، صفها وحلّلها وأجب عن أي سؤال يخصها بدقة.',
        },
        ...openaiMessages,
      ],
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
      const autoTitle = (content && content.trim() ? content.trim() : 'محادثة بصورة').slice(0, 40);
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

app.use('/api', router);

module.exports.handler = serverless(app);
