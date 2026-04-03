// ─── Utilities ────────────────────────────────────────────────────────────────

function randomHex(n) {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('').slice(0, n * 2);
}

function jsonOk(data) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── KV Helpers ───────────────────────────────────────────────────────────────

async function getSession(env, sessionId) {
  return env.CHAT_KV.get(`session:${sessionId}`, 'json');
}

async function saveSession(env, session) {
  // Sessions expire after 30 days of inactivity
  await env.CHAT_KV.put(`session:${session.id}`, JSON.stringify(session), {
    expirationTtl: 86400 * 30,
  });
}

async function getAllSessions(env) {
  const list = await env.CHAT_KV.list({ prefix: 'session:' });
  const sessions = await Promise.all(
    list.keys.map(k => env.CHAT_KV.get(k.name, 'json'))
  );
  return sessions
    .filter(Boolean)
    .sort((a, b) => {
      const lastA = a.messages.at(-1)?.ts ?? a.createdAt;
      const lastB = b.messages.at(-1)?.ts ?? b.createdAt;
      return lastB - lastA;
    });
}

// ─── API Handlers ─────────────────────────────────────────────────────────────

async function handlePostMessage(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON'); }

  const { name, text, sessionId } = body;
  if (!name || typeof name !== 'string' || !name.trim()) return jsonError('name required');
  if (!text || typeof text !== 'string' || !text.trim()) return jsonError('text required');

  let session = sessionId ? await getSession(env, sessionId) : null;

  if (!session) {
    session = { id: randomHex(8), name: name.trim().slice(0, 60), createdAt: Date.now(), messages: [] };
  }

  session.messages.push({ role: 'visitor', text: text.trim().slice(0, 2000), ts: Date.now() });
  await saveSession(env, session);
  return jsonOk({ sessionId: session.id });
}

async function handleGetMessages(request, env) {
  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (!sessionId) return jsonError('sessionId required');
  const session = await getSession(env, sessionId);
  if (!session) return jsonError('Session not found', 404);
  return jsonOk({ messages: session.messages, name: session.name });
}

async function handleAdminReply(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON'); }

  const { sessionId, text, password } = body;
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) return jsonError('Unauthorized', 401);
  if (!sessionId || !text?.trim()) return jsonError('sessionId and text required');

  const session = await getSession(env, sessionId);
  if (!session) return jsonError('Session not found', 404);

  session.messages.push({ role: 'admin', text: text.trim().slice(0, 2000), ts: Date.now() });
  await saveSession(env, session);
  return jsonOk({ ok: true });
}

async function handleGetSessions(request, env) {
  const password = new URL(request.url).searchParams.get('password');
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) return jsonError('Unauthorized', 401);
  const sessions = await getAllSessions(env);
  return jsonOk({ sessions });
}

// ─── Visitor HTML ─────────────────────────────────────────────────────────────

