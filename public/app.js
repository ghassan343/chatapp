// ============================================
// app.js
// كل الطلبات هنا تروح فقط لسيرفرنا الخلفي (/api/...)
// المتصفح لا يتكلم أبداً مع OpenAI أو Supabase مباشرة.
// ============================================

const state = {
  user: null,
  conversations: [],
  activeConvId: null,
  pendingImage: null, // صورة Base64 مختارة بانتظار الإرسال
};

const el = {
  loginScreen: document.getElementById('loginScreen'),
  appScreen: document.getElementById('appScreen'),
  nameInput: document.getElementById('nameInput'),
  startBtn: document.getElementById('startBtn'),
  newChatBtn: document.getElementById('newChatBtn'),
  convList: document.getElementById('convList'),
  userNameLabel: document.getElementById('userNameLabel'),
  emptyState: document.getElementById('emptyState'),
  messagesWrap: document.getElementById('messagesWrap'),
  composerForm: document.getElementById('composerForm'),
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  menuToggleBtn: document.getElementById('menuToggleBtn'),
  sidebarOverlay: document.getElementById('sidebarOverlay'),
  attachBtn: document.getElementById('attachBtn'),
  imageInput: document.getElementById('imageInput'),
  imagePreviewWrap: document.getElementById('imagePreviewWrap'),
  imagePreview: document.getElementById('imagePreview'),
  removeImageBtn: document.getElementById('removeImageBtn'),
};

// ---------------- قائمة الجوال (فتح/إغلاق الشريط الجانبي) ----------------
function openSidebar() {
  el.appScreen.classList.add('sidebar-open');
}
function closeSidebar() {
  el.appScreen.classList.remove('sidebar-open');
}
if (el.menuToggleBtn) {
  el.menuToggleBtn.addEventListener('click', openSidebar);
}
if (el.sidebarOverlay) {
  el.sidebarOverlay.addEventListener('click', closeSidebar);
}

// ---------------- تسجيل الدخول البسيط ----------------
const savedUser = localStorage.getItem('chatapp_user');
if (savedUser) {
  state.user = JSON.parse(savedUser);
  boot();
}

el.startBtn.addEventListener('click', handleStart);
el.nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleStart();
});

async function handleStart() {
  const name = el.nameInput.value.trim();
  if (!name) return;
  el.startBtn.disabled = true;
  el.startBtn.textContent = '...جاري التحضير';
  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const user = await res.json();
    state.user = user;
    localStorage.setItem('chatapp_user', JSON.stringify(user));
    boot();
  } catch (err) {
    alert('حدث خطأ، تأكد أن السيرفر شغال');
    el.startBtn.disabled = false;
    el.startBtn.textContent = 'ابدأ';
  }
}

// ---------------- تشغيل التطبيق ----------------
async function boot() {
  el.loginScreen.style.display = 'none';
  el.appScreen.style.display = 'flex';
  el.userNameLabel.textContent = state.user.name;
  await loadConversations();
}

// ---------------- المحادثات ----------------
async function loadConversations() {
  const res = await fetch(`/api/conversations?user_id=${state.user.id}`);
  state.conversations = await res.json();
  renderConvList();
}

function renderConvList() {
  el.convList.innerHTML = '';
  state.conversations.forEach((conv) => {
    const item = document.createElement('div');
    item.className = 'conv-item' + (conv.id === state.activeConvId ? ' active' : '');
    item.innerHTML = `
      <span class="conv-title">${escapeHtml(conv.title)}</span>
      <div class="conv-actions">
        <button class="rename-btn" title="إعادة تسمية" type="button">✎</button>
        <button class="del-btn" title="حذف" type="button">✕</button>
      </div>
    `;
    item.querySelector('.conv-title').addEventListener('click', () => openConversation(conv.id));
    item.querySelector('.rename-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      startRenameConversation(item, conv);
    });
    item.querySelector('.del-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversation(conv.id);
    });
    el.convList.appendChild(item);
  });
}

