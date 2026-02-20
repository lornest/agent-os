interface ChatPageOptions {
  title?: string;
  wsUrl?: string;
}

export function getChatPageHtml(options: ChatPageOptions = {}): string {
  const title = options.title ?? 'Agent OS WebChat';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f5f5f5;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
  header {
    background: #1a1a2e;
    color: #e0e0e0;
    padding: 12px 20px;
    font-size: 16px;
    font-weight: 600;
    flex-shrink: 0;
  }
  #messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .msg {
    max-width: 70%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.5;
    word-wrap: break-word;
  }
  .msg.user {
    align-self: flex-end;
    background: #1a1a2e;
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .msg.agent {
    align-self: flex-start;
    background: #fff;
    color: #1a1a2e;
    border: 1px solid #ddd;
    border-bottom-left-radius: 4px;
  }
  .msg.system {
    align-self: center;
    color: #888;
    font-size: 12px;
  }
  #input-area {
    flex-shrink: 0;
    display: flex;
    gap: 8px;
    padding: 12px 20px;
    background: #fff;
    border-top: 1px solid #ddd;
  }
  #input-area input {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid #ccc;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
  }
  #input-area input:focus { border-color: #1a1a2e; }
  #input-area button {
    padding: 10px 20px;
    background: #1a1a2e;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
  }
  #input-area button:hover { background: #16213e; }
  #input-area button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
</head>
<body>
<header>${title}</header>
<div id="messages"></div>
<div id="input-area">
  <input id="msg-input" type="text" placeholder="Type a message..." autocomplete="off" />
  <button id="send-btn">Send</button>
</div>
<script>
(function() {
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('msg-input');
  const sendBtn = document.getElementById('send-btn');

  const senderId = 'user-' + Math.random().toString(36).slice(2, 10);
  // Pending correlationIds → track which messages are awaiting responses
  const pending = new Set();

  function addMessage(text, cls) {
    const div = document.createElement('div');
    div.className = 'msg ' + cls;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Connect to the adaptor's own WS (same host, /ws path)
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = proto + '//' + location.host + '/ws';
  let ws;
  let reconnectTimer;

  function connect() {
    ws = new WebSocket(wsUrl);
    ws.onopen = function() {
      addMessage('Connected', 'system');
      sendBtn.disabled = false;
    };
    ws.onmessage = function(ev) {
      try {
        const data = JSON.parse(ev.data);
        pending.delete(data.correlationId);
        addMessage(data.text, 'agent');
      } catch (e) {
        addMessage(ev.data, 'agent');
      }
    };
    ws.onclose = function() {
      sendBtn.disabled = true;
      addMessage('Disconnected. Reconnecting...', 'system');
      reconnectTimer = setTimeout(connect, 2000);
    };
    ws.onerror = function() {
      ws.close();
    };
  }

  function send() {
    const text = inputEl.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
    addMessage(text, 'user');
    ws.send(JSON.stringify({ text: text, senderId: senderId }));
    inputEl.value = '';
  }

  sendBtn.addEventListener('click', send);
  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') send();
  });

  connect();
})();
</script>
</body>
</html>`;
}
