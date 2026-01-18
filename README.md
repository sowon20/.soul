# 🌟 Soul Project

> **단일 인격 AI 동반자 시스템** - 완전 재배포 가능한 오픈소스 프로젝트

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4.4%2B-green)](https://www.mongodb.com/)

---

## 📋 개요

Soul Project는 **장기 메모리, 컨텍스트 관리, 자율 학습**을 갖춘 단일 인격 AI 동반자 시스템입니다.

### 핵심 철학

- **단일 인격**: 모드 분리 없이 하나의 복합적이고 유동적인 인격체
- **자연어 제어**: 모든 설정과 기능을 자연어로 제어
- **Anti-템플릿**: 고정된 말투나 템플릿 응답 금지
- **완전 재배포 가능**: 하드코딩 제로, 환경변수로 모든 설정 관리

---

## ✨ 주요 기능

### 📚 메모리 시스템 (Phase 1-3)
- **대화 자동 저장**: Markdown 형식으로 구조화된 대화 저장
- **AI 자동 분류**: 주제, 태그, 카테고리, 중요도 자동 추출
- **지능형 검색**: 자연어 쿼리, 시간 추론, 맥락 기반 검색
- **관계 그래프**: 대화 간 연결 관계 시각화
- **추천 시스템**: "이것도 볼래?" 스타일 추천

### 🧠 자율 기억 (Phase 4)
- **맥락 감지**: 대화 중 관련 주제 자동 감지
- **자동 메모리 주입**: "저번에 얘기했던..." 자연스러운 참조
- **비유/연결**: 과거 대화에서 비슷한 패턴 찾기
- **스팸 방지**: 과도한 메모리 주입 방지

### 🎛️ 컨텍스트 관리 (Phase 5)
- **토큰 모니터링**: 실시간 컨텍스트 사용량 추적
- **자동 압축**: 80% 경고, 90% 자동 압축
- **세션 연속성**: 대화 중단/재개 완벽 처리
- **무한 메모리**: 토큰 제한 극복한 연속 대화

### 🗣️ 자연어 제어 (Week 1)
- **의도 감지**: 14가지 의도 자동 인식
- **패턴 매칭**: 21개 패턴으로 명령 이해
- **엔티티 추출**: 숫자, 날짜, 시간, 설정값 자동 추출
- **액션 제안**: 감지된 의도에 따른 액션 자동 제안
- **신뢰도 기반 실행**: 70% 이상 신뢰도에서 자동 실행

### 🤖 스마트 라우팅 (Planned)
- **자동 모델 선택**: 작업에 맞는 최적 모델 자동 선택
- **다중 AI 제공사**: Anthropic, OpenAI, Google, Ollama 지원
- **Fallback 체인**: 1순위 실패 시 2순위 자동 시도

---

## 🚀 빠른 시작

### 필수 요구사항

- **Node.js** 18.0.0 이상
- **MongoDB** 4.4 이상 (또는 Docker)
- **AI API 키** (최소 1개):
  - Anthropic (Claude) - 추천
  - OpenAI (GPT)
  - Google (Gemini)
  - Ollama (로컬 모델)

### 설치

```bash
# 1. 저장소 클론
git clone https://github.com/YOUR_USERNAME/soul.git
cd soul

# 2. 설치 스크립트 실행
chmod +x install.sh
./install.sh
```

설치 스크립트가 자동으로:
- 디렉토리 구조 생성
- 의존성 설치
- 환경변수 파일 생성
- MongoDB 연결 테스트
- 서버 헬스 체크

### 환경변수 설정

`.env` 파일을 편집하여 다음 값을 설정하세요:

```bash
# MongoDB
MONGODB_URI=mongodb://localhost:27017/soul

# AI Services (최소 1개 필요)
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Server
PORT=3080
```

### 서버 시작

```bash
# 개발 모드
cd soul
node server/index.js

# 또는 pm2로 프로덕션 실행
pm2 start soul/server/index.js --name soul-server
```

---

## 📖 사용법

### API 테스트

```bash
# 헬스 체크
curl http://localhost:3080/api/health

# 전체 API 테스트
cd soul
./test-all-apis.sh
```

### API 사용 예시

#### 1. 대화 저장

```bash
curl -X POST http://localhost:3080/api/memory/archive \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "main-conversation",
    "messages": [
      {"role": "user", "content": "React 시작하는 방법"},
      {"role": "assistant", "content": "React 프로젝트를 시작하려면..."}
    ],
    "autoAnalyze": true
  }'
```

#### 2. 스마트 검색

```bash
curl -X POST http://localhost:3080/api/search/smart \
  -H "Content-Type: application/json" \
  -d '{"query": "최근 개발 관련 중요한 대화"}'
```

#### 3. 맥락 감지

```bash
curl -X POST http://localhost:3080/api/context/detect \
  -H "Content-Type: application/json" \
  -d '{"message": "저번에 얘기했던 React 프로젝트"}'
```

---

## 🏗️ 프로젝트 구조

```
soul/
├── soul/                   # 백엔드
│   ├── server/            # Express 서버
│   ├── routes/            # API 라우트 (40개 엔드포인트)
│   └── utils/             # 유틸리티
├── mcp/                   # MCP 서버
│   ├── hub-server.js      # MCP 허브 서버
│   ├── tools/             # MCP 도구 (10개)
│   └── example-client.js  # 클라이언트 예제
├── memory/                # 메모리 저장소
│   ├── raw/              # 원본 대화 (Markdown)
│   └── index.json        # 메타데이터 인덱스
├── files/                # 파일 저장소
├── .env.example          # 환경변수 템플릿
├── install.sh            # 설치 스크립트
└── README.md             # 이 파일
```

---

## 📚 문서

- [API Reference](soul/API_REFERENCE.md) - 40개 API 엔드포인트 문서
- [Context Detection](soul/CONTEXT_DETECTION.md) - 맥락 감지 시스템
- [Analogy System](soul/ANALOGY_SYSTEM.md) - 비유/연결 시스템
- [NLP System](soul/NLP_SYSTEM.md) - 자연어 제어 시스템
- [MCP Server](mcp/README.md) - Model Context Protocol 서버 (10개 도구)
- [TODO](TODO.md) - 개발 계획 및 진행 상황

---

## 🎯 로드맵

### ✅ 완료 (Phase 1-5, Week 1)
- [x] 메모리 저장 시스템
- [x] AI 자동 분류
- [x] 검색 시스템 (기본/스마트/관계)
- [x] 맥락 감지 & 비유/연결
- [x] 컨텍스트 관리 & 자동 압축
- [x] 자연어 제어 (14개 의도, 21개 패턴)
- [x] MCP 서버 (10개 도구)
- [x] 코드 감사 & 클린업
- [x] 설치 자동화 (install.sh)

### 🚧 진행 중 (Week 1)
- [ ] UI 통합 (Phase 9)
- [ ] 패널 시스템

### 📅 예정 (Week 2-3)
- [ ] 메모리 고도화
- [ ] Proactive Messaging
- [ ] 배포 준비

자세한 로드맵은 [TODO.md](TODO.md)를 참고하세요.

---

## 🛠️ 기술 스택

- **Node.js** + Express
- **MongoDB** + Mongoose
- **AI Services**: Anthropic, OpenAI, Google, Ollama
- **Features**: 토큰 카운팅, 컨텍스트 압축, 맥락 감지, 비유 검색

---

## ❓ FAQ

**Q: API 키는 어디서 받나요?**
- Anthropic: https://console.anthropic.com/
- OpenAI: https://platform.openai.com/
- Google: https://ai.google.dev/

**Q: MongoDB 설치가 필요한가요?**
Docker 사용 권장:
```bash
docker run -d --name soul-mongodb -p 27017:27017 mongo:7
```

**Q: 로컬 모델만 사용 가능한가요?**
네, Ollama를 설치하고 `.env`에서 설정하세요.

---

## 📄 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능

---

## 🙏 감사의 글

- [LibreChat](https://github.com/danny-avila/LibreChat) - 초기 영감
- [Anthropic](https://www.anthropic.com/) - Claude API
- [OpenAI](https://openai.com/) - GPT API

---

**Made with ❤️ for AI companions**

**Version**: 1.0.0
**Last Updated**: 2026-01-18
