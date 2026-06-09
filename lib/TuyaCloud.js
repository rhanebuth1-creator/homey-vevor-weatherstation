'use strict';

const https = require('https');
const crypto = require('crypto');

const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

class TuyaCloud {
  constructor({ accessId, accessSecret, deviceId }) {
    this.accessId = accessId;
    this.accessSecret = accessSecret;
    this.deviceId = deviceId;
    this.host = 'openapi.tuyaeu.com';
    this._token = null;
    this._tokenExpiry = 0;
  }

  _signToken(t) {
    const str = this.accessId + t + `GET\n${EMPTY_HASH}\n\n/v1.0/token?grant_type=1`;
    return crypto.createHmac('sha256', this.accessSecret).update(str).digest('hex').toUpperCase();
  }

  _signRequest(t, token, path) {
    const pathOnly = path.split('?')[0];
    const query = path.includes('?') ? path.split('?')[1].split('&').sort().join('&') : '';
    const urlPart = query ? `${pathOnly}?${query}` : pathOnly;
    const str = this.accessId + token + t + `GET\n${EMPTY_HASH}\n\n${urlPart}`;
    return crypto.createHmac('sha256', this.accessSecret).update(str).digest('hex').toUpperCase();
  }

  _request(path, token = '', isTokenReq = false) {
    return new Promise((resolve, reject) => {
      const t = Date.now().toString();
      const s = isTokenReq ? this._signToken(t) : this._signRequest(t, token, path);
      const options = {
        hostname: this.host, path, method: 'GET',
        headers: {
          'client_id': this.accessId, 'sign': s, 't': t,
          'sign_method': 'HMAC-SHA256', 'access_token': token,
        }
      };
      const req = https.request(options, r => {
        let d = ''; r.on('data', c => d += c);
        r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      });
      req.on('error', reject); req.end();
    });
  }

  async _getToken() {
    if (this._token && Date.now() < this._tokenExpiry) return this._token;
    const res = await this._request('/v1.0/token?grant_type=1', '', true);
    if (!res.success) throw new Error('Token Fehler: ' + res.msg);
    this._token = res.result.access_token;
    this._tokenExpiry = Date.now() + (res.result.expire_time * 1000) - 60000;
    return this._token;
  }

  async getStatus() {
    const token = await this._getToken();
    const res = await this._request(`/v2.0/cloud/thing/${this.deviceId}/shadow/properties`, token);
    if (!res.success) throw new Error('Status Fehler: ' + res.msg);
    const dps = {};
    for (const p of res.result.properties) {
      dps[p.code] = p.value;
    }
    return dps;
  }
}

module.exports = TuyaCloud;
