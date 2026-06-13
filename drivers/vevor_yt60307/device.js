'use strict';

/**
 * Vevor YT60307 – HYBRID (lokal Tuya 3.5 + Cloud-Fallback).
 *
 * Logik:
 *   - Sind `ip` UND `local_key` gesetzt -> lokaler 3.5-Abruf (ohne Cloud/Quota).
 *   - Schlägt der lokale Abruf fehl und Cloud-Zugang ist konfiguriert -> Cloud-Fallback.
 *   - Sind nur Cloud-Zugangsdaten gesetzt -> reiner Cloud-Betrieb (wie bisher).
 *
 * Dadurch bleibt die App für bestehende Cloud-Nutzer voll kompatibel.
 *
 * Benötigte Settings: ip, local_key (neu), access_id, access_secret, device_id,
 *                     poll_interval, temp_offset_indoor/outdoor.
 */

const Homey = require('homey');
const TuyaCloud = require('../../lib/TuyaCloud');
const TuyaLocal = require('../../lib/TuyaLocal');
const { getMappingForCode, convertValue, decodeOutdoorDisplay } = require('../../lib/DpsMap');
const { getLocalMapping, LOCAL_DP_BATTERY } = require('../../lib/DpsMapLocal');

class VevorDevice extends Homey.Device {

  async onInit() {
    this.log('Vevor YT60307 (hybrid) initialisiert:', this.getName());
    this._cloud = null;
    this._local = null;
    this._pollTimer = null;
    this._wasRaining = false;

    this._setup();
    this._startPolling();
  }

  _setup(settings) {
    const s = settings || this.getSettings();

    // Lokal, wenn IP + Local Key vorhanden
    if (s.ip && s.local_key && s.device_id) {
      this._local = new TuyaLocal({ ip: s.ip, deviceId: s.device_id, localKey: s.local_key });
    } else {
      this._local = null;
    }

    // Cloud, wenn Zugangsdaten vorhanden (Fallback / reiner Cloud-Modus)
    if (s.access_id && s.access_secret && s.device_id) {
      this._cloud = new TuyaCloud({ accessId: s.access_id, accessSecret: s.access_secret, deviceId: s.device_id });
    } else {
      this._cloud = null;
    }

    if (!this._local && !this._cloud) {
      this.setUnavailable(this.homey.__('errors.missing_settings'));
    }
  }

  _startPolling() {
    const s = this.getSettings();
    const interval = Math.max(10, s.poll_interval || 30) * 1000;
    this._stopPolling();
    this._pollTimer = setInterval(() => this._poll(), interval);
    this._poll();
  }

  _stopPolling() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  }

  async _poll() {
    // 1) Lokal bevorzugen
    if (this._local) {
      try {
        const dps = await this._local.getStatus();
        this._processLocal(dps);
        this.setAvailable();
        return;
      } catch (err) {
        this.log('Lokaler Poll-Fehler:', err.message);
        if (!this._cloud) {
          this.setUnavailable('Lokal: ' + err.message);
          return;
        }
        // sonst: Fallback auf Cloud
      }
    }

    // 2) Cloud (regulär oder Fallback)
    if (this._cloud) {
      try {
        const dps = await this._cloud.getStatus();
        this._processCloud(dps);
        this.setAvailable();
      } catch (err) {
        this.log('Cloud-Poll-Fehler:', err.message);
        this.setUnavailable(this.homey.__('errors.poll_failed'));
      }
    }
  }

  // ── Verarbeitung LOKAL (numerische DP-IDs) ───────────────────────────────
  _processLocal(dps) {
    const s = this.getSettings();
    const indoorOffset  = parseFloat(s.temp_offset_indoor)  || 0;
    const outdoorOffset = parseFloat(s.temp_offset_outdoor) || 0;

    for (const [code, rawValue] of Object.entries(dps)) {
      const id = Number(code);

      if (id === LOCAL_DP_BATTERY) {
        this.setCapabilityValue('alarm_battery', rawValue === 'low_battery').catch(() => {});
        continue;
      }

      const mapping = getLocalMapping(id);
      if (!mapping) continue;

      let value = Number(rawValue);
      if (!Number.isFinite(value)) continue;
      value = value / mapping.factor;
      if (mapping.capability === 'measure_temperature')         value += indoorOffset;
      if (mapping.capability === 'measure_temperature.outdoor') value += outdoorOffset;
      value = Math.round(value * 10) / 10;

      this.setCapabilityValue(mapping.capability, value).catch(() => {});
      this._fireTriggers(mapping.capability, value);
    }
  }

  // ── Verarbeitung CLOUD (String-Codes, wie bisher) ────────────────────────
  _processCloud(dps) {
    const s = this.getSettings();
    const indoorOffset  = parseFloat(s.temp_offset_indoor)  || 0;
    const outdoorOffset = parseFloat(s.temp_offset_outdoor) || 0;

    for (const [code, rawValue] of Object.entries(dps)) {

      if (code === 'outdoor_alert_display') {
        const decoded = decodeOutdoorDisplay(rawValue);
        if (decoded.windAngle !== undefined) {
          this.setCapabilityValue('measure_wind_angle', decoded.windAngle % 360).catch(() => {});
        }
        if (decoded.rainDaily !== undefined) {
          this.setCapabilityValue('measure_rain_daily', Math.round(decoded.rainDaily * 10) / 10).catch(() => {});
        }
        continue;
      }

      if (code === 'outdoor_battery_status') {
        this.setCapabilityValue('alarm_battery', rawValue === 'low_battery').catch(() => {});
        continue;
      }

      if (code === 'rainfall') {
        const rainNow = Math.round(Number(rawValue) / 10 * 10) / 10;
        this.setCapabilityValue('measure_rain', rainNow).catch(() => {});
        const raining = rainNow > 0;
        if (raining && !this._wasRaining) {
          this.homey.app.getRainStartedTrigger().trigger(this, {}, {}).catch(() => {});
        }
        this._wasRaining = raining;
        continue;
      }

      const mapping = getMappingForCode(code);
      if (!mapping) continue;
      if (mapping.capability === 'measure_rain') continue;

      let value = convertValue(code, rawValue);
      if (value === null || value === undefined) continue;
      if (value < -100 && code !== 'outdoor_temperature') continue;
      if (mapping.capability === 'measure_temperature')         value += indoorOffset;
      if (mapping.capability === 'measure_temperature.outdoor') value += outdoorOffset;
      value = Math.round(value * 10) / 10;

      this.setCapabilityValue(mapping.capability, value).catch(() => {});
      this._fireTriggers(mapping.capability, value);
    }
  }

  // ── Gemeinsame Flow-Trigger ──────────────────────────────────────────────
  _fireTriggers(capability, value) {
    if (capability === 'measure_rain') {
      const raining = value > 0;
      if (raining && !this._wasRaining) {
        this.homey.app.getRainStartedTrigger().trigger(this, {}, {}).catch(() => {});
      }
      this._wasRaining = raining;
    }
    if (capability === 'measure_wind_strength') {
      this.homey.app.getWindSpeedExceededTrigger().trigger(this, {}, { speed: value }).catch(() => {});
    }
    if (capability === 'measure_ultraviolet') {
      this.homey.app.getUvIndexHighTrigger().trigger(this, {}, { uv_index: value }).catch(() => {});
    }
  }

  async onSettings({ newSettings, changedKeys }) {
    this._setup(newSettings);
    this._startPolling();
  }

  async onDeleted() {
    this._stopPolling();
  }

}

module.exports = VevorDevice;
