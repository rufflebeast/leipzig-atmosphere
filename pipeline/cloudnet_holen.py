"""Cloudnet-Daten der TROPOS-Stationen Leipzig und Melpitz holen und als JSON speichern.

Cloudnet (ACTRIS) stellt die Messungen als NetCDF4/HDF5-Dateien bereit. Ein Browser
kann diese Dateien nicht direkt lesen, und die Cloudnet-Schnittstelle erlaubt keinen
Abruf von fremden Webseiten. Dieses Skript läuft deshalb auf dem Server (oder lokal),
liest die Dateien der letzten 48 Stunden und schreibt eine kleine JSON-Datei, die die
Webseite laden kann.

Aufruf:  python cloudnet_holen.py
Ergebnis: ../app/data/cloudnet.json
"""

import io
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import urlopen

import h5py
import numpy as np
import truststore

# Zertifikate des Betriebssystems verwenden (sonst scheitert HTTPS auf manchen Macs)
truststore.inject_into_ssl()

API = "https://cloudnet.fmi.fi/api/files"
STATIONEN = {
    "leipzig": "TROPOS-Dach Leipzig",
    "melpitz": "TROPOS Melpitz",
}
STUNDEN = 48            # Zeitfenster
RASTER = 5 * 60         # Mittelungsintervall in Sekunden (5 Minuten)
FUELLWERT = 1e30        # NetCDF-Füllwert ist 9.97e36, alles darüber gilt als fehlend
HOEHE_SCHRITT = 120     # Höhenraster der Klassifikation in Metern (4 Cloudnet-Messbereiche)
HOEHE_MAX = 12000       # bis 12 km über Grund
KLASSEN = 11            # Cloudnet-Klassen 0 bis 10, siehe klassifikation_raster()
ZEICHEN = "0123456789a" # eine Klasse = ein Zeichen, hält die JSON-Datei klein
FASSUNG = "v2"          # bei Änderungen am Auslesen erhöhen, dann wird der Speicher neu gefüllt
ZIEL = Path(__file__).resolve().parent.parent / "app" / "data" / "cloudnet.json"
# Bereits ausgelesene Dateien. GitHub Actions hebt den Ordner zwischen den Läufen auf,
# damit unveränderte Dateien nicht jede Stunde neu von Cloudnet geladen werden.
SPEICHER = Path(__file__).resolve().parent / ".zwischenspeicher"


def lade_json(url):
    with urlopen(url, timeout=60) as antwort:
        return json.load(antwort)


def lade_datei(url):
    """NetCDF-Datei herunterladen und als geöffnetes h5py-Objekt zurückgeben."""
    with urlopen(url, timeout=120) as antwort:
        return h5py.File(io.BytesIO(antwort.read()), "r")


def zeit_in_unix(datei, tag):
    """Cloudnet speichert 'Stunden seit Mitternacht UTC' -> Unix-Sekunden."""
    mitternacht = datetime(tag.year, tag.month, tag.day, tzinfo=timezone.utc).timestamp()
    return mitternacht + datei["time"][...].astype("float64") * 3600


def werte(datei, name):
    """Variable lesen, Füllwerte durch NaN ersetzen."""
    v = datei[name][...].astype("float64")
    v[v > FUELLWERT] = np.nan
    return v


def sammle(station, produkt, tage, auslesen):
    """Für jeden Tag die Produktdatei holen und die Teilergebnisse aneinanderhängen.

    Die Prüfsumme der Datei zeigt, ob sie sich seit dem letzten Lauf geändert hat.
    Nur dann wird sie neu heruntergeladen, sonst kommt das Ergebnis aus dem Speicher.
    """
    teile = []
    for tag in tage:
        liste = lade_json(f"{API}?site={station}&product={produkt}&date={tag:%Y-%m-%d}")
        if not liste:
            continue
        eintrag = liste[0]
        gespeichert = SPEICHER / f"{station}_{produkt}_{tag:%Y%m%d}_{FASSUNG}_{eintrag['checksum'][:16]}.npz"
        if gespeichert.exists():
            with np.load(gespeichert) as alt:
                teile.append({k: alt[k] for k in alt.files})
            continue
        with lade_datei(eintrag["downloadUrl"]) as datei:
            teil = auslesen(datei, tag)
        SPEICHER.mkdir(exist_ok=True)
        # Ältere Fassungen derselben Tagesdatei entfernen
        for veraltet in SPEICHER.glob(f"{station}_{produkt}_{tag:%Y%m%d}_*.npz"):
            veraltet.unlink()
        np.savez_compressed(gespeichert, **teil)
        teile.append(teil)
    if not teile:
        return None
    return {k: np.concatenate([t[k] for t in teile]) for k in teile[0]}


