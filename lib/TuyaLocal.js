'use strict';

/**
 * TuyaLocal – Lokale Kommunikation mit Tuya-Geräten
 * Unterstützt Protokollversionen 3.1, 3.3 und 3.4
 *
 * Basiert auf dem offenen Tuya-Lokalprotokoll (keine Cloud nötig).
 */

const net = require('net');
const crypto = require('crypto');
const EventEmitter = require('events');

// Tuya Protokoll-Konstanten
const TUYA_HEADER = Buffer.from('000055aa', 'hex');
const TUYA_FOOTER = Buffer.from('0000aa55', 'hex');

const TUYA_COMMANDS = {
  DP_QUERY: 0x0a,       // Datenpunkte abfragen
  CONTROL: 0x07,        // Gerät steuern
  HEART_BEAT: 0x09,     // Keep-alive
  DP_QUERY_NEW: 0x0f,   // Neue Abfragemethode (v3.4)
};

const UDP_KEY = crypto.createHash('md5')
  .update('yGAdlopoPVldABfn')
  .digest();

class TuyaLocal extends EventEmitter {

  constructor({ ip, deviceId, localKey, version = '3.3' }) {
    super();
    this.ip = ip;
    this.deviceId = deviceId;
    this.localKey = localKey;
    this.version = version;
    this.port = 6668;
    this.socket = null;
    this.connected = false;
    this._seqNo = 0;
    this._connectTimeout = null;
    this._reconnectTimer = null;
    this._heartbeatTimer = null;
    this._buffer = Buffer.alloc(0);
  }

  // ─── Verbindung herstellen ───────────────────────────────────────────────

  connect() {
    return new Promise((resolve, reject) => {
      if (this.connected) return resolve();

      this.socket = new net.Socket();
      this.socket.setNoDelay(true);
      this.socket.setTimeout(10000);

      this._connectTimeout = setTimeout(() => {
        reject(new Error('Verbindungs-Timeout'));
        this.socket.destroy();
      }, 10000);

      this.socket.connect(this.port, this.ip, () => {
        clearTimeout(this._connectTimeout);
        this.connected = true;
        this.emit('connected');
        this._startHeartbeat();
        resolve();
      });

      this.socket.on('data', (data) => this._onData(data));

      this.socket.on('close', () => {
        this.connected = false;
        this._stopHeartbeat();
        this.emit('disconnected');
      });

      this.socket.on('error', (err) => {
        clearTimeout(this._connectTimeout);
        this.connected = false;
        this.emit('error', err);
        reject(err);
      });

      this.socket.on('timeout', () => {
        this.socket.destroy();
        this.connected = false;
        this.emit('disconnected');
      });
    });
  }

  disconnect() {
    this._stopHeartbeat();
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }

  // ─── Datenpunkte abfragen ────────────────────────────────────────────────

