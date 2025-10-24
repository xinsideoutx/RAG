const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT || 8787;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // best practice: keep the key in an env var server-side
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION;
const QDRANT_TOP_K = Number.parseInt(process.env.QDRANT_TOP_K ?? '4', 10);
const QDRANT_SCORE_THRESHOLD = process.env.QDRANT_SCORE_THRESHOLD
  ? Number.parseFloat(process.env.QDRANT_SCORE_THRESHOLD)
  : undefined;

const ENABLE_RAG = Boolean(QDRANT_URL && QDRANT_COLLECTION);

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:8787',
  'http://127.0.0.1:8787'
];

const EXTRA_ALLOWED_ORIGINS = (process.env.CORS_ALLOW_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = new Set([...DEFAULT_ALLOWED_ORIGINS, ...EXTRA_ALLOWED_ORIGINS]);

const JSON_HEADERS = {
  'Content-Type': 'application/json'
};

const NO_CONTEXT_REPLY =
  'Sorry, I could not find information related to your question in the knowledge base, so I cannot answer it.';

function isLocalOrigin(origin) {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function setCors(res, origin, allowCredentials = false) {
  if (origin && (ALLOWED_ORIGINS.has(origin) || isLocalOrigin(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (allowCredentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function fetchJson(url, options = {}) {
  const resp = await fetch(url, options);
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const errMessage = data?.error?.message || data?.message || resp.statusText;
    const err = new Error(errMessage || 'Upstream request failed');
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function createEmbedding(input) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

  const payload = {
    input,
    model: OPENAI_EMBED_MODEL
  };

  const data = await fetchJson(`${OPENAI_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!Array.isArray(data?.data) || !data.data[0]?.embedding) {
    throw new Error('Embedding response missing embedding array');
  }

  return data.data[0].embedding;
}

function qdrantHeaders() {
  const headers = { ...JSON_HEADERS };
  if (QDRANT_API_KEY) headers['api-key'] = QDRANT_API_KEY;
  return headers;
}

async function searchQdrant(vector) {
  if (!ENABLE_RAG) return [];
  const baseUrl = QDRANT_URL.endsWith('/') ? QDRANT_URL.slice(0, -1) : QDRANT_URL;
  const url = `${baseUrl}/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/search`;
  const payload = {
    vector,
    limit: Number.isFinite(QDRANT_TOP_K) ? QDRANT_TOP_K : 4,
    with_payload: true,
    with_vector: false
  };

  if (typeof QDRANT_SCORE_THRESHOLD === 'number' && !Number.isNaN(QDRANT_SCORE_THRESHOLD)) {
    payload.score_threshold = QDRANT_SCORE_THRESHOLD;
  }

  try {
    const data = await fetchJson(url, {
      method: 'POST',
      headers: qdrantHeaders(),
      body: JSON.stringify(payload)
    });
    return Array.isArray(data?.result) ? data.result : [];
  } catch (err) {
    console.warn('[RAG] Qdrant search failed:', err.message || err);
    return [];
  }
}

function buildContextSnippets(results = []) {
  return results
    .filter(Boolean)
    .map((item, idx) => {
      const payload = item.payload || {};
      const title = payload.title || payload.source || payload.doc_id || `Fragment ${idx + 1}`;
      const text = (payload.text || '').toString().trim().replace(/\s+/g, ' ');
      const distanceInfo = typeof item.score === 'number' ? ` (score ${item.score.toFixed(3)})` : '';
      return `[${idx + 1}] ${title}${distanceInfo}\n${text}`;
    })
    .filter(Boolean);
}

function stripSourceSections(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text.replace(/\n{2,}(?:Источники|Sources):[\s\S]*$/i, '');
  cleaned = cleaned.replace(/(?:\n\[\d+][^\n]*)+$/g, '');
  return cleaned.trimEnd();
}

function appendContext(messages, snippets) {
  if (!snippets.length) return messages;
  const contextBlock = [
    'You are an assistant answering questions strictly from the provided doc fragments.',
    'Use only these fragments when formulating the reply. If they do not contain the answer, state that the docs do not cover the question and politely decline.',
    'Do not list sources, references, or document numbers in the reply.',
    'Doc fragments:',
    snippets.join('\n\n')
  ].join('\n\n');

  const next = messages.map(m => ({ ...m }));
  const systemIndex = next.findIndex(m => m.role === 'system');
  if (systemIndex >= 0) {
    const current = next[systemIndex].content || '';
    next[systemIndex].content = `${current}\n\n${contextBlock}`.trim();
  } else {
    next.unshift({ role: 'system', content: contextBlock });
  }
  return next;
}


async function callChatCompletions(payload) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured on the server');

  return fetchJson(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload)
  });
}

function collectReferences(results = []) {
  return results.map((item, idx) => {
    const payload = item.payload || {};
    return {
      ordinal: idx + 1,
      id: item.id,
      score: item.score,
      docId: payload.doc_id,
      source: payload.source,
      title: payload.title,
      chunkIndex: payload.chunk_index,
      text: payload.text
    };
  });
}

async function handleChat(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  if (!OPENAI_API_KEY) {
    return sendJson(res, 500, { error: 'OPENAI_API_KEY is not configured on the server' });
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 1e6) req.destroy();
  });

  req.on('end', async () => {
    try {
      const parsed = JSON.parse(body || '{}');
      const {
        messages = [],
        model = OPENAI_CHAT_MODEL,
        temperature = 0.7,
        max_tokens
      } = parsed;

      if (!Array.isArray(messages) || messages.length === 0) {
        return sendJson(res, 400, { error: 'messages array is required' });
      }

      let references = [];
      let augmentedMessages = messages;

      if (ENABLE_RAG) {
        const userMessages = messages.filter(m => m.role === 'user');
        const question = userMessages.at(-1)?.content?.trim();

        if (question) {
          try {
            const vector = await createEmbedding(question);
            const hits = await searchQdrant(vector);
            references = collectReferences(hits);
            const snippets = buildContextSnippets(hits).slice(0, 6);
            if (snippets.length) {
              augmentedMessages = appendContext(messages, snippets);
            } else {
              return sendJson(res, 200, {
                content: NO_CONTEXT_REPLY,
                raw: null,
                references,
                ragEnabled: ENABLE_RAG
              });
            }
          } catch (ragErr) {
            console.warn('[RAG] enrichment failed:', ragErr.message || ragErr);
          }
        }
      }

      const payload = {
        model,
        messages: augmentedMessages,
        temperature
      };
      if (max_tokens) payload.max_tokens = max_tokens;

      const data = await callChatCompletions(payload);
      const rawContent = data?.choices?.[0]?.message?.content?.trim();
      if (!rawContent) {
        return sendJson(res, 502, { error: 'Empty response from completion API', raw: data });
      }
      const cleanedContent = stripSourceSections(rawContent);
      const content = cleanedContent || rawContent;
      return sendJson(res, 200, { content, raw: data, references, ragEnabled: ENABLE_RAG });
    } catch (err) {
      console.error('OpenAI proxy error:', err);
      const status = err.status && Number.isInteger(err.status) ? err.status : 500;
      return sendJson(res, status, { error: err.message || 'Internal Server Error' });
    }
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/chat') {
    return handleChat(req, res);
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`OpenAI proxy listening on http://localhost:${PORT}`);
  if (!OPENAI_API_KEY) {
    console.warn('Warning: OPENAI_API_KEY environment variable is not set.');
  }
  if (ENABLE_RAG) {
    console.log(`RAG mode enabled → Qdrant collection "${QDRANT_COLLECTION}" @ ${QDRANT_URL}`);
  } else {
    console.warn('RAG mode disabled: set QDRANT_URL and QDRANT_COLLECTION to enable vector search.');
  }
});
