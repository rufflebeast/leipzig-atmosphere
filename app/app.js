// Gemeinsame Hilfsfunktionen und die aktuellen Messwerte von Leipzig-Holzhausen.
//
// Alle Daten kommen aus dem Ordner data/. Dort legt die Pipeline (Python, läuft bei
// GitHub) ihre JSON-Dateien ab. Der Browser fragt dadurch keinen fremden Dienst an.

// Alle 10 Minuten neu laden (Angabe in Millisekunden)
const INTERVALL = 10 * 60 * 1000;

// Ab diesem Alter gelten die Dateien der Pipeline als veraltet (Sekunden).
// Die Pipeline läuft alle 20 Minuten, GitHub startet geplante Läufe aber manchmal verspätet.
const VERALTET_NACH = 3 * 3600;

// Windrichtung in Grad -> Himmelsrichtung, z. B. 300 -> "WNW"
function himmelsrichtung(grad) {
  // 360° auf 16 Sektoren zu je 22,5° verteilen. Die Namen stehen in i18n.js.
  return T.richtungen[Math.round(grad / 22.5) % 16];
}

// Zahl mit fester Nachkommastelle (Komma oder Punkt je nach Sprache), fehlende Werte als Strich
function zahl(wert, stellen = 0) {
  if (wert === null || wert === undefined) return "–";
  return wert.toLocaleString(GEBIETSSCHEMA, {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  });
}

// Text in das Element mit der angegebenen id schreiben
function setze(id, text) {
  document.getElementById(id).textContent = text;
}

// Unix-Sekunden -> "08.10.2026, 19:00" in deutscher Ortszeit
function ortszeit(sekunden) {
  return new Date(sekunden * 1000).toLocaleString(GEBIETSSCHEMA, {
    timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short",
  });
}

// Eine JSON-Datei der Pipeline laden. "no-store": immer die neueste Fassung holen.
async function ladeDatei(name) {
  const antwort = await fetch(`data/${name}`, { cache: "no-store" });
  if (!antwort.ok) throw new Error(`${name}: HTTP ${antwort.status}`);
  return antwort.json();
}

function zeigeAktuell(dwd) {
  const w = dwd.aktuell;
  setze("temperatur", zahl(w.temperature, 1));
  setze("feuchte", zahl(w.relative_humidity));
  setze("druck", zahl(w.pressure_msl, 1));
  setze("wind", zahl(w.wind_speed_10));
  setze("windrichtung", w.wind_direction_10 == null ? "" : T.windAus(himmelsrichtung(w.wind_direction_10)));
  setze("boeen", zahl(w.wind_gust_speed_10));
  setze("niederschlag", zahl(w.precipitation_60, 1));
  setze("bewoelkung", zahl(w.cloud_cover));
  setze("zeitstempel", T.messungVom(ortszeit(Date.parse(w.timestamp) / 1000)));
}

function zeigeFehlerAktuell() {
  setze("zeitstempel", T.nichtErreichbar);
  for (const id of ["temperatur", "feuchte", "druck", "wind", "boeen", "niederschlag", "bewoelkung"]) setze(id, "–");
  setze("windrichtung", "");
}

// Hinweis oben auf der Seite, wenn Daten veraltet sind. Leere Liste blendet ihn aus.
function zeigeWarnungen(texte) {
  const feld = document.getElementById("warnung");
  feld.textContent = texte.join(" ");
  feld.hidden = texte.length === 0;
}

// Prüft, ob die Pipeline zuletzt gelaufen ist und ob Cloudnet neue Daten geliefert hat
function pruefeAlter(dwd, cloudnet) {
  const jetzt = Date.now() / 1000;
  const texte = [];
  const erzeugt = [dwd, cloudnet].filter(Boolean).map((d) => d.erzeugt);
  if (erzeugt.length && jetzt - Math.min(...erzeugt) > VERALTET_NACH) {
    texte.push(T.veraltet(ortszeit(Math.min(...erzeugt))));
  }
  if (cloudnet) {
    const letzte = Math.max(...Object.values(cloudnet.stationen).map((s) => s.letzte_messung || 0));
    if (jetzt - letzte > 24 * 3600) {
      texte.push(T.tropAlt);
    }
  }
  zeigeWarnungen(texte);
}

// Alles laden und anzeigen. Jede Quelle wird für sich behandelt: Fällt eine aus,
// erscheint der Rest trotzdem. zeichneVerlauf() steht in charts.js.
async function aktualisiere() {
  const [dwd, cloudnet] = (await Promise.allSettled([ladeDatei("dwd.json"), ladeDatei("cloudnet.json")]))
    .map((e) => {
      if (e.status === "rejected") console.error(e.reason);
      return e.status === "fulfilled" ? e.value : null;
    });

  if (dwd) zeigeAktuell(dwd); else zeigeFehlerAktuell();
  zeichneVerlauf(dwd, cloudnet);
  pruefeAlter(dwd, cloudnet);
}

// Erst starten, wenn auch charts.js geladen ist
window.addEventListener("DOMContentLoaded", () => {
  aktualisiere();
  setInterval(aktualisiere, INTERVALL);
});
