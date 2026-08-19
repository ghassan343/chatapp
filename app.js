// ============================================
// app.js
// كل الطلبات هنا تروح فقط لسيرفرنا الخلفي (/api/...)
// المتصفح لا يتكلم أبداً مع OpenAI أو Supabase مباشرة.
// ============================================

const state = {
  user: null,
  conversations: [],
  activeConvId: null,
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
};

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
    item.innerHTML = `<span>${escapeHtml(conv.title)}</span><button class="del-btn">✕</button>`;
    item.querySelector('span').addEventListener('click', () => openConversation(conv.id));
    item.querySelector('.del-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversation(conv.id);
    });
    el.convList.appendChild(item);
  });
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

// ---------------- إرسال الرسائل ----------------
el.composerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = el.messageInput.value.trim();
  if (!text) return;

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

  renderMessage({ role: 'user', content: text });
  const thinkingEl = renderThinking();
  scrollToBottom();

  try {
    const res = await fetch(`/api/conversations/${state.activeConvId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
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
  row.innerHTML = `
    <div class="avatar">${avatarLetter}</div>
    <div class="bubble">${escapeHtml(msg.content)}</div>
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
