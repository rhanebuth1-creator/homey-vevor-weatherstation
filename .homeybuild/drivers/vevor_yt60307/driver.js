'use strict';

const Homey = require('homey');

class VevorDriver extends Homey.Driver {

  async onInit() {
    this.log('Vevor YT60307 Driver initialisiert');
  }

  /**
   * Wird beim Pairing aufgerufen – zeigt ein Gerät zur Auswahl an.
   * Der Nutzer gibt IP, Device ID und Local Key manuell ein.
   */
  async onPairListDevices() {
    return [
      {
        name: 'Vevor YT60307 Wetterstation',
        data: {
          id: `vevor_yt60307_${Date.now()}`,
        },
        settings: {
          ip_address: '',
          device_id: '',
          local_key: '',
          poll_interval: 30,
          protocol_version: '3.3',
        },
      },
    ];
  }

}

module.exports = VevorDriver;
