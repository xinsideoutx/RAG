#!/usr/bin/env node
/**
 * CLI helper to ingest local text/markdown files into Qdrant with OpenAI embeddings.
 *
 * Usage:
 *   OPENAI_API_KEY=... QDRANT_URL=http://localhost:6333 QDRANT_COLLECTION=docs node ingest.js --dir ./docs
 */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const {
  OPENAI_API_KEY,
  OPENAI_BASE_URL = 'https://api.openai.com/v1',
  OPENAI_EMBED_MODEL = 'text-embedding-3-small',
  QDRANT_URL = 'http://localhost:6333',
  QDRANT_API_KEY,
  QDRANT_COLLECTION = 'docs',
  QDRANT_VECTOR_SIZE,
  INGEST_DIR,
  INGEST_BATCH = '8',
  INGEST_CHUNK_SIZE = '900',
  INGEST_CHUNK_OVERLAP = '150'
} = process.env;

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.markdown']);

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY. Set it before running the ingest script.');
  process.exit(1);
}

if (!QDRANT_URL || !QDRANT_COLLECTION) {
  console.error('Missing QDRANT_URL or QDRANT_COLLECTION. Set them before running the ingest script.');
  process.exit(1);
}

const VECTOR_DIMENSION = Number.parseInt(QDRANT_VECTOR_SIZE ?? '1536', 10);
const BATCH_SIZE = Math.max(1, Number.parseInt(INGEST_BATCH, 10) || 8);
const CHUNK_SIZE = Math.max(200, Number.parseInt(INGEST_CHUNK_SIZE, 10) || 900);
const CHUNK_OVERLAP = Math.min(CHUNK_SIZE - 50, Math.max(0, Number.parseInt(INGEST_CHUNK_OVERLAP, 10) || 150));

