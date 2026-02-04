/**
 * Oracle Object Storage 기반 파일 스토리지 어댑터
 * OCI API Key 인증 (만료 없음)
 *
 * 필요 설정:
 * - tenancyId: Tenancy OCID
 * - userId: User OCID
 * - region: OCI Region (예: ap-chuncheon-1)
 * - fingerprint: API Key fingerprint
 * - privateKey: PEM 형식 private key (문자열)
 * - namespace: Object Storage namespace
 * - bucketName: 버킷 이름
 *
 * 마이그레이션 지원:
 * - exportAll(): 전체 파일을 공통 포맷으로 내보내기
 * - importAll(): 공통 포맷 데이터를 Object Storage로 가져오기
 */

const os = require('oci-objectstorage');
const common = require('oci-common');
const { Readable } = require('stream');

class OracleObjectStorage {
  constructor(config = {}) {
    this.config = {
      tenancyId: config.tenancyId || '',
      userId: config.userId || '',
      region: config.region || '',
      fingerprint: config.fingerprint || '',
      privateKey: config.privateKey || '',
      namespace: config.namespace || '',
      bucketName: config.bucketName || ''
    };
    this.client = null;
    this._initialized = false;
  }

  _createProvider() {
    // PEM 키 정규화 (줄바꿈, 공백 정리)
    let privateKey = this.config.privateKey || '';
    if (typeof privateKey === 'string') {
      privateKey = privateKey
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim() + '\n';
    }

    return new common.SimpleAuthenticationDetailsProvider(
      this.config.tenancyId,
      this.config.userId,
      this.config.fingerprint,
      privateKey,
      null, // passphrase
      common.Region.fromRegionId(this.config.region)
    );
  }

  async initialize() {
    if (this._initialized) return;

    const provider = this._createProvider();
    this.client = new os.ObjectStorageClient({
      authenticationDetailsProvider: provider
    });

    // namespace 자동 가져오기
    if (!this.config.namespace) {
      const nsResponse = await this.client.getNamespace({});
      this.config.namespace = nsResponse.value;
    }

    this._initialized = true;
  }

  async _ensureInit() {
    if (!this._initialized) await this.initialize();
  }

  // ========== 파일 조작 ==========

  async readFile(filename) {
    await this._ensureInit();
    try {
      const response = await this.client.getObject({
        namespaceName: this.config.namespace,
        bucketName: this.config.bucketName,
        objectName: filename
      });

      const chunks = [];
      for await (const chunk of response.value) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString('utf-8');
    } catch (err) {
      if (err.statusCode === 404) return null;
      throw err;
    }
  }

  async readBuffer(filename) {
    await this._ensureInit();
    try {
      const response = await this.client.getObject({
        namespaceName: this.config.namespace,
        bucketName: this.config.bucketName,
        objectName: filename
      });

      const chunks = [];
      for await (const chunk of response.value) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (err) {
      if (err.statusCode === 404) return null;
      throw err;
    }
  }

  async writeFile(filename, content) {
    await this._ensureInit();
    const buffer = Buffer.from(content, 'utf-8');
    await this._putObject(filename, buffer, 'text/plain; charset=utf-8');
  }

  async writeBuffer(filename, buffer) {
    await this._ensureInit();
    await this._putObject(filename, buffer);
  }

  async _putObject(objectName, buffer, contentType) {
    const stream = Readable.from(buffer);
    await this.client.putObject({
      namespaceName: this.config.namespace,
      bucketName: this.config.bucketName,
      objectName,
      contentLength: buffer.length,
      putObjectBody: stream,
      contentType: contentType || 'application/octet-stream'
    });
  }

  async delete(filename) {
    await this._ensureInit();
    try {
      await this.client.deleteObject({
        namespaceName: this.config.namespace,
        bucketName: this.config.bucketName,
        objectName: filename
      });
    } catch (err) {
      if (err.statusCode === 404) return;
      throw err;
    }
  }

  async exists(filename) {
    await this._ensureInit();
    try {
      await this.client.headObject({
        namespaceName: this.config.namespace,
        bucketName: this.config.bucketName,
        objectName: filename
      });
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(prefix = '') {
    await this._ensureInit();
    const result = [];
    let nextStart = undefined;

    do {
      const response = await this.client.listObjects({
        namespaceName: this.config.namespace,
        bucketName: this.config.bucketName,
        prefix: prefix || undefined,
        start: nextStart,
        limit: 1000
      });

      const objects = response.listObjects.objects || [];
      for (const obj of objects) {
        result.push({
          name: obj.name,
          type: 'file',
          size: obj.size,
          modifiedAt: obj.timeModified ? new Date(obj.timeModified) : null
        });
      }

      nextStart = response.listObjects.nextStartWith;
    } while (nextStart);

    return result;
  }

  // ========== 연결 테스트 ==========

  async testConnection() {
    await this._ensureInit();

    // 버킷 접근 확인
    await this.client.getBucket({
      namespaceName: this.config.namespace,
      bucketName: this.config.bucketName
    });

    return true;
  }

  // ========== 마이그레이션 인터페이스 ==========

  /**
   * 전체 파일을 공통 포맷으로 내보내기
   * { "path/to/file.ext": Buffer, ... }
   */
  async exportAll(onProgress) {
    await this._ensureInit();
    const data = {};
    let exported = 0;

    const files = await this.listFiles();
    for (const file of files) {
      const buffer = await this.readBuffer(file.name);
      if (buffer) {
        data[file.name] = buffer;
        exported++;
        if (onProgress) onProgress({ exported, currentFile: file.name });
      }
    }

    return data;
  }

  /**
   * 공통 포맷 데이터를 Object Storage로 가져오기
   * data: { "path/to/file.ext": Buffer, ... }
   */
  async importAll(data, onProgress) {
    await this._ensureInit();
    const files = Object.keys(data);
    let imported = 0;

    for (const filePath of files) {
      const content = data[filePath];
      if (Buffer.isBuffer(content)) {
        await this.writeBuffer(filePath, content);
      } else if (typeof content === 'string') {
        await this.writeFile(filePath, content);
      }
      imported++;
      if (onProgress) onProgress({ imported, total: files.length, currentFile: filePath });
    }

    return { files: files.length, imported };
  }

  async close() {
    this._initialized = false;
    this.client = null;
  }
}

let instance = null;

function getOracleObjectStorage(config) {
  if (!instance) {
    instance = new OracleObjectStorage(config);
  }
  return instance;
}

module.exports = { OracleObjectStorage, getOracleObjectStorage };
