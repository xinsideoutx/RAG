const messagesEl = document.getElementById('messages');
const composerEl = document.getElementById('composer');
const inputEl = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const statusEl = document.getElementById('status');
const noteEl = document.querySelector('.note small');
const resumeBtn = document.getElementById('historyBtn');
const clearBtn = document.getElementById('clearBtn');

const LEGACY_STORAGE_KEY = 'rag-js-s1mple-chat-v1';
const STORAGE_CURRENT_KEY = 'rag-js-s1mple-chat-current';
const STORAGE_LAST_KEY = 'rag-js-s1mple-chat-last';
const MODEL = 'gpt-4o-mini';
const MAX_CONTEXT = 12;
const API_URL = '/api/chat';

const TEXT = {
  metaUser: '\u0412\u044b',
  metaBot: '\u0410\u0441\u0441\u0438\u0441\u0442\u0435\u043d\u0442',
  ready: '\u0413\u043e\u0442\u043e\u0432 \u043a \u0447\u0430\u0442\u0443',
  typing: '\u041f\u0435\u0447\u0430\u0442\u0430\u0435\u0442\u2026',
  request: '\u0417\u0430\u043f\u0440\u043e\u0441 \u043a GPT\u2026',
  placeholder: '\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0438 \u043d\u0430\u0436\u043c\u0438\u0442\u0435 Enter\u2026',
  inputLabel: '\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435',
  send: '\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c',
  note: '\u0421\u0431\u043e\u0440 \u0432 RAG: \u0437\u0430\u043f\u0443\u0441\u0442\u0438 ingest.js, \u0447\u0442\u043e\u0431\u044b \u043f\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u044c Qdrant.',
  noteRag: '\u0420\u0430\u0431\u043e\u0442\u0430\u0435\u0442 RAG: \u043a\u043e\u043d\u0442\u0435\u043a\u0441\u0442 \u043f\u0440\u0438\u043b\u0435\u0442\u0430\u0435\u0442 \u0438\u0437 Qdrant.',
  noteResumed: '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0430\u0435\u043c \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0439 \u0447\u0430\u0442: \u043d\u043e\u0432\u044b\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f \u043e\u0431\u043d\u043e\u0432\u044f\u0442 \u0438\u0441\u0442\u043e\u0440\u0438\u044e.',
  hello: '\u041f\u0440\u0438\u0432\u0435\u0442! \u042d\u0442\u043e RAG-\u0447\u0430\u0442: \u044f \u043d\u0430\u0445\u043e\u0436\u0443 \u043a\u0443\u0441\u043a\u0438 \u0432 \u0432\u0430\u0448\u0435\u0439 Qdrant \u0431\u0430\u0437\u0435 \u0438 \u043e\u0442\u0432\u0435\u0447\u0430\u044e \u043d\u0430 \u0438\u0445 \u043e\u0441\u043d\u043e\u0432\u0435.',
  canned: [
    '\u0415\u0441\u043b\u0438 \u0432\u0435\u0442\u043a\u0430 RAG \u0432 Qdrant \u043f\u0443\u0441\u0442\u0430\u044f, \u0437\u0430\u043f\u0443\u0441\u0442\u0438 ingest.js.',
    '\u0411\u043b\u0430\u0433\u043e\u0434\u0430\u0440\u044f RAG \u044f \u0432\u0438\u0436\u0443 \u0432\u0441\u0451, \u0447\u0442\u043e \u0432\u044b \u043f\u043e\u043b\u043e\u0436\u0438\u043b\u0438 \u0432 docs/.',
    '\u0414\u043b\u044f \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f \u0437\u043d\u0430\u043d\u0438\u0439 \u0441\u043d\u043e\u0432\u0430 \u043f\u043e\u0437\u0432\u0438 ingest.js \u0441 --reset.'
  ],
  said: '\u0412\u044b \u0441\u043a\u0430\u0437\u0430\u043b\u0438: "',
  system: '\u0422\u044b \u2014 \u043f\u043e\u043b\u0435\u0437\u043d\u044b\u0439 \u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043d\u0442. \u041e\u0442\u0432\u0435\u0447\u0430\u0439 \u043a\u0440\u0430\u0442\u043a\u043e \u0438 \u043f\u043e \u0434\u0435\u043b\u0443. \u041d\u0435 \u0432\u043a\u043b\u044e\u0447\u0430\u0439 \u0441\u043f\u0438\u0441\u043a\u0438 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u043e\u0432 \u0438 \u043d\u0435 \u043f\u0438\u0448\u0438 \u0441\u043b\u043e\u0432\u043e "\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438".',
  emptyModel: '\u041f\u0443\u0441\u0442\u043e\u0439 \u043e\u0442\u0432\u0435\u0442 \u043e\u0442 \u043c\u043e\u0434\u0435\u043b\u0438',
  fallbackSuffix: '\u0417\u0430\u0433\u043b\u0443\u0448\u043a\u0430 \u0438\u0437-\u0437\u0430 \u043e\u0448\u0438\u0431\u043a\u0438 API',
  resume: '\u041f\u0440\u043e\u0448\u043b\u044b\u0439 \u0447\u0430\u0442',
  resumeDisabled: '\u041f\u0440\u043e\u0448\u043b\u044b\u0439 \u0447\u0430\u0442',
  resumeHint: '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043f\u0440\u043e\u0448\u043b\u044b\u0439 \u0434\u0438\u0430\u043b\u043e\u0433',
  resumeEmptyHint: '\u041d\u0435\u0442 \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0445 \u0434\u0438\u0430\u043b\u043e\u0433\u043e\u0432',
  clear: '\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u0447\u0430\u0442'
};

