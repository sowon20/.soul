import fs from "fs";
import path from "path";

const DEFAULT_DIM = 256;

function getVectorPath(rootDir) {
  return path.join(rootDir, "index", "vectors.ndjson");
}

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "");
  }
}

function hashToken(token) {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function embedFallback(text, dim = DEFAULT_DIM) {
  const vec = new Array(dim).fill(0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    const idx = hashToken(token) % dim;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

async function embedOpenAI(apiKey, text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`embedding failed: ${res.status} ${detail}`);
  }
  const data = await res.json();
  return data.data?.[0]?.embedding || [];
}

export function initVectorStore(rootDir) {
  const vectorPath = getVectorPath(rootDir);
  ensureFile(vectorPath);
  return { vectorPath };
}

export async function embedText({ text, apiKey, dim }) {
  if (apiKey) {
    return embedOpenAI(apiKey, text);
  }
  return embedFallback(text, dim);
}

export function appendVector(vectorStore, record) {
  const line = JSON.stringify(record);
  fs.appendFileSync(vectorStore.vectorPath, `${line}\n`);
}

export function searchVectors(vectorStore, queryVec, limit = 5) {
  const raw = fs.readFileSync(vectorStore.vectorPath, "utf8").trim();
  if (!raw) return [];
  const lines = raw.split("\n");
  const scored = [];
  for (const line of lines) {
    if (!line) continue;
    try {
      const row = JSON.parse(line);
      const vec = row.vector || [];
      let dot = 0;
      for (let i = 0; i < Math.min(vec.length, queryVec.length); i += 1) {
        dot += vec[i] * queryVec[i];
      }
      scored.push({ ...row, score: dot });
    } catch {
      continue;
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
