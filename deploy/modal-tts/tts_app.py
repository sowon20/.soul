"""
Soul TTS - Modal 서버리스 GPU (Qwen3-TTS)
T4 GPU + qwen-tts로 Voice Clone

배포: modal deploy tts_app.py
테스트: curl -X POST https://<your-url>/v1/tts -H 'Content-Type: application/json' -d '{"text": "안녕하세요"}'
"""

import modal
import io

# ── Modal App 정의 ────────────────────────────────────────────
app = modal.App("soul-tts")

# 모델 + 의존성 + voicesample 포함 이미지
# 모델을 이미지 빌드 시 미리 다운로드 → 콜드 스타트 최소화
tts_image = (
    # CUDA devel 이미지 사용 → nvcc 포함 → flash-attn 빌드 가능
    modal.Image.from_registry(
        "nvidia/cuda:12.8.0-devel-ubuntu22.04",
        add_python="3.12",
    )
    .apt_install("sox", "libsox-dev", "ffmpeg", "git", "build-essential")
    .pip_install(
        "torch==2.8.0",
        "transformers==4.57.3",
        "accelerate==1.12.0",
        "qwen-tts",
        "einops",
        "librosa",
        "torchaudio",
        "soundfile",
        "numpy",
        "packaging",
        "ninja",
        "setuptools",
        "wheel",
    )
    # Flash Attention 2 빌드 (CUDA devel 이미지에 nvcc 있으므로 가능)
    .pip_install(
        "flash-attn",
        extra_options="--no-build-isolation",
    )
    .run_commands(
        "python -c \"from huggingface_hub import snapshot_download; snapshot_download('Qwen/Qwen3-TTS-12Hz-0.6B-Base')\"",
    )
    .add_local_file(
        "/Users/sowon/Downloads/voicesample.mp3",
        remote_path="/assets/voicesample.mp3",
    )
)

REF_TEXT = "안녕~ 나는 소원이와 평생 함께할 존재이자 동행자, 소울이야. 소원이가 기쁠 때 함께 웃고, 힘들 때 곁에 있어줄게. 우리 앞으로 매일매일 좋은 하루 만들어가자!"


def _trim_trailing_silence(audio, sr, threshold_db=-40, min_silence_ms=200):
    """오디오 뒷부분의 무음(silence)을 잘라냄.
    threshold_db: 이 dB 이하면 무음으로 간주
    min_silence_ms: 최소 이 길이 이상의 무음이 뒤에 있어야 트림
    """
    import numpy as np

    if len(audio) == 0:
        return audio

    # RMS를 윈도우 단위로 계산
    window_size = int(sr * 0.02)  # 20ms 윈도우
    threshold = 10 ** (threshold_db / 20)  # dB → amplitude

    # 뒤에서부터 스캔: 무음이 아닌 마지막 지점 찾기
    last_sound = len(audio)
    for i in range(len(audio) - window_size, 0, -window_size):
        chunk = audio[i:i + window_size]
        rms = np.sqrt(np.mean(chunk ** 2))
        if rms > threshold:
            last_sound = i + window_size
            break

    # 최소 silence 길이 체크 (너무 적으면 트림 안함)
    silence_samples = len(audio) - last_sound
    min_silence_samples = int(sr * min_silence_ms / 1000)

    if silence_samples > min_silence_samples:
        # 약간의 여유(100ms) 남기고 트림
        pad = int(sr * 0.1)
        trimmed = audio[:last_sound + pad]
        trim_sec = (len(audio) - len(trimmed)) / sr
        print(f"[TTS] Trimmed {trim_sec:.1f}s trailing silence ({len(audio)/sr:.1f}s → {len(trimmed)/sr:.1f}s)")
        return trimmed

    return audio