let currentHistory = [];
let lastHistory = [];

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function createMessageEl(role, text, time = now()) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${role === 'user' ? TEXT.metaUser : TEXT.metaBot} \u2022 ${time}`;

  wrap.appendChild(bubble);
  wrap.appendChild(meta);
  return wrap;
}

function scrollToBottom() {
  messagesEl?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function readSession(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(item => ({ ...item })) : [];
  } catch {
    return [];
  }
}

function writeSession(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* no-op */
  }
}

function cloneMessages(list) {
  return Array.isArray(list) ? list.map(item => ({ ...item })) : [];
}

function hasDialogue(list) {
  if (!Array.isArray(list) || list.length === 0) return false;
  if (list.length > 1) return true;
  return list.some(msg => msg.role === 'user');
}

function createHelloEntry() {
  return {
    id: crypto.randomUUID?.() ?? String(Math.random()),
    role: 'bot',
    text: TEXT.hello,
    time: now()
  };
}

function createFreshHistory() {
  return [createHelloEntry()];
}

function migrateLegacyHistory() {
  const legacy = readSession(LEGACY_STORAGE_KEY);
  if (!legacy.length) return;
  writeSession(STORAGE_LAST_KEY, legacy);
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function saveCurrent() {
  writeSession(STORAGE_CURRENT_KEY, currentHistory);
}

function saveLast() {
  writeSession(STORAGE_LAST_KEY, lastHistory);
}

function renderAll(list) {
  messagesEl.innerHTML = '';
  for (const m of list) {
    messagesEl.appendChild(createMessageEl(m.role, m.text, m.time));
  }
  scrollToBottom();
}

function resetComposer() {
  if (!inputEl) return;
  inputEl.value = '';
  if (sendBtn) {
    sendBtn.disabled = inputEl.value.trim().length === 0;
  }
}

function updateResumeButton() {
  if (!resumeBtn) return;
  const hasHistory = hasDialogue(lastHistory);
  resumeBtn.disabled = !hasHistory;
  resumeBtn.textContent = hasHistory ? TEXT.resume : TEXT.resumeDisabled;
  resumeBtn.title = hasHistory ? TEXT.resumeHint : TEXT.resumeEmptyHint;
  resumeBtn.setAttribute('aria-label', resumeBtn.title);
}

function setBusy(isBusy, label) {
  if (sendBtn) sendBtn.disabled = isBusy;
  if (statusEl) statusEl.textContent = label || (isBusy ? TEXT.typing : TEXT.ready);
}

function botReply(userText) {
  const arr = TEXT.canned;
  const base = arr[Math.floor(Math.random() * arr.length)];
  const hint = userText?.trim() ? `${TEXT.said}${userText.trim()}"` : '';
  return [base, hint].filter(Boolean).join('\n');
}

