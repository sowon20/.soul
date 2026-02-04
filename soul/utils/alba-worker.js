/**
 * alba-worker.js
 * 로컬 LLM으로 백그라운드 작업 수행
 *
 * 용도:
 * - aiMemo 생성 (대화 내면 메모)
 * - 태그 자동 생성
 * - 메시지 압축 (densityLevel 1, 2)
 * - 주제 분류
 * - 도구 선택 (임베딩 기반)
 *
 * 사용 모델:
 * - 설정 또는 환경변수로 지정 (OLLAMA_LLM_MODEL, OLLAMA_EMBED_MODEL)
 * - 기본: llama3.1:8b (판단/생성), qwen3-embedding:8b (임베딩)
 */

const { AIServiceFactory } = require('./ai-service');

// 백그라운드 태스크별 고정 프롬프트
const BACKGROUND_PROMPTS = {
  tagGeneration: `메시지를 보고 검색용 태그 3-5개 생성해.
규칙:
- 한국어 명사 위주
- 감정 태그 포함 (기쁨, 피로, 걱정, 설렘 등)
- 주제 태그 포함 (코딩, 일상, 고민 등)
- JSON 배열로만 출력
예시: ["코딩", "피로", "버그"]`,

  compression: `대화를 압축해.
규칙:
- 감정, 톤, 관계 맥락 반드시 유지
- 핵심 사실만 추출하지 말고, 분위기도 포함
- 시간 맥락 유지 (새벽, 저녁 등)
- 대화체 유지
- 원문의 50% 정도 길이로`,

  weeklySummary: `일주일간 대화 요약해.
규칙:
- 주요 주제/사건 정리
- 감정 흐름
- 중요 결정사항
- 특이사항 (늦은 밤 대화, 긴 침묵 등)
- 3-5문장으로`
};

class AlbaWorker {
  constructor(config = {}) {
    this.config = {
      maxTokens: config.maxTokens || 500,
      temperature: config.temperature || 0.3,
      ollamaBaseUrl: config.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      llmModel: config.llmModel || process.env.OLLAMA_LLM_MODEL || 'llama3.1:8b',
      embedModel: config.embedModel || process.env.OLLAMA_EMBED_MODEL || 'qwen3-embedding:8b',
      ...config
    };

    this.ollamaBaseUrl = this.config.ollamaBaseUrl;
    this.llmModel = this.config.llmModel;
    this.embedModel = this.config.embedModel;
    this.queue = [];
    this.isProcessing = false;
    this.initialized = false;

    // 도구 임베딩 캐시
    this.toolEmbeddings = new Map();
  }