def auf_raster(t, v, kanten, art="mittel"):
    """Messwerte in Zeitintervalle einsortieren und je Intervall zusammenfassen.

    art = "mittel": Mittelwert, "median": Median, "summe": Summe.
    Intervalle ohne gültige Werte bleiben leer (None in der JSON-Datei).
    """
    fach = np.digitize(t, kanten) - 1
    ergebnis = []
    for i in range(len(kanten) - 1):
        auswahl = v[(fach == i) & np.isfinite(v)]
        if auswahl.size == 0:
            ergebnis.append(None)
        elif art == "median":
            ergebnis.append(float(np.median(auswahl)))
        elif art == "summe":
            ergebnis.append(float(auswahl.sum()))
        else:
            ergebnis.append(float(auswahl.mean()))
    return ergebnis


def klassen_je_hoehe(klasse, hoehe_ueber_grund):
    """Zielklassifikation eines Tages auf das 120-m-Höhenraster bringen.

    klasse: Klassen je Profil und Messbereich (Zeit × Höhe, etwa 30 m Abstand)
    Ergebnis: Klassen je Profil und 120-m-Stufe. In jeder Stufe gilt die häufigste
    Klasse außer "klar". Nur wenn kein Messbereich etwas enthält, bleibt die Stufe klar.
    So gehen dünne Wolkenschichten beim Zusammenfassen nicht verloren.
    """
    stufen = HOEHE_MAX // HOEHE_SCHRITT
    stufe = np.floor(hoehe_ueber_grund / HOEHE_SCHRITT).astype(int)
    gueltig = (stufe >= 0) & (stufe < stufen)
    anzahl = np.zeros((klasse.shape[0], stufen, KLASSEN), dtype=np.int16)
    zeilen = np.arange(klasse.shape[0])[:, None]
    k = klasse[:, gueltig]
    np.add.at(anzahl, (np.broadcast_to(zeilen, k.shape), np.broadcast_to(stufe[gueltig], k.shape), k), 1)
    belegt = anzahl[:, :, 1:].sum(axis=2) > 0
    return np.where(belegt, anzahl[:, :, 1:].argmax(axis=2) + 1, 0).astype(np.int8)


def klassifikation_raster(t, klasse, kanten, anteil=0.3):
    """Klassen je 5-Minuten-Intervall und Höhenstufe, als Zeichenkette je Intervall.

    Eine Zelle bekommt die häufigste Klasse außer "klar", wenn mindestens 30 % der
    Profile im Intervall dort etwas zeigen. Intervalle ohne Messung werden "-".
    Bedeutung der Klassen: 0 klar, 1 Wolkentröpfchen, 2 Niesel oder Regen,
    3 Regen und Tröpfchen, 4 Eis, 5 Eis und unterkühlte Tröpfchen, 6 schmelzendes Eis,
    7 schmelzendes Eis und Tröpfchen, 8 Aerosol, 9 Insekten, 10 Aerosol und Insekten.
    """
    n = len(kanten) - 1
    fach = np.digitize(t, kanten) - 1
    drin = (fach >= 0) & (fach < n)
    fach, klasse = fach[drin], klasse[drin]
    profile = np.bincount(fach, minlength=n)
    anzahl = np.zeros((n, klasse.shape[1], KLASSEN), dtype=np.int16)
    for k in range(1, KLASSEN):
        np.add.at(anzahl[:, :, k], fach, (klasse == k).astype(np.int16))
    belegt = anzahl[:, :, 1:].sum(axis=2)
    beste = anzahl[:, :, 1:].argmax(axis=2) + 1
    spalten = []
    for i in range(n):
        if profile[i] == 0:
            spalten.append("-" * klasse.shape[1])
            continue
        zelle = np.where(belegt[i] >= anteil * profile[i], beste[i], 0)
        spalten.append("".join(ZEICHEN[c] for c in zelle))
    return spalten


def runde(liste, stellen):
    return [None if x is None else round(x, stellen) for x in liste]


