/**
 * SFTP 기반 파일 스토리지 어댑터
 * OCI Compute + Block Volume 등 원격 서버에 SFTP로 파일 저장/조회
 *
 * FTP 스토리지와 동일한 패턴:
 * - 큐 기반 동시접근 방지
 * - 30초 idle timeout
 * - 자동 재연결
 *
 * 마이그레이션 지원:
 * - exportAll(): 전체 파일을 공통 포맷으로 내보내기
 * - importAll(): 공통 포맷 데이터를 SFTP로 가져오기
 */
const SFTPClient = require('ssh2-sftp-client');
const path = require('path');

class SFTPStorage {
  constructor(config = {}) {
    this.config = {
      host: config.host || '',
      port: config.port || 22,
      username: config.username || config.user || '',
      password: config.password || '',
      privateKey: config.privateKey || null,
      basePath: config.basePath || '/soul/files'
    };
    this.client = null;
    this.connected = false;
    this._lock = false;
    this._queue = [];
    this._idleTimeout = null;
    this._idleMs = 30000;
  }

  _resetIdleTimer() {
    if (this._idleTimeout) clearTimeout(this._idleTimeout);
    this._idleTimeout = setTimeout(() => {
      if (this.connected && !this._lock && this._queue.length === 0) {
        console.log('[SFTPStorage] Idle timeout, disconnecting...');
        this.disconnect();
      }
    }, this._idleMs);
  }