function parseArgs(argv) {
  const args = { dir: INGEST_DIR || 'docs', dryRun: false, reset: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if ((token === '--dir' || token === '-d') && argv[i + 1]) {
      args.dir = argv[++i];
    } else if (token === '--dry-run') {
      args.dryRun = true;
    } else if (token === '--reset') {
      args.reset = true;
    } else if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node ingest.js [options]

Options:
  --dir, -d <path>   Directory with .txt/.md files (default: "./docs")
  --dry-run          Parse and chunk files, but skip API calls
  --reset            Delete existing points in the collection before ingest
  --help, -h         Show this help message

Environment:
  OPENAI_API_KEY            (required) OpenAI key used for embeddings
  OPENAI_EMBED_MODEL        Embedding model id (default: ${OPENAI_EMBED_MODEL})
  QDRANT_URL                (required) Qdrant endpoint URL (e.g. http://localhost:6333)
  QDRANT_API_KEY            Optional key for Qdrant Cloud
  QDRANT_COLLECTION         Collection name (default: ${QDRANT_COLLECTION})
  QDRANT_VECTOR_SIZE        Vector size (default: 1536)
  INGEST_BATCH              Embedding batch size (default: ${BATCH_SIZE})
  INGEST_CHUNK_SIZE         Approx chunk size in characters (default: ${CHUNK_SIZE})
  INGEST_CHUNK_OVERLAP      Overlap between chunks (default: ${CHUNK_OVERLAP})
`);
}

async function readAllFiles(dir) {
  const stats = await fs.stat(dir).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new Error(`Input directory not found: ${dir}`);
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await readAllFiles(fullPath);
      files.push(...nested);
    } else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function chunkParagraphs(text) {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n{2,}/g).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';

  const pushCurrent = () => {
    if (!current) return;
    chunks.push(current.trim());
    current = '';
  };

  for (const paragraph of paragraphs) {
    if ((current + '\n\n' + paragraph).length <= CHUNK_SIZE) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    } else if (paragraph.length > CHUNK_SIZE) {
      // Paragraph is too long, hard-split it
      let start = 0;
      while (start < paragraph.length) {
        const slice = paragraph.slice(start, start + CHUNK_SIZE);
        if (current) pushCurrent();
        chunks.push(slice.trim());
        start += CHUNK_SIZE - CHUNK_OVERLAP;
      }
      current = '';
    } else {
      pushCurrent();
      current = paragraph;
    }
  }

  pushCurrent();
  return chunks;
}

async function readDocument(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw;
}

function qdrantHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (QDRANT_API_KEY) headers['api-key'] = QDRANT_API_KEY;
  return headers;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let errorPayload = null;
    try {
      errorPayload = await response.json();
    } catch {
      // ignore
    }
    const err = new Error(errorPayload?.status?.error || response.statusText || 'Upstream request failed');
    err.status = response.status;
    err.payload = errorPayload;
    throw err;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function ensureCollection(vectorSize) {
  const base = QDRANT_URL.endsWith('/') ? QDRANT_URL.slice(0, -1) : QDRANT_URL;
  const infoUrl = `${base}/collections/${encodeURIComponent(QDRANT_COLLECTION)}`;
  try {
    const info = await fetchJson(infoUrl, { headers: qdrantHeaders() });
    if (info?.result) {
      return false;
    }
  } catch (err) {
    if (err.status !== 404) throw err;
  }

  const createPayload = {
    vectors: {
      size: vectorSize,
      distance: 'Cosine'
    },
    optimizers_config: { default_segment_number: 2 }
  };

  await fetchJson(infoUrl, {
    method: 'PUT',
    headers: qdrantHeaders(),
    body: JSON.stringify(createPayload)
  });
  console.log(`Created Qdrant collection "${QDRANT_COLLECTION}" (size ${vectorSize}).`);
  return true;
}

async function maybeResetCollection() {
  const base = QDRANT_URL.endsWith('/') ? QDRANT_URL.slice(0, -1) : QDRANT_URL;
  const truncateUrl = `${base}/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/truncate`;
  await fetchJson(truncateUrl, {
    method: 'POST',
    headers: qdrantHeaders(),
    body: JSON.stringify({ timeout: 60 })
  });
  console.log(`Cleared all points in collection "${QDRANT_COLLECTION}".`);
}

async function embedBatch(texts) {
  const body = JSON.stringify({ input: texts, model: OPENAI_EMBED_MODEL });
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${OPENAI_API_KEY}`
  };
  const data = await fetchJson(`${OPENAI_BASE_URL}/embeddings`, {
    method: 'POST',
    headers,
    body
  });
  if (!data?.data || data.data.length !== texts.length) {
    throw new Error('Embedding API returned unexpected result');
  }
  return data.data.map(item => item.embedding);
}

async function upsertBatch(points) {
  if (!points.length) return;
  const base = QDRANT_URL.endsWith('/') ? QDRANT_URL.slice(0, -1) : QDRANT_URL;
  const url = `${base}/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points?wait=true`;
  await fetchJson(url, {
    method: 'PUT',
    headers: qdrantHeaders(),
    body: JSON.stringify({ points })
  });
}

function hashId(docId, chunkIndex, text) {
  const hash = crypto.createHash('sha1');
  hash.update(docId);
  hash.update(String(chunkIndex));
  hash.update(text);
  const hex = hash.digest('hex').toLowerCase();
  // Convert first 32 hex chars into UUID v5-like string
  const base = (hex.length >= 32 ? hex.slice(0, 32) : hex.padEnd(32, '0')).split('');
  base[12] = '5'; // set UUID version 5
  const variant = (parseInt(base[16], 16) & 0x3) | 0x8;
  base[16] = variant.toString(16);
  return `${base.slice(0, 8).join('')}-${base.slice(8, 12).join('')}-${base.slice(12, 16).join('')}-${base.slice(16, 20).join('')}-${base.slice(20, 32).join('')}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Ingesting documents from: ${path.resolve(args.dir)}`);

  const files = await readAllFiles(args.dir);
  if (files.length === 0) {
    console.warn('No supported files found (.txt, .md). Nothing to ingest.');
    return;
  }

  console.log(`Found ${files.length} file(s). Chunk size ~${CHUNK_SIZE} chars, overlap ${CHUNK_OVERLAP}.`);

  await ensureCollection(VECTOR_DIMENSION);
  if (args.reset) {
    await maybeResetCollection();
  }

  const points = [];

  for (const filePath of files) {
    const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    const title = path.basename(filePath);
    const docId = relPath.toLowerCase();
    const source = relPath;

    const content = await readDocument(filePath);
    const chunks = chunkParagraphs(content);

    if (!chunks.length) {
      console.warn(`Skipping empty document: ${relPath}`);
      continue;
    }

    console.log(`• ${relPath} → ${chunks.length} chunk(s)`);

    chunks.forEach((text, index) => {
      points.push({
        docId,
        source,
        title,
        text,
        chunkIndex: index
      });
    });
  }

  if (args.dryRun) {
    console.log(`Dry run complete. Would embed and upsert ${points.length} chunk(s).`);
    return;
  }

  console.log(`Embedding ${points.length} chunk(s) with model ${OPENAI_EMBED_MODEL} (batch ${BATCH_SIZE})...`);
  const upserts = [];
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    const vectors = await embedBatch(batch.map(item => item.text));
    upserts.push(
      ...batch.map((item, idx) => ({
        id: hashId(item.docId, item.chunkIndex, item.text),
        vector: vectors[idx],
        payload: {
          doc_id: item.docId,
          source: item.source,
          title: item.title,
          chunk_index: item.chunkIndex,
          text: item.text,
          model: OPENAI_EMBED_MODEL,
          updated_at: new Date().toISOString()
        }
      }))
    );
  }

  console.log(`Uploading ${upserts.length} vector(s) to Qdrant @ ${QDRANT_URL} collection "${QDRANT_COLLECTION}"...`);
  const UPSERT_BATCH_SIZE = 64;
  for (let i = 0; i < upserts.length; i += UPSERT_BATCH_SIZE) {
    const slice = upserts.slice(i, i + UPSERT_BATCH_SIZE);
    await upsertBatch(slice);
  }

  console.log('Ingestion complete ✅');
}

main().catch(err => {
  console.error('Ingest failed:', err.message || err);
  if (err.payload) {
    console.error(JSON.stringify(err.payload, null, 2));
  }
  process.exit(1);
});
