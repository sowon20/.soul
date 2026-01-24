/**
 * Message.js
 * 대화 메시지 MongoDB 모델
 *
 * 서버 재시작 후에도 메시지가 유지되도록 영속 저장
 */

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    default: 'main-conversation',
    index: true
  },
  role: {
    type: String,
    required: true,
    enum: ['user', 'assistant', 'system']
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  tokens: {
    type: Number,
    default: 0
  },
  metadata: {
    modelId: String,
    serviceId: String,
    delegatedRole: String,
    processingTime: Number
  }
}, {
  timestamps: true
});

// 복합 인덱스: 세션별 시간순 조회 최적화
messageSchema.index({ sessionId: 1, timestamp: -1 });

/**
 * 세션의 최근 메시지 조회
 */
messageSchema.statics.getRecentMessages = async function(sessionId, limit = 50) {
  return this.find({ sessionId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean()
    .then(messages => messages.reverse()); // 시간순 정렬
};

/**
 * 세션의 모든 메시지 수 조회
 */
messageSchema.statics.getMessageCount = async function(sessionId) {
  return this.countDocuments({ sessionId });
};

/**
 * 메시지 추가
 */
messageSchema.statics.addMessage = async function(sessionId, message) {
  return this.create({
    sessionId,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp || new Date(),
    tokens: message.tokens || 0,
    metadata: message.metadata || {}
  });
};

/**
 * 세션의 이전 메시지 조회 (페이지네이션)
 */
messageSchema.statics.getMessagesBefore = async function(sessionId, beforeTimestamp, limit = 50) {
  return this.find({
    sessionId,
    timestamp: { $lt: new Date(beforeTimestamp) }
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean()
    .then(messages => messages.reverse());
};

/**
 * 세션 메시지 전체 삭제
 */
messageSchema.statics.clearSession = async function(sessionId) {
  return this.deleteMany({ sessionId });
};

module.exports = mongoose.model('Message', messageSchema);
