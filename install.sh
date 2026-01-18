#!/bin/bash

# Soul Project - 설치 스크립트
# 완전 재배포 가능한 설치 프로세스

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# 헤더
clear
echo ""
echo -e "${YELLOW}╔════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║         Soul Project - 설치 스크립트            ║${NC}"
echo -e "${YELLOW}║      완전 재배포 가능한 AI 동반자 시스템       ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════╝${NC}"
echo ""

# 0. 시스템 요구사항 체크
log_section "0. 시스템 요구사항 확인"

# Node.js 체크
if ! command -v node &> /dev/null; then
    log_error "Node.js가 설치되어 있지 않습니다."
    log_info "Node.js 18+ 설치가 필요합니다: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Node.js 버전이 너무 낮습니다 (현재: v$NODE_VERSION)"
    log_info "Node.js 18 이상이 필요합니다."
    exit 1
fi
log_success "Node.js $(node -v) 확인"

# npm 체크
if ! command -v npm &> /dev/null; then
    log_error "npm이 설치되어 있지 않습니다."
    exit 1
fi
log_success "npm $(npm -v) 확인"

# MongoDB 체크 (선택)
if command -v mongod &> /dev/null; then
    log_success "MongoDB 설치 확인"
elif command -v docker &> /dev/null; then
    log_success "Docker 설치 확인 (MongoDB 컨테이너 사용 가능)"
else
    log_warn "MongoDB 또는 Docker가 설치되어 있지 않습니다."
    log_info "MongoDB 설치 또는 Docker를 사용하여 MongoDB 컨테이너를 실행하세요."
fi

# 1. 디렉토리 구조 생성
log_section "1. 디렉토리 구조 생성"

INSTALL_DIR=$(pwd)
log_info "설치 경로: $INSTALL_DIR"

# 필수 디렉토리 생성
mkdir -p memory/raw
mkdir -p memory/processed
mkdir -p files/uploads
mkdir -p files/processed
mkdir -p mcp/tools

log_success "디렉토리 구조 생성 완료"

# 2. 환경변수 설정
log_section "2. 환경변수 설정"

if [ ! -f .env ]; then
    log_info ".env 파일이 없습니다. .env.example을 복사합니다."
    cp .env.example .env
    log_success ".env 파일 생성 완료"

    log_warn "중요: .env 파일을 편집하여 다음 값을 설정하세요:"
    echo ""
    echo "  1. MONGODB_URI - MongoDB 연결 주소"
    echo "  2. ANTHROPIC_API_KEY - Anthropic (Claude) API 키"
    echo "  3. OPENAI_API_KEY - OpenAI (GPT) API 키 (선택)"
    echo "  4. GOOGLE_API_KEY - Google (Gemini) API 키 (선택)"
    echo "  5. JWT_SECRET - JWT 비밀키 (랜덤 문자열)"
    echo ""

    read -p "지금 .env 파일을 편집하시겠습니까? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ${EDITOR:-nano} .env
    else
        log_warn ".env 파일을 나중에 반드시 편집하세요!"
    fi
else
    log_success ".env 파일이 이미 존재합니다."
fi

# 3. 의존성 설치
log_section "3. 의존성 설치"

log_info "npm 패키지 설치 중..."
npm install

log_success "의존성 설치 완료"

# 4. 메모리 인덱스 초기화
log_section "4. 메모리 시스템 초기화"

if [ ! -f memory/index.json ]; then
    log_info "memory/index.json 초기화 중..."
    echo '{"conversations":[]}' > memory/index.json
    log_success "메모리 인덱스 생성 완료"
else
    log_success "메모리 인덱스가 이미 존재합니다."
fi

if [ ! -f files/index.json ]; then
    log_info "files/index.json 초기화 중..."
    echo '{"files":[]}' > files/index.json
    log_success "파일 인덱스 생성 완료"
else
    log_success "파일 인덱스가 이미 존재합니다."
fi

# 5. MongoDB 연결 테스트
log_section "5. MongoDB 연결 테스트"

# .env에서 MONGODB_URI 읽기
source .env

if [ -z "$MONGODB_URI" ] || [ "$MONGODB_URI" = "mongodb://localhost:27017/soul" ]; then
    log_warn "MONGODB_URI가 기본값입니다. MongoDB 연결을 확인하세요."

    # Docker로 MongoDB 실행 제안
    if command -v docker &> /dev/null; then
        echo ""
        log_info "Docker로 MongoDB를 실행하시겠습니까?"
        echo "  명령어: docker run -d --name soul-mongodb -p 27017:27017 mongo:7"
        echo ""
        read -p "지금 실행하시겠습니까? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker run -d --name soul-mongodb -p 27017:27017 mongo:7
            log_success "MongoDB 컨테이너 실행 완료"
            sleep 3
        fi
    fi
fi

# MongoDB 연결 테스트 (간단한 체크)
log_info "MongoDB 연결 테스트 중..."
node -e "
const mongoose = require('mongoose');
mongoose.connect('$MONGODB_URI', { serverSelectionTimeoutMS: 3000 })
  .then(() => { console.log('✓ MongoDB 연결 성공'); mongoose.connection.close(); })
  .catch((err) => { console.log('✗ MongoDB 연결 실패:', err.message); process.exit(0); });
" || log_warn "MongoDB 연결 실패. 서버 시작 후 연결을 확인하세요."

# 6. 서버 테스트 실행
log_section "6. 서버 테스트 실행"

log_info "서버를 테스트 모드로 실행합니다..."
log_info "Ctrl+C를 눌러 종료할 수 있습니다."
echo ""

# 3초 대기
sleep 1

# 서버 시작 (백그라운드)
node soul/server/index.js &
SERVER_PID=$!

log_info "서버 PID: $SERVER_PID"
sleep 3

# 헬스 체크
if curl -s http://localhost:${PORT:-3080}/api/health | grep -q "ok"; then
    log_success "서버 헬스 체크 성공!"
else
    log_error "서버 헬스 체크 실패"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# 서버 종료
kill $SERVER_PID 2>/dev/null
log_info "테스트 서버 종료"

# 7. 완료
log_section "7. 설치 완료"

log_success "Soul Project 설치가 완료되었습니다!"
echo ""
echo -e "${GREEN}다음 단계:${NC}"
echo ""
echo "  1. 환경변수 설정 확인:"
echo "     ${CYAN}nano .env${NC}"
echo ""
echo "  2. 서버 시작:"
echo "     ${CYAN}cd soul && node server/index.js${NC}"
echo ""
echo "  3. API 테스트:"
echo "     ${CYAN}./soul/test-all-apis.sh${NC}"
echo ""
echo "  4. 브라우저에서 접속:"
echo "     ${CYAN}http://localhost:${PORT:-3080}${NC}"
echo ""
echo -e "${YELLOW}중요:${NC}"
echo "  - .env 파일에 API 키를 설정하세요"
echo "  - MongoDB가 실행 중인지 확인하세요"
echo "  - 첫 실행 시 관리자 계정을 생성하세요"
echo ""
log_success "Happy coding! 🌟"
echo ""
