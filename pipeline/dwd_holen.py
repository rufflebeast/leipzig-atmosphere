"""DWD-Daten der Station Leipzig-Holzhausen holen und als JSON speichern.

Die Werte kommen von Bright Sky, das die offenen Daten des Deutschen Wetterdienstes
als JSON bereitstellt. Das Skript läuft auf dem Server, nicht im Browser: So schickt
der Browser der Besucher keine Anfrage an einen weiteren Dienst, und auf der Seite
entsteht keine zusätzliche Datenübertragung an Dritte.

Aufruf:  python dwd_holen.py
Ergebnis: ../app/data/dwd.json
"""

import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import urlopen

import truststore

# Zertifikate des Betriebssystems verwenden (sonst scheitert HTTPS auf manchen Macs)
truststore.inject_into_ssl()

API = "https://api.brightsky.dev"
STATION = "02928"       # Leipzig-Holzhausen
STUNDEN = 48
ZIEL = Path(__file__).resolve().parent.parent / "app" / "data" / "dwd.json"

# Felder der aktuellen Messung, die die Seite anzeigt
AKTUELL = ["timestamp", "temperature", "relative_humidity", "pressure_msl",
           "wind_speed_10", "wind_direction_10", "wind_gust_speed_10",
           "precipitation_60", "cloud_cover"]


def lade_json(url):
    with urlopen(url, timeout=60) as antwort:
        return json.load(antwort)


def unix(zeitstempel):
    return int(datetime.fromisoformat(zeitstempel).timestamp())


def main():
    jetzt = datetime.now(timezone.utc)
    von = jetzt - timedelta(hours=STUNDEN)

    aktuell = lade_json(f"{API}/current_weather?dwd_station_id={STATION}")["weather"]
    verlauf = lade_json(f"{API}/weather?dwd_station_id={STATION}"
                        f"&date={von.isoformat()}&last_date={jetzt.isoformat()}")["weather"]
    # Nur Werte, die schon gemessen sind (Bright Sky ergänzt sonst Vorhersagen)
    verlauf = [w for w in verlauf if unix(w["timestamp"]) <= jetzt.timestamp()]

    daten = {
        "erzeugt": int(time.time()),
        "quelle": "Deutscher Wetterdienst (Open Data, CC BY 4.0), abgerufen über Bright Sky",
        "aktuell": {k: aktuell.get(k) for k in AKTUELL},
        "verlauf": {
            "zeit": [unix(w["timestamp"]) for w in verlauf],
            "temperatur": [w["temperature"] for w in verlauf],
            "taupunkt": [w["dew_point"] for w in verlauf],
            # Niederschlag der vorangegangenen Stunde, Zeitstempel = Ende der Stunde
            "niederschlag": [w["precipitation"] for w in verlauf],
        },
    }
    ZIEL.parent.mkdir(parents=True, exist_ok=True)
    ZIEL.write_text(json.dumps(daten, separators=(",", ":")), encoding="utf-8")
    print(f"Geschrieben: {ZIEL} ({ZIEL.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
