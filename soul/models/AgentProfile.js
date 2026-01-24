/**
 * AgentProfile Model
 * 에이전트(소울) 프로필을 MongoDB에 저장
 * 서버 재시작해도 설정 유지
 */

const mongoose = require('mongoose');

const personalitySchema = new mongoose.Schema({
  traits: {
    helpful: { type: Number, default: 1.0 },
    professional: { type: Number, default: 0.9 },
    friendly: { type: Number, default: 0.8 },
    precise: { type: Number, default: 0.9 },
    proactive: { type: Number, default: 0.7 },
    empathetic: { type: Number, default: 0.8 }
  },
  communication: {
    formality: { type: Number, default: 0.6 },
    verbosity: { type: Number, default: 0.6 },
    technicality: { type: Number, default: 0.8 },
    directness: { type: Number, default: 0.7 },
    emoji: { type: Number, default: 0.3 },
    humor: { type: Number, default: 0.3 }
  }
}, { _id: false });

const agentProfileSchema = new mongoose.Schema({
  profileId: {
    type: String,
    required: true,
    unique: true,
    default: 'default'
  },
  name: {
    type: String,
    default: 'Soul'
  },
  role: {
    type: String,
    default: 'AI 동반자'
  },
  description: {
    type: String,
    default: '당신의 생각을 이해하고 함께 성장하는 AI 동반자입니다.'
  },
  // AI 동작 설정
  defaultModel: {
    type: String,
    default: ''
  },
  temperature: {
    type: Number,
    default: 0.7
  },
  maxTokens: {
    type: Number,
    default: 4096
  },
  tone: {
    type: String,
    default: 'friendly'
  },
  // 사용자 커스텀 프롬프트 (핵심!)
  customPrompt: {
    type: String,
    default: ''
  },
  personality: {
    type: personalitySchema,
    default: () => ({
      traits: {
        helpful: 1.0,
        professional: 0.9,
        friendly: 0.8,
        precise: 0.9,
        proactive: 0.7,
        empathetic: 0.8
      },
      communication: {
        formality: 0.6,
        verbosity: 0.6,
        technicality: 0.8,
        directness: 0.7,
        emoji: 0.3,
        humor: 0.3
      }
    })
  },
  capabilities: {
    type: [String],
    default: [
      '대화 및 질문 답변',
      '코드 작성 및 디버깅',
      '문서 작성 및 요약',
      '창의적 작업 지원',
      '분석 및 추론',
      '메모리 기반 맥락 이해',
      '자연어 명령 처리'
    ]
  },
  limitations: {
    type: [String],
    default: [
      '실시간 인터넷 접근 불가',
      '외부 API 직접 호출 불가',
      '파일 시스템 직접 접근 제한'
    ]
  },
  guidelines: {
    type: [String],
    default: [
      '사용자를 존중하고 항상 도움이 되는 답변 제공',
      '확실하지 않은 정보는 명확히 표시',
      '윤리적이고 안전한 방식으로 작동',
      '사용자 프라이버시를 최우선으로 보호',
      '건설적이고 긍정적인 태도 유지'
    ]
  }
}, {
  timestamps: true
});

/**
 * 기본 프로필 생성 또는 가져오기
 */
agentProfileSchema.statics.getOrCreateDefault = async function(profileId = 'default') {
  let profile = await this.findOne({ profileId });

  if (!profile) {
    profile = await this.create({
      profileId,
      name: 'Soul',
      role: 'AI 동반자',
      description: '당신의 생각을 이해하고 함께 성장하는 AI 동반자입니다.'
    });
    console.log(`✅ 기본 에이전트 프로필 생성: ${profileId}`);
  }

  return profile;
};

/**
 * 프로필 업데이트
 */
agentProfileSchema.statics.updateProfile = async function(profileId, updates) {
  const profile = await this.findOneAndUpdate(
    { profileId },
    { $set: updates },
    { new: true, upsert: true }
  );
  return profile;
};

module.exports = mongoose.model('AgentProfile', agentProfileSchema);
