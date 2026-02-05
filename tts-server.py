#!/usr/bin/env python3
"""
Qwen3-TTS 로컬 서버 (mlx-audio 기반)
Fish-Speech API 호환 형태로 제공

실행: source ~/mlx-tts-venv/bin/activate && python tts-server.py
옵션: --ref-audio /path/to/sample.mp3 --ref-text "샘플 텍스트"
"""

import argparse
import io
import json
import time
import os

import numpy as np
import soundfile as sf
from http.server import HTTPServer, BaseHTTPRequestHandler

# 전역 모델 (서버 시작 시 로드)
tts_model = None
ref_audio_path = None
ref_text = None

MODEL_ID = "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit"


def load_model():
    """모델 로드 (최초 1회)"""
    global tts_model

    from mlx_audio.tts.utils import load_model as _load_model
    print(f"[TTS] 모델 로딩: {MODEL_ID}")
    t0 = time.time()
    tts_model = _load_model(model_path=MODEL_ID)
    print(f"[TTS] 모델 로드 완료 ({time.time() - t0:.1f}s)")


def generate_wav(text: str) -> bytes:
    """텍스트 → WAV 바이트"""
    t0 = time.time()

    gen_kwargs = {
        "text": text,
        "verbose": False,
        "speed": 1.0,
        "lang_code": "ko",
    }

    # Voice Clone: ref_audio가 있으면 사용
    if ref_audio_path and os.path.exists(ref_audio_path):
        gen_kwargs["ref_audio"] = ref_audio_path
        if ref_text:
            gen_kwargs["ref_text"] = ref_text

    # Model.generate → GenerationResult 제너레이터
    results = list(tts_model.generate(**gen_kwargs))

    if not results:
        raise RuntimeError("TTS 생성 실패: 결과 없음")

    # GenerationResult에서 오디오 추출
    result = results[0]
    audio_array = np.array(result.audio)
    sample_rate = result.sample_rate if hasattr(result, 'sample_rate') else 24000

    # numpy array → WAV bytes
    buf = io.BytesIO()
    sf.write(buf, audio_array, sample_rate, format='WAV')
    wav_bytes = buf.getvalue()

    elapsed = time.time() - t0
    duration = len(audio_array) / sample_rate
    rtf = duration / elapsed if elapsed > 0 else 0
    print(f"[TTS] \"{text[:40]}\" → {duration:.1f}s audio, {elapsed:.1f}s gen, RTF={rtf:.2f}x")

    return wav_bytes


class TTSHandler(BaseHTTPRequestHandler):
    """HTTP 요청 핸들러"""

    def do_GET(self):
        if self.path == '/v1/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok",
                "model": MODEL_ID,
                "ref_audio": ref_audio_path or None
            }).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/v1/tts':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(content_length)) if content_length else {}

                text = body.get('text', '')
                if not text:
                    self.send_response(400)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(b'{"error": "text required"}')
                    return

                wav_bytes = generate_wav(text)

                self.send_response(200)
                self.send_header('Content-Type', 'audio/wav')
                self.send_header('Content-Length', str(len(wav_bytes)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(wav_bytes)

            except Exception as e:
                print(f"[TTS] 에러: {e}")
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        """CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        pass  # 기본 로그 끔 (generate_wav에서 직접 출력)


def main():
    global ref_audio_path, ref_text

    parser = argparse.ArgumentParser(description='Qwen3-TTS 로컬 서버')
    parser.add_argument('--port', type=int, default=8090, help='서버 포트 (기본: 8090)')
    parser.add_argument('--ref-audio', type=str, help='Voice Clone 참조 오디오 파일 경로')
    parser.add_argument('--ref-text', type=str, help='참조 오디오의 텍스트 (정확할수록 품질 향상)')
    args = parser.parse_args()

    ref_audio_path = args.ref_audio
    ref_text = args.ref_text

    # 모델 로드
    load_model()

    # 서버 시작
    server = HTTPServer(('0.0.0.0', args.port), TTSHandler)
    print(f"[TTS] 서버 시작: http://localhost:{args.port}")
    if ref_audio_path:
        print(f"[TTS] Voice Clone: {ref_audio_path}")
    print(f"[TTS] Health: GET /v1/health")
    print(f"[TTS] Generate: POST /v1/tts {{text: '...'}}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[TTS] 서버 종료")
        server.server_close()


if __name__ == '__main__':
    main()
