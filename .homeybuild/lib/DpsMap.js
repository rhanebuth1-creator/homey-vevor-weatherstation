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

function decodeWindDirection(b64) {
  try {
    const buf = Buffer.from(b64, 'base64');
    let i = 0;
    while (i < buf.length) {
      const tag = buf[i];
      const len = buf[i+1];
      if (i + 2 + len > buf.length) break;
      if (tag === 0x02 && len === 1) {
        const deg = buf[i+2] * 10;
        return deg % 360; // Fix: 360 → 0 (Nord)
      }
      i += 2 + len;
    }
  } catch(e) {}
  return null;
}

function degreesToCardinal(deg) {
  const dirs = ['N','NNO','NO','ONO','O','OSO','SO','SSO','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const index = Math.round((deg % 360) / 22.5) % 16;
  return dirs[index];
}

module.exports = { DPS_MAP, getMappingForCode, convertValue, decodeWindDirection, degreesToCardinal };