const VISITOR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Chat</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f13; color: #e8e8f0;
      height: 100dvh; display: flex; flex-direction: column; align-items: center;
    }
    header {
      width: 100%; max-width: 700px;
      padding: 14px 20px;
      background: linear-gradient(135deg, #6c63ff, #a855f7);
      display: flex; align-items: center; gap: 12px;
    }
    header h1 { font-size: 17px; font-weight: 700; }
    header p  { font-size: 12px; opacity: .75; margin-top: 2px; }
    .status { width: 9px; height: 9px; background: #4ade80; border-radius: 50%;
              box-shadow: 0 0 7px #4ade80; margin-left: auto; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }

    /* ── Name screen ── */
    #name-screen {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 20px;
      padding: 30px; width: 100%; max-width: 700px;
    }
    #name-screen h2 { font-size: 22px; }
    #name-screen p  { color: #888; font-size: 14px; text-align: center; line-height: 1.6; }
    #name-input {
      width: 100%; max-width: 340px;
      background: #1e1e2a; border: 1.5px solid #2a2a3a;
      border-radius: 12px; padding: 12px 16px;
      color: #e8e8f0; font-size: 15px; outline: none;
      transition: border-color .2s;
    }
    #name-input:focus { border-color: #6c63ff; }
    #name-input::placeholder { color: #444; }
    #start-btn {
      width: 100%; max-width: 340px;
      background: linear-gradient(135deg, #6c63ff, #a855f7);
      border: none; border-radius: 12px; padding: 13px;
      color: white; font-size: 15px; font-weight: 600; cursor: pointer;
      transition: opacity .2s;
    }
    #start-btn:hover { opacity: .9; }

    /* ── Chat screen ── */
    #chat-screen { flex: 1; display: none; flex-direction: column; width: 100%; max-width: 700px; }
    #messages {
      flex: 1; overflow-y: auto; padding: 18px 16px;
      display: flex; flex-direction: column; gap: 10px;
    }
    #messages::-webkit-scrollbar { width: 4px; }
    #messages::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
    .msg { display: flex; flex-direction: column; max-width: 76%; }
    .msg.visitor { align-self: flex-end; align-items: flex-end; }
    .msg.admin   { align-self: flex-start; align-items: flex-start; }
    .label { font-size: 11px; color: #555; margin-bottom: 3px; }
    .bubble {
      padding: 10px 15px; border-radius: 18px;
      font-size: 14.5px; line-height: 1.55;
      white-space: pre-wrap; word-break: break-word;
    }
    .msg.visitor .bubble { background: linear-gradient(135deg,#6c63ff,#a855f7); color:#fff; border-bottom-right-radius:4px; }
    .msg.admin   .bubble { background: #1e1e2a; border:1px solid #2a2a3a; border-bottom-left-radius:4px; }
    .ts { font-size: 10px; color: #444; margin-top: 3px; }
    #input-area {
      padding: 12px 16px 18px;
      border-top: 1px solid #1e1e2a;
      display: flex; gap: 10px; align-items: flex-end;
    }
    #msg-input {
      flex: 1; background: #1e1e2a; border: 1.5px solid #2a2a3a;
      border-radius: 12px; padding: 11px 15px; color: #e8e8f0;
      font-size: 14.5px; font-family: inherit; resize: none;
      max-height: 130px; line-height: 1.5; outline: none;
      transition: border-color .2s;
    }
    #msg-input:focus { border-color: #6c63ff; }
    #msg-input::placeholder { color: #444; }
    #send-btn {
      width: 44px; height: 44px; flex-shrink: 0;
      background: linear-gradient(135deg,#6c63ff,#a855f7);
      border: none; border-radius: 11px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: opacity .2s, transform .1s;
    }
    #send-btn:hover { opacity: .9; }
    #send-btn:active { transform: scale(.94); }
    #send-btn:disabled { opacity: .4; cursor: not-allowed; }
    #send-btn svg { width: 20px; height: 20px; fill: white; }
    .hint { text-align: center; font-size: 11px; color: #2d2d40; padding-bottom: 4px; }
  </style>
</head>
<body>
<header>
  <div>
    <h1>💬 Live Chat</h1>
    <p>We'll reply as soon as possible</p>
  </div>
  <div class="status"></div>
</header>

<!-- Name entry -->
<div id="name-screen">
  <h2>👋 Start a conversation</h2>
  <p>Enter your name so we know who you are,<br/>then send your message.</p>
  <input id="name-input" type="text" placeholder="Your name…" maxlength="60" autofocus/>
  <button id="start-btn">Start Chatting →</button>
</div>

<!-- Chat -->
<div id="chat-screen">
  <div id="messages"></div>
  <div id="input-area">
    <textarea id="msg-input" rows="1" placeholder="Type a message…"></textarea>
    <button id="send-btn" disabled>
      <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
    </button>
  </div>
  <div class="hint">Enter to send · Shift+Enter for new line</div>
</div>

<script>
  const nameScreen  = document.getElementById('name-screen');
  const chatScreen  = document.getElementById('chat-screen');
  const nameInput   = document.getElementById('name-input');
  const startBtn    = document.getElementById('start-btn');
  const messagesEl  = document.getElementById('messages');
  const msgInput    = document.getElementById('msg-input');
  const sendBtn     = document.getElementById('send-btn');

  let sessionId = localStorage.getItem('chat_session_id');
  let visitorName = localStorage.getItem('chat_name');
  let knownCount = 0;
  let sending = false;

  function fmt(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function addBubble(role, text, ts, prepend = false) {
    const wrap   = document.createElement('div');
    wrap.className = 'msg ' + role;
    const label  = document.createElement('div');
    label.className = 'label';
    label.textContent = role === 'admin' ? 'Support' : 'You';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    const time   = document.createElement('div');
    time.className = 'ts';
    time.textContent = fmt(ts);
    wrap.append(label, bubble, time);
    if (prepend) messagesEl.prepend(wrap);
    else messagesEl.append(wrap);
    return wrap;
  }

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showChat() {
    nameScreen.style.display = 'none';
    chatScreen.style.display = 'flex';
    sendBtn.disabled = false;
    msgInput.focus();
  }

  // If returning visitor, skip name screen
  if (sessionId && visitorName) {
    showChat();
    poll();
  }

  startBtn.addEventListener('click', () => {
    const n = nameInput.value.trim();
    if (!n) { nameInput.focus(); return; }
    visitorName = n;
    localStorage.setItem('chat_name', n);
    showChat();
  });

  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') startBtn.click();
  });

  msgInput.addEventListener('input', () => {
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 130) + 'px';
  });

  msgInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  sendBtn.addEventListener('click', sendMessage);

  async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || sending) return;
    sending = true;
    sendBtn.disabled = true;
    msgInput.value = '';
    msgInput.style.height = 'auto';

    addBubble('visitor', text, Date.now());
    scrollBottom();

    try {
      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: visitorName, text, sessionId }),
      });
      const data = await res.json();
      if (data.sessionId) {
        sessionId = data.sessionId;
        localStorage.setItem('chat_session_id', sessionId);
      }
      knownCount++;
    } catch (_) { /* ignore */ }

    sending = false;
    sendBtn.disabled = false;
    msgInput.focus();
  }

  async function poll() {
    if (!sessionId) return;
    try {
      const res = await fetch('/api/messages?sessionId=' + sessionId);
      if (res.ok) {
        const { messages } = await res.json();
        if (messages.length > knownCount) {
          // Render new messages
          const newMsgs = messages.slice(knownCount);
          newMsgs.forEach(m => addBubble(m.role, m.text, m.ts));
          knownCount = messages.length;
          scrollBottom();
        }
      }
    } catch (_) { /* ignore */ }
    setTimeout(poll, 3000);
  }

  // Start polling after slight delay
  if (sessionId) setTimeout(poll, 1000);
  // Kick off polling loop when chat opens
  const origShowChat = showChat;
