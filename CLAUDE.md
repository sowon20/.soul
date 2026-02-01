# Soul AI - 프로젝트 가이드

## 개요
Soul AI는 개인용 AI 어시스턴트 앱입니다. 여러 AI 서비스(Claude, OpenAI, Gemini 등)를 통합하고, 스마트 라우팅으로 복잡도에 따라 적절한 모델을 자동 선택합니다.

## 프로젝트 구조

```
/Volumes/soul/app/
├── client/                 # 프론트엔드 (Vite + Vanilla JS)
│   ├── src/
│   │   ├── main.js        # 메인 채팅 UI (SoulApp 클래스)
│   │   ├── settings/      # 설정 페이지
│   │   │   ├── components/
│   │   │   │   ├── ai-settings.js   # AI 설정 컴포넌트 (4000줄+)
│   │   │   │   ├── profile-settings.js
│   │   │   │   ├── app-settings.js
│   │   │   │   └── theme-settings.js
│   │   │   └── styles/
│   │   │       └── settings.css     # 설정 페이지 스타일
│   │   ├── components/
│   │   │   ├── chat/chat-manager.js     # 채팅 관리
│   │   │   ├── shared/panel-manager.js  # 패널 관리
│   │   │   ├── sidebar/menu-manager.js  # 메뉴 관리
│   │   │   ├── memory/memory-manager.js # 메모리 관리
│   │   │   └── mcp/
│   │   │       ├── mcp-manager.js       # MCP 도구 관리
│   │   │       └── google-home-manager.js
│   │   ├── styles/        # 전역 스타일
│   │   │   ├── chat.css
│   │   │   ├── main.css
│   │   │   ├── themes.css
│   │   │   └── ...
│   │   └── utils/
│   │       ├── api-client.js        # API 클라이언트
│   │       ├── socket-client.js     # WebSocket 클라이언트
│   │       ├── theme-manager.js
│   │       ├── role-manager.js      # 역할(알바) 관리
│   │       ├── search-manager.js
│   │       ├── profile-manager.js
│   │       ├── dashboard-manager.js
│   │       └── ai-service-manager.js
│   └── index.html
│
├── soul/                   # 백엔드 (Express + Socket.io)
│   ├── server/
│   │   └── index.js       # 서버 엔트리포인트 (포트 4000)
│   ├── routes/            # API 라우트
│   │   ├── chat.js        # 채팅 API (핵심)
│   │   ├── chat-simple.js # 간단한 채팅
│   │   ├── ai-services.js # AI 서비스 관리
│   │   ├── ai-models.js   # AI 모델 목록
│   │   ├── profile.js     # 에이전트/라우팅 프로필
│   │   ├── roles.js       # 역할(알바) 관리
│   │   ├── memory.js      # 메모리 API
│   │   ├── memory-advanced.js
│   │   ├── mcp.js         # MCP 도구
│   │   ├── google-home.js # Google Home 연동
│   │   ├── storage.js     # 외부 저장소
│   │   ├── filesystem.js  # 파일시스템
│   │   ├── bootstrap.js   # 초기 설정
│   │   ├── notifications.js
│   │   ├── config.js
│   │   ├── search.js
│   │   ├── context.js
│   │   ├── context-management.js
│   │   ├── nlp.js / nlp-advanced.js
│   │   ├── panel.js
│   │   ├── workers.js
│   │   └── analogy.js
│   ├── models/            # 데이터 모델
│   │   ├── AIService.js   # AI 서비스
│   │   ├── Role.js        # 역할(알바)
│   │   ├── AgentProfile.js # 에이전트 프로필
│   │   ├── Profile.js     # 사용자 프로필
│   │   ├── UserProfile.js
│   │   ├── Memory.js      # 메모리
│   │   ├── Message.js     # 메시지
│   │   ├── SelfRule.js    # 자기학습 규칙
│   │   ├── ScheduledMessage.js # 예약 메시지
│   │   ├── UsageStats.js  # 사용 통계
│   │   ├── SystemConfig.js
│   │   └── APIKey.js
│   ├── utils/             # 유틸리티
│   │   ├── smart-router.js      # 스마트 라우팅 시스템
│   │   ├── personality-core.js  # 단일 인격 시스템
│   │   ├── agent-profile.js     # 에이전트 프로필 관리
│   │   ├── conversation-pipeline.js
│   │   ├── conversation-store.js  # JSONL 대화 저장소
│   │   ├── memory-layers.js
│   │   ├── token-counter.js
│   │   ├── token-safeguard.js
│   │   ├── session-continuity.js
│   │   ├── mcp-tools.js         # MCP 도구 통합
│   │   ├── builtin-tools.js     # 내장 도구
│   │   ├── alba-worker.js       # 알바 워커
│   │   ├── role-selector.js
│   │   ├── proactive-messenger.js # 능동적 메시지
│   │   ├── scheduled-messages.js  # 예약 메시지
│   │   ├── bootstrap.js         # 부트스트랩 설정
│   │   ├── config.js            # 설정 관리자
│   │   ├── search.js
│   │   ├── vector-store.js
│   │   ├── ftp-storage.js       # FTP 저장소
│   │   ├── oracle-storage.js    # Oracle 저장소
│   │   ├── gdrive-storage.js    # Google Drive
│   │   ├── notion-storage.js    # Notion 연동
│   │   └── ...
│   ├── db/                # 데이터베이스 추상화
│   │   ├── index.js       # DB 선택 (SQLite/Oracle)
│   │   ├── sqlite.js      # SQLite 드라이버
│   │   └── oracle.js      # Oracle 드라이버
│   └── config/
│       └── roles.js       # 역할 설정
│
├── data/                  # 로컬 데이터 저장소
└── .env                   # 환경변수
```

