'use strict';

const Homey = require('homey');

class VevorWeatherStationApp extends Homey.App {

  async onInit() {
    this.log('Vevor Weather Station App gestartet');

    // Flow Trigger: Windgeschwindigkeit überschritten
    this._windSpeedExceededTrigger = this.homey.flow.getTriggerCard('wind_speed_exceeded');
    this._windSpeedExceededTrigger.registerRunListener(async (args, state) => {
      return state.speed > args.speed;
    });

    // Flow Trigger: Regen begonnen
    this._rainStartedTrigger = this.homey.flow.getTriggerCard('rain_started');

    // Flow Trigger: UV-Index hoch
    this._uvIndexHighTrigger = this.homey.flow.getTriggerCard('uv_index_high');
    this._uvIndexHighTrigger.registerRunListener(async (args, state) => {
      return state.uv_index > args.uv_index;
    });

    // Flow Condition: Regnet es?
    const isRainingCondition = this.homey.flow.getConditionCard('is_raining');
    isRainingCondition.registerRunListener(async (args) => {
      const device = args.device;
      const rain = device.getCapabilityValue('measure_rain');
      return rain > 0;
    });

    // Flow Condition: Windgeschwindigkeit über X?
    const windAboveCondition = this.homey.flow.getConditionCard('wind_speed_above');
    windAboveCondition.registerRunListener(async (args) => {
      const device = args.device;
      const windSpeed = device.getCapabilityValue('measure_wind_speed');
      return windSpeed > args.speed;
    });
  }

  getWindSpeedExceededTrigger() {
    return this._windSpeedExceededTrigger;
  }

  getRainStartedTrigger() {
    return this._rainStartedTrigger;
  }

  getUvIndexHighTrigger() {
    return this._uvIndexHighTrigger;
  }
}

module.exports = VevorWeatherStationApp;
