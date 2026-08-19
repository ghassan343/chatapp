-- ============================================
-- Schema لتطبيق الشات (شبيه ChatGPT)
-- شغّل هذا الملف كامل داخل: Supabase Dashboard > SQL Editor > New Query
-- ============================================

-- تفعيل امتداد توليد UUID (موجود افتراضياً في أغلب مشاريع Supabase)
create extension if not exists "pgcrypto";

-- جدول المستخدمين (بسيط - تعريف بواسطة اسم/بريد فقط، بدون نظام دخول معقد)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  created_at timestamptz not null default now()
);

-- جدول المحادثات
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null default 'محادثة جديدة',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- جدول الرسائل
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

-- فهارس لتسريع الاستعلامات المتكررة
create index if not exists idx_messages_conversation_id on messages(conversation_id);
create index if not exists idx_conversations_user_id on conversations(user_id);

-- تحديث updated_at تلقائياً عند إضافة رسالة جديدة للمحادثة
create or replace function touch_conversation()
returns trigger as $$
begin
  update conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_conversation on messages;
create trigger trg_touch_conversation
after insert on messages
for each row execute function touch_conversation();

-- ملاحظة أمان مهمة:
-- هذه الجداول يتم الوصول لها فقط من السيرفر الخلفي (Backend) باستخدام
-- الـ Service Role Key، وليس من المتصفح مباشرة. لذلك لا حاجة لتفعيل RLS
-- المعقد هنا، لكن تأكد أن الـ anon/public key لا يُستخدم أبداً على هذه الجداول
-- من طرف العميل (Frontend) مباشرة.
