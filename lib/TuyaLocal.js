'use strict';

/**
 * TuyaLocal – Lokale Kommunikation mit Tuya-Geräten, Protokoll 3.5
 * (0x6699-Frame, AES-128-GCM, Session-Key-Handshake)
 *
 * Eigenständig: nur Node-Bausteine `net` + `crypto`, keine Abhängigkeiten.
 * Verifiziert gegen Vevor YT60307 (192.168.178.36), 13.06.2026.
 *
 * Nutzung:
 *   const t = new TuyaLocal({ ip, deviceId, localKey });
 *   const dps = await t.getStatus();   // -> { '117': 235, '121': 100930, ... }
 *
 * getStatus() ist zustandslos: baut pro Aufruf Verbindung auf, handshaked,
 * fragt ab und schließt wieder. Robust und einfach für Polling.
 */

const net = require('net');
const crypto = require('crypto');

const PREFIX = 0x00006699;
const SUFFIX = 0x00009966;
const PREFIX_BIN = Buffer.from([0x00, 0x00, 0x66, 0x99]);

const CMD = {
  SESS_START: 3,    // SESS_KEY_NEG_START
  SESS_RESP: 4,     // SESS_KEY_NEG_RESP
  SESS_FINISH: 5,   // SESS_KEY_NEG_FINISH
  DP_QUERY_NEW: 0x10, // 16 – Statusabfrage für v3.4/v3.5
  HEART_BEAT: 9,
};

class TuyaLocal {
  constructor({ ip, deviceId, localKey, port = 6668, timeout = 8000 }) {
    this.ip = ip;
    this.deviceId = deviceId;
    this.realKey = Buffer.from(localKey, 'utf8'); // 16 Byte
    this.port = port;
    this.timeout = timeout;
  }

  // ── Paket bauen (6699 / GCM) ────────────────────────────────────────────
  _pack(seqno, cmd, payload, key) {
    const len = payload.length + 12 + 16; // iv(12) + tag(16), kein retcode beim Senden
    const header = Buffer.alloc(18);
    header.writeUInt32BE(PREFIX, 0);
    header.writeUInt16BE(0, 4);
    header.writeUInt32BE(seqno, 6);
    header.writeUInt32BE(cmd, 10);
    header.writeUInt32BE(len, 14);
    const aad = header.subarray(4); // 14 Byte AAD
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-128-gcm', key, iv);
    c.setAAD(aad);
    const ct = Buffer.concat([c.update(payload), c.final()]);
    const tag = c.getAuthTag();
    const suffix = Buffer.alloc(4);
    suffix.writeUInt32BE(SUFFIX, 0);
    return Buffer.concat([header, iv, ct, tag, suffix]);
  }

  // ── Ein vollständiges Paket aus buf entschlüsseln ───────────────────────
  _unpack(buf, key) {
    const off = buf.indexOf(PREFIX_BIN);
    if (off < 0) return null;
    buf = buf.subarray(off);
    if (buf.length < 18) return null;
    const seqno = buf.readUInt32BE(6);
    const cmd = buf.readUInt32BE(10);
    const length = buf.readUInt32BE(14);
    const total = 18 + length + 4;
    if (buf.length < total) return null;
    const packet = buf.subarray(0, total);
    const region = packet.subarray(18, 18 + length + 4);
    const tag = region.subarray(region.length - 20, region.length - 4);
    const enc = region.subarray(0, region.length - 20);
    const iv = enc.subarray(0, 12);
    const ct = enc.subarray(12);
    const aad = packet.subarray(4, 18);
    const d = crypto.createDecipheriv('aes-128-gcm', key, iv);
    d.setAAD(aad);
    d.setAuthTag(tag);
    let pt = Buffer.concat([d.update(ct), d.final()]);
    if (pt.length >= 4) pt = pt.subarray(4); // 4-Byte retcode strippen
    return { msg: { seqno, cmd, payload: pt }, rest: buf.subarray(total) };
  }

  _hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  // ── Statusabfrage ───────────────────────────────────────────────────────
  getStatus() {
    return new Promise((resolve, reject) => {
      const sock = new net.Socket();
      sock.setTimeout(this.timeout);
      let buffer = Buffer.alloc(0);
      let seqno = 1;
      let currentKey = this.realKey;
      let done = false;
      const waiters = [];

      const finish = (err, val) => {
        if (done) return;
        done = true;
        try { sock.destroy(); } catch (e) {}
        if (err) reject(err); else resolve(val);
      };

      const feed = () => {
        let r;
        while ((r = this._unpack(buffer, currentKey)) !== null) {
          buffer = r.rest;
          const w = waiters.shift();
          if (w) w.resolve(r.msg);
        }
      };

      const recv = () => new Promise((res, rej) => {
        const to = setTimeout(() => rej(new Error('Empfangs-Timeout')), this.timeout);
        waiters.push({
          resolve: (m) => { clearTimeout(to); res(m); },
          reject: (e) => { clearTimeout(to); rej(e); },
        });
      });

      sock.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        try { feed(); } catch (e) {
          const w = waiters.shift();
          if (w) w.reject(e); else finish(e);
        }
      });
      sock.on('timeout', () => finish(new Error('Socket-Timeout')));
      sock.on('error', (e) => finish(e));

      sock.connect(this.port, this.ip, async () => {
        try {
          // Session-Key-Negotiation
          const localNonce = Buffer.from('0123456789abcdef');
          sock.write(this._pack(seqno++, CMD.SESS_START, localNonce, this.realKey));
          const resp = await recv();
          if (resp.cmd !== CMD.SESS_RESP || resp.payload.length < 48) {
            throw new Error('Session-Antwort ungültig (cmd ' + resp.cmd + ', len ' + resp.payload.length + ')');
          }
          const remoteNonce = resp.payload.subarray(0, 16);
          if (!resp.payload.subarray(16, 48).equals(this._hmac(this.realKey, localNonce))) {
            throw new Error('HMAC-Prüfung fehlgeschlagen – Local Key falsch?');
          }
          sock.write(this._pack(seqno++, CMD.SESS_FINISH, this._hmac(this.realKey, remoteNonce), this.realKey));

          const xor = Buffer.alloc(16);
          for (let i = 0; i < 16; i++) xor[i] = localNonce[i] ^ remoteNonce[i];
          const ck = crypto.createCipheriv('aes-128-gcm', this.realKey, localNonce.subarray(0, 12));
          currentKey = Buffer.concat([ck.update(xor), ck.final()]).subarray(0, 16);
          ck.getAuthTag();

          // DP-Abfrage
          sock.write(this._pack(seqno++, CMD.DP_QUERY_NEW, Buffer.from('{}'), currentKey));
          const dp = await recv();
          const txt = dp.payload.toString('utf8');
          let j;
          try { j = JSON.parse(txt); } catch (e) { throw new Error('Antwort kein JSON: ' + txt.slice(0, 80)); }
          const dps = j.dps || (j.data && j.data.dps);
          if (!dps) throw new Error('Kein dps-Feld in Antwort');
          finish(null, dps);
        } catch (e) {
          finish(e);
        }
      });
    });
  }
}

module.exports = TuyaLocal;
