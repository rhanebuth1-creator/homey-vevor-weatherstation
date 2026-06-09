Vevor Weather Station for Homey

Integrate your Vevor YT60307 weather station into Homey via the Tuya Cloud API.

## Features

- Indoor & outdoor temperature with calibration offset
- Indoor & outdoor humidity
- Wind speed and wind direction
- Wind gusts
- Rainfall and daily rainfall accumulation
- Barometric pressure
- UV Index
- Light intensity
- Pool temperature (channel 1)
- Outdoor sensor battery alarm

## Setup

1. Create a Tuya developer account at https://iot.tuya.com
2. Add your Vevor weather station as a cloud device
3. Copy your Access ID, Access Secret and Device ID
4. In Homey: Add device → Vevor Weather Station → Vevor YT60307
5. Enter your Tuya credentials in the device settings

## Flow Cards

**Triggers:**
- Wind speed exceeded X km/h
- Rain started
- UV Index exceeded X

**Conditions:**
- Is raining / is not raining
- Indoor/outdoor temperature above X °C
- Indoor/outdoor humidity above X %
- Wind speed above X km/h
- UV Index above X
- Light intensity above X lux
- Air pressure above/below X hPa
- Daily rainfall above X mm
- Outdoor sensor battery low

## Support

https://github.com/rhanebuth1-creator/homey-vevor-weatherstation/issues
