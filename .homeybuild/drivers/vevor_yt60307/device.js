'use strict';

const Homey = require('homey');
const TuyaCloud = require('../../lib/TuyaCloud');
const { getMappingForCode, convertValue, decodeWindDirection, degreesToCardinal } = require('../../lib/DpsMap');

class VevorDevice extends Homey.Device {

  async onInit() {
    this.log('Vevor YT60307 initialisiert:', this.getName());
    this._cloud = null;
    this._pollTimer = null;
    this._wasRaining = false;
    await this._setupCloud();
    this._startPolling();
  }

  async _setupCloud() {
    const s = this.getSettings();
    if (!s.access_id || !s.access_secret || !s.device_id) {
      this.setUnavailable(this.homey.__('errors.missing_settings'));
      return;
    }
    this._cloud = new TuyaCloud({
      accessId: s.access_id,
      accessSecret: s.access_secret,
      deviceId: s.device_id,
    });
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
    if (!this._cloud) return;
    try {
      const dps = await this._cloud.getStatus();
      this._processDps(dps);
      this.setAvailable();
    } catch (err) {
      this.log('Poll-Fehler:', err.message);
      this.setUnavailable(this.homey.__('errors.poll_failed'));
    }
  }

  _processDps(dps) {
    const s = this.getSettings();
    const indoorOffset = parseFloat(s.temp_offset_indoor) || 0;
    const outdoorOffset = parseFloat(s.temp_offset_outdoor) || 0;

    for (const [code, rawValue] of Object.entries(dps)) {

      // Windrichtung aus outdoor_alert_display dekodieren
      if (code === 'outdoor_alert_display') {
        const deg = decodeWindDirection(rawValue);
        if (deg !== null) {
          this.setCapabilityValue('measure_wind_angle', deg).catch(() => {});
          this.setCapabilityValue('wind_direction_cardinal', degreesToCardinal(deg)).catch(() => {});
        }
        continue;
      }

      const mapping = getMappingForCode(code);
      if (!mapping) continue;

      let value = convertValue(code, rawValue);
      if (value === null || value === undefined) continue;
      if (value < -100 && code !== 'outdoor_temperature') continue;

      if (mapping.capability === 'measure_temperature') value += indoorOffset;
      if (mapping.capability === 'measure_temperature.outdoor') value += outdoorOffset;
      value = Math.round(value * 10) / 10;

      this.setCapabilityValue(mapping.capability, value).catch(() => {});

      if (mapping.capability === 'measure_wind_strength') {
        this.homey.app.getWindSpeedExceededTrigger().trigger(this, {}, { speed: value }).catch(() => {});
      }
      if (mapping.capability === 'measure_rain') {
        const raining = value > 0;
        if (raining && !this._wasRaining) {
          this.homey.app.getRainStartedTrigger().trigger(this, {}, {}).catch(() => {});
        }
        this._wasRaining = raining;
      }
      if (mapping.capability === 'measure_ultraviolet') {
        this.homey.app.getUvIndexHighTrigger().trigger(this, {}, { uv_index: value }).catch(() => {});
      }
    }
  }

  async onSettings({ changedKeys }) {
    await this._setupCloud();
    if (changedKeys.includes('poll_interval')) this._startPolling();
  }

  async onDeleted() {
    this._stopPolling();
  }
}

module.exports = VevorDevice;
