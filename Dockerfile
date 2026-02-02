FROM node:20-slim

WORKDIR /app

# 네이티브 모듈 빌드를 위한 패키지 설치
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    libsecret-1-dev \
    && rm -rf /var/lib/apt/lists/*

# client 의존성 설치 및 빌드
COPY --chown=node:node client/package*.json ./client/
RUN cd client && npm install

COPY --chown=node:node client ./client
RUN cd client && npm run build

# soul 폴더의 의존성 설치
COPY --chown=node:node soul/package*.json ./soul/
RUN cd soul && npm install --production --ignore-optional

# soul 소스 복사
COPY --chown=node:node soul ./soul

# 데이터 디렉토리 생성
RUN mkdir -p /home/node/.soul/memory /home/node/.soul/files && chown -R node:node /home/node/.soul

# node 유저로 전환 (UID 1000)
USER node

# 포트 설정 (Hugging Face는 7860 사용)
EXPOSE 7860

# 환경변수
ENV PORT=7860
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"

# 실행
CMD ["node", "soul/server/index.js"]
