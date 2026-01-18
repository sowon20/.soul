/**
 * memory-tool.js
 * MCP Tool: 메모리 검색 및 관리
 */

const axios = require('axios');

const API_BASE = process.env.SOUL_API_BASE || 'http://localhost:3080/api';

/**
 * 메모리 검색 도구
 */
async function searchMemory({ query, limit = 5, timeRange = null }) {
  try {
    const response = await axios.post(`${API_BASE}/search/smart`, {
      query,
      limit,
      timeRange
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Search failed');
    }

    const results = response.data.results || [];

    return {
      success: true,
      count: results.length,
      conversations: results.map(r => ({
        id: r.id,
        topics: r.topics || [],
        summary: r.summary || '',
        date: r.date,
        relevance: r.relevanceScore || 0
      }))
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 메모리 조회 도구
 */
async function getMemory({ conversationId }) {
  try {
    const response = await axios.get(`${API_BASE}/memory/${conversationId}`);

    if (!response.data.success) {
      throw new Error(response.data.error || 'Get memory failed');
    }

    return {
      success: true,
      conversation: response.data.conversation
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 메모리 저장 도구
 */
async function saveMemory({ conversationId, messages, autoAnalyze = true }) {
  try {
    const response = await axios.post(`${API_BASE}/memory/archive`, {
      conversationId,
      messages,
      autoAnalyze
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Save memory failed');
    }

    return {
      success: true,
      message: 'Memory saved successfully',
      analysis: response.data.analysis
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 관련 메모리 추천
 */
async function recommendMemories({ conversationId, limit = 3 }) {
  try {
    const response = await axios.get(
      `${API_BASE}/search/recommendations/${conversationId}?limit=${limit}`
    );

    if (!response.data.success) {
      throw new Error(response.data.error || 'Recommendations failed');
    }

    return {
      success: true,
      recommendations: response.data.recommendations || []
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  name: 'memory',
  description: 'Soul 메모리 시스템 - 대화 검색, 저장, 조회',
  tools: [
    {
      name: 'search_memory',
      description: '과거 대화를 자연어로 검색합니다',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '검색 쿼리 (자연어)'
          },
          limit: {
            type: 'number',
            description: '최대 결과 개수',
            default: 5
          },
          timeRange: {
            type: 'string',
            description: '시간 범위 (today, yesterday, last_week, last_month)',
            enum: ['today', 'yesterday', 'last_week', 'last_month']
          }
        },
        required: ['query']
      },
      handler: searchMemory
    },
    {
      name: 'get_memory',
      description: '특정 대화의 전체 내용을 가져옵니다',
      inputSchema: {
        type: 'object',
        properties: {
          conversationId: {
            type: 'string',
            description: '대화 ID'
          }
        },
        required: ['conversationId']
      },
      handler: getMemory
    },
    {
      name: 'save_memory',
      description: '현재 대화를 메모리에 저장합니다',
      inputSchema: {
        type: 'object',
        properties: {
          conversationId: {
            type: 'string',
            description: '대화 ID'
          },
          messages: {
            type: 'array',
            description: '메시지 배열',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string' },
                content: { type: 'string' }
              }
            }
          },
          autoAnalyze: {
            type: 'boolean',
            description: 'AI 자동 분석 여부',
            default: true
          }
        },
        required: ['conversationId', 'messages']
      },
      handler: saveMemory
    },
    {
      name: 'recommend_memories',
      description: '현재 대화와 관련된 과거 대화를 추천합니다',
      inputSchema: {
        type: 'object',
        properties: {
          conversationId: {
            type: 'string',
            description: '현재 대화 ID'
          },
          limit: {
            type: 'number',
            description: '추천 개수',
            default: 3
          }
        },
        required: ['conversationId']
      },
      handler: recommendMemories
    }
  ]
};
