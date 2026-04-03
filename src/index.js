const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Chat Chat — AI Chatbot</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f13;
      color: #e8e8f0;
      height: 100dvh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    header {
      background: linear-gradient(135deg, #6c63ff 0%, #a855f7 100%);
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 2px 20px rgba(108, 99, 255, 0.4);
      flex-shrink: 0;
    }

    .logo {
      width: 36px;
      height: 36px;
      background: rgba(255,255,255,0.2);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    header h1 {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }

    header p {
      font-size: 12px;
      opacity: 0.75;
      margin-top: 1px;
    }

    #status-dot {
      width: 8px;
      height: 8px;
      background: #4ade80;
      border-radius: 50%;
      margin-left: auto;
      box-shadow: 0 0 8px #4ade80;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    #chat-window {
      flex: 1;
      overflow-y: auto;
      padding: 20px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scroll-behavior: smooth;
    }

    #chat-window::-webkit-scrollbar { width: 4px; }
    #chat-window::-webkit-scrollbar-track { background: transparent; }
    #chat-window::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }

    .message {
      display: flex;
      gap: 10px;
      max-width: 80%;
      animation: fadeUp 0.25s ease;
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .message.user { margin-left: auto; flex-direction: row-reverse; }

    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      margin-top: 2px;
    }

    .message.bot .avatar  { background: #2a2a38; }
    .message.user .avatar { background: #6c63ff; }

    .bubble {
      padding: 11px 15px;
      border-radius: 18px;
      font-size: 14.5px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .message.bot  .bubble {
      background: #1e1e2a;
      border-bottom-left-radius: 4px;
      color: #e0e0f0;
    }

    .message.user .bubble {
      background: linear-gradient(135deg, #6c63ff, #a855f7);
      border-bottom-right-radius: 4px;
      color: #fff;
    }

    .timestamp {
      font-size: 10px;
      color: #555;
      margin-top: 4px;
      text-align: right;
    }

    .message.bot .timestamp { text-align: left; }

    /* Typing indicator */
    .typing-indicator {
      display: flex;
      gap: 10px;
      align-items: center;
      max-width: 80%;
      animation: fadeUp 0.25s ease;
    }

    .typing-bubble {
      background: #1e1e2a;
      padding: 14px 18px;
      border-radius: 18px;
      border-bottom-left-radius: 4px;
      display: flex;
      gap: 5px;
      align-items: center;
    }

    .dot {
      width: 7px;
      height: 7px;
      background: #6c63ff;
      border-radius: 50%;
      animation: bounce 1.2s infinite;
    }

    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes bounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-6px); }
    }

    /* Input area */
    #input-area {
      padding: 14px 16px;
      background: #15151e;
      border-top: 1px solid #1e1e2a;
      display: flex;
      gap: 10px;
      align-items: flex-end;
      flex-shrink: 0;
    }

    #message-input {
      flex: 1;
      background: #1e1e2a;
      border: 1.5px solid #2a2a3a;
      border-radius: 14px;
      padding: 12px 16px;
      color: #e8e8f0;
      font-size: 14.5px;
      font-family: inherit;
      resize: none;
      outline: none;
      line-height: 1.5;
      max-height: 140px;
      overflow-y: auto;
      transition: border-color 0.2s;
    }

    #message-input::placeholder { color: #444; }

    #message-input:focus { border-color: #6c63ff; }

    #send-btn {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, #6c63ff, #a855f7);
      border: none;
      border-radius: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.2s, transform 0.1s;
    }

    #send-btn:hover { opacity: 0.9; }
    #send-btn:active { transform: scale(0.94); }
    #send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    #send-btn svg { width: 20px; height: 20px; fill: white; }

    .hint { font-size: 11px; color: #333; text-align: center; padding-bottom: 4px; padding-top: 2px; }

    /* Welcome message */
    .welcome {
      text-align: center;
      padding: 40px 20px;
      color: #444;
    }

    .welcome .icon { font-size: 48px; margin-bottom: 12px; }
    .welcome h2 { font-size: 18px; color: #666; margin-bottom: 6px; }
    .welcome p  { font-size: 13px; line-height: 1.6; }

    @media (max-width: 480px) {
      .message { max-width: 90%; }
      header h1 { font-size: 16px; }
    }
  </style>
</head>
<body>

<header>
  <div class="logo">💬</div>
  <div>
    <h1>Chat Chat</h1>
    <p>AI-powered chatbot</p>
  </div>
  <div id="status-dot" title="Online"></div>
</header>

<div id="chat-window">
  <div class="welcome" id="welcome">
    <div class="icon">🤖</div>
    <h2>Hello! I'm your AI assistant.</h2>
    <p>Ask me anything — I'm here to help.<br/>Type a message below to get started.</p>
  </div>
</div>

<div id="input-area">
  <textarea
    id="message-input"
    placeholder="Type a message…"
    rows="1"
    autofocus
  ></textarea>
  <button id="send-btn" title="Send message">
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
    </svg>
  </button>
</div>
<div class="hint">Enter to send &nbsp;·&nbsp; Shift+Enter for new line</div>

<script>
  const chatWindow = document.getElementById('chat-window');
  const input = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const welcome = document.getElementById('welcome');

  let history = [];
  let waiting = false;

  function now() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function scrollBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function addMessage(role, text) {
    if (welcome) welcome.remove();

    const wrap = document.createElement('div');
    wrap.className = 'message ' + role;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? '🧑' : '🤖';

    const right = document.createElement('div');

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;

    const ts = document.createElement('div');
    ts.className = 'timestamp';
    ts.textContent = now();

    right.appendChild(bubble);
    right.appendChild(ts);
    wrap.appendChild(avatar);
    wrap.appendChild(right);
    chatWindow.appendChild(wrap);
    scrollBottom();
    return bubble;
  }

  function showTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'typing-indicator';
    wrap.id = 'typing';

    const avatar = document.createElement('div');
    avatar.className = 'avatar bot';
    avatar.textContent = '🤖';

    const bubble = document.createElement('div');
    bubble.className = 'typing-bubble';
    bubble.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    chatWindow.appendChild(wrap);
    scrollBottom();
  }

  function hideTyping() {
    const el = document.getElementById('typing');
    if (el) el.remove();
  }

  function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || waiting) return;

    waiting = true;
    sendBtn.disabled = true;
    input.value = '';
    autoResize();

    addMessage('user', text);
    history.push({ role: 'user', content: text });

    showTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: history.slice(0, -1) })
      });

      hideTyping();

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        addMessage('bot', '⚠️ ' + (err.error || 'Something went wrong. Please try again.'));
        history.pop();
        return;
      }

      const data = await res.json();
      const reply = data.reply || '(no response)';
      addMessage('bot', reply);
      history.push({ role: 'assistant', content: reply });
    } catch (e) {
      hideTyping();
      addMessage('bot', '⚠️ Network error. Please check your connection and try again.');
      history.pop();
    } finally {
      waiting = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener('click', sendMessage);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  input.addEventListener('input', autoResize);
</script>

</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve the chat UI
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Chat API endpoint
    if (request.method === 'POST' && url.pathname === '/api/chat') {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonError('Invalid JSON body', 400);
      }

      const { message, history = [] } = body;

      if (!message || typeof message !== 'string' || !message.trim()) {
        return jsonError('message is required', 400);
      }

      if (!env.ANTHROPIC_API_KEY) {
        return jsonError('Server is missing API key configuration', 500);
      }

      const messages = [
        ...history.filter(m => m.role && m.content),
        { role: 'user', content: message.trim() },
      ];

      let anthropicRes;
      try {
        anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system: 'You are a helpful, friendly, and concise AI assistant. Respond naturally and helpfully.',
            messages,
          }),
        });
      } catch (e) {
        return jsonError('Failed to reach AI service', 502);
      }

      if (!anthropicRes.ok) {
        const errBody = await anthropicRes.json().catch(() => ({}));
        const msg = errBody?.error?.message || 'AI service error';
        return jsonError(msg, anthropicRes.status === 401 ? 401 : 502);
      }

      const data = await anthropicRes.json();
      const reply = data?.content?.[0]?.text ?? '(no response)';

      return new Response(JSON.stringify({ reply }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 404 for anything else
    return new Response('Not found', { status: 404 });
  },
};

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
