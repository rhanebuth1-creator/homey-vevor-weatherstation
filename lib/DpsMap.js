'use strict';

const DPS_MAP = {
  'indoor_temperature':  { capability: 'measure_temperature',         factor: 10  },
  'outdoor_temperature': { capability: 'measure_temperature.outdoor', factor: 10  },
  'indoor_humidity':     { capability: 'measure_humidity',            factor: 1   },
  'outdoor_humidity':    { capability: 'measure_humidity.outdoor',    factor: 1   },
  'wind_speed':          { capability: 'measure_wind_strength',       factor: 10  },
  'wind_gust':           { capability: 'measure_gust_strength',       factor: 10  },
  'rainfall':            { capability: 'measure_rain',                factor: 10  },
  'indoor_pressure':     { capability: 'measure_pressure',            factor: 100 },
  'uvi':                 { capability: 'measure_ultraviolet',         factor: 1   },
  'light_intensity':     { capability: 'measure_luminance',           factor: 100 },
  'ch1_temp':            { capability: 'measure_temperature.pool',    factor: 10  },
};

function getMappingForCode(code) {
  return DPS_MAP[code] || null;
}

function convertValue(code, raw) {
  const mapping = DPS_MAP[code];
  if (!mapping) return null;
  const num = Number(raw);
  if (isNaN(num)) return null;
  return num / mapping.factor;
}

function decodeOutdoorDisplay(b64) {
  const result = {};
  try {
    const buf = Buffer.from(b64, 'base64');
    let i = 0;
    while (i < buf.length) {
      const tag = buf[i];
      const len = buf[i+1];
      if (i + 2 + len > buf.length) break;
      const val = buf.slice(i+2, i+2+len);
      let num;
      if (len === 1) num = val[0];
      else if (len === 2) num = val.readInt16BE(0);
      else if (len === 3) num = (val[0] << 16) | (val[1] << 8) | val[2];
      else if (len === 4) num = val.readInt32BE(0);

      switch (tag) {
        case 0x02: result.windAngle = num * 10; break;     // Windrichtung
        case 0x12: result.rainEvent = num / 10; break;     // Aktueller Schauer mm (Tag 18)
      }
      i += 2 + len;
    }
  } catch(e) {}
  return result;
}

function decodeWindDirection(b64) {
  const r = decodeOutdoorDisplay(b64);
  return r.windAngle !== undefined ? r.windAngle % 360 : null;
}

function degreesToCardinal(deg) {
  const dirs = ['N','NNO','NO','ONO','O','OSO','SO','SSO','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round((deg % 360) / 22.5) % 16];
}

module.exports = { DPS_MAP, getMappingForCode, convertValue, decodeOutdoorDisplay, decodeWindDirection, degreesToCardinal };
