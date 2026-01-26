/**
 * SelfRule - Soul 자기학습 규칙
 * 대화하면서 스스로 배운 것을 규칙으로 저장
 */
const mongoose = require('mongoose');

const selfRuleSchema = new mongoose.Schema({
  // 규칙 내용
  rule: {
    type: String,
    required: true
  },
  
  // 카테고리 (상황별 로드용)
  category: {
    type: String,
    enum: ['system', 'coding', 'daily', 'personality', 'user', 'general'],
    default: 'general'
  },
  
  // 중요도 (1-10, 높을수록 우선)
  priority: {
    type: Number,
    default: 5,
    min: 1,
    max: 10
  },
  
  // 사용 횟수 (자주 쓰이면 중요)
  useCount: {
    type: Number,
    default: 0
  },
  
  // 마지막 사용 시간
  lastUsed: {
    type: Date,
    default: null
  },
  
  // 활성 상태 (false면 아카이브)
  isActive: {
    type: Boolean,
    default: true
  },
  
  // 생성 맥락 (어떤 상황에서 배웠는지)
  context: {
    type: String,
    default: null
  },
  
  // 토큰 수 (압축 관리용)
  tokenCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// 인덱스
selfRuleSchema.index({ category: 1, isActive: 1 });
selfRuleSchema.index({ priority: -1 });
selfRuleSchema.index({ lastUsed: -1 });
selfRuleSchema.index({ useCount: -1 });

module.exports = mongoose.model('SelfRule', selfRuleSchema);
