/**
 * SelfRule Model
 * AI가 스스로 학습한 규칙/메모 저장
 *
 * 대화 중 [MEMO: ...] 태그로 저장되는 내면 성찰 데이터
 */

const mongoose = require('mongoose');

const selfRuleSchema = new mongoose.Schema({
  // 규칙/메모 내용
  rule: {
    type: String,
    required: true
  },

  // 카테고리
  category: {
    type: String,
    enum: ['general', 'coding', 'system', 'user', 'personality'],
    default: 'general',
    index: true
  },

  // 우선순위 (높을수록 중요)
  priority: {
    type: Number,
    default: 5,
    min: 1,
    max: 10,
    index: true
  },

  // 토큰 수 (컨텍스트 관리용)
  tokenCount: {
    type: Number,
    default: 0
  },

  // 생성 맥락
  context: {
    type: String,
    default: ''
  },

  // 활성 상태
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  // 사용 통계
  useCount: {
    type: Number,
    default: 0
  },

  lastUsed: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// 복합 인덱스
selfRuleSchema.index({ isActive: 1, priority: -1, useCount: -1 });

module.exports = mongoose.model('SelfRule', selfRuleSchema);