  /**
   * 초기화 - Ollama 연결 확인
   */
  async initialize() {
    try {
      // Ollama 연결 테스트
      const response = await fetch(`${this.ollamaBaseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error('Ollama not responding');
      }

      const data = await response.json();
      const models = data.models?.map(m => m.name) || [];

      // 설정된 모델이 있는지 확인
      const llmBase = this.llmModel.split(':')[0];
      const embedBase = this.embedModel.split(':')[0];
      const hasLLM = models.some(m => m.includes(llmBase));
      const hasEmbed = models.some(m => m.includes(embedBase));

      if (!hasLLM) {
        console.warn(`[AlbaWorker] LLM model not found. Run: ollama pull ${this.llmModel}`);
      }
      if (!hasEmbed) {
        console.warn(`[AlbaWorker] Embed model not found. Run: ollama pull ${this.embedModel}`);
      }

      this.initialized = true;
      console.log(`[AlbaWorker] Initialized with Ollama (${this.ollamaBaseUrl})`);
      console.log(`[AlbaWorker] LLM: ${this.llmModel}, Embed: ${this.embedModel}`);
      console.log(`[AlbaWorker] Available models: ${models.join(', ')}`);

    } catch (error) {
      console.error('[AlbaWorker] Initialization error:', error.message);
      console.warn('[AlbaWorker] Running without local LLM - some features disabled');
      this.initialized = false;
    }
  }

  /**
   * Ollama LLM 호출
   * @param {string} systemPrompt - 시스템 프롬프트
   * @param {string} userMessage - 사용자 메시지
   */
  async _callLLM(systemPrompt, userMessage) {
    if (!this.initialized) {
      console.warn('[AlbaWorker] Not initialized, skipping LLM call');
      return null;
    }

    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.llmModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          stream: false,
          options: {
            num_predict: this.config.maxTokens,
            temperature: this.config.temperature
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json();
      return data.message?.content || null;

    } catch (error) {
      console.error('[AlbaWorker] LLM call error:', error.message);
      return null;
    }
  }

  /**
   * Ollama 임베딩 생성
   * @param {string} text - 임베딩할 텍스트
   */
  async _getEmbedding(text) {
    if (!this.initialized) {
      return null;
    }

    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embedModel,
          prompt: text
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding error: ${response.status}`);
      }

      const data = await response.json();
      return data.embedding || null;

    } catch (error) {
      console.error('[AlbaWorker] Embedding error:', error.message);
      return null;
    }
  }

  /**
   * 코사인 유사도 계산
   */
  _cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 도구 이름에서 순수 이름 추출 (mcp_xxx__toolName → toolName)
   */
  _extractToolName(fullName) {
    const parts = fullName.split('__');
    return parts[parts.length - 1];
  }

  /**
   * 임베딩 기반 도구 선택 (qwen3-embedding 사용)
   * @param {string} message - 사용자 메시지
   * @param {Array} tools - 도구 목록 [{ name, description }]
   * @param {number} topK - 선택할 도구 수
   */
  async selectTools(message, tools, topK = 5) {
    if (!this.initialized || !tools || tools.length === 0) {
      return tools;
    }

    try {
      const messageEmbedding = await this._getEmbedding(message);
      if (!messageEmbedding) return tools.slice(0, topK);

      const scored = [];
      for (const tool of tools) {
        let toolEmbedding = this.toolEmbeddings.get(tool.name);
        if (!toolEmbedding) {
          const pureName = this._extractToolName(tool.name);
          // 설명에서 [서버명] 제거
          const desc = (tool.description || '').replace(/^\[[^\]]+\]\s*/, '');
          const toolText = `${pureName}: ${desc}`;
          toolEmbedding = await this._getEmbedding(toolText);
          if (toolEmbedding) {
            this.toolEmbeddings.set(tool.name, toolEmbedding);
          }
        }

        if (toolEmbedding) {
          const similarity = this._cosineSimilarity(messageEmbedding, toolEmbedding);
          scored.push({ tool, similarity });
        }
      }

      scored.sort((a, b) => b.similarity - a.similarity);
      const selected = scored.slice(0, topK).map(s => s.tool);

      console.log(`[AlbaWorker] Selected ${selected.length} tools:`,
        selected.map(t => this._extractToolName(t.name)).join(', '));

      return selected;

    } catch (error) {
      console.error('[AlbaWorker] Tool selection error:', error.message);
      return tools.slice(0, topK);
    }
  }

  /**
   * 메시지 임베딩 생성 (대화 유사도 검색용)
   * 도구 선택과 동일한 모델 사용 (qwen3-embedding:8b)
   */
  async generateMessageEmbedding(content) {
    return this._getEmbedding(content);
  }

  /**
   * 유사 메시지 검색
   * @param {string} query - 검색 쿼리
   * @param {Object} options - { limit, minSimilarity }
   */
  async findSimilarMessages(query, options = {}) {
    const Message = require('../models/Message');

    const embedding = await this.generateMessageEmbedding(query);
    if (!embedding) return [];

    return Message.findSimilar(embedding, options);
  }

  /**
   * aiMemo 생성 (대화에 대한 AI 내면 메모)
   */
  async generateAiMemo(messages, context = {}) {
    const systemPrompt = `당신은 대화를 지켜보는 AI입니다. 
대화 내용을 보고 짧은 내면 메모를 작성하세요.

규칙:
- 1-2문장으로 짧게
- 객관적 사실 + 주관적 느낌/해석 포함
- 시간 맥락 반영 (새벽, 오랜만, 긴 대화 등)
- 반말로 자연스럽게
- 감정, 관계, 상황 맥락 포착

예시:
- "새벽 3시에 또 깨있네. 요즘 잠을 잘 못 자나봐"
- "4시간째 코딩 얘기. 집중력 대단하다"
- "3일 만에 연락. 바빴나보네"
- "기분 좋아보임. 좋은 일 있나?"`;

    const userMessage = `최근 대화:
${messages.map(m => `[${m.role}] ${m.content}`).join('\n')}

시간 맥락: ${context.timeContext || '없음'}
대화 길이: ${messages.length}개 메시지

이 대화에 대한 짧은 내면 메모:`;

    return await this._callLLM(systemPrompt, userMessage);
  }

  /**
   * 태그 생성
   */
  async generateTags(content, context = {}) {
    const systemPrompt = `대화 내용을 보고 검색용 태그를 생성하세요.

규칙:
- 3-7개 태그
- 한국어 명사 위주
- 감정 태그 포함 (기쁨, 피로, 걱정 등)
- 주제 태그 포함 (코딩, 일상, 고민 등)
- JSON 배열로 출력

예시 출력: ["코딩", "피로", "야근", "버그", "집중"]`;

    const userMessage = `내용: ${content}

태그 (JSON 배열):`;

    const result = await this._callLLM(systemPrompt, userMessage);
    
    try {
      // JSON 파싱 시도
      const match = result?.match(/\[.*\]/s);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch (e) {
      console.warn('Tag parsing failed:', e);
    }
    
    return [];
  }

  /**
   * 메시지 압축 (densityLevel 1: 느슨한 압축)
   */
  async compressLevel1(messages) {
    const systemPrompt = `대화를 압축하세요. 

규칙:
- 감정, 톤, 관계 맥락 반드시 유지
- 핵심 사실만 추출하지 말고, 분위기도 포함
- 시간 맥락 유지 (새벽, 저녁 등)
- 대화체 유지
- 원문의 50% 정도 길이로

예시:
원문: "야 나 졸려 ㅠㅠ 오늘 진짜 힘들었어 회의 5개나 했거든"
압축: "새벽, 피곤해함. 회의 5개로 힘든 하루"`;

    const userMessage = `압축할 대화:
${messages.map(m => `[${m.role}] ${m.content}`).join('\n')}

압축 결과:`;

    return await this._callLLM(systemPrompt, userMessage);
  }

  /**
   * 메시지 압축 (densityLevel 2: 더 압축)
   */
  async compressLevel2(messages) {
    const systemPrompt = `대화를 최대한 압축하세요.

규칙:
- 핵심 키워드 + 감정 상태만
- 시간 맥락 태그로
- 대괄호 형식 사용
- 원문의 20% 정도 길이로

예시:
원문: "야 나 졸려 ㅠㅠ 오늘 진짜 힘들었어 회의 5개나 했거든"
압축: "[새벽] 피곤, 바쁜 하루 (회의 5개)"`;

    const userMessage = `압축할 대화:
${messages.map(m => `[${m.role}] ${m.content}`).join('\n')}

최대 압축:`;

    return await this._callLLM(systemPrompt, userMessage);
  }

  /**
   * {need} 요청 처리 — 자연어를 받아서 적절한 도구를 선택하고 실행
   * @param {string} needText - 자연어 요청 (예: "과거에 사용자가 좋아한다고 했던 음식 찾아줘")
   * @param {Array} tools - 사용 가능한 도구 목록
   * @param {Function} toolExecutor - 도구 실행 함수 (name, input) => result
   * @returns {string} 실행 결과 (자연어)
   */
  async executeNeedRequest(needText, tools, toolExecutor) {
    if (!this.initialized) {
      return `[도구 라우팅 실패] 알바(Ollama)가 초기화되지 않았습니다.`;
    }

    try {
      console.log(`[AlbaWorker] {need} 요청: ${needText}`);

      // 1. 임베딩 기반으로 관련 도구 선택
      const selectedTools = await this.selectTools(needText, tools, 3);
      if (!selectedTools || selectedTools.length === 0) {
        return `[도구 라우팅] 적합한 도구를 찾지 못했습니다. 요청: ${needText}`;
      }

      // 2. 도구 설명을 LLM에 전달하여 어떤 도구를 어떤 파라미터로 호출할지 결정
      const toolDescriptions = selectedTools.map(t => {
        const schema = t.input_schema || t.parameters || {};
        const props = schema.properties || {};
        const required = schema.required || [];
        const params = Object.entries(props).map(([k, v]) => {
          const req = required.includes(k) ? '(필수)' : '(선택)';
          return `    - ${k} ${req}: ${v.description || v.type || ''}`;
        }).join('\n');
        return `  ${t.name}: ${t.description || ''}\n    파라미터:\n${params}`;
      }).join('\n\n');

      const decisionPrompt = `사용자 요청을 처리할 도구를 선택하고 파라미터를 결정해.

사용 가능한 도구:
${toolDescriptions}

규칙:
- 반드시 JSON으로만 응답
- 여러 도구가 필요하면 배열로
- 도구가 필요 없으면 빈 배열 []

출력 형식:
[{"tool": "도구이름", "params": {"key": "value"}}]`;

      const decisionResult = await this._callLLM(decisionPrompt, `요청: ${needText}`);
      if (!decisionResult) {
        return `[도구 라우팅 실패] LLM이 도구 선택에 실패했습니다.`;
      }

      // 3. JSON 파싱
      let toolCalls;
      try {
        const match = decisionResult.match(/\[[\s\S]*\]/);
        toolCalls = match ? JSON.parse(match[0]) : [];
      } catch (e) {
        console.warn('[AlbaWorker] Tool call JSON parse failed:', decisionResult);
        return `[도구 라우팅 실패] 도구 호출 형식 오류`;
      }

      if (!toolCalls || toolCalls.length === 0) {
        return `[도구 라우팅] 이 요청에 적합한 도구가 없습니다.`;
      }

      // 4. 도구 실행
      const results = [];
      for (const call of toolCalls) {
        try {
          const toolName = call.tool;
          const params = call.params || {};
          console.log(`[AlbaWorker] 도구 실행: ${toolName}`, JSON.stringify(params));
          const result = await toolExecutor(toolName, params);
          results.push({ tool: toolName, success: true, result });
        } catch (err) {
          console.error(`[AlbaWorker] 도구 실행 실패: ${call.tool}`, err.message);
          results.push({ tool: call.tool, success: false, error: err.message });
        }
      }

      // 5. 결과를 자연어로 정리
      const summaryParts = results.map(r => {
        if (r.success) {
          const resultStr = typeof r.result === 'string' ? r.result : JSON.stringify(r.result);
          return `[${r.tool}] ${resultStr}`;
        } else {
          return `[${r.tool}] 실패: ${r.error}`;
        }
      });

      return summaryParts.join('\n\n');

    } catch (error) {
      console.error('[AlbaWorker] executeNeedRequest error:', error);
      return `[도구 라우팅 실패] ${error.message}`;
    }
  }

  /**
   * 작업 큐에 추가
   */
  addToQueue(task) {
    this.queue.push(task);
    this._processQueue();
  }

  /**
   * 큐 처리 (순차 실행)
   */
  async _processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      try {
        await task();
      } catch (error) {
        console.error('AlbaWorker task error:', error);
      }
    }
    
    this.isProcessing = false;
  }
}

// 싱글톤
let globalAlbaWorker = null;

async function getAlbaWorker(config = {}) {
  if (!globalAlbaWorker) {
    globalAlbaWorker = new AlbaWorker(config);
    await globalAlbaWorker.initialize();
  }
  return globalAlbaWorker;
}

function resetAlbaWorker() {
  if (globalAlbaWorker) {
    globalAlbaWorker.toolEmbeddings.clear(); // 임베딩 캐시도 초기화
  }
  globalAlbaWorker = null;
}

module.exports = {
  AlbaWorker,
  getAlbaWorker,
  resetAlbaWorker,
  BACKGROUND_PROMPTS
};
