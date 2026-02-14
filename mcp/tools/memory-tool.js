// Soul MCP - Memory & Profile Tools
const SOUL_API_BASE = process.env.SOUL_API_BASE || 'http://localhost:3080/api';

async function apiCall(endpoint, options = {}) {
  const response = await fetch(`${SOUL_API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

module.exports = {
  name: 'memory',
  description: '메모리 및 프로필 관리 도구',
  tools: [
    {
      name: 'recall_memory',
      description: '과거 대화 검색',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '검색 쿼리'
          },
          limit: {
            type: 'number',
            description: '최대 결과 개수 (기본: 5)'
          },
          timeFilter: {
            type: 'string',
            description: '시간 필터 (YYYY-MM-DD 형식)'
          }
        },
        required: ['query']
      },
      handler: async ({ query, limit = 5, timeFilter }) => {
        const params = new URLSearchParams({ query, limit: limit.toString() });
        if (timeFilter) params.append('timeFilter', timeFilter);
        const data = await apiCall(`/memory/search?${params}`);
        return { success: true, results: data.results || [] };
      }
    },
    {
      name: 'get_profile',
      description: '사용자 프로필 조회',
      inputSchema: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            description: '조회할 필드명'
          }
        },
        required: ['field']
      },
      handler: async ({ field }) => {
        const data = await apiCall('/profile');
        return { [field]: data[field] || null };
      }
    },
    {
      name: 'update_profile',
      description: '사용자 프로필 업데이트',
      inputSchema: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            description: '업데이트할 필드명'
          },
          value: {
            type: 'string',
            description: '새로운 값'
          }
        },
        required: ['field', 'value']
      },
      handler: async ({ field, value }) => {
        await apiCall('/profile', {
          method: 'POST',
          body: JSON.stringify({ [field]: value })
        });
        return { success: true };
      }
    },
    {
      name: 'get_user',
      description: '사용자 정보 조회',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      handler: async () => {
        const data = await apiCall('/user');
        return data;
      }
    },
    {
      name: 'update_user',
      description: '사용자 정보 업데이트',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '사용자 이름'
          },
          email: {
            type: 'string',
            description: '이메일'
          }
        }
      },
      handler: async (params) => {
        await apiCall('/user', {
          method: 'PUT',
          body: JSON.stringify(params)
        });
        return { success: true };
      }
    }
  ]
};