  async _withLock(fn) {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        this._lock = true;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this._lock = false;
          this._resetIdleTimer();
          if (this._queue.length > 0) {
            const next = this._queue.shift();
            next();
          }
        }
      };

      if (this._lock) {
        this._queue.push(execute);
      } else {
        execute();
      }
    });
  }

  async connect() {
    if (this.connected && this.client) {
      try {
        await this.client.cwd();
        return;
      } catch (err) {
        console.log('[SFTPStorage] Connection lost, reconnecting...');
        this.connected = false;
        try { this.client.end(); } catch {}
      }
    }

    this.client = new SFTPClient();

    const connectConfig = {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      readyTimeout: 10000,
      retries: 1
    };

    if (this.config.privateKey) {
      connectConfig.privateKey = this.config.privateKey;
    } else {
      connectConfig.password = this.config.password;
    }

    try {
      await this.client.connect(connectConfig);
      this.connected = true;
      console.log('[SFTPStorage] Connected to', this.config.host);
    } catch (err) {
      console.error('[SFTPStorage] Connection failed:', err.message);
      this.connected = false;
      throw err;
    }
  }

  async disconnect() {
    if (this.client) {
      try { await this.client.end(); } catch {}
      this.connected = false;
    }
  }

  async close() {
    await this.disconnect();
  }

  _fullPath(filename) {
    return `${this.config.basePath}/${filename}`.replace(/\/+/g, '/');
  }

  async readFile(filename) {
    return this._withLock(async () => {
      await this.connect();
      const remotePath = this._fullPath(filename);
      try {
        const buffer = await this.client.get(remotePath);
        return buffer.toString('utf-8');
      } catch (err) {
        if (err.code === 2 || err.message?.includes('No such file')) return null;
        throw err;
      }
    });
  }

  async readBuffer(filename) {
    return this._withLock(async () => {
      await this.connect();
      const remotePath = this._fullPath(filename);
      try {
        return await this.client.get(remotePath);
      } catch (err) {
        if (err.code === 2 || err.message?.includes('No such file')) return null;
        throw err;
      }
    });
  }

  async writeFile(filename, content) {
    return this._withLock(async () => {
      await this.connect();
      const remotePath = this._fullPath(filename);
      await this._ensureDir(remotePath);
      const buffer = Buffer.from(content, 'utf-8');
      await this.client.put(buffer, remotePath);
    });
  }

  async writeBuffer(filename, buffer) {
    return this._withLock(async () => {
      await this.connect();
      const remotePath = this._fullPath(filename);
      await this._ensureDir(remotePath);
      await this.client.put(buffer, remotePath);
    });
  }

  async delete(filename) {
    return this._withLock(async () => {
      await this.connect();
      const remotePath = this._fullPath(filename);
      try {
        await this.client.delete(remotePath);
      } catch (err) {
        if (err.code === 2) return;
        throw err;
      }
    });
  }

  async exists(filename) {
    return this._withLock(async () => {
      await this.connect();
      const remotePath = this._fullPath(filename);
      try {
        return !!(await this.client.stat(remotePath));
      } catch {
        return false;
      }
    });
  }

  async mkdir(dirPath) {
    return this._withLock(async () => {
      await this.connect();
      const remotePath = this._fullPath(dirPath);
      try {
        await this.client.mkdir(remotePath, true);
      } catch {}
    });
  }

  async listFiles(subdir = '') {
    return this._withLock(async () => {
      await this.connect();
      const remotePath = subdir
        ? this._fullPath(subdir)
        : this.config.basePath;
      try {
        const list = await this.client.list(remotePath);
        return list.map(f => ({
          name: f.name,
          type: f.type === 'd' ? 'directory' : 'file',
          size: f.size,
          modifiedAt: new Date(f.modifyTime)
        }));
      } catch {
        return [];
      }
    });
  }

  async testConnection() {
    return this._withLock(async () => {
      await this.connect();
      try {
        await this.client.stat(this.config.basePath);
      } catch {
        await this.client.mkdir(this.config.basePath, true);
      }
      return true;
    });
  }

  // ========== 마이그레이션 인터페이스 ==========

  /**
   * 전체 파일을 공통 포맷으로 내보내기
   * { "path/to/file.ext": Buffer, ... }
   */
  async exportAll(onProgress) {
    const data = {};
    let exported = 0;

    const walkDir = async (dir) => {
      const items = await this._listInternal(dir);
      for (const item of items) {
        const itemPath = dir ? `${dir}/${item.name}` : item.name;
        if (item.type === 'directory') {
          await walkDir(itemPath);
        } else {
          const buffer = await this._readBufferInternal(itemPath);
          if (buffer) {
            data[itemPath] = buffer;
            exported++;
            if (onProgress) onProgress({ exported, currentFile: itemPath });
          }
        }
      }
    };

    await this._withLock(async () => {
      await this.connect();
      await walkDir('');
    });

    return data;
  }

  /**
   * 공통 포맷 데이터를 SFTP로 가져오기
   * data: { "path/to/file.ext": Buffer, ... }
   */
  async importAll(data, onProgress) {
    const files = Object.keys(data);
    let imported = 0;

    for (const filePath of files) {
      const buffer = data[filePath];
      if (Buffer.isBuffer(buffer)) {
        await this.writeBuffer(filePath, buffer);
      } else if (typeof buffer === 'string') {
        await this.writeFile(filePath, buffer);
      }
      imported++;
      if (onProgress) onProgress({ imported, total: files.length, currentFile: filePath });
    }

    return { files: files.length, imported };
  }

  // ========== 내부 헬퍼 (락 없이) ==========

  async _ensureDir(remotePath) {
    const dir = remotePath.substring(0, remotePath.lastIndexOf('/'));
    if (!dir) return;
    try {
      await this.client.stat(dir);
    } catch {
      await this.client.mkdir(dir, true);
    }
  }

  async _listInternal(subdir) {
    const remotePath = subdir
      ? this._fullPath(subdir)
      : this.config.basePath;
    try {
      const list = await this.client.list(remotePath);
      return list.map(f => ({
        name: f.name,
        type: f.type === 'd' ? 'directory' : 'file',
        size: f.size
      }));
    } catch {
      return [];
    }
  }

  async _readBufferInternal(filename) {
    const remotePath = this._fullPath(filename);
    try {
      return await this.client.get(remotePath);
    } catch {
      return null;
    }
  }
}

let instance = null;

function getSFTPStorage(config) {
  if (!instance) {
    instance = new SFTPStorage(config);
  }
  return instance;
}

module.exports = { SFTPStorage, getSFTPStorage };
