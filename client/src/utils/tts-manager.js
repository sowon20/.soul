/**
 * TTS Manager - Fish-Speech 로컬 TTS 연동
 * 텍스트를 문장 단위로 분리 → fish-speech API로 음성 생성 → AudioContext로 순차 재생
 */
export class TTSManager {
  constructor() {
    this.serverUrl = localStorage.getItem('tts-server-url') || 'http://localhost:8080';
    this.referenceId = localStorage.getItem('tts-reference-id') || 'haerin';
    this.enabled = localStorage.getItem('tts-enabled') === 'true';
    this.audioContext = null;
    this.queue = [];       // 재생 대기 큐
    this.playing = false;
    this.aborted = false;
    this.currentSource = null;
    this.available = false; // 서버 연결 상태
    this._checkServer();
  }

  // 서버 연결 확인
  async _checkServer() {
    try {
      const res = await fetch(`${this.serverUrl}/v1/health`, { signal: AbortSignal.timeout(3000) });
      this.available = res.ok;
    } catch {
      this.available = false;
    }
    return this.available;
  }

  // on/off 토글
  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('tts-enabled', this.enabled);
    if (!this.enabled) this.stop();
    return this.enabled;
  }

  // 설정 업데이트
  setServer(url) {
    this.serverUrl = url;
    localStorage.setItem('tts-server-url', url);
    this._checkServer();
  }

  setReference(id) {
    this.referenceId = id;
    localStorage.setItem('tts-reference-id', id);
  }

  // 텍스트 → 문장 분리
  _splitSentences(text) {
    // 마크다운/코드블록/도구 호출 제거
    let clean = text
      .replace(/```[\s\S]*?```/g, '')           // 코드블록
      .replace(/`[^`]+`/g, '')                   // 인라인 코드
      .replace(/\{[a-z_]+:.*?\}/gi, '')          // {recall_memory: ...} 도구 호출
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')   // 링크 → 텍스트만
      .replace(/[#*_~>|]/g, '')                   // 마크다운 기호
      .replace(/\n{2,}/g, '\n')                   // 여러 줄바꿈 → 하나
      .trim();

    if (!clean) return [];

    // 한국어/영어 문장 분리
    const sentences = clean.split(/(?<=[.!?。！？\n])\s*/);
    return sentences
      .map(s => s.trim())
      .filter(s => s.length > 3); // 너무 짧은 거 제거 (음... 같은 것 방지)
  }

  // AudioContext 초기화 (사용자 제스처 필요)
  _ensureAudioContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  // 단일 문장 → 음성 생성
  async _generateAudio(sentence) {
    const res = await fetch(`${this.serverUrl}/v1/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: sentence,
        reference_id: this.referenceId || undefined,
        format: 'wav'
      })
    });

    if (!res.ok) throw new Error(`TTS 실패: ${res.status}`);
    return await res.arrayBuffer();
  }

  // 오디오 재생 (Promise 기반)
  _playBuffer(audioBuffer) {
    return new Promise((resolve, reject) => {
      const ctx = this._ensureAudioContext();
      ctx.decodeAudioData(audioBuffer.slice(0), (decoded) => {
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
      }, reject);
    });
  }

  // 메인: 텍스트를 음성으로 읽기
  async speak(text) {
    if (!this.enabled || !text) return;

    // 서버 체크
    if (!this.available) {
      const ok = await this._checkServer();
      if (!ok) return;
    }

    // 이전 재생 중이면 멈추고 새로 시작
    this.stop();
    this.aborted = false;

    const sentences = this._splitSentences(text);
    if (!sentences.length) return;

    this.playing = true;

    // 파이프라인: 다음 문장 미리 생성하면서 현재 문장 재생
    let nextAudioPromise = null;

    for (let i = 0; i < sentences.length; i++) {
      if (this.aborted) break;

      try {
        // 현재 오디오 가져오기 (미리 생성된 거 or 새로 생성)
        const audioData = nextAudioPromise
          ? await nextAudioPromise
          : await this._generateAudio(sentences[i]);

        if (this.aborted) break;

        // 다음 문장 미리 생성 시작
        if (i + 1 < sentences.length) {
          nextAudioPromise = this._generateAudio(sentences[i + 1]);
        } else {
          nextAudioPromise = null;
        }

        // 현재 문장 재생
        await this._playBuffer(audioData);
      } catch (err) {
        console.warn('[TTS] 문장 재생 실패:', sentences[i], err);
        nextAudioPromise = null;
      }
    }

    this.playing = false;
  }

  // 정지
  stop() {
    this.aborted = true;
    this.playing = false;
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch {}
      this.currentSource = null;
    }
  }
}
