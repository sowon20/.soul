/**
 * TTS Manager - Cartesia 음성 출력
 * 백엔드 /api/tts/speak 프록시를 통해 Cartesia API 호출
 * API 키는 백엔드에서 관리 (클라이언트 노출 없음)
 */
export class TTSManager {
  constructor() {
    this.enabled = localStorage.getItem('tts-enabled') === 'true';
    this.audioContext = null;
    this.playing = false;
    this.aborted = false;
    this.currentSource = null;
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('tts-enabled', this.enabled);
    if (!this.enabled) this.stop();
    return this.enabled;
  }

  _cleanText(text) {
    return text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/\{[a-z_]+:.*?\}/gi, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*_~>|]/g, '')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  _ensureAudioContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  _playBuffer(arrayBuffer) {
    return new Promise((resolve, reject) => {
      const ctx = this._ensureAudioContext();
      ctx.decodeAudioData(arrayBuffer.slice(0), (decoded) => {
        if (this.aborted) { resolve(); return; }
        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.connect(ctx.destination);
        this.currentSource = source;
        source.onended = () => {
          this.currentSource = null;
          resolve();
        };
        source.start(0);
      }, (err) => {
        console.warn('[TTS] decodeAudioData 실패:', err);
        resolve();
      });
    });
  }

  async speak(text) {
    if (!this.enabled || !text) return;

    this.stop();
    this.aborted = false;

    const clean = this._cleanText(text);
    if (!clean || clean.length < 3) return;

    this.playing = true;

    try {
      const res = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `TTS 실패: ${res.status}`);
      }

      const wavBuffer = await res.arrayBuffer();
      if (this.aborted || !wavBuffer || wavBuffer.byteLength < 44) return;

      await this._playBuffer(wavBuffer);
    } catch (err) {
      console.warn('[TTS] 재생 실패:', err);
    }

    this.playing = false;
  }

  stop() {
    this.aborted = true;
    this.playing = false;
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch {}
      this.currentSource = null;
    }
  }
}