## 배포 환경

### Hugging Face Spaces
- Space: `sowon20/soul` (private)
- Docker 기반 배포 (`Dockerfile`)
- 포트: 7860
- 현재 상태: UI 이슈 수정 중
- TODO: Keep-alive 자동화 필요 (30~60초 간격)

### 로컬 LLM (테스트 예정)
- GPT-OSS 20B
- Qwen Embedding 8B
- API 제공: Modal, Lightning AI 등

### Oracle AI 서비스 (무료 활용 예정)
- 음성 (Speech)
- Vision
- 문서 이해 (Document Understanding)
- 디지털 어시스턴트

## 실행 방법

```bash
# 개발 모드 (프론트 + 백엔드 동시 실행)
npm run dev

# 백엔드만
cd soul && npm run dev

# 프론트엔드만
cd client && npm run dev
```

**포트**: 백엔드 4000, 프론트엔드 3000 (Vite 프록시로 /api → localhost:4000)

## 데이터 저장소

### 통합 저장소 시스템
- 사용자는 설정 UI에서 **하나의 저장소**만 선택 (로컬/Oracle/FTP/Notion)
- 내부적으로는 용도별 폴더로 자동 분리 (메모리, 설정, 대화 등)
- 저장 형식: 파일 기반
- **하드코딩 절대 없음** - 모든 경로는 사용자 설정에서 가져옴

### 첨부파일 스토리지
- 대화 중 주고받은 이미지/파일 저장
- 사용자가 설정 UI에서 폴더 지정
- Oracle 스토리지 지원 예정 (TODO)

### 저장소 변경 시 옵션
저장소를 바꾸면 모든 데이터가 함께 이동:
1. **전부 옮기기** - 기존 데이터 전체 이전
2. **새로 만들기** - 빈 상태로 시작
3. **합쳐서 마이그레이션** - 기존 + 새 저장소 데이터 병합

### Oracle 자율운영 DB (이전 예정)
- **인스턴스**: `soul_database`
- **MongoDB 완전 제거 예정** - mongoose 의존성 삭제
- `soul/db/index.js` - DB 추상화 레이어
- `soul/db/oracle.js` - Oracle 드라이버

## 부트스트랩 시스템

앱 첫 실행 시 초기 설정:
1. `GET /api/bootstrap/status` - 설정 완료 여부 확인
2. 미완료 시 설정 페이지로 리다이렉트
3. 저장소 선택 (local, oracle, ftp, notion)
4. `POST /api/bootstrap/complete` - 설정 완료

## 핵심 기능

### 1. AI 서비스 관리
- 여러 AI 서비스(Claude, OpenAI, Gemini, Groq, DeepSeek 등) 지원
- API 키 관리 및 서비스 활성화/비활성화
- 위치: 설정 페이지 상단의 캡슐 UI

