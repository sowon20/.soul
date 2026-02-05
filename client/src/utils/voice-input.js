/**
 * Voice Input Manager
 * Web Speech API를 사용한 음성 인식
 */

class VoiceInputManager {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.onResult = null;
    this.onStateChange = null;
    this.interimResult = '';

    this._init();
  }

  _init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('[VoiceInput] Web Speech API not supported');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'ko-KR';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      console.log('[VoiceInput] Started');
      this.isListening = true;
      this._notifyStateChange('listening');
    };

    this.recognition.onend = () => {
      console.log('[VoiceInput] Ended');
      this.isListening = false;
      this._notifyStateChange('idle');
    };

    this.recognition.onerror = (event) => {
      console.error('[VoiceInput] Error:', event.error);
      this.isListening = false;
      this._notifyStateChange('error', event.error);

      // 자동 재시작 (no-speech 에러 시)
      if (event.error === 'no-speech') {
        this._notifyStateChange('idle');
      }
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // 중간 결과 표시
      if (interimTranscript) {
        this.interimResult = interimTranscript;
        this._notifyResult(interimTranscript, false);
      }

      // 최종 결과
      if (finalTranscript) {
        this.interimResult = '';
        this._notifyResult(finalTranscript, true);
      }
    };
  }

  /**
   * 지원 여부 확인
   */
  isSupported() {
    return !!this.recognition;
  }

  /**
   * 음성 인식 시작
   */
  start() {
    if (!this.recognition) {
      console.warn('[VoiceInput] Not supported');
      return false;
    }

    if (this.isListening) {
      console.log('[VoiceInput] Already listening');
      return true;
    }

    try {
      this.recognition.start();
      return true;
    } catch (e) {
      console.error('[VoiceInput] Start error:', e);
      return false;
    }
  }

  /**
   * 음성 인식 중지
   */
  stop() {
    if (!this.recognition) return;

    if (this.isListening) {
      this.recognition.stop();
    }
  }

  /**
   * 토글 (시작/중지)
   */
  toggle() {
    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
    return this.isListening;
  }

  /**
   * 결과 콜백 등록
   * @param {Function} callback - (text, isFinal) => void
   */
  setOnResult(callback) {
    this.onResult = callback;
  }

  /**
   * 상태 변경 콜백 등록
   * @param {Function} callback - (state, error?) => void
   *   state: 'idle' | 'listening' | 'error'
   */
  setOnStateChange(callback) {
    this.onStateChange = callback;
  }

  _notifyResult(text, isFinal) {
    if (this.onResult) {
      this.onResult(text, isFinal);
    }
  }

  _notifyStateChange(state, error = null) {
    if (this.onStateChange) {
      this.onStateChange(state, error);
    }
  }
}

// 싱글톤 인스턴스
let voiceInputInstance = null;

export function getVoiceInput() {
  if (!voiceInputInstance) {
    voiceInputInstance = new VoiceInputManager();
  }
  return voiceInputInstance;
}

export { VoiceInputManager };