  async getStatus() {
    if (!this.connected) await this.connect();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Status-Abfrage Timeout'));
      }, 8000);

      const handler = (dps) => {
        clearTimeout(timeout);
        resolve(dps);
      };

      this.once('data', handler);

      const payload = this._buildStatusPayload();
      this.socket.write(payload);
    });
  }

  // ─── Pakete zusammenbauen ────────────────────────────────────────────────

  _buildStatusPayload() {
    this._seqNo++;
    let data;

    if (this.version === '3.4') {
      data = JSON.stringify({ protocol: 5, t: Math.floor(Date.now() / 1000) });
    } else {
      data = JSON.stringify({ gwId: this.deviceId, devId: this.deviceId, t: Math.floor(Date.now() / 1000) });
    }

    return this._buildPacket(TUYA_COMMANDS.DP_QUERY, data);
  }

  _buildPacket(command, data) {
    const payload = Buffer.from(data, 'utf8');
    let encryptedPayload;

    if (this.version === '3.3' || this.version === '3.4') {
      const encrypted = this._encrypt33(payload);
      const prefix = this.version === '3.3'
        ? Buffer.from('3.3\x00\x00\x00\x00\x00\x00\x00\x00\x00', 'binary')
        : Buffer.from('3.4\x00\x00\x00\x00\x00\x00\x00\x00\x00', 'binary');
      encryptedPayload = Buffer.concat([prefix, encrypted]);
    } else {
      // v3.1: MD5 Hash + AES ECB
      encryptedPayload = this._encrypt31(payload);
    }

    const seqBuf = Buffer.alloc(4);
    seqBuf.writeUInt32BE(this._seqNo);

    const cmdBuf = Buffer.alloc(4);
    cmdBuf.writeUInt32BE(command);

    // Länge = payload + CRC(4) + suffix(4)
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(encryptedPayload.length + 8);

    const headerWithoutCrc = Buffer.concat([
      TUYA_HEADER,
      seqBuf,
      cmdBuf,
      lengthBuf,
      encryptedPayload,
    ]);

    const crc = this._crc32(headerWithoutCrc);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc);

    return Buffer.concat([headerWithoutCrc, crcBuf, TUYA_FOOTER]);
  }

  // ─── Verschlüsselung ─────────────────────────────────────────────────────

  _encrypt33(data) {
    const key = Buffer.from(this.localKey, 'utf8');
    const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
    cipher.setAutoPadding(true);
    return Buffer.concat([cipher.update(data), cipher.final()]);
  }

  _encrypt31(data) {
    const key = Buffer.from(this.localKey, 'utf8');
    const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
    cipher.setAutoPadding(true);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const b64 = encrypted.toString('base64');
    const hash = crypto.createHash('md5')
      .update(`data=${b64}||lpv=${this.version}||${this.localKey}`)
      .digest('hex')
      .slice(8, 24);
    return Buffer.from(`${this.version}${hash}${b64}`, 'utf8');
  }

  _decrypt(data) {
    const key = Buffer.from(this.localKey, 'utf8');
    try {
      // v3.3/3.4: Skip 15-byte prefix
      let toDecode = data;
      if (data.length > 15 && (data.slice(0, 3).toString() === '3.3' || data.slice(0, 3).toString() === '3.4')) {
        toDecode = data.slice(15);
      } else if (data.length > 19 && data.slice(0, 3).toString() === '3.1') {
        // v3.1: base64 ab Position 19
        toDecode = Buffer.from(data.slice(19).toString(), 'base64');
      }
      const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
      decipher.setAutoPadding(true);
      return Buffer.concat([decipher.update(toDecode), decipher.final()]);
    } catch (e) {
      return null;
    }
  }

  // ─── Empfangene Daten verarbeiten ────────────────────────────────────────

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);

    while (this._buffer.length >= 16) {
      // Suche nach Tuya-Header
      const start = this._buffer.indexOf(TUYA_HEADER);
      if (start === -1) {
        this._buffer = Buffer.alloc(0);
        break;
      }
      if (start > 0) {
        this._buffer = this._buffer.slice(start);
      }
      if (this._buffer.length < 16) break;

      const length = this._buffer.readUInt32BE(12);
      const totalLength = 16 + length;

      if (this._buffer.length < totalLength) break;

      const packet = this._buffer.slice(0, totalLength);
      this._buffer = this._buffer.slice(totalLength);

      this._parsePacket(packet);
    }
  }

  _parsePacket(packet) {
    try {
      const command = packet.readUInt32BE(8);
      const dataLen = packet.readUInt32BE(12);
      const payload = packet.slice(16, 16 + dataLen - 8); // ohne CRC + Footer

      if (payload.length === 0) return;

      // Returncode überspringen (erste 4 Bytes bei manchen Antworten)
      let data = payload;
      if (payload.length > 4 && payload.readUInt32BE(0) <= 10) {
        data = payload.slice(4);
      }

      const decrypted = this._decrypt(data);
      if (!decrypted) return;

      const jsonStr = decrypted.toString('utf8').trim();
      if (!jsonStr.startsWith('{')) return;

      const parsed = JSON.parse(jsonStr);
      if (parsed.dps) {
        this.emit('data', parsed.dps);
      }
    } catch (e) {
      // Ungültiges Paket – ignorieren
    }
  }

  // ─── Heartbeat ───────────────────────────────────────────────────────────

  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      if (this.connected && this.socket) {
        const hb = this._buildPacket(TUYA_COMMANDS.HEART_BEAT, '{}');
        this.socket.write(hb);
      }
    }, 20000);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  // ─── CRC32 ───────────────────────────────────────────────────────────────

  _crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
}

module.exports = TuyaLocal;