### 2. 두뇌(Brain) 설정 - 라우팅 시스템
**위치**: `client/src/settings/components/ai-settings.js`

**두 가지 모드**:
- **단일 모델 (single)**: 하나의 모델만 사용
- **자동 라우팅 (auto)**: 복잡도에 따라 모델 자동 선택
  - **서버 라우팅 (server)**: 백엔드에서 복잡도 분석 후 모델 선택
  - **라우터 AI (ai)**: AI가 직접 라우팅 결정

**자동 라우팅 시 티어별 모델**:
- 경량(light): 간단한 질문용
- 중간(medium): 일반 대화용
- 고성능(heavy): 복잡한 작업용

**UI 흐름** (Brain Wizard):
```
단일모델: 모드선택 → 모델선택 → 확인
자동+서버: 모드선택 → 라우팅방식 → 티어별모델 → 확인
자동+라우터AI: 모드선택 → 라우팅방식 → 라우터모델 → 티어별모델 → 확인
```

### 3. 성격(Personality) 설정
- 프롬프트: AI의 역할과 말투 정의
- 세밀조절 슬라이더:
  - formality (격식)
  - verbosity (말의 길이)
  - humor (유머)
  - empathy (공감)
  - temperature (창의성)

### 4. 역할(알바) 시스템
특정 작업을 위한 전문 AI 역할:
- 번역가, 코드 리뷰어, 문서 작성자 등
- 각 역할별로 별도의 모델 및 프롬프트 설정 가능
- `[DELEGATE:역할ID]` 태그로 작업 위임

### 5. MCP 도구 시스템
- 외부 도구 통합 (Model Context Protocol)
- `soul/utils/mcp-tools.js` - MCP 도구 로더
- `soul/utils/builtin-tools.js` - 내장 도구
- 도구 캐시 (1분 TTL)

### 6. 자기학습 (SelfRule)
- AI가 대화 중 배운 것을 저장
- `[MEMO: 내용]` 태그로 메모 남기기
- 다음 대화에서 컨텍스트로 주입

### 7. 예약/능동 메시지
- `ScheduledMessage` - 예약 메시지
- `ProactiveMessenger` - 능동적 메시지 발송

### 8. 대화 저장 시스템
**위치**: `soul/utils/conversation-store.js`

**저장 구조**:
```
conversations/YYYY-MM/YYYY-MM-DD.json
```

**저장소 지원**:
- 로컬 파일시스템
- FTP 서버
- Oracle DB

**설정**: `SystemConfig.memory` 키에 저장소 설정

### 9. 메모리 계층 시스템
**위치**: `soul/utils/memory-layers.js`

```
단기 (50개) → 중기 (요약) → 장기 (아카이브)
    ↓            ↓             ↓
  즉시참조      세션복원       검색
```

## 데이터 구조

### routingConfig (라우팅 설정)
```javascript
{
  mode: 'single' | 'auto',           // 라우팅 모드
  manager: 'server' | 'ai',          // 자동 라우팅 시 관리자
  managerModel: 'model-id',          // 라우터 AI 모델 (NOT routerModel)
  defaultModel: 'model-id',          // 단일 모델 시 사용
  light: 'model-id',                 // 경량 티어 (NOT lightModel)
  medium: 'model-id',                // 중간 티어 (NOT mediumModel)
  heavy: 'model-id',                 // 고성능 티어 (NOT heavyModel)
  lightThinking: false,
  mediumThinking: false,
  heavyThinking: true,
  confirmed: false                   // 설정 확인 완료 여부
}
```

### agentProfile (에이전트 프로필)
```javascript
{
  name: '',                          // AI 이름
  role: '',                          // AI 역할
  description: '',                   // AI 설명/프롬프트
  formality: 0.5,
  verbosity: 0.5,
  humor: 0.3,
  empathy: 0.6,
  temperature: 0.7,
  maxTokens: 4096
}
```

## UI 컴포넌트

### 설정 페이지 타임라인
세로 타임라인 구조:
1. 정체성 (이름, 역할)
2. 성격 (프롬프트, 세밀조절)
3. 두뇌 (모델 및 라우팅)
4. 기억 (메모리 설정)
5. 역할 (알바 설정)

