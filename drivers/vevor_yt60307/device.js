'use strict';

const Homey = require('homey');
const TuyaCloud = require('../../lib/TuyaCloud');
const { getMappingForCode, convertValue, decodeOutdoorDisplay } = require('../../lib/DpsMap');

class VevorDevice extends Homey.Device {

  async onInit() {
    this.log('Vevor YT60307 initialisiert:', this.getName());
    this._cloud = null;
    this._pollTimer = null;
    this._midnightTimer = null;
    this._wasRaining = false;
    this._lastRainValue = -1;

    // Tagesniederschlag aus persistentem Speicher laden
    this._dailyRain = this.getStoreValue('dailyRain') || 0;
    const lastResetDate = this.getStoreValue('lastResetDate') || '';
    const today = new Date().toDateString();

    if (lastResetDate !== today) {
      this._dailyRain = 0;
      await this.setStoreValue('dailyRain', 0);
      await this.setStoreValue('lastResetDate', today);
      this.log('Neuer Tag - Tagesniederschlag zurückgesetzt');
    }

    this.log('Tagesniederschlag beim Start:', this._dailyRain, 'mm');

    await this._setupCloud();
    this._startPolling();
    this._scheduleMidnightReset();
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

  _scheduleMidnightReset() {
    if (this._midnightTimer) clearTimeout(this._midnightTimer);
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    this._midnightTimer = setTimeout(async () => {
      this.log('Mitternacht - Tagesniederschlag zurückgesetzt');
      this._dailyRain = 0;
      this._lastRainValue = -1;
      await this.setStoreValue('dailyRain', 0);
      await this.setStoreValue('lastResetDate', new Date().toDateString());
      this.setCapabilityValue('measure_rain_daily', 0).catch(() => {});
      this._scheduleMidnightReset();
    }, midnight - now);
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

      // Windrichtung aus outdoor_alert_display Buffer
      if (code === 'outdoor_alert_display') {
        const decoded = decodeOutdoorDisplay(rawValue);
        if (decoded.windAngle !== undefined) {
          this.setCapabilityValue('measure_wind_angle', decoded.windAngle % 360).catch(() => {});
        }
        continue;
      }

      // Batteriestatus Außensensor
      if (code === 'outdoor_battery_status') {
        const isLow = rawValue === 'low_battery';
        this.setCapabilityValue('alarm_battery', isLow).catch(() => {});
        continue;
      }

      // Niederschlag separat (Tuya-Reset-Problem)
      if (code === 'rainfall') {
        const rainNow = Math.round(Number(rawValue) / 10 * 10) / 10;

        this.setCapabilityValue('measure_rain', rainNow).catch(() => {});

        if (this._lastRainValue === -1) {
          // Erster Wert nach Start: als Referenz setzen, nicht aufaddieren
          this._lastRainValue = rainNow;
          this.setCapabilityValue('measure_rain_daily', this._dailyRain).catch(() => {});
        } else if (rainNow >= this._lastRainValue + 0.1) {
          // Echter Zuwachs (mind. 0.1mm) → aufaddieren
          this._dailyRain = Math.round((this._dailyRain + (rainNow - this._lastRainValue)) * 10) / 10;
          this.setCapabilityValue('measure_rain_daily', this._dailyRain).catch(() => {});
          this.setStoreValue('dailyRain', this._dailyRain).catch(() => {});
          this._lastRainValue = rainNow;
        } else if (rainNow < this._lastRainValue - 0.5) {
          // Signifikante Abnahme (>0.5mm) → echter Tuya-Reset, neue Referenz setzen
          this._lastRainValue = rainNow;
        }
        // Kleine Schwankungen (±0.5mm) ignorieren — kein Reset, kein Zuwachs

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
    if (this._midnightTimer) clearTimeout(this._midnightTimer);
  }

}

module.exports = VevorDevice;
