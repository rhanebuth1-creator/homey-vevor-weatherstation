'use strict';

const Homey = require('homey');

class VevorDriver extends Homey.Driver {

  async onInit() {
    this.log('Vevor YT60307 Driver initialisiert (Cloud)');
  }

  async onPairListDevices() {
    return [
      {
        name: 'Vevor YT60307 Wetterstation',
        data: {
          id: `vevor_yt60307_${Date.now()}`,
        },
        settings: {
          access_id: '',
          access_secret: '',
          device_id: '',
          poll_interval: 10,
          temp_offset_indoor: 0.2,
          temp_offset_outdoor: 0,
        },
      },
    ];
  }

}

module.exports = VevorDriver;