// ---------------- إعادة تسمية محادثة ----------------
function startRenameConversation(item, conv) {
  const titleSpan = item.querySelector('.conv-title');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'conv-rename-input';
  input.value = conv.title;
  titleSpan.replaceWith(input);
  input.focus();
  input.select();

  const finish = async (save) => {
    const newTitle = input.value.trim();
    if (save && newTitle && newTitle !== conv.title) {
      try {
        const res = await fetch(`/api/conversations/${conv.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle }),
        });
        const updated = await res.json();
        if (!updated.error) conv.title = updated.title;
      } catch (err) {
        // نتجاهل ونرجع للاسم القديم لو فشل الاتصال
      }
    }
    renderConvList();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

el.newChatBtn.addEventListener('click', async () => {
  const res = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: state.user.id }),
  });
  const conv = await res.json();
  state.conversations.unshift(conv);
  renderConvList();
  openConversation(conv.id);
  closeSidebar();
});

async function deleteConversation(id) {
  if (!confirm('حذف هذه المحادثة؟')) return;
  await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
  state.conversations = state.conversations.filter((c) => c.id !== id);
  if (state.activeConvId === id) {
    state.activeConvId = null;
    showEmptyState();
  }
  renderConvList();
}

async function openConversation(id) {
  state.activeConvId = id;
  renderConvList();
  closeSidebar();
  el.emptyState.style.display = 'none';
  el.messagesWrap.style.display = 'block';
  el.messagesWrap.innerHTML = '<div style="text-align:center;color:var(--ink-soft);padding:20px;font-size:13px;">...جاري التحميل</div>';

  const res = await fetch(`/api/conversations/${id}/messages`);
  const messages = await res.json();
  el.messagesWrap.innerHTML = '';
  messages.forEach(renderMessage);
  scrollToBottom();
}

function showEmptyState() {
  el.emptyState.style.display = 'flex';
  el.messagesWrap.style.display = 'none';
}

// ---------------- إرفاق الصور ----------------
if (el.attachBtn) {
  el.attachBtn.addEventListener('click', () => el.imageInput.click());
}

if (el.imageInput) {
  el.imageInput.addEventListener('change', async () => {
    const file = el.imageInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('الملف المختار لازم يكون صورة');
      return;
    }
    try {
      const dataUrl = await compressImageToDataUrl(file);
      state.pendingImage = dataUrl;
      el.imagePreview.src = dataUrl;
      el.imagePreviewWrap.style.display = 'flex';
    } catch (err) {
      alert('تعذر قراءة الصورة، جرب صورة ثانية');
    }
    el.imageInput.value = ''; // يسمح باختيار نفس الملف مرة ثانية لو حبى
  });
}

if (el.removeImageBtn) {
  el.removeImageBtn.addEventListener('click', () => {
    state.pendingImage = null;
    el.imagePreview.src = '';
    el.imagePreviewWrap.style.display = 'none';
  });
}

// نصغّر الصورة قبل الإرسال (أقصى بعد 1280px، جودة 75%) عشان تكون
// خفيفة بما يكفي للإرسال والتخزين في قاعدة البيانات
function compressImageToDataUrl(file, maxDim = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('image load failed'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------------- إرسال الرسائل ----------------
el.composerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = el.messageInput.value.trim();
  const image = state.pendingImage;
  if (!text && !image) return;

  // إذا ما فيه محادثة مفتوحة، ننشئ وحدة جديدة تلقائياً
  if (!state.activeConvId) {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: state.user.id }),
    });
    const conv = await res.json();
    state.conversations.unshift(conv);
    state.activeConvId = conv.id;
    el.emptyState.style.display = 'none';
    el.messagesWrap.style.display = 'block';
    el.messagesWrap.innerHTML = '';
    renderConvList();
  }

  el.messageInput.value = '';
  el.messageInput.style.height = 'auto';
  el.sendBtn.disabled = true;

  // تفريغ معاينة الصورة من الواجهة بعد أخذ نسختها للإرسال
  state.pendingImage = null;
  el.imagePreview.src = '';
  el.imagePreviewWrap.style.display = 'none';

  renderMessage({ role: 'user', content: text, image_data: image });
  const thinkingEl = renderThinking();
  scrollToBottom();

  try {
    const res = await fetch(`/api/conversations/${state.activeConvId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, image }),
    });
    const assistantMsg = await res.json();
    thinkingEl.remove();
    if (assistantMsg.error) {
      renderMessage({ role: 'assistant', content: '⚠️ ' + assistantMsg.error });
    } else {
      renderMessage(assistantMsg);
      // تحديث عنوان المحادثة في الشريط الجانبي بعد أول رسالة
      loadConversations();
    }
  } catch (err) {
    thinkingEl.remove();
    renderMessage({ role: 'assistant', content: '⚠️ تعذر الاتصال بالسيرفر' });
  }

  scrollToBottom();
  el.sendBtn.disabled = false;
});

// إرسال بـ Enter (بدون Shift)
el.messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    el.composerForm.requestSubmit();
  }
});
el.messageInput.addEventListener('input', () => {
  el.messageInput.style.height = 'auto';
  el.messageInput.style.height = Math.min(el.messageInput.scrollHeight, 160) + 'px';
});

// ---------------- عرض الرسائل ----------------
function renderMessage(msg) {
  const row = document.createElement('div');
  row.className = `msg-row ${msg.role}`;
  const avatarLetter = msg.role === 'user' ? (state.user.name[0] || 'م') : 'م';
  const imageHtml = msg.image_data
    ? `<img class="msg-image" src="${msg.image_data}" alt="صورة مرفقة">`
    : '';
  const textHtml = msg.content ? escapeHtml(msg.content) : '';
  row.innerHTML = `
    <div class="avatar">${avatarLetter}</div>
    <div class="bubble">${imageHtml}${textHtml}</div>
  `;
  el.messagesWrap.appendChild(row);
  return row;
}

function renderThinking() {
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  row.innerHTML = `
    <div class="avatar">م</div>
    <div class="bubble thinking"><span></span><span></span><span></span></div>
  `;
  el.messagesWrap.appendChild(row);
  return row;
}

function scrollToBottom() {
  el.messagesWrap.scrollTop = el.messagesWrap.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
