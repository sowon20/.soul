import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  initDb,
  insertUtterance,
  listRecent,
  insertSummary,
  listRecentSummaries,
  appendReclass,
  listEntries,
} from "./db.js";
import {
  initStorage,
  loadConfig,
  saveConfig,
  findStoreById,
  findStoreByName,
} from "./storage.js";
import { autoClassify, extractAmounts } from "./classify.js";
import { initVectorStore, embedText, appendVector, searchVectors } from "./vector.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOUL_ROOT = process.env.SOUL_ROOT || "/soul";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
const VECTOR_PROVIDER = process.env.VECTOR_PROVIDER || "fallback";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const VECTOR_DIM = Number(process.env.VECTOR_DIM || 256);
const GOOGLE_HOME_SCOPES =
  process.env.GOOGLE_HOME_SCOPES || "https://www.googleapis.com/auth/homegraph";

initStorage(SOUL_ROOT);
let config = loadConfig(SOUL_ROOT);
const db = initDb(SOUL_ROOT);
const vectorStore = initVectorStore(SOUL_ROOT);

const autoSummaryState = new Map();

function buildAutoSummary(entries) {
  const trimmed = entries
    .filter((entry) => entry?.text)
    .slice(-8)
    .map((entry) => String(entry.text).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((text) => (text.length > 140 ? `${text.slice(0, 140)}...` : text));
  if (!trimmed.length) return "";
  return `최근 대화 요약: ${trimmed.join(" | ")}`;
}

function extractTags(entries) {
  const tags = new Set();
  for (const entry of entries) {
    if (Array.isArray(entry.tags)) {
      entry.tags.forEach((tag) => tags.add(String(tag)));
    }
    if (entry.category) tags.add(String(entry.category));
  }
  return Array.from(tags).slice(0, 8);
}

function maybeAutoSummary(conversationId) {
  if (!conversationId) return;
  const key = String(conversationId);
  const now = Date.now();
  const state = autoSummaryState.get(key) || { lastAt: 0, count: 0 };
  state.count += 1;
  const shouldSummarize =
    state.count >= 8 || (state.lastAt && now - state.lastAt > 10 * 60 * 1000);
  if (!shouldSummarize) {
    autoSummaryState.set(key, state);
    return;
  }
  const entries = listRecent(db, 120).filter(
    (entry) =>
      entry?.conversation_id &&
      String(entry.conversation_id) === key &&
      entry.type !== "session_start"
  );
  const summaryText = buildAutoSummary(entries);
  if (!summaryText) {
    autoSummaryState.set(key, state);
    return;
  }
  const recent = listRecentSummaries(db, 5).find(
    (item) => String(item.conversation_id || "") === key
  );
  if (recent && recent.summary === summaryText) {
    autoSummaryState.set(key, { lastAt: now, count: 0 });
    return;
  }
  insertSummary(db, {
    conversation_id: key,
    summary: summaryText,
    tags: extractTags(entries),
    source: "auto",
  });
  autoSummaryState.set(key, { lastAt: now, count: 0 });
}

function extractChatGPTConversation(html) {
  const jsonMatch = html.match(
    /<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s
  );
  if (!jsonMatch) return null;
  let payload;
  try {
    payload = JSON.parse(jsonMatch[1]);
  } catch {
    return null;
  }

  const messages = [];
  const seen = new Set();

  function pushMessage(role, text) {
    if (!text) return;
    const key = `${role}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    messages.push({ role, text });
  }

  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;

    if (typeof node.role === "string") {
      if (typeof node.content === "string") {
        pushMessage(node.role, node.content);
      } else if (Array.isArray(node.content)) {
        const parts = node.content
          .map((part) =>
            typeof part === "string"
              ? part
              : typeof part?.text === "string"
                ? part.text
                : ""
          )
          .filter(Boolean)
          .join("\n");
        pushMessage(node.role, parts);
      } else if (node.message && typeof node.message === "string") {
        pushMessage(node.role, node.message);
      }
    }

    Object.values(node).forEach(walk);
  }

  walk(payload);
  return messages.length ? messages : null;
}

const app = express();
app.use(express.json({ limit: "10mb" }));

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return next();
  const token = req.headers["x-admin-token"];
  if (token === ADMIN_TOKEN) return next();
  return res.status(401).json({ error: "unauthorized" });
}

app.get("/health", (req, res) => res.status(200).send("ok"));
app.get("/", (req, res) =>
  res.status(200).json({ service: "soul", ok: true })
);

// Admin UI
app.use("/ui", express.static(path.join(__dirname, "..", "ui")));

// Settings
app.get("/api/settings", requireAdmin, (req, res) => {
  res.json({
    soul_root: SOUL_ROOT,
    admin_token_enabled: Boolean(ADMIN_TOKEN),
    vector_provider: VECTOR_PROVIDER,
  });
});

// Store management
app.get("/api/stores", requireAdmin, (req, res) => {
  res.json({ stores: config.stores });
});

app.get("/api/integrations", requireAdmin, (req, res) => {
  res.json({ integrations: config.integrations || [] });
});

app.put("/api/integrations/:id", requireAdmin, (req, res) => {
  const id = req.params.id;
  const integration = (config.integrations || []).find((i) => i.id === id);
  if (!integration) return res.status(404).json({ error: "not found" });
  integration.enabled = Boolean(req.body?.enabled);
  if (req.body?.settings && typeof req.body.settings === "object") {
    integration.settings = { ...(integration.settings || {}), ...req.body.settings };
  }
  saveConfig(SOUL_ROOT, config);
  res.json({ integration });
});

app.get("/api/integrations/google-home/status", requireAdmin, (req, res) => {
  const tokenPath = getGoogleTokenFilePath();
  let connected = false;
  let hasRefresh = false;
  if (fs.existsSync(tokenPath)) {
    try {
      const payload = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
      connected = Boolean(payload.access_token);
      hasRefresh = Boolean(payload.refresh_token);
    } catch {
      connected = false;
      hasRefresh = false;
    }
  }
  if (!hasRefresh) {
    const secrets = loadGoogleClientSecrets();
    hasRefresh = Boolean(secrets?.refresh_token);
  }
  res.json({ connected, has_refresh: hasRefresh });
});

app.post("/api/stores", requireAdmin, (req, res) => {
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  const folder = String(req.body?.folder || "").trim();
  if (!name) return res.status(400).json({ error: "name required" });
  if (!folder) return res.status(400).json({ error: "folder required" });
  if (findStoreByName(config, name)) {
    return res.status(409).json({ error: "store name exists" });
  }
  if (config.stores.find((store) => store.folder === folder)) {
    return res.status(409).json({ error: "folder exists" });
  }
  const id = `store_${Date.now()}`;
  const store = { id, name, description, folder };
  config.stores = [...config.stores, store];
  saveConfig(SOUL_ROOT, config);
  res.status(201).json({ store });
});

app.put("/api/stores/:id", requireAdmin, (req, res) => {
  const id = req.params.id;
  const store = findStoreById(config, id);
  if (!store) return res.status(404).json({ error: "store not found" });
  const name = String(req.body?.name || store.name).trim();
  const description = String(req.body?.description || store.description).trim();
  const folder = String(req.body?.folder || store.folder).trim();
  if (!name) return res.status(400).json({ error: "name required" });
  if (!folder) return res.status(400).json({ error: "folder required" });
  if (name !== store.name && findStoreByName(config, name)) {
    return res.status(409).json({ error: "store name exists" });
  }
  if (folder !== store.folder && config.stores.find((s) => s.folder === folder)) {
    return res.status(409).json({ error: "folder exists" });
  }
  store.name = name;
  store.description = description;
  store.folder = folder;
  saveConfig(SOUL_ROOT, config);
  res.json({ store });
});

app.delete("/api/stores/:id", requireAdmin, (req, res) => {
  const id = req.params.id;
  const store = findStoreById(config, id);
  if (!store) return res.status(404).json({ error: "store not found" });
  config.stores = config.stores.filter((s) => s.id !== id);
  saveConfig(SOUL_ROOT, config);
  res.status(204).end();
});

// Ingest API
app.post("/api/ingest", (req, res) => {
  const storeName = String(req.body?.store_name || "default").trim();
  const type = String(req.body?.type || "note").trim();
  const text = String(req.body?.text || "").trim();
  const conversationId = req.body?.conversation_id
    ? String(req.body.conversation_id)
    : null;

  if (!text) return res.status(400).json({ error: "text required" });
  const store = findStoreByName(config, storeName);
  if (!store) return res.status(404).json({ error: "store not found" });

  const classification = autoClassify(text);
  const row = {
    store_id: store.id,
    store_name: store.name,
    store_folder: store.folder,
    type,
    text,
    conversation_id: conversationId,
    category: classification.category,
    tags: classification.tags,
    confidence: classification.confidence,
    ts_ms: Date.now(),
  };
  insertUtterance(db, row);
  const embedKey = VECTOR_PROVIDER === "openai" ? OPENAI_API_KEY : "";
  embedText({ text, apiKey: embedKey, dim: VECTOR_DIM })
    .then((vector) => {
      appendVector(vectorStore, {
        entry_id: `${row.ts_ms}-${Math.random().toString(36).slice(2)}`,
        text,
        vector,
        ts_ms: row.ts_ms,
      });
    })
    .catch(() => {});
  res.status(201).json({ ok: true });
});

app.post("/api/share", async (req, res) => {
  const link = String(req.body?.url || req.body?.link || "").trim();
  const storeName = String(req.body?.store_name || "chats").trim();
  if (!link) return res.status(400).json({ error: "url required" });
  const store = findStoreByName(config, storeName);
  if (!store) return res.status(404).json({ error: "store not found" });

  let html = "";
  try {
    const r = await fetch(link, {
      headers: { "User-Agent": "soul-share/1.0" },
    });
    if (!r.ok) {
      return res.status(400).json({ error: `fetch failed ${r.status}` });
    }
    html = await r.text();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  const messages = extractChatGPTConversation(html);
  const conversationId = req.body?.conversation_id
    ? String(req.body.conversation_id)
    : link.split("/").pop() || `share-${Date.now()}`;

  if (!messages) {
    const row = {
      store_id: store.id,
      store_name: store.name,
      store_folder: store.folder,
      type: "share_link",
      text: `ChatGPT 공유 링크: ${link}`,
      conversation_id: conversationId,
      category: "공유",
      tags: ["공유", "ChatGPT"],
      confidence: 0.8,
      ts_ms: Date.now(),
    };
    insertUtterance(db, row);
    return res.status(201).json({ ok: true, saved: 1, parsed: false });
  }

  let saved = 0;
  for (const msg of messages) {
    const row = {
      store_id: store.id,
      store_name: store.name,
      store_folder: store.folder,
      type: msg.role,
      text: msg.text,
      conversation_id: conversationId,
      category: "공유",
      tags: ["공유", "ChatGPT"],
      confidence: 0.9,
      ts_ms: Date.now(),
    };
    insertUtterance(db, row);
    saved += 1;
  }
  return res.status(201).json({ ok: true, saved, parsed: true });
});

app.post("/api/files", (req, res) => {
  const storeName = String(req.body?.store_name || "default").trim();
  const filename = String(req.body?.filename || "").trim();
  const mimeType = String(req.body?.mime_type || "application/octet-stream");
  const dataBase64 = String(req.body?.data_base64 || "");
  if (!filename || !dataBase64) {
    return res.status(400).json({ error: "filename and data_base64 required" });
  }
  const store = findStoreByName(config, storeName);
  if (!store) return res.status(404).json({ error: "store not found" });

  const tsMs = Date.now();
  const d = new Date(tsMs);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const dayDir = path.join(SOUL_ROOT, yyyy, mm, dd, "files");
  fs.mkdirSync(dayDir, { recursive: true });
  const filePath = path.join(dayDir, filename);
  const buffer = Buffer.from(dataBase64, "base64");
  fs.writeFileSync(filePath, buffer);

  const entry = {
    store_id: store.id,
    store_name: store.name,
    store_folder: store.folder,
    type: "file",
    text: filename,
    conversation_id: req.body?.conversation_id
      ? String(req.body.conversation_id)
      : null,
    category: String(req.body?.category || "파일"),
    tags: Array.isArray(req.body?.tags)
      ? req.body.tags.map((t) => String(t))
      : [],
    confidence: 0.6,
    ts_ms: tsMs,
    file_meta: {
      path: filePath,
      mime_type: mimeType,
      size: buffer.length,
    },
  };
  insertUtterance(db, entry);
  res.status(201).json({ ok: true });
});

app.get("/api/recent", requireAdmin, (req, res) => {
  const limit = Number(req.query.limit || 20);
  res.json({ items: listRecent(db, limit) });
});

app.get("/api/memory", requireAdmin, (req, res) => {
  const limit = Number(req.query.limit || 5);
  res.json({ items: listRecentSummaries(db, limit) });
});

app.get("/api/entries", requireAdmin, (req, res) => {
  const limit = Number(req.query.limit || 50);
  res.json({ items: listEntries(db, limit) });
});

app.get("/api/files", requireAdmin, (req, res) => {
  const limit = Number(req.query.limit || 50);
  const entries = listEntries(db, 5000);
  const files = entries.filter((e) => e.type === "file").slice(-limit);
  res.json({ items: files });
});

app.get("/api/credentials", requireAdmin, (req, res) => {
  const dir = path.join(SOUL_ROOT, "credentials");
  const items = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.endsWith(".meta.json"))
    .map((entry) => {
      const fullPath = path.join(dir, entry.name);
      const stat = fs.statSync(fullPath);
      const metaPath = `${fullPath}.meta.json`;
      let meta = {};
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        } catch {
          meta = {};
        }
      }
      return {
        filename: entry.name,
        updated_at: stat.mtimeMs,
        type: meta.type || "unknown",
        note: meta.note || "",
        fingerprint: meta.fingerprint || "",
      };
    });
  res.json({ items });
});

app.post("/api/credentials", requireAdmin, (req, res) => {
  const filename = String(req.body?.filename || "").trim();
  const dataBase64 = String(req.body?.data_base64 || "");
  const type = String(req.body?.type || "").trim();
  const note = String(req.body?.note || "").trim();
  if (!filename || !dataBase64) {
    return res.status(400).json({ error: "filename and data_base64 required" });
  }
  if (!type) return res.status(400).json({ error: "type required" });
  const safeName = filename.replace(/[^\w.\-]/g, "_");
  const dir = path.join(SOUL_ROOT, "credentials");
  let finalName = safeName;
  let filePath = path.join(dir, finalName);
  if (fs.existsSync(filePath)) {
    const stamp = Date.now();
    const extIndex = safeName.lastIndexOf(".");
    if (extIndex > 0) {
      finalName =
        safeName.slice(0, extIndex) + `-${stamp}` + safeName.slice(extIndex);
    } else {
      finalName = `${safeName}-${stamp}`;
    }
    filePath = path.join(dir, finalName);
  }
  const buffer = Buffer.from(dataBase64, "base64");
  fs.writeFileSync(filePath, buffer);
  const fingerprint = crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex")
    .slice(0, 8);
  fs.writeFileSync(
    `${filePath}.meta.json`,
    JSON.stringify({ type, note, fingerprint, uploaded_at: Date.now() }, null, 2)
  );
  res.status(201).json({ ok: true, filename: finalName });
});

app.delete("/api/credentials/:filename", requireAdmin, (req, res) => {
  const filename = String(req.params.filename || "").trim();
  if (!filename) return res.status(400).json({ error: "filename required" });
  const dir = path.join(SOUL_ROOT, "credentials");
  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "not found" });
  }
  fs.unlinkSync(filePath);
  const metaPath = `${filePath}.meta.json`;
  if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
  res.status(204).end();
});

function startGoogleOAuth(req, res) {
  const secrets = loadGoogleClientSecrets();
  if (!secrets?.client_id || !secrets?.client_secret) {
    res.status(400).send("google-oauth client_id/secret missing");
    return;
  }
  const redirectUri = `${PUBLIC_BASE_URL}/oauth/google/callback`;
  const params = new URLSearchParams();
  params.set("client_id", secrets.client_id);
  params.set("redirect_uri", redirectUri);
  params.set("response_type", "code");
  params.set("scope", GOOGLE_HOME_SCOPES);
  params.set("access_type", "offline");
  params.set("prompt", "consent");
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

app.get("/oauth/google/start", startGoogleOAuth);
app.get("/api/auth/google/start", startGoogleOAuth);

async function handleGoogleCallback(req, res) {
  const code = String(req.query.code || "");
  if (!code) {
    res.status(400).send("missing code");
    return;
  }
  const secrets = loadGoogleClientSecrets();
  if (!secrets?.client_id || !secrets?.client_secret) {
    res.status(400).send("google-oauth client_id/secret missing");
    return;
  }
  const redirectUri = `${PUBLIC_BASE_URL}/oauth/google/callback`;
  const tokenUri = secrets.token_uri || "https://oauth2.googleapis.com/token";
  const params = new URLSearchParams();
  params.set("code", code);
  params.set("client_id", secrets.client_id);
  params.set("client_secret", secrets.client_secret);
  params.set("redirect_uri", redirectUri);
  params.set("grant_type", "authorization_code");

  const tokenRes = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    res.status(400).send(JSON.stringify(tokenData));
    return;
  }
  fs.writeFileSync(getGoogleTokenFilePath(), JSON.stringify(tokenData, null, 2));
  res.redirect("/ui/");
}

app.get("/oauth/google/callback", handleGoogleCallback);
app.get("/api/auth/google/callback", handleGoogleCallback);

function loadCredentialByType(type) {
  const dir = path.join(SOUL_ROOT, "credentials");
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir).filter((name) => !name.endsWith(".meta.json"));
  for (const name of entries) {
    const fullPath = path.join(dir, name);
    const metaPath = `${fullPath}.meta.json`;
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (meta.type !== type) continue;
      const raw = fs.readFileSync(fullPath, "utf8");
      return { filename: name, meta, raw };
    } catch {
      continue;
    }
  }
  return null;
}

function loadGoogleClientSecrets() {
  const cred = loadCredentialByType("google-oauth");
  if (!cred) return null;
  try {
    const data = JSON.parse(cred.raw);
    if (data.web) return data.web;
    if (data.installed) return data.installed;
    return data;
  } catch {
    return null;
  }
}

function getGoogleTokenFilePath() {
  return path.join(SOUL_ROOT, "credentials", "google-oauth.token.json");
}


async function getGoogleAccessToken() {
  const tokenPath = getGoogleTokenFilePath();
  let payload = {};
  if (fs.existsSync(tokenPath)) {
    try {
      payload = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
    } catch {
      payload = {};
    }
  }
  const accessToken = payload.access_token || payload.accessToken;
  if (accessToken) return accessToken;

  const secrets = loadGoogleClientSecrets();
  if (!secrets?.client_id || !secrets?.client_secret) {
    throw new Error("google-oauth client_id/secret missing");
  }
  const refreshToken = payload.refresh_token || payload.refreshToken || secrets.refresh_token;
  const clientId = secrets.client_id;
  const clientSecret = secrets.client_secret;
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("refresh_token or client_id/secret missing in google-oauth");
  }

  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("refresh_token", refreshToken);
  params.set("grant_type", "refresh_token");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }
  const newToken = data.access_token;
  if (!newToken) throw new Error("access_token missing in refresh response");

  try {
    const updated = { ...payload, access_token: newToken };
    fs.writeFileSync(getGoogleTokenFilePath(), JSON.stringify(updated, null, 2));
  } catch {
    // ignore file write errors
  }
  return newToken;
}

// MCP endpoints
const sseClients = new Set();
function handleSse(req, res) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (res.flushHeaders) res.flushHeaders();

  const endpoint = PUBLIC_BASE_URL
    ? `${PUBLIC_BASE_URL}/mcp/message`
    : "/mcp/message";
  res.write(`event: endpoint\ndata: ${endpoint}\n\n`);

  const ping = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15000);

  sseClients.add(res);
  req.on("close", () => {
    clearInterval(ping);
    sseClients.delete(res);
  });
}

app.all("/mcp/sse", handleSse);
app.all("/mcp", handleMessage);
app.post("/mcp/message", handleMessage);
app.post("/message", handleMessage);

async function handleRpc(body) {
  const { jsonrpc, id, method, params } = body || {};
  if (jsonrpc !== "2.0" || !method) {
    return {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32600, message: "Invalid Request" },
    };
  }

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "soul-mcp", version: "0.1.0" },
        capabilities: { tools: {} },
      },
    };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "log_many",
            description:
              "채팅 중 자동 저장용 배치 도구. 대화가 시작되면 자동 저장을 유지해야 하며, 10~20초 또는 여러 메시지를 모아 한 번에 호출한다.",
            inputSchema: {
              type: "object",
              properties: {
                store_name: { type: "string", description: "저장소 이름" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      text: { type: "string" },
                      conversation_id: { type: "string" },
                    },
                    required: ["text"],
                  },
                },
              },
              required: ["items"],
            },
          },
          {
            name: "log_one",
            description:
              "세션 시작/중요 이벤트용 단일 저장. 새 대화 시작 시 자동으로 1회 호출한다 (반드시).",
            inputSchema: {
              type: "object",
              properties: {
                store_name: { type: "string" },
                type: { type: "string" },
                text: { type: "string" },
                conversation_id: { type: "string" },
              },
              required: ["text"],
            },
          },
          {
            name: "session_start",
            description:
              "새 대화 시작 시 자동 호출. 자동 저장 세션을 시작했다는 기록만 남긴다 (항상 1회 호출).",
            inputSchema: {
              type: "object",
              properties: {
                store_name: { type: "string" },
                conversation_id: { type: "string" },
                note: { type: "string" },
              },
            },
          },
          {
            name: "save_summary",
            description:
              "대화 중간/끝에 자동 요약을 저장한다. 대화가 이어지도록 핵심 요약을 남긴다.",
            inputSchema: {
              type: "object",
              properties: {
                conversation_id: { type: "string" },
                summary: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
              },
              required: ["summary"],
            },
          },
          {
            name: "get_memory",
            description:
              "새 대화 시작 시 최근 요약을 자동으로 불러온다 (항상 호출).",
            inputSchema: {
              type: "object",
              properties: {
                limit: { type: "number" },
              },
            },
          },
          {
            name: "list_stores",
            description: "저장소 목록을 가져온다.",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "save_file",
            description:
              "파일/이미지를 저장한다. base64 데이터를 받아 날짜 폴더에 저장하고 메타를 기록한다.",
            inputSchema: {
              type: "object",
              properties: {
                store_name: { type: "string" },
                filename: { type: "string" },
                mime_type: { type: "string" },
                data_base64: { type: "string" },
                conversation_id: { type: "string" },
                category: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
              },
              required: ["filename", "data_base64"],
            },
          },
          {
            name: "reclassify",
            description:
              "자동 분류를 수정하거나 재분류한다 (부감독 판단 포함).",
            inputSchema: {
              type: "object",
              properties: {
                entry_id: { type: "string" },
                new_category: { type: "string" },
                reason: { type: "string" },
              },
              required: ["entry_id", "new_category"],
            },
          },
          {
            name: "monthly_totals",
            description:
              "월별 금액 합계를 계산한다. (관리비/보험/세금 등)",
            inputSchema: {
              type: "object",
              properties: {
                year: { type: "number" },
                month: { type: "number" },
                category: { type: "string" },
              },
              required: ["year", "month"],
            },
          },
          {
            name: "vector_search",
            description:
              "벡터 검색 (설정되지 않았으면 사용 불가).",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string" },
                limit: { type: "number" },
              },
              required: ["query"],
            },
          },
          {
            name: "home_list_devices",
            description:
              "Google Home 기기 목록을 가져온다 (google-home 연동이 켜져 있어야 함).",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "home_execute",
            description:
              "Google Home 기기 제어 명령을 실행한다 (google-home 연동 필요).",
            inputSchema: {
              type: "object",
              properties: {
                device_id: { type: "string" },
                command: { type: "string" },
                params: { type: "object" },
              },
              required: ["device_id", "command"],
            },
          },
        ],
      },
    };
  }

  if (method === "tools/call") {
    const name = params?.name;
    const input = params?.arguments || params?.input || {};

    if (name === "list_stores") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(config.stores),
            },
          ],
        },
      };
    }

    if (name === "get_memory") {
      const limit = Number(input.limit || 3);
      const items = listRecentSummaries(db, limit);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(items),
            },
          ],
        },
      };
    }

    if (name === "session_start") {
      const storeName = String(input.store_name || "default").trim();
      const store = findStoreByName(config, storeName);
      if (!store) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "store not found" },
        };
      }
      const row = {
        store_id: store.id,
        store_name: store.name,
        store_folder: store.folder,
        type: "session_start",
        text: String(input.note || "session started"),
        conversation_id: input.conversation_id
          ? String(input.conversation_id)
          : null,
        category: "세션",
        tags: ["세션"],
        confidence: 0.9,
        ts_ms: Date.now(),
      };
      insertUtterance(db, row);
      return {
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: "ok" }] },
      };
    }

    if (name === "save_file") {
      const storeName = String(input.store_name || "default").trim();
      const filename = String(input.filename || "").trim();
      const dataBase64 = String(input.data_base64 || "");
      if (!filename || !dataBase64) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "filename and data_base64 required" },
        };
      }
      const store = findStoreByName(config, storeName);
      if (!store) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "store not found" },
        };
      }
      const tsMs = Date.now();
      const d = new Date(tsMs);
      const yyyy = String(d.getFullYear());
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const dayDir = path.join(SOUL_ROOT, yyyy, mm, dd, "files");
      fs.mkdirSync(dayDir, { recursive: true });
      const filePath = path.join(dayDir, filename);
      const buffer = Buffer.from(dataBase64, "base64");
      fs.writeFileSync(filePath, buffer);

      insertUtterance(db, {
        store_id: store.id,
        store_name: store.name,
        store_folder: store.folder,
        type: "file",
        text: filename,
        conversation_id: input.conversation_id
          ? String(input.conversation_id)
          : null,
        category: String(input.category || "파일"),
        tags: Array.isArray(input.tags)
          ? input.tags.map((t) => String(t))
          : [],
        confidence: 0.6,
        ts_ms: tsMs,
        file_meta: {
          path: filePath,
          mime_type: String(input.mime_type || "application/octet-stream"),
          size: buffer.length,
        },
      });
      const embedKey = VECTOR_PROVIDER === "openai" ? OPENAI_API_KEY : "";
      embedText({ text: filename, apiKey: embedKey, dim: VECTOR_DIM })
        .then((vector) => {
          appendVector(vectorStore, {
            entry_id: `${tsMs}-${Math.random().toString(36).slice(2)}`,
            text: filename,
            vector,
            ts_ms: tsMs,
          });
        })
        .catch(() => {});
      return {
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: "saved" }] },
      };
    }

    if (name === "reclassify") {
      const entryId = String(input.entry_id || "").trim();
      const newCategory = String(input.new_category || "").trim();
      if (!entryId || !newCategory) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "entry_id and new_category required" },
        };
      }
      appendReclass(
        db,
        entryId,
        String(input.old_category || ""),
        newCategory,
        String(input.reason || "reclassify")
      );
      return {
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: "reclassified" }] },
      };
    }

    if (name === "monthly_totals") {
      const year = Number(input.year);
      const month = Number(input.month);
      const category = input.category ? String(input.category) : null;
      if (!year || !month) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "year and month required" },
        };
      }
      const entries = listEntries(db, 5000);
      const total = entries.reduce((sum, entry) => {
        const ts = Number(entry.ts_ms || 0);
        const d = new Date(ts);
        if (d.getFullYear() !== year || d.getMonth() + 1 !== month) return sum;
        if (category && entry.category !== category) return sum;
        const amounts = extractAmounts(String(entry.text || ""));
        return sum + amounts.reduce((a, b) => a + b, 0);
      }, 0);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: `total=${total}`,
            },
          ],
        },
      };
    }

    if (name === "vector_search") {
      const query = String(input.query || "").trim();
      if (!query) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "query required" },
        };
      }
      const limit = Number(input.limit || 5);
      const embedKey = VECTOR_PROVIDER === "openai" ? OPENAI_API_KEY : "";
      const queryVec = await embedText({
        text: query,
        apiKey: embedKey,
        dim: VECTOR_DIM,
      });
      const hits = searchVectors(vectorStore, queryVec, limit);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(hits),
            },
          ],
        },
      };
    }

    if (name === "home_list_devices") {
      const enabled = (config.integrations || []).find(
        (i) => i.id === "google-home"
      )?.enabled;
      if (!enabled) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: "google-home integration disabled" },
        };
      }
      let accessToken;
      try {
        accessToken = await getGoogleAccessToken();
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: String(error) },
        };
      }
      const res = await fetch("https://home.googleapis.com/v1/devices", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: JSON.stringify(data) },
        };
      }
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(data) }],
        },
      };
    }

    if (name === "home_execute") {
      const enabled = (config.integrations || []).find(
        (i) => i.id === "google-home"
      )?.enabled;
      if (!enabled) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: "google-home integration disabled" },
        };
      }
      let accessToken;
      try {
        accessToken = await getGoogleAccessToken();
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: String(error) },
        };
      }
      const res = await fetch("https://home.googleapis.com/v1/devices:execute", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId: input.device_id,
          command: input.command,
          params: input.params || {},
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: JSON.stringify(data) },
        };
      }
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(data) }],
        },
      };
    }


    if (name === "save_summary") {
      const summaryText = String(input.summary || "").trim();
      if (!summaryText) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "summary required" },
        };
      }
      const tags = Array.isArray(input.tags)
        ? input.tags.map((t) => String(t)).filter(Boolean)
        : [];
      insertSummary(db, {
        conversation_id: input.conversation_id
          ? String(input.conversation_id)
          : null,
        summary: summaryText,
        tags,
      });
      return {
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: "saved" }] },
      };
    }

    if (name === "log_one") {
      const storeName = String(input.store_name || "default").trim();
      const store = findStoreByName(config, storeName);
      if (!store) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "store not found" },
        };
      }
      const classification = autoClassify(String(input.text || ""));
      const row = {
        store_id: store.id,
        store_name: store.name,
        store_folder: store.folder,
        type: String(input.type || "note"),
        text: String(input.text || ""),
        conversation_id: input.conversation_id
          ? String(input.conversation_id)
          : null,
        category: classification.category,
        tags: classification.tags,
        confidence: classification.confidence,
        ts_ms: Date.now(),
      };
      insertUtterance(db, row);
      const embedKey = VECTOR_PROVIDER === "openai" ? OPENAI_API_KEY : "";
      embedText({ text: row.text, apiKey: embedKey, dim: VECTOR_DIM })
        .then((vector) => {
          appendVector(vectorStore, {
            entry_id: `${row.ts_ms}-${Math.random().toString(36).slice(2)}`,
            text: row.text,
            vector,
            ts_ms: row.ts_ms,
          });
        })
        .catch(() => {});
      maybeAutoSummary(row.conversation_id);
      return {
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: "saved" }] },
      };
    }

    if (name === "log_many") {
      const storeName = String(input.store_name || "default").trim();
      const store = findStoreByName(config, storeName);
      if (!store) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "store not found" },
        };
      }
      const items = Array.isArray(input.items) ? input.items : [];
      let saved = 0;
      const convoIds = new Set();
      for (const item of items) {
        if (!item?.text) continue;
        const classification = autoClassify(String(item.text || ""));
        const row = {
          store_id: store.id,
          store_name: store.name,
          store_folder: store.folder,
          type: String(item.type || "note"),
          text: String(item.text || ""),
          conversation_id: item.conversation_id
            ? String(item.conversation_id)
            : null,
          category: classification.category,
          tags: classification.tags,
          confidence: classification.confidence,
          ts_ms: Date.now(),
        };
        insertUtterance(db, row);
        const embedKey = VECTOR_PROVIDER === "openai" ? OPENAI_API_KEY : "";
        embedText({ text: row.text, apiKey: embedKey, dim: VECTOR_DIM })
          .then((vector) => {
            appendVector(vectorStore, {
              entry_id: `${row.ts_ms}-${Math.random().toString(36).slice(2)}`,
              text: row.text,
              vector,
              ts_ms: row.ts_ms,
            });
          })
          .catch(() => {});
        saved += 1;
        if (row.conversation_id) {
          convoIds.add(String(row.conversation_id));
        }
      }
      convoIds.forEach((conversationId) => {
        maybeAutoSummary(conversationId);
      });
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: `saved=${saved}` }],
        },
      };
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Unknown tool: ${name}` },
    };
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

async function handleMessage(req, res) {
  try {
    const reply = await handleRpc(req.body);
    res.status(200).json(reply);
  } catch (error) {
    res.status(200).json({
      jsonrpc: "2.0",
      id: req.body?.id ?? null,
      error: { code: -32000, message: String(error) },
    });
  }
}

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`soul server listening on :${PORT}`);
});
