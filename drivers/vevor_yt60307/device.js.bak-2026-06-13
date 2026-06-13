'use strict';

const Homey = require('homey');
const TuyaCloud = require('../../lib/TuyaCloud');
const { getMappingForCode, convertValue, decodeOutdoorDisplay } = require('../../lib/DpsMap');

class VevorDevice extends Homey.Device {

  async onInit() {
    this.log('Vevor YT60307 initialisiert:', this.getName());
    this._cloud = null;
    this._pollTimer = null;
    this._wasRaining = false;

    await this._setupCloud();
    this._startPolling();
  }

  async _setupCloud(settings) {
    const s = settings || this.getSettings();
    if (!s.access_id || !s.access_secret || !s.device_id) {
      this.setUnavailable(this.homey.__('errors.missing_settings'));
      return;
    }
    this._cloud = new TuyaCloud({
      accessId:     s.access_id,
      accessSecret: s.access_secret,
      deviceId:     s.device_id,
    });
  }

  _startPolling() {
    const s = this.getSettings();
    const interval = Math.max(10, s.poll_interval || 10) * 1000;
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
    const indoorOffset  = parseFloat(s.temp_offset_indoor)  || 0;
    const outdoorOffset = parseFloat(s.temp_offset_outdoor) || 0;

    for (const [code, rawValue] of Object.entries(dps)) {

      // Windrichtung + Tagesniederschlag aus outdoor_alert_display Buffer
      if (code === 'outdoor_alert_display') {
        const decoded = decodeOutdoorDisplay(rawValue);
        if (decoded.windAngle !== undefined) {
          this.setCapabilityValue('measure_wind_angle', decoded.windAngle % 360).catch(() => {});
        }
        // Tagesniederschlag direkt von der Station übernehmen (wie Stationsdisplay)
        if (decoded.rainDaily !== undefined) {
          const daily = Math.round(decoded.rainDaily * 10) / 10;
          this.setCapabilityValue('measure_rain_daily', daily).catch(() => {});
        }
        continue;
      }

      // Batteriestatus Außensensor
      if (code === 'outdoor_battery_status') {
        const isLow = rawValue === 'low_battery';
        this.setCapabilityValue('alarm_battery', isLow).catch(() => {});
        continue;
      }

      // Aktueller Niederschlag (Tagesniederschlag kommt aus outdoor_alert_display)
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

      if (mapping.capability === 'measure_wind_strength') {
        this.homey.app.getWindSpeedExceededTrigger().trigger(this, {}, { speed: value }).catch(() => {});
      }
      if (mapping.capability === 'measure_ultraviolet') {
        this.homey.app.getUvIndexHighTrigger().trigger(this, {}, { uv_index: value }).catch(() => {});
      }
    }
  }

  async onSettings({ newSettings, changedKeys }) {
    await this._setupCloud(newSettings);
    this._startPolling(); // sofort pollen nach jeder Einstellungsänderung
  }

  async onDeleted() {
    this._stopPolling();
  }

}

module.exports = VevorDevice;