각 섹션:
- 접힘/펼침 토글
- 진행률 원형 표시 (progress ring)
- 요약 표시

### Brain Wizard (두뇌 설정 UI)
가로 스텝 인디케이터:
- `data-mode`: 'single' | 'auto'
- `data-router`: 'server' | 'ai'
- `data-confirmed`: 'true' | 'false'

CSS로 조건부 패널 표시 제어

## 스타일 가이드

### 디자인 시스템
- 뉴모피즘(Neumorphism) 스타일
- 따뜻한 베이지/브라운 톤
- 부드러운 그림자와 하이라이트

### 색상
- 배경: `rgba(200, 185, 165, x)` 계열
- 텍스트: `rgba(90, 80, 70, x)` 계열
- 강조: `#e8a87c` (주황/살구색)
- 성공: `rgba(90, 140, 110, x)` (녹색)

### 주요 CSS 클래스
- `.timeline-item`: 타임라인 섹션
- `.brain-wizard`: 두뇌 설정 위자드
- `.brain-wizard-card`: 선택 카드
- `.thinking-toggle`: 생각 기능 토글
- `.api-capsule`: API 서비스 캡슐

## API 엔드포인트

### 부트스트랩
- `GET /api/bootstrap/status` - 초기 설정 상태
- `POST /api/bootstrap/complete` - 초기 설정 완료

### 프로필
- `GET/POST /api/profile/agent` - 에이전트 프로필
- `GET/POST /api/profile/routing` - 라우팅 설정

### AI 서비스
- `GET /api/ai-services` - 서비스 목록
- `POST /api/ai-services/:id/toggle` - 서비스 활성화/비활성화
- `POST /api/ai-services/:id/api-key` - API 키 설정
- `GET /api/ai-models` - 사용 가능한 모델 목록

### 채팅
- `POST /api/chat` - 메시지 전송 (스트리밍, 스마트 라우팅)
- `POST /api/chat-simple` - 단순 채팅

### 역할(알바)
- `GET /api/roles` - 역할 목록
- `POST /api/roles` - 역할 생성/수정

### MCP/도구
- `GET /api/mcp/tools` - 도구 목록
- `POST /api/mcp/execute` - 도구 실행

### 저장소
- `GET/POST /api/storage/config` - 저장소 설정
- `/api/filesystem/*` - 파일시스템 작업

## 필드명 주의사항

### routingConfig 필드
- 라우터 모델: `managerModel` (NOT routerModel)
- 티어 모델: `light`, `medium`, `heavy` (NOT lightModel, mediumModel, heavyModel)
- 라우터 타입: HTML value는 'ai', 코드에서는 `manager === 'ai' || manager === 'router'` 둘 다 체크

### 값 체크
- 모델 선택 안 됨 = null (빈 문자열 아님)
- confirmed = true/false

## 스마트 라우팅 동작

`soul/utils/smart-router.js`:

1. **단일 모델 모드** (`mode === 'single'`)
   - `singleModel.modelId` 사용

2. **자동 라우팅** (`mode === 'auto'`)
   - 서버 라우팅: 메시지 복잡도 분석 → 티어 선택
   - AI 라우팅: `managerModel`이 라우팅 결정 (TODO: 실제 AI 호출 미구현)

3. **복잡도 분석 기준**
   - 토큰 수, 코드 여부, 질문 유형 등

## 주의사항

1. `ai-settings.js`는 4000줄+ 대형 파일 - offset/limit으로 부분 읽기 필요
2. 하드코딩된 기본값 없음 - 빈 문자열 또는 null 사용
3. DB는 SQLite (기본) / Oracle (ORACLE_PASSWORD 환경변수 시)
4. Vite 캐시 문제 시: `rm -rf client/node_modules/.vite`
5. WebSocket은 `global.io`로 전역 접근 가능 (도구 실행 상태 전송용)

## 환경변수

```bash
# 필수
PORT=4000

# Oracle DB (선택)
ORACLE_PASSWORD=xxx
ORACLE_USER=ADMIN
ORACLE_CONNECTION_STRING=database_medium
ORACLE_WALLET_DIR=./wallet

# 데이터 경로
SOUL_DATA_DIR=~/.soul

# 디버그
SOUL_DEBUG=true
SOUL_DEBUG_LOG=~/.soul/debug-chat.log
```
