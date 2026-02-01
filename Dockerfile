FROM node:18-slim

WORKDIR /app

# 네이티브 모듈 빌드를 위한 패키지 설치
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libsecret-1-dev \
    && rm -rf /var/lib/apt/lists/*

# soul 폴더의 의존성 설치
COPY soul/package*.json ./soul/
RUN cd soul && npm install --production

# 전체 소스 복사 (client + soul)
COPY client ./client
COPY soul ./soul

# 포트 설정
EXPOSE 8080

# 환경변수
ENV PORT=8080
ENV NODE_ENV=production

# 실행 (soul 폴더 안의 서버)
CMD ["node", "soul/server/index.js"]