def verarbeite(station, jetzt):
    tage = [(jetzt - timedelta(days=d)).date() for d in (2, 1, 0)]
    beginn = (jetzt.timestamp() - STUNDEN * 3600) // RASTER * RASTER
    kanten = np.arange(beginn, jetzt.timestamp() + RASTER, RASTER)
    stunden_kanten = np.arange(beginn // 3600 * 3600, jetzt.timestamp() + 3600, 3600)

    # Wolken: Basis und Obergrenze über Grund, dazu die Regenkennung
    wolken = sammle(station, "classification", tage, lambda d, tag: {
        "t": zeit_in_unix(d, tag),
        "basis": werte(d, "cloud_base_height_agl"),
        "top": werte(d, "cloud_top_height_agl"),
        "regen": d["rain_detected"][...].astype("float64"),
        # Höhe der Messbereiche über Meeresspiegel minus Höhe der Station = über Grund
        "klasse": klassen_je_hoehe(d["target_classification"][...],
                                   d["height"][...] - float(np.ravel(d["altitude"][...])[0])),
    })

    # Mikrowellenradiometer: Flüssigwasserpfad und Wasserdampf
    mwr = sammle(station, "mwr", tage, lambda d, tag: {
        "t": zeit_in_unix(d, tag),
        "lwp": werte(d, "lwp") * 1000,   # kg/m² -> g/m²
        "iwv": werte(d, "iwv"),          # kg/m²
    })

    if mwr is not None and wolken is not None:
        # Qualitätskontrolle: Bei Regen ist die Radiometer-Haube nass, LWP und IWV
        # sind dann unbrauchbar. Messpunkte innerhalb von 5 Minuten nach einer
        # Regenkennung werden verworfen.
        regenzeiten = np.sort(wolken["t"][wolken["regen"] > 0])
        if regenzeiten.size:
            # Für jeden Messpunkt den zeitlich nächsten Regenzeitpunkt suchen
            pos = np.searchsorted(regenzeiten, mwr["t"])
            davor = regenzeiten[np.clip(pos - 1, 0, regenzeiten.size - 1)]
            danach = regenzeiten[np.clip(pos, 0, regenzeiten.size - 1)]
            abstand = np.minimum(np.abs(mwr["t"] - davor), np.abs(mwr["t"] - danach))
            nass = abstand < 300
            mwr["lwp"][nass] = np.nan
            mwr["iwv"][nass] = np.nan

    reihen = {"zeit": [int(k) for k in kanten[:-1]]}
    if wolken is not None:
        reihen["wolkenbasis_km"] = runde(auf_raster(wolken["t"], wolken["basis"] / 1000, kanten, "median"), 2)
        reihen["wolkentop_km"] = runde(auf_raster(wolken["t"], wolken["top"] / 1000, kanten, "median"), 2)
    if mwr is not None:
        reihen["lwp_g_m2"] = runde(auf_raster(mwr["t"], mwr["lwp"], kanten), 0)
        reihen["iwv_kg_m2"] = runde(auf_raster(mwr["t"], mwr["iwv"], kanten), 1)

    ergebnis = {
        "name": STATIONEN[station],
        "letzte_messung": None,
        "reihen": reihen,
    }

    # Letzter Zeitpunkt mit Wolkendaten, damit die Seite den Verzug anzeigen kann
    if wolken is not None:
        ergebnis["letzte_messung"] = int(wolken["t"].max())
        # Höhen-Zeit-Schnitt der Zielklassifikation
        ergebnis["klassifikation"] = {
            "hoehe_schritt_m": HOEHE_SCHRITT,
            "spalten": klassifikation_raster(wolken["t"], wolken["klasse"], kanten),
        }

    # Niederschlag gibt es nur in Melpitz (Wägeregenmesser), stündlich aufsummiert
    if station == "melpitz":
        regen = sammle(station, "rain-gauge", tage, lambda d, tag: {
            "t": zeit_in_unix(d, tag),
            # Regenrate in m/s, ein Wert pro Minute -> mm pro Minute
            "mm": werte(d, "rainfall_rate") * 60 * 1000,
        })
        if regen is not None:
            ergebnis["niederschlag_stuendlich"] = {
                # Zeitstempel = Ende der Stunde, wie beim DWD ("letzte 60 Minuten")
                "zeit": [int(k) for k in stunden_kanten[1:]],
                "mm": runde(auf_raster(regen["t"], regen["mm"], stunden_kanten, "summe"), 1),
            }

    return ergebnis


def raeume_auf(tage=5):
    """Gespeicherte Dateien entfernen, die älter als einige Tage sind."""
    grenze = time.time() - tage * 86400
    for datei in SPEICHER.glob("*.npz"):
        if datei.stat().st_mtime < grenze:
            datei.unlink()


def main():
    jetzt = datetime.now(timezone.utc)
    if SPEICHER.exists():
        raeume_auf()
    daten = {
        "erzeugt": int(time.time()),
        "quelle": "Cloudnet / ACTRIS (https://cloudnet.fmi.fi), Messungen TROPOS, Lizenz CC BY 4.0, auf 5 Minuten zusammengefasst und gefiltert",
        "stationen": {s: verarbeite(s, jetzt) for s in STATIONEN},
    }
    ZIEL.parent.mkdir(parents=True, exist_ok=True)
    ZIEL.write_text(json.dumps(daten, separators=(",", ":")), encoding="utf-8")
    print(f"Geschrieben: {ZIEL} ({ZIEL.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
