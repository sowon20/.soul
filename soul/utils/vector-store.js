/**
 * 벡터 스토어 - 멀티 서비스 임베딩 + SQLite 저장
 * recall_memory의 의미적 검색을 위한 모듈
 *
 * embedding-worker 역할에서 서비스/모델 설정을 읽어 임베딩 생성
 * 지원: OpenRouter, OpenAI, HuggingFace, Ollama
 */

// 임베딩 프로바이더 캐시
let _cachedProvider = null;

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

/**
 * embedding-worker 역할에서 프로바이더 정보 로드
 */
async function getEmbeddingProvider() {
  if (_cachedProvider) return _cachedProvider;

  try {
    const RoleModel = require('../models/Role');
    const role = await RoleModel.findOne({ roleId: 'embedding-worker', isActive: 1 });
    if (!role) return null;

    const config = typeof role.config === 'string'
      ? JSON.parse(role.config) : (role.config || {});
    const serviceId = config.serviceId || 'openrouter';
    const model = role.preferredModel || 'qwen/qwen3-embedding-8b';

    const AIServiceModel = require('../models/AIService');
    const aiService = await AIServiceModel.findOne({ serviceId });
    if (!aiService || !aiService.apiKey) {
      console.warn(`[VectorStore] No API key for ${serviceId}`);
      return null;
    }

    _cachedProvider = {
      type: serviceId,
      apiKey: aiService.apiKey,
      model,
      baseUrl: aiService.baseUrl || null
    };
    return _cachedProvider;
  } catch (e) {
    console.warn('[VectorStore] getEmbeddingProvider failed:', e.message);
    return null;
  }
}

/**
 * 프로바이더 캐시 리셋 (설정 변경 시 호출)
 */
function resetEmbeddingProvider() {
  _cachedProvider = null;
  console.log('[VectorStore] Embedding provider cache reset');
}

/**
 * OpenRouter / OpenAI 호환 임베딩
 */
async function embedWithOpenAI(text, apiKey, model, baseUrl) {
  const url = `${baseUrl || 'https://openrouter.ai/api/v1'}/embeddings`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, input: text })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embedding API error (${response.status}): ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.data?.[0]?.embedding || null;
}

/**
 * HuggingFace Feature Extraction 임베딩
 */
async function embedWithHuggingFace(text, apiKey, model) {
  const url = `https://router.huggingface.co/pipeline/feature-extraction/${model}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ inputs: text })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`HuggingFace embedding error (${response.status}): ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  // feature-extraction: [[...]] 또는 [...] 형태
  if (Array.isArray(data) && Array.isArray(data[0])) return data[0];
  if (Array.isArray(data) && typeof data[0] === 'number') return data;
  return null;
}

/**
 * Ollama 로컬 임베딩
 */
async function embedWithOllama(text, model) {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || 'qwen3-embedding:8b', prompt: text })
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding || null;
}

/**
 * 텍스트를 벡터로 변환 (프로바이더 자동 감지)
 */
async function embed(text) {
  try {
    const provider = await getEmbeddingProvider();

    if (!provider) {
      console.warn('[VectorStore] No embedding provider configured');
      return null;
    }

    switch (provider.type) {
      case 'openrouter':
        return await embedWithOpenAI(text, provider.apiKey, provider.model, 'https://openrouter.ai/api/v1');
      case 'openai':
        return await embedWithOpenAI(text, provider.apiKey, provider.model, 'https://api.openai.com/v1');
      case 'huggingface':
        return await embedWithHuggingFace(text, provider.apiKey, provider.model);
      case 'ollama':
        return await embedWithOllama(text, provider.model);
      default:
        // OpenAI 호환 시도
        return await embedWithOpenAI(text, provider.apiKey, provider.model, provider.baseUrl);
    }
  } catch (error) {
    console.error('[VectorStore] Embedding error:', error.message);
    return null;
  }
}

/**
 * 메시지 임베딩 후 SQLite에 저장
 */
async function addMessage(message) {
  try {
    const text = message.text || message.content || '';
    if (!text || text.length < 5) return;

    const embedding = await embed(text);
    if (!embedding) {
      console.warn('[VectorStore] Embedding failed, skipping');
      return;
    }

    const Message = require('../models/Message');

    // 기존 메시지면 (숫자 ID) 임베딩만 업데이트
    if (message.id && typeof message.id === 'number') {
      await Message.updateEmbedding(message.id, embedding);
      console.log(`[VectorStore] Updated embedding: ${message.id}`);
      return;
    }

    // 새 메시지로 저장 (다이제스트 요약/메모리용)
    const db = require('../db');
    if (!db.db) db.init();

    const digestId = message.id || `emb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const stmt = db.db.prepare(`
      INSERT INTO messages (session_id, role, content, embedding, timestamp, meta)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      message.sessionId || 'embeddings',
      message.role || 'system',
      text,
      JSON.stringify(embedding),
      message.timestamp || new Date().toISOString(),
      JSON.stringify({ digestId })
    );

    console.log(`[VectorStore] Saved embedding: ${digestId} (${embedding.length}dim)`);
  } catch (error) {
    console.error('[VectorStore] Failed to add message:', error.message);
  }
}

/**
 * 유사도 검색 (SQLite cosine similarity)
 */
async function search(query, limit = 5) {
  try {
    const queryEmbedding = await embed(query);
    if (!queryEmbedding) return [];

    const Message = require('../models/Message');
    // Message.findSimilar는 embeddings 세션뿐 아니라 전체에서 검색
    const results = await Message.findSimilar(queryEmbedding, {
      sessionId: 'embeddings',
      limit,
      minSimilarity: 0.3
    });

    return results.map(r => ({
      text: r.content,
      id: r.id,
      distance: 1 - (r.similarity || 0),
      metadata: {
        role: r.role,
        timestamp: r.timestamp
      }
    }));
  } catch (error) {
    console.error('[VectorStore] Search failed:', error.message);
    return [];
  }
}

module.exports = {
  embed,
  addMessage,
  search,
  getEmbeddingProvider,
  resetEmbeddingProvider
};