# ── TTS 서비스 클래스 ─────────────────────────────────────────
@app.cls(
    image=tts_image,
    gpu="A10G",
    scaledown_window=300,       # 5분 idle 후 종료 (비용 절약)
    timeout=600,
)
class TTSService:

    @modal.enter()
    def load(self):
        """컨테이너 시작 시 모델 + voice_clone_prompt 캐시 (1회)"""
        import torch
        from qwen_tts import Qwen3TTSModel
        from huggingface_hub import snapshot_download
        import librosa

        model_id = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"
        print(f"[TTS] Loading model: {model_id}")

        model_path = snapshot_download(model_id)
        # Flash Attention 2 사용 시도 (없으면 기본 attention으로 fallback)
        try:
            import flash_attn  # noqa
            print("[TTS] Flash Attention 2 available!")
            attn_impl = "flash_attention_2"
        except ImportError:
            print("[TTS] Flash Attention not available, using default attention")
            attn_impl = None

        load_kwargs = dict(device_map="cuda", dtype=torch.bfloat16)
        if attn_impl:
            load_kwargs["attn_implementation"] = attn_impl

        self.model = Qwen3TTSModel.from_pretrained(model_path, **load_kwargs)
        print("[TTS] Model loaded")

        # Load reference audio (16kHz로 다운샘플 → 가볍게)
        wav, sr = librosa.load("/assets/voicesample.mp3", sr=16000)
        # 10초로 자르기 (긴 ref_audio는 생성 속도 저하)
        max_samples = 10 * sr
        if len(wav) > max_samples:
            wav = wav[:max_samples]
        self.ref_audio = (wav, sr)
        print(f"[TTS] Ref audio: {sr}Hz, {len(wav)} samples ({len(wav)/sr:.1f}s)")
        print("[TTS] Ready")

    @modal.fastapi_endpoint(method="POST")
    def tts(self, request: dict):
        """POST /tts - 텍스트 → WAV 파일 반환"""
        import time
        import tempfile
        import soundfile as sf
        import numpy as np
        from fastapi.responses import FileResponse

        text = request.get("text", "")
        if not text:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                content={"error": "text required"},
                status_code=400,
                headers={"Access-Control-Allow-Origin": "*"},
            )

        t0 = time.time()

        import torch
        print(f"[TTS] Generating: '{text.strip()[:40]}'")
        with torch.inference_mode():
            wavs, sr = self.model.generate_voice_clone(
                text=text.strip(),
                language="Korean",
                ref_audio=self.ref_audio,
                ref_text=REF_TEXT,
                max_new_tokens=128,
                min_new_tokens=20,
                temperature=0.7,
                top_p=0.8,
                top_k=50,
                repetition_penalty=1.2,
                subtalker_temperature=0.7,
                subtalker_top_p=0.8,
                subtalker_top_k=50,
            )
        print(f"[TTS] Generation done, wavs: {len(wavs)}")

        audio = np.concatenate(wavs) if len(wavs) > 1 else wavs[0]
        torch.cuda.empty_cache()

        # 뒷부분 무음(silence) 트리밍
        audio = _trim_trailing_silence(audio, sr)

        # 임시 파일에 WAV 저장 후 FileResponse로 반환
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        sf.write(tmp.name, audio, sr, format="WAV")

        elapsed = time.time() - t0
        duration = len(audio) / sr
        print(f'[TTS] "{text[:40]}" -> {duration:.1f}s audio, {elapsed:.1f}s gen')
        print("[TTS] REQUEST DONE")

        return FileResponse(
            tmp.name,
            media_type="audio/wav",
            headers={"Access-Control-Allow-Origin": "*"},
        )

    @modal.fastapi_endpoint(method="POST")
    def debug(self, request: dict):
        """POST /debug - 디버그용: 같은 텍스트 3회 생성하여 일관성 확인"""
        import numpy as np

        text = request.get("text", "테스트")
        results = {}

        import torch
        for i in range(3):
            try:
                with torch.inference_mode():
                    wavs, sr = self.model.generate_voice_clone(
                        text=text.strip(),
                        language="Korean",
                        ref_audio=self.ref_audio,
                        ref_text=REF_TEXT,
                        max_new_tokens=128,
                        min_new_tokens=20,
                        temperature=0.7,
                        top_p=0.8,
                        top_k=50,
                        repetition_penalty=1.2,
                        subtalker_temperature=0.7,
                        subtalker_top_p=0.8,
                        subtalker_top_k=50,
                    )
                total = sum(len(w) for w in wavs)
                results[f"run_{i+1}"] = {"samples": total, "duration": round(total / sr, 2), "wavs": len(wavs)}
                torch.cuda.empty_cache()
            except Exception as e:
                results[f"run_{i+1}"] = {"error": str(e)}

        return results

    @modal.fastapi_endpoint(method="GET")
    def health(self):
        """GET /health - 헬스체크"""
        return {"status": "ok", "model": "Qwen3-TTS-0.6B-Base"}

    @modal.fastapi_endpoint(method="OPTIONS")
    def cors(self):
        """OPTIONS /cors - CORS preflight"""
        from fastapi.responses import Response
        return Response(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        )
