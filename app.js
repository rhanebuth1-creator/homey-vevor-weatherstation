'use strict';

const Homey = require('homey');

class VevorWeatherStationApp extends Homey.App {

  async onInit() {
    this.log('Vevor Weather Station App v2 gestartet');

    // ─── Triggers ────────────────────────────────────────────────────────────

    this._windSpeedExceededTrigger = this.homey.flow.getTriggerCard('wind_speed_exceeded');
    this._windSpeedExceededTrigger.registerRunListener(async (args, state) => {
      return state.speed > args.speed;
    });

    this._rainStartedTrigger = this.homey.flow.getTriggerCard('rain_started');

    this._uvIndexHighTrigger = this.homey.flow.getTriggerCard('uv_index_high');
    this._uvIndexHighTrigger.registerRunListener(async (args, state) => {
      return state.uv_index > args.uv_index;
    });

    // ─── Conditions ──────────────────────────────────────────────────────────

    // Regnet es?
    this.homey.flow.getConditionCard('is_raining')
      .registerRunListener(async (args) => {
        return (args.device.getCapabilityValue('measure_rain') || 0) > 0;
      });

    // Windgeschwindigkeit über X?
    this.homey.flow.getConditionCard('wind_speed_above')
      .registerRunListener(async (args) => {
        return (args.device.getCapabilityValue('measure_wind_strength') || 0) > args.speed;
      });

    // Innentemperatur über X?
    this.homey.flow.getConditionCard('temperature_indoor_above')
      .registerRunListener(async (args) => {
        return (args.device.getCapabilityValue('measure_temperature') || 0) > args.temperature;
      });

    // Außentemperatur über X?
    this.homey.flow.getConditionCard('temperature_outdoor_above')
      .registerRunListener(async (args) => {
        return (args.device.getCapabilityValue('measure_temperature.outdoor') || 0) > args.temperature;
      });

    // Innenluftfeuchtigkeit über X?
    this.homey.flow.getConditionCard('humidity_indoor_above')
      .registerRunListener(async (args) => {
        return (args.device.getCapabilityValue('measure_humidity') || 0) > args.humidity;
      });

    // Außenluftfeuchtigkeit über X?
    this.homey.flow.getConditionCard('humidity_outdoor_above')
      .registerRunListener(async (args) => {
        return (args.device.getCapabilityValue('measure_humidity.outdoor') || 0) > args.humidity;
      });

    // UV-Index über X?
    this.homey.flow.getConditionCard('uv_index_above')
      .registerRunListener(async (args) => {
        return (args.device.getCapabilityValue('measure_ultraviolet') || 0) > args.uv_index;
      });

    // Lichtstärke über X?
    this.homey.flow.getConditionCard('luminance_above')
      .registerRunListener(async (args) => {
        return (args.device.getCapabilityValue('measure_luminance') || 0) > args.luminance;
      });

    // Luftdruck über X?
    this.homey.flow.getConditionCard('pressure_above')
      .registerRunListener(async (args) => {
        return (args.device.getCapabilityValue('measure_pressure') || 0) > args.pressure;
      });

    // Luftdruck unter X?
    this.homey.flow.getConditionCard('pressure_below')
      .registerRunListener(async (args) => {
        return (args.device.getCapabilityValue('measure_pressure') || 0) < args.pressure;
      });

    // Tagesniederschlag über X?
    this.homey.flow.getConditionCard('daily_rain_above')
      .registerRunListener(async (args) => {
        return (args.device.getCapabilityValue('measure_rain_daily') || 0) > args.rain;
      });

    // Außensensor Batterie schwach?
    this.homey.flow.getConditionCard('outdoor_battery_low')
      .registerRunListener(async (args) => {
        return args.device.getCapabilityValue('alarm_battery') === true;
      });
  }

  getWindSpeedExceededTrigger() { return this._windSpeedExceededTrigger; }
  getRainStartedTrigger()       { return this._rainStartedTrigger; }
  getUvIndexHighTrigger()       { return this._uvIndexHighTrigger; }

}

module.exports = VevorWeatherStationApp;
