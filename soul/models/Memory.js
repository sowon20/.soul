/**
 * Memory Model
 * 장기 메모리 저장소
 *
 * 사용자 선호도, 대화 맥락, 학습한 패턴 저장
 */

const mongoose = require('mongoose');

const memorySchema = new mongoose.Schema({
  // 메모리 타입
  type: {
    type: String,
    enum: ['preference', 'context', 'fact', 'pattern', 'conversation'],
    required: true,
    index: true
  },

  // 메모리 키 (빠른 검색용)
  key: {
    type: String,
    required: true,
    index: true
  },

  // 메모리 값
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  // 메타데이터
  metadata: {
    userId: String,
    conversationId: String,
    source: String, // 메모리 출처
    importance: {
      type: Number,
      default: 1,
      min: 1,
      max: 10
    },
    tags: [String]
  },

  // 사용 통계
  stats: {
    accessCount: {
      type: Number,
      default: 0
    },
    lastAccessed: Date,
    createdAt: Date,
    updatedAt: Date
  },

  // 만료 설정
  expiresAt: Date
}, {
  timestamps: true
});

// 인덱스
memorySchema.index({ type: 1, key: 1 });
memorySchema.index({ 'metadata.userId': 1, type: 1 });
memorySchema.index({ 'metadata.conversationId': 1 });
memorySchema.index({ 'metadata.importance': -1 });
memorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL 인덱스

// 메서드: 접근 기록
memorySchema.methods.recordAccess = async function() {
  this.stats.accessCount += 1;
  this.stats.lastAccessed = new Date();
  await this.save();
};

// 메서드: 중요도 증가
memorySchema.methods.increaseImportance = async function(amount = 1) {
  this.metadata.importance = Math.min(10, this.metadata.importance + amount);
  await this.save();
};

// 스태틱 메서드: 타입별 메모리 조회
memorySchema.statics.findByType = async function(type, limit = 100) {
  return this.find({ type })
    .sort({ 'metadata.importance': -1, 'stats.lastAccessed': -1 })
    .limit(limit);
};

// 스태틱 메서드: 사용자별 메모리 조회
memorySchema.statics.findByUser = async function(userId, type = null) {
  const query = { 'metadata.userId': userId };
  if (type) query.type = type;

  return this.find(query)
    .sort({ 'metadata.importance': -1, updatedAt: -1 })
    .limit(100);
};

// 스태틱 메서드: 대화별 메모리 조회
memorySchema.statics.findByConversation = async function(conversationId) {
  return this.find({ 'metadata.conversationId': conversationId })
    .sort({ createdAt: 1 });
};

// 스태틱 메서드: 키로 메모리 조회 또는 생성
memorySchema.statics.upsert = async function(type, key, value, metadata = {}) {
  return this.findOneAndUpdate(
    { type, key },
    {
      $set: {
        value,
        metadata: {
          ...metadata,
          importance: metadata.importance || 1
        },
        'stats.lastAccessed': new Date()
      },
      $inc: {
        'stats.accessCount': 1
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );
};

// 스태틱 메서드: 중요한 메모리만 조회
memorySchema.statics.findImportant = async function(minImportance = 5, limit = 50) {
  return this.find({ 'metadata.importance': { $gte: minImportance } })
    .sort({ 'metadata.importance': -1, 'stats.lastAccessed': -1 })
    .limit(limit);
};

const Memory = mongoose.model('Memory', memorySchema);

module.exports = Memory;
