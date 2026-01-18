/**
 * nlp-tool.js
 * MCP Tool: 자연어 이해 및 의도 감지
 */

const axios = require('axios');

const API_BASE = process.env.SOUL_API_BASE || 'http://localhost:3080/api';

/**
 * 의도 감지
 */
async function detectIntent({ message, context = {} }) {
  try {
    const response = await axios.post(`${API_BASE}/nlp/detect`, {
      message,
      context
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Intent detection failed');
    }

    return {
      success: true,
      intent: response.data.intent,
      confidence: response.data.confidence,
      entities: response.data.entities,
      isCommand: response.data.isCommand
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 액션 실행
 */
async function executeIntent({ message, context = {} }) {
  try {
    const response = await axios.post(`${API_BASE}/nlp/execute`, {
      message,
      context
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Intent execution failed');
    }

    return {
      success: true,
      intent: response.data.intent,
      action: response.data.action,
      shouldExecute: response.data.shouldExecute
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  name: 'nlp',
  description: 'Soul 자연어 처리 - 의도 감지, 엔티티 추출, 액션 제안',
  tools: [
    {
      name: 'detect_intent',
      description: '사용자 메시지의 의도를 감지합니다',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: '사용자 메시지'
          },
          context: {
            type: 'object',
            description: 'UI 상태 등 컨텍스트 정보',
            properties: {
              currentPanel: { type: 'string' },
              previousMessageWasQuestion: { type: 'boolean' }
            }
          }
        },
        required: ['message']
      },
      handler: detectIntent
    },
    {
      name: 'execute_intent',
      description: '의도를 감지하고 실행할 액션을 제안합니다',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: '사용자 메시지'
          },
          context: {
            type: 'object',
            description: '컨텍스트 정보'
          }
        },
        required: ['message']
      },
      handler: executeIntent
    }
  ]
};
