/**
 * 저장소 크리덴셜 암호화/복호화
 * APIKey.js와 동일한 AES-256-CBC 패턴
 */

const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'soul-default-encryption-key-32b';
const ALGORITHM = 'aes-256-cbc';

function getKey() {
  return Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
}

function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
  if (!encryptedText || !isEncrypted(encryptedText)) return encryptedText;
  const [ivHex, encryptedHex] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  return /^[0-9a-f]{32}:[0-9a-f]+$/i.test(value);
}

module.exports = { encrypt, decrypt, isEncrypted };