function appendCurrentMessage(role, text) {
  const entry = { id: crypto.randomUUID?.() ?? String(Math.random()), role, text, time: now() };
  currentHistory.push(entry);
  saveCurrent();
  messagesEl.appendChild(createMessageEl(entry.role, entry.text, entry.time));
  scrollToBottom();
  return entry;
}

function toOpenAIMessages(history) {
  const base = [{ role: 'system', content: TEXT.system }];
  const recent = history.slice(-MAX_CONTEXT);
  for (const msg of recent) {
    if (msg.role === 'user') base.push({ role: 'user', content: msg.text });
    if (msg.role === 'bot') base.push({ role: 'assistant', content: msg.text });
  }
  return base;
}

async function callProxy(history) {
  const payload = {
    model: MODEL,
    messages: toOpenAIMessages(history),
    temperature: 0.7
  };

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}));
    throw new Error(detail?.error || `Proxy error ${resp.status}`);
  }

  const data = await resp.json();
  const text = data?.content?.trim();
  if (!text) throw new Error(TEXT.emptyModel);
  const ragEnabled = Boolean(data?.ragEnabled);
  return { text, ragEnabled };
}

function startNewChat(options = {}) {
  const { archive = true } = options;
  if (archive && hasDialogue(currentHistory)) {
    lastHistory = cloneMessages(currentHistory);
    saveLast();
  }
  currentHistory = createFreshHistory();
  saveCurrent();
  renderAll(currentHistory);
  resetComposer();
  if (noteEl) noteEl.textContent = TEXT.note;
  updateResumeButton();
  setBusy(false);
}

function resumeLastChat() {
  if (!hasDialogue(lastHistory)) return;
  currentHistory = cloneMessages(lastHistory);
  saveCurrent();
  renderAll(currentHistory);
  resetComposer();
  if (noteEl) noteEl.textContent = TEXT.noteResumed;
  updateResumeButton();
  setBusy(false);
}

function handleHistoryClick() {
  resumeLastChat();
}

function handleClearClick() {
  startNewChat();
}

function bootstrap() {
  migrateLegacyHistory();
  lastHistory = readSession(STORAGE_LAST_KEY);

  const previousCurrent = readSession(STORAGE_CURRENT_KEY);
  if (hasDialogue(previousCurrent)) {
    lastHistory = cloneMessages(previousCurrent);
    saveLast();
  }

  currentHistory = [];
  startNewChat({ archive: false });

  if (inputEl) {
    inputEl.placeholder = TEXT.placeholder;
    inputEl.setAttribute('aria-label', TEXT.inputLabel);
  }
  if (sendBtn) {
    sendBtn.textContent = TEXT.send;
    sendBtn.setAttribute('aria-label', TEXT.send);
  }
  if (resumeBtn) {
    resumeBtn.textContent = TEXT.resume;
    resumeBtn.addEventListener('click', handleHistoryClick);
  }
  if (clearBtn) {
    clearBtn.textContent = TEXT.clear;
    clearBtn.addEventListener('click', handleClearClick);
  }
  if (noteEl) noteEl.textContent = TEXT.note;
  setBusy(false);
  updateResumeButton();

  composerEl?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;

    setBusy(true, TEXT.request);
    appendCurrentMessage('user', text);
    inputEl.value = '';

    try {
      const { text: replyText, ragEnabled } = await callProxy(currentHistory);
      if (ragEnabled && noteEl) {
        noteEl.textContent = TEXT.noteRag;
      }
      appendCurrentMessage('bot', replyText);
    } catch (err) {
      console.error(err);
      const fallback = botReply(text);
      appendCurrentMessage('bot', `${String(err.message || err)}\n\n${fallback}\n(${TEXT.fallbackSuffix})`);
    } finally {
      setBusy(false);
      if (sendBtn) sendBtn.disabled = inputEl.value.trim().length === 0;
    }
  });

  inputEl?.addEventListener('input', () => {
    if (sendBtn) sendBtn.disabled = inputEl.value.trim().length === 0;
  });
  if (sendBtn) sendBtn.disabled = inputEl?.value.trim().length === 0;
}

document.addEventListener('DOMContentLoaded', bootstrap);
