# Vevor YT60307 – Homey Pro App

Lokale Integration der Vevor YT60307 7-in-1 WLAN-Wetterstation für Homey Pro.  
Keine Cloud, kein Tuya-Account nötig – läuft komplett im lokalen Netzwerk.

---

## 📡 Übertragene Messwerte

| Messwert              | Capability                    |
|-----------------------|-------------------------------|
| Innentemperatur       | `measure_temperature`         |
| Außentemperatur       | `measure_temperature.outdoor` |
| Innenluftfeuchtigkeit | `measure_humidity`            |
| Außenluftfeuchtigkeit | `measure_humidity.outdoor`    |
| Windgeschwindigkeit   | `measure_wind_speed`          |
| Windrichtung          | `measure_wind_angle`          |
| Niederschlag          | `measure_rain`                |
| Luftdruck             | `measure_pressure`            |
| UV-Index              | `measure_ultraviolet`         |
| Lichtstärke           | `measure_luminance`           |
| Pooltemperatur        | `measure_temperature.pool`    |

---

## 🚀 Installation

### Schritt 1 – App installieren

```bash
# Homey CLI installieren (einmalig)
npm install -g homey

# In den App-Ordner wechseln
cd vevor-weatherstation

# App auf Homey Pro installieren
homey app install
```

### Schritt 2 – Drei Infos beschaffen

Du brauchst:
1. **IP-Adresse** der Wetterstation (aus der Geräteliste deines Routers)
2. **Device ID** (Tuya-Geräte-ID)
3. **Local Key** (verschlüsselter lokaler Schlüssel)

#### Device ID und Local Key ermitteln

**Methode A – tuyaLocal / tuyapi-finder (empfohlen):**
```bash
npx @tuyapi/cli wizard
```
Folge dem Assistenten – du brauchst dazu einmalig Zugang zur Tuya Cloud  
(kostenloser Developer-Account auf [iot.tuya.com](https://iot.tuya.com)).

**Methode B – Smart Life App + Netzwerkanalyse:**
- Gerät in Smart Life App einrichten
- Mit einem Tool wie [tuya-local-key-extractor](https://github.com/mzakharo/tuyappy) den Key extrahieren

**Methode C – lokales Netzwerk-Sniffing:**
- Wireshark oder tcpdump auf dem Router
- Tuya-Pakete enthalten Device ID im Klartext

---

### Schritt 3 – Gerät in Homey einrichten

1. Homey App öffnen → Geräte → `+` → **Vevor Wetterstation**
2. Gerät auswählen → Weiter
3. In den **Geräteeinstellungen** eintragen:
   - IP-Adresse (z.B. `192.168.1.105`)
   - Device ID
   - Local Key
   - Protokollversion (Standard: `3.3`)
   - Aktualisierungsintervall (Standard: 30 Sekunden)

---

## 🔁 Flow-Karten

### Trigger (Wenn…)
- **Windgeschwindigkeit überschritten** – z.B. Markise einfahren wenn Wind > 40 km/h
- **Regen hat begonnen** – z.B. Benachrichtigung senden
- **UV-Index ist hoch** – z.B. Sonnenschutz aktivieren (UV > 6)

### Bedingungen (Und…)
- **Es regnet / Es regnet nicht**
- **Windgeschwindigkeit ist über X km/h**

---

## ⚙️ Einstellungen

| Einstellung           | Beschreibung                                      |
|-----------------------|---------------------------------------------------|
| IP-Adresse            | Lokale IP der Wetterstation                       |
| Device ID             | Tuya-Geräte-ID                                    |
| Local Key             | Tuya-Verschlüsselungsschlüssel                    |
| Protokollversion      | 3.1 / 3.3 / 3.4 (Standard: 3.3)                  |
| Aktualisierungsintervall | Abfrageintervall in Sekunden (min. 10)         |

---

## 🛠️ Fehlerbehebung

**Gerät nicht erreichbar:**
- IP-Adresse korrekt? Im Router prüfen
- Wetterstation muss im gleichen WLAN-Netz wie Homey Pro sein
- Nur 2,4 GHz wird unterstützt (kein 5 GHz)

**Falsche Werte:**
- DPS-Nummern können je nach Firmware variieren
- In `lib/DpsMap.js` die DP-Nummern anpassen
- Mit `homey app run` (Debug-Modus) die empfangenen DPS-Werte im Log prüfen

**Local Key ungültig:**
- Nach einem Reset der Wetterstation oder erneutem Pairen ändert sich der Local Key
- Key erneut aus der Tuya Cloud auslesen

---

## 📝 Hinweise

- Die App kommuniziert **ausschließlich lokal** – keine Daten verlassen dein Heimnetz
- Die Smart Life App muss **nicht** geöffnet oder installiert sein
- Bei Stromausfall der Wetterstation verbindet sich die App automatisch neu
- Pool-Thermometer-Werte sind nur verfügbar wenn das Zubehör angeschlossen ist

---

## Lizenz

MIT License
