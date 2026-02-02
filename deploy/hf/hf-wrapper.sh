#!/bin/bash
# HuggingFace Spaces 전용 래퍼 스크립트
# 서버 시작 전 Dataset에서 복원, 종료 시 백업

set -e

DATA_DIR="${SOUL_DATA_DIR:-/home/node/.soul}"
REPO_ID="${HF_DATASET_REPO:-sowon20/dataset}"
WALLET_DIR="/app/soul/config/oracle"

# Dataset에서 데이터 복원 (Python 사용)
restore_data() {
    echo "[HF-Wrapper] Restoring data from dataset: $REPO_ID"
    echo "[HF-Wrapper] HF_TOKEN set: $([ -n "$HF_TOKEN" ] && echo 'yes' || echo 'no')"
    mkdir -p "$DATA_DIR"
    mkdir -p "$WALLET_DIR"

    # Python으로 Dataset 다운로드
    echo "[HF-Wrapper] Downloading from dataset..."
    python3 << EOF
import os
from huggingface_hub import snapshot_download, login

token = os.environ.get('HF_TOKEN')
if token:
    login(token=token)

try:
    snapshot_download(
        repo_id="$REPO_ID",
        repo_type="dataset",
        local_dir="$DATA_DIR"
    )
    print("[HF-Wrapper] Download successful")
except Exception as e:
    print(f"[HF-Wrapper] Download error: {e}")
    exit(1)
EOF

    if [ $? -eq 0 ]; then
        echo "[HF-Wrapper] Data restored successfully"
        echo "[HF-Wrapper] Downloaded files:"
        ls -la "$DATA_DIR"

        # Oracle Wallet zip 파일이 있으면 압축 해제
        if [ -f "$DATA_DIR/Wallet_database.zip" ]; then
            echo "[HF-Wrapper] Extracting Oracle Wallet from zip..."
            unzip -o "$DATA_DIR/Wallet_database.zip" -d "$WALLET_DIR/"
            echo "[HF-Wrapper] Oracle Wallet extracted to $WALLET_DIR"
            echo "[HF-Wrapper] Wallet files:"
            ls -la "$WALLET_DIR"
        # 기존 폴더 방식도 지원 (하위 호환)
        elif [ -d "$DATA_DIR/oracle-wallet" ]; then
            echo "[HF-Wrapper] Restoring Oracle Wallet from folder..."
            cp -r "$DATA_DIR/oracle-wallet/"* "$WALLET_DIR/" 2>/dev/null || true
            echo "[HF-Wrapper] Oracle Wallet restored to $WALLET_DIR"
        else
            echo "[HF-Wrapper] WARNING: No Wallet_database.zip or oracle-wallet folder found!"
        fi
    else
        echo "[HF-Wrapper] Download failed, starting fresh"
    fi
}

# Dataset으로 백업 (Python 사용)
backup_data() {
    echo "[HF-Wrapper] Backing up data to dataset..."

    # Oracle Wallet 파일이 있으면 백업 폴더에 복사
    if [ -d "$WALLET_DIR" ] && [ "$(ls -A $WALLET_DIR 2>/dev/null)" ]; then
        echo "[HF-Wrapper] Including Oracle Wallet in backup..."
        mkdir -p "$DATA_DIR/oracle-wallet"
        cp -r "$WALLET_DIR/"* "$DATA_DIR/oracle-wallet/" 2>/dev/null || true
    fi

    if [ -f "$DATA_DIR/soul.db" ] || [ -d "$DATA_DIR/oracle-wallet" ]; then
        python3 << EOF
import os
from huggingface_hub import HfApi, login

token = os.environ.get('HF_TOKEN')
if token:
    login(token=token)
    api = HfApi()
    try:
        api.upload_folder(
            folder_path="$DATA_DIR",
            repo_id="$REPO_ID",
            repo_type="dataset",
            commit_message="Auto backup"
        )
        print("[HF-Wrapper] Backup successful")
    except Exception as e:
        print(f"[HF-Wrapper] Backup error: {e}")
else:
    print("[HF-Wrapper] No HF_TOKEN, skipping backup")
EOF
        echo "[HF-Wrapper] Backup complete"
    else
        echo "[HF-Wrapper] No data to backup"
    fi
}

# 시그널 핸들러 (종료 시 백업)
cleanup() {
    echo "[HF-Wrapper] Received shutdown signal, backing up..."
    backup_data
    exit 0
}

trap cleanup SIGTERM SIGINT

# 시작 시 복원
restore_data

# 메인 서버 실행
echo "[HF-Wrapper] Starting Soul server..."
node soul/server/index.js &
SERVER_PID=$!

# 주기적 백업 (5분마다)
while true; do
    sleep 300
    backup_data
done &

# 서버 프로세스 대기
wait $SERVER_PID
