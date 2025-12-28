import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { initDb, insertUtterance, listRecent } from "./db.js";
import {
  initStorage,
  loadConfig,
  saveConfig,
  findStoreById,
  findStoreByName,
} from "./storage.js";
import { autoClassify } from "./classify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOUL_ROOT = process.env.SOUL_ROOT || "/soul";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");

initStorage(SOUL_ROOT);
let config = loadConfig(SOUL_ROOT);
const db = initDb(SOUL_ROOT);

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
  });
});

// Store management
app.get("/api/stores", requireAdmin, (req, res) => {
  res.json({ stores: config.stores });
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
  res.status(201).json({ ok: true });
});

app.get("/api/recent", requireAdmin, (req, res) => {
  const limit = Number(req.query.limit || 20);
  res.json({ items: listRecent(db, limit) });
});

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
              "채팅 중 자동 저장용 배치 도구. 10~20초 또는 여러 메시지를 모아 한 번에 호출한다.",
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
              "세션 시작/중요 이벤트용 단일 저장. 새 대화 시작 시 자동으로 1회 호출한다.",
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
              "새 대화 시작 시 자동 호출. 자동 저장 세션을 시작했다는 기록만 남긴다.",
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
            name: "list_stores",
            description: "저장소 목록을 가져온다.",
            inputSchema: { type: "object", properties: {} },
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
      for (const item of items) {
        if (!item?.text) continue;
        const classification = autoClassify(String(item.text || ""));
        insertUtterance(db, {
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
        });
        saved += 1;
      }
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