</script>
</body>
</html>`;

// ─── Admin HTML ───────────────────────────────────────────────────────────────

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Chat Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d0d12; color: #e0e0ee;
      height: 100dvh; display: flex; flex-direction: column;
    }

    /* ── Password Screen ── */
    #pw-screen {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 16px;
    }
    #pw-screen h2 { font-size: 20px; }
    #pw-screen p  { color: #777; font-size: 13px; }
    #pw-input {
      width: 280px; background: #1a1a26; border: 1.5px solid #2a2a38;
      border-radius: 10px; padding: 11px 15px;
      color: #e0e0ee; font-size: 15px; outline: none;
      transition: border-color .2s;
    }
    #pw-input:focus { border-color: #6c63ff; }
    #pw-btn {
      width: 280px; background: linear-gradient(135deg,#6c63ff,#a855f7);
      border: none; border-radius: 10px; padding: 12px;
      color: white; font-size: 15px; font-weight: 600; cursor: pointer;
    }
    #pw-err { color: #f87171; font-size: 13px; display: none; }

    /* ── Dashboard ── */
    #dashboard { flex: 1; display: none; flex-direction: row; overflow: hidden; }

    /* Sidebar */
    #sidebar {
      width: 280px; flex-shrink: 0;
      background: #13131c;
      border-right: 1px solid #1e1e2c;
      display: flex; flex-direction: column;
    }
    #sidebar-header {
      padding: 14px 16px;
      background: linear-gradient(135deg,#6c63ff,#a855f7);
      font-weight: 700; font-size: 15px;
    }
    #sessions-list { flex: 1; overflow-y: auto; }
    .session-item {
      padding: 12px 16px; cursor: pointer;
      border-bottom: 1px solid #1a1a26;
      transition: background .15s;
    }
    .session-item:hover { background: #1a1a28; }
    .session-item.active { background: #1e1c38; border-left: 3px solid #6c63ff; }
    .session-item .s-name { font-size: 14px; font-weight: 600; }
    .session-item .s-preview { font-size: 12px; color: #666; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .session-item .s-time { font-size: 11px; color: #444; margin-top: 2px; }
    .badge {
      display: inline-block; background: #a855f7;
      color: white; font-size: 10px; font-weight: 700;
      border-radius: 10px; padding: 1px 6px; margin-left: 6px;
    }
    #no-sessions { padding: 30px 16px; color: #444; font-size: 13px; text-align: center; }

    /* Main panel */
    #main-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    #panel-header {
      padding: 14px 20px;
      border-bottom: 1px solid #1e1e2c;
      font-weight: 600; font-size: 15px;
      background: #13131c;
    }
    #conv-messages {
      flex: 1; overflow-y: auto;
      padding: 16px 20px; display: flex; flex-direction: column; gap: 10px;
    }
    #conv-messages::-webkit-scrollbar { width: 4px; }
    #conv-messages::-webkit-scrollbar-thumb { background: #2a2a38; border-radius: 4px; }
    .msg { display: flex; flex-direction: column; max-width: 72%; }
    .msg.visitor { align-self: flex-start; }
    .msg.admin   { align-self: flex-end; align-items: flex-end; }
    .msg-label { font-size: 11px; color: #555; margin-bottom: 3px; }
    .bubble {
      padding: 10px 14px; border-radius: 16px;
      font-size: 14px; line-height: 1.55;
      white-space: pre-wrap; word-break: break-word;
    }
    .msg.visitor .bubble { background: #1e1e2c; border: 1px solid #2a2a38; border-bottom-left-radius: 4px; }
    .msg.admin   .bubble { background: linear-gradient(135deg,#6c63ff,#a855f7); color: #fff; border-bottom-right-radius: 4px; }
    .msg-ts { font-size: 10px; color: #444; margin-top: 3px; }

    #reply-area {
      padding: 12px 20px 16px;
      border-top: 1px solid #1e1e2c;
      display: flex; gap: 10px; align-items: flex-end;
    }
    #reply-input {
      flex: 1; background: #1a1a26; border: 1.5px solid #2a2a38;
      border-radius: 11px; padding: 10px 14px;
      color: #e0e0ee; font-size: 14px; font-family: inherit;
      resize: none; max-height: 120px; line-height: 1.5; outline: none;
      transition: border-color .2s;
    }
    #reply-input:focus { border-color: #6c63ff; }
    #reply-input::placeholder { color: #3a3a50; }
    #reply-btn {
      height: 42px; padding: 0 18px; flex-shrink: 0;
      background: linear-gradient(135deg,#6c63ff,#a855f7);
      border: none; border-radius: 10px; color: white;
      font-size: 14px; font-weight: 600; cursor: pointer;
      transition: opacity .2s;
    }
    #reply-btn:hover { opacity: .9; }
    #reply-btn:disabled { opacity: .4; cursor: not-allowed; }

    #empty-state {
      flex: 1; display: flex; align-items: center; justify-content: center;
      color: #333; font-size: 14px; flex-direction: column; gap: 8px;
    }

    @media (max-width: 600px) {
      #sidebar { width: 220px; }
    }
  </style>
</head>
<body>

<!-- Password screen -->
<div id="pw-screen">
  <h2>🔐 Admin Login</h2>
  <p>Enter your admin password to continue</p>
  <input id="pw-input" type="password" placeholder="Admin password…" autofocus/>
  <button id="pw-btn">Login</button>
  <span id="pw-err">Wrong password — try again</span>
</div>

<!-- Dashboard -->
<div id="dashboard">
  <div id="sidebar">
    <div id="sidebar-header">💬 Conversations</div>
    <div id="sessions-list">
      <div id="no-sessions">No conversations yet.<br/>Share the chat link to get started.</div>
    </div>
  </div>
  <div id="main-panel">
    <div id="empty-state">
      <span style="font-size:32px">👈</span>
      Select a conversation to view messages
    </div>
  </div>
</div>

<script>
  const pwScreen    = document.getElementById('pw-screen');
  const dashboard   = document.getElementById('dashboard');
  const pwInput     = document.getElementById('pw-input');
  const pwBtn       = document.getElementById('pw-btn');
  const pwErr       = document.getElementById('pw-err');
  const sessionsList = document.getElementById('sessions-list');
  const noSessions  = document.getElementById('no-sessions');
  const mainPanel   = document.getElementById('main-panel');

  let adminPw = sessionStorage.getItem('admin_pw') || '';
  let sessions = [];
  let activeId  = null;
  let replying  = false;

  // Auto-login if password already stored
  if (adminPw) initDashboard();

  pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') pwBtn.click(); });

  pwBtn.addEventListener('click', async () => {
    const pw = pwInput.value.trim();
    if (!pw) return;
    // Test password
    const res = await fetch('/api/sessions?password=' + encodeURIComponent(pw));
    if (res.ok) {
      adminPw = pw;
      sessionStorage.setItem('admin_pw', pw);
      initDashboard();
    } else {
      pwErr.style.display = 'block';
    }
  });

  function initDashboard() {
    pwScreen.style.display = 'none';
    dashboard.style.display = 'flex';
    fetchSessions();
    setInterval(fetchSessions, 3000);
  }

  function fmt(ts) {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  async function fetchSessions() {
    try {
      const res = await fetch('/api/sessions?password=' + encodeURIComponent(adminPw));
      if (!res.ok) return;
      const data = await res.json();
      sessions = data.sessions;
      renderSidebar();
      if (activeId) renderConversation(activeId);
    } catch (_) { /* ignore */ }
  }

  function renderSidebar() {
    if (sessions.length === 0) {
      noSessions.style.display = 'block';
      return;
    }
    noSessions.style.display = 'none';

    // Build session items
    const existing = new Set([...sessionsList.querySelectorAll('.session-item')].map(el => el.dataset.id));
    const incoming = new Set(sessions.map(s => s.id));

    // Remove deleted
    sessionsList.querySelectorAll('.session-item').forEach(el => {
      if (!incoming.has(el.dataset.id)) el.remove();
    });

    sessions.forEach((s, i) => {
      let item = sessionsList.querySelector(\`.session-item[data-id="\${s.id}"]\`);
      const lastMsg = s.messages.at(-1);
      const unread = s.messages.filter(m => m.role === 'visitor').length;

      if (!item) {
        item = document.createElement('div');
        item.className = 'session-item';
        item.dataset.id = s.id;
        item.addEventListener('click', () => selectSession(s.id));
        sessionsList.appendChild(item);
      }

      if (s.id === activeId) item.classList.add('active');
      else item.classList.remove('active');

      item.innerHTML = \`
        <div class="s-name">\${esc(s.name)}<span class="badge" style="display:\${unread > 0 ? 'inline-block' : 'none'}">\${unread}</span></div>
        <div class="s-preview">\${lastMsg ? esc(lastMsg.text) : 'No messages yet'}</div>
        <div class="s-time">\${lastMsg ? fmt(lastMsg.ts) : ''}</div>
      \`;
    });
  }

  function selectSession(id) {
    activeId = id;
    renderSidebar();
    renderConversation(id);
  }

  function renderConversation(id) {
    const session = sessions.find(s => s.id === id);
    if (!session) return;

    // Clear and rebuild
    mainPanel.innerHTML = \`
      <div id="panel-header">
        Chatting with <strong>\${esc(session.name)}</strong>
        <span style="font-size:12px;color:#555;margin-left:8px">Session started \${fmt(session.createdAt)}</span>
      </div>
      <div id="conv-messages"></div>
      <div id="reply-area">
        <textarea id="reply-input" rows="1" placeholder="Type a reply…"></textarea>
        <button id="reply-btn">Send</button>
      </div>
    \`;

    const convMessages = document.getElementById('conv-messages');
    const replyInput   = document.getElementById('reply-input');
    const replyBtn     = document.getElementById('reply-btn');

    session.messages.forEach(m => {
      const wrap = document.createElement('div');
      wrap.className = 'msg ' + m.role;
      wrap.innerHTML = \`
        <div class="msg-label">\${m.role === 'admin' ? 'You' : esc(session.name)}</div>
        <div class="bubble">\${esc(m.text)}</div>
        <div class="msg-ts">\${fmt(m.ts)}</div>
      \`;
      convMessages.appendChild(wrap);
    });

    convMessages.scrollTop = convMessages.scrollHeight;

    replyInput.addEventListener('input', () => {
      replyInput.style.height = 'auto';
      replyInput.style.height = Math.min(replyInput.scrollHeight, 120) + 'px';
    });
    replyInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(id, replyInput, replyBtn); }
    });
    replyBtn.addEventListener('click', () => sendReply(id, replyInput, replyBtn));
  }

  async function sendReply(sessionId, replyInput, replyBtn) {
    const text = replyInput.value.trim();
    if (!text || replying) return;
    replying = true;
    replyBtn.disabled = true;

    try {
      await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, text, password: adminPw }),
      });
      replyInput.value = '';
      replyInput.style.height = 'auto';
      await fetchSessions();
    } catch (_) { /* ignore */ }

    replying = false;
    replyBtn.disabled = false;
    replyInput.focus();
  }

  function esc(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
</script>
</body>
</html>`;

// ─── Main Worker ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { method, pathname } = Object.assign(request, { pathname: url.pathname });

    // Visitor UI
    if (method === 'GET' && url.pathname === '/') {
      return new Response(VISITOR_HTML, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    // Admin UI
    if (method === 'GET' && url.pathname === '/admin') {
      return new Response(ADMIN_HTML, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    // Check KV is configured
    if (!env.CHAT_KV) {
      return jsonError('KV namespace not configured', 500);
    }

    // API routes
    if (method === 'POST' && url.pathname === '/api/message') return handlePostMessage(request, env);
    if (method === 'GET'  && url.pathname === '/api/messages') return handleGetMessages(request, env);
    if (method === 'POST' && url.pathname === '/api/reply')    return handleAdminReply(request, env);
    if (method === 'GET'  && url.pathname === '/api/sessions') return handleGetSessions(request, env);

    return new Response('Not Found', { status: 404 });
  },
};
