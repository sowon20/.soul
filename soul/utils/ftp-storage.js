/**
 * FTP 기반 스토리지 어댑터
 * conversations.jsonl 읽기/쓰기를 FTP로 처리
 */
const ftp = require('basic-ftp');
const { Readable } = require('stream');

class FTPStorage {
  constructor(config = {}) {
    this.config = {
      host: config.host || process.env.FTP_HOST || '121.171.190.215',
      port: config.port || parseInt(process.env.FTP_PORT) || 21,
      user: config.user || process.env.FTP_USER || 'sowon',
      password: config.password || process.env.FTP_PASSWORD || 'sg1324',
      basePath: config.basePath || '/H/memory',
      secure: false
    };
    this.client = null;
    this.connected = false;
  }

  async connect() {
    if (this.connected && this.client) return;
    
    this.client = new ftp.Client();
    this.client.ftp.verbose = false;
    
    try {
      await this.client.access({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        secure: this.config.secure
      });
      this.connected = true;
      console.log('[FTPStorage] Connected to', this.config.host);
    } catch (err) {
      console.error('[FTPStorage] Connection failed:', err.message);
      this.connected = false;
      throw err;
    }
  }

  async disconnect() {
    if (this.client) {
      this.client.close();
      this.connected = false;
    }
  }

  async readFile(filename) {
    await this.connect();
    const remotePath = `${this.config.basePath}/${filename}`;
    
    try {
      const chunks = [];
      const writable = new (require('stream').Writable)({
        write(chunk, encoding, callback) {
          chunks.push(chunk);
          callback();
        }
      });
      
      await this.client.downloadTo(writable, remotePath);
      return Buffer.concat(chunks).toString('utf-8');
    } catch (err) {
      if (err.code === 550) {
        // 파일 없음
        return null;
      }
      throw err;
    }
  }

  async writeFile(filename, content) {
    await this.connect();
    const remotePath = `${this.config.basePath}/${filename}`;
    
    const readable = Readable.from([content]);
    await this.client.uploadFrom(readable, remotePath);
    console.log('[FTPStorage] Saved:', remotePath);
  }

  async appendToFile(filename, content) {
    await this.connect();
    const remotePath = `${this.config.basePath}/${filename}`;
    
    try {
      // FTP는 append 지원이 제한적이라 read-modify-write
      const existing = await this.readFile(filename) || '';
      const newContent = existing + content;
      await this.writeFile(filename, newContent);
    } catch (err) {
      // 파일 없으면 새로 생성
      await this.writeFile(filename, content);
    }
  }

  async exists(filename) {
    await this.connect();
    const remotePath = `${this.config.basePath}/${filename}`;
    
    try {
      const list = await this.client.list(this.config.basePath);
      return list.some(f => f.name === filename);
    } catch {
      return false;
    }
  }

  async listFiles(subdir = '') {
    await this.connect();
    const remotePath = subdir 
      ? `${this.config.basePath}/${subdir}`
      : this.config.basePath;
    
    try {
      const list = await this.client.list(remotePath);
      return list.map(f => ({
        name: f.name,
        type: f.type === 2 ? 'directory' : 'file',
        size: f.size,
        modifiedAt: f.modifiedAt
      }));
    } catch {
      return [];
    }
  }
}

// 싱글톤 인스턴스
let instance = null;

function getFTPStorage(config) {
  if (!instance) {
    instance = new FTPStorage(config);
  }
  return instance;
}

module.exports = { FTPStorage, getFTPStorage };
