'use strict';

/**
 * Mapping der LOKALEN (numerischen) Tuya-DP-IDs auf Homey-Capabilities.
 * Ermittelt am 13.06.2026 per Abgleich lokaler 3.5-Read ↔ Stationsdisplay.
 *
 * Gegenstück zur cloud-basierten DpsMap.js (String-Codes). Lokal liefert
 * das Gerät Zahlen-IDs statt Codes wie `indoor_temperature`.
 *
 * factor: roher Wert wird durch factor geteilt.
 */

const LOCAL_DP_MAP = {
  117: { capability: 'measure_temperature',          factor: 10 },  // Innentemp
  118: { capability: 'measure_temperature.outdoor',  factor: 10 },  // Außentemp
  119: { capability: 'measure_humidity',             factor: 1  },  // Innenfeuchte
  120: { capability: 'measure_humidity.outdoor',     factor: 1  },  // Außenfeuchte
  121: { capability: 'measure_pressure',             factor: 100 }, // Luftdruck (absolut)
  115: { capability: 'measure_luminance',            factor: 100 }, // Lichtstärke (klux)
  116: { capability: 'measure_ultraviolet',          factor: 1  },  // UV-Index
  126: { capability: 'measure_temperature.pool',     factor: 10 },  // Pool / CH1
  112: { capability: 'measure_wind_strength',        factor: 10 },  // Windgeschwindigkeit
  132: { capability: 'measure_gust_strength',        factor: 10 },  // Böe (zu bestätigen)
  102: { capability: 'measure_rain',                 factor: 10 },  // Niederschlag (Faktor bei Regen prüfen)
};

// Batteriestatus Außensensor (String-DP). 'low_battery' -> alarm_battery = true
const LOCAL_DP_BATTERY = 123;

// Noch ungeklärt: 108 (=420, stabil), 106 (=false, Alarm-Flag?), Windrichtung
// (kam in der Cloud aus outdoor_alert_display; lokal noch kein sauberer DP gefunden).

function getLocalMapping(dpId) {
  return LOCAL_DP_MAP[String(dpId)] || LOCAL_DP_MAP[Number(dpId)] || null;
}

module.exports = { LOCAL_DP_MAP, LOCAL_DP_BATTERY, getLocalMapping };
