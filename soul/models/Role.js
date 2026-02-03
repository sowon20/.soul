/**
 * Role Model
 * 동적 역할 관리 (SQLite)
 */

const { Role } = require('../db/models');

/**
 * 활성 역할 목록
 */
Role.getActiveRoles = async function() {
  return this.find({ isActive: 1 });
};

/**
 * 기본 역할 초기화
 */
Role.initializeDefaultRoles = async function() {
  const db = require('../db');
  if (!db.db) db.init();

  const defaultRoles = [
    {
      roleId: 'digest-worker',
      name: '자동 요약',
      description: '대화를 자동으로 요약하고 중요한 기억을 추출합니다.',
      systemPrompt: '',  // session-digest.js 내부 프롬프트 사용
      preferredModel: 'openai/gpt-oss-20b:free',
      tools: '[]',
      isActive: 1,
      isSystem: 1,
      config: JSON.stringify({
        serviceId: 'openrouter',
        temperature: 0.3,
        maxTokens: 800,
        purpose: 'digest'
      })
    },
    {
      roleId: 'embedding-worker',
      name: '벡터 임베딩',
      description: '다이제스트 결과를 벡터 임베딩하여 의미적 검색을 지원합니다.',
      systemPrompt: '',
      preferredModel: 'qwen/qwen3-embedding-8b',
      tools: '[]',
      isActive: 1,
      isSystem: 1,
      config: JSON.stringify({
        serviceId: 'openrouter',
        purpose: 'embedding'
      })
    }
  ];

  for (const roleData of defaultRoles) {
    const existing = db.Role.findOne({ roleId: roleData.roleId });
    if (!existing) {
      db.Role.create(roleData);
      console.log(`[Role] Created: ${roleData.name}`);
    }
  }
};

module.exports = Role;
