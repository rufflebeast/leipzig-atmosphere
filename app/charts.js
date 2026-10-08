// Schritt 2: Zeitreihen der letzten 48 Stunden für drei Stationen.
//
// Holzhausen kommt aus data/dwd.json (pipeline/dwd_holen.py), die beiden
// TROPOS-Stationen aus data/cloudnet.json (pipeline/cloudnet_holen.py).

const STUNDEN = 48;

// Eine Farbe pro Station, in allen Diagrammen gleich
const FARBE = {
  holzhausen: "#5E6E73",   // Grau
  tropos: "#0A5C6D",       // Petrol
  melpitz: "#C0712B",      // Ocker
};

// Monats- und Wochentagsnamen für die Zeitachse, aus i18n.js
const NAMEN = { MMMM: T.monate, MMM: T.monateKurz, WWWW: T.tage, WWW: T.tageKurz };

// Zahl für die Legende: Komma oder Punkt je nach Sprache, Strich bei fehlendem Wert
function fmt(stellen) {
  return (u, v) => (v == null ? "–" : v.toLocaleString(GEBIETSSCHEMA, {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  }));
}

// Werte zweier Quellen auf eine gemeinsame Zeitachse legen.
// zeiten: gemeinsame Zeitpunkte; quellen: Liste von {zeit: [...], wert: [...]}
function aufAchse(zeiten, quellen) {
  return quellen.map(({ zeit, wert }) => {
    const nachZeit = new Map(zeit.map((t, i) => [t, wert[i]]));
    return zeiten.map((t) => nachZeit.get(t) ?? null);
  });
}

// Beschriftung der Zeitachse: 24-Stunden-Format, um Mitternacht Wochentag und Datum.
// uPlot übergibt die Positionen der Teilstriche als Unix-Sekunden.
const UHRZEIT = new Intl.DateTimeFormat(GEBIETSSCHEMA, { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const TAG = new Intl.DateTimeFormat(GEBIETSSCHEMA, { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit" });

function achsenbeschriftung(u, striche) {
  return striche.map((t) => {
    const datum = new Date(t * 1000);
    const uhrzeit = UHRZEIT.format(datum);
    return uhrzeit === "00:00" ? TAG.format(datum) : uhrzeit;
  });
}

// Gemeinsame Einstellungen für alle Diagramme
function grundeinstellung(container, von, bis) {
  return {
    width: container.clientWidth,
    height: 180,
    // Zeit in deutscher Ortszeit anzeigen, egal wo der Browser steht
    tzDate: (ts) => uPlot.tzDate(new Date(ts * 1000), "Europe/Berlin"),
    fmtDate: (vorlage) => uPlot.fmtDate(vorlage, NAMEN),
    // Gleiche "sync"-Kennung: der Mauszeiger läuft durch alle Diagramme mit
    cursor: { sync: { key: "zeit" } },
    scales: { x: { time: true, min: von, max: bis } },
    axes: [
      { stroke: "#5E6E73", grid: { stroke: "#E6EBEC" }, values: achsenbeschriftung },
      { stroke: "#5E6E73", grid: { stroke: "#E6EBEC" }, size: 50 },
    ],
    legend: { live: true },
  };
}

// Linien-Serie
function linie(label, farbe, stellen) {
  return { label, stroke: farbe, width: 2, value: fmt(stellen) };
}

// Punkt-Serie ohne Verbindungslinie (für Wolkenhöhen)
function punkte(label, farbe, gefuellt) {
  return {
    label,
    stroke: farbe,
    paths: () => null,
    points: { show: true, size: gefuellt ? 5 : 6, width: 1.5, fill: gefuellt ? farbe : "#FFFFFF" },
    value: fmt(1),
  };
}

// Balken-Serie; der Balken liegt links vom Zeitstempel (Summe der Stunde davor)
function balken(label, farbe, breite) {
  return {
    label,
    stroke: farbe,
    fill: farbe,
    paths: uPlot.paths.bars({ size: [breite, 40], align: -1 }),
    points: { show: false },
    value: fmt(1),
  };
}

// Cloudnet-Zielklassifikation: Farbe je Klasse (Zeichen aus der JSON-Datei).
// Die Namen stehen in i18n.js.
const KLASSEN_FARBE = {
  "1": "#8EC3E6", "2": "#1F4E79", "3": "#3F78A8", "4": "#C9B8E2", "5": "#7A5BA6",
  "6": "#E8A06A", "7": "#C0712B", "8": "#DDD5C4", "9": "#9FB08C", "a": "#C2C8A6",
};
const KEINE_MESSUNG = "#EEF1F2";

// Alle gezeichneten Diagramme, nach Container-id
const diagramme = new Map();

function zeichne(id, serien, daten, von, bis, extra = {}) {
  const container = document.getElementById(id);
  // Beim Aktualisieren das alte Diagramm entfernen und neu zeichnen
  diagramme.get(id)?.destroy();
  container.textContent = "";
  const opts = grundeinstellung(container, von, bis);
  opts.series = [{ label: T.zeit, value: T.zeitFormat }, ...serien];
  Object.assign(opts.scales, extra.scales || {});
  const diagramm = new uPlot(opts, daten, container);
  beschreibe(diagramm, id);
  beruehrung(diagramm);
  diagramme.set(id, diagramm);
}

// Höhen-Zeit-Schnitt der Klassifikation einer Station.
// uPlot liefert Zeitachse, Höhenachse, Mauszeiger und Gleichlauf mit den anderen
// Diagrammen. Die farbigen Zellen zeichnet ein eigener Schritt ("hook") auf die Fläche.
function zeichneKlassen(id, station, von, bis) {
  const k = station.klassifikation;
  const zeit = station.reihen.zeit;
  const schritt = k.hoehe_schritt_m / 1000;   // km
  const stufen = k.spalten[0]?.length || 0;
  const raster = 5 * 60;                        // Breite einer Spalte in Sekunden

  // Klasse an Zeitpunkt idx und Höhe km, für die Legende
  const klasseBei = (idx, km) => {
    const spalte = k.spalten[idx];
    const stufe = Math.floor(km / schritt);
    if (!spalte || stufe < 0 || stufe >= stufen) return null;
    return spalte[stufe];
  };

  const opts = grundeinstellung(document.getElementById(id), von, bis);
  opts.height = 220;
  opts.scales.y = { range: [0, stufen * schritt] };
  opts.series = [
    { label: T.zeit, value: T.zeitFormat },
    {
      label: T.inDieserHoehe,
      stroke: FARBE.tropos,
      paths: () => null,
      points: { show: false },
      // Wert in der Legende: Klasse unter dem Mauszeiger
      value: (u, v, si, idx) => {
        if (idx == null || u.cursor.top == null || u.cursor.top < 0) return "–";
        const z = klasseBei(idx, u.posToVal(u.cursor.top, "y"));
        if (z === null) return "–";
        if (z === "-") return T.keineMessung;
        if (z === "0") return T.klar;
        return T.klassen[z];
      },
    },
  ];
  opts.hooks = {
    // Vor den Achsen und Gitterlinien die Zellen malen
    drawClear: [(u) => {
      const ctx = u.ctx;
      const hoeheZelle = Math.abs(u.valToPos(schritt, "y", true) - u.valToPos(0, "y", true));
      ctx.save();
      ctx.beginPath();
      ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
      ctx.clip();
      for (let i = 0; i < k.spalten.length; i++) {
        const x0 = u.valToPos(zeit[i], "x", true);
        const x1 = u.valToPos(zeit[i] + raster, "x", true);
        const spalte = k.spalten[i];
        for (let j = 0; j < stufen; j++) {
          const z = spalte[j];
          if (z === "0") continue;
          ctx.fillStyle = z === "-" ? KEINE_MESSUNG : KLASSEN_FARBE[z];
          const y = u.valToPos((j + 1) * schritt, "y", true);
          // +1 Pixel, damit zwischen den Zellen keine hellen Fugen bleiben
          ctx.fillRect(x0, y, x1 - x0 + 1, hoeheZelle + 1);
        }
      }
      ctx.restore();
    }],
  };

  diagramme.get(id)?.destroy();
  const container = document.getElementById(id);
  container.textContent = "";
  const diagramm = new uPlot(opts, [zeit, zeit.map(() => 0)], container);
  beschreibe(diagramm, id);
  beruehrung(diagramm);
  diagramme.set(id, diagramm);
}

// Farblegende der Klassen einmalig unter die Klassifikations-Diagramme schreiben
function schreibeKlassenLegende() {
  const ziel = document.getElementById("klassen-legende");
  if (ziel.childElementCount) return;
  const eintraege = [...Object.entries(KLASSEN_FARBE).map(([z, farbe]) => ({ name: T.klassen[z], farbe })),
                     { name: T.keineMessung, farbe: KEINE_MESSUNG }];
  for (const { name, farbe } of eintraege) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="farbfeld" style="background:${farbe}"></span>${name}`;
    ziel.append(li);
  }
}

// Kurzbeschreibung für Screenreader. Die Zeichenfläche selbst ist für sie unsichtbar.
function beschreibe(diagramm, id) {
  const flaeche = diagramm.root.querySelector("canvas");
  flaeche.setAttribute("role", "img");
  flaeche.setAttribute("aria-label", T.beschreibung[id]);
}

// Statt eines Diagramms einen Hinweis anzeigen, wenn die Daten fehlen
function keineDaten(id) {
  diagramme.get(id)?.destroy();
  diagramme.delete(id);
  const container = document.getElementById(id);
  container.innerHTML = `<p class="keine-daten">${T.keineDaten}</p>`;
}

// uPlot reagiert nur auf die Maus. Auf Handy und Tablet wird eine Berührung
// deshalb in eine Mausbewegung übersetzt: Antippen oder seitliches Wischen
// zeigt die Werte an, und alle Diagramme laufen wie mit der Maus mit.
function beruehrung(diagramm) {
  const flaeche = diagramm.over;
  const zeige = (e) => {
    const finger = e.touches[0];
    flaeche.dispatchEvent(new MouseEvent("mousemove", {
      clientX: finger.clientX, clientY: finger.clientY, bubbles: true,
    }));
  };
  flaeche.addEventListener("touchstart", zeige, { passive: true });
  flaeche.addEventListener("touchmove", zeige, { passive: true });
}

// Alle fünf Diagramme zeichnen. dwd oder cloudnet ist null, wenn die Datei fehlte.
function zeichneVerlauf(dwd, cloudnet) {
  const bis = Math.floor(Date.now() / 1000);
  const von = bis - STUNDEN * 3600;
  const h = dwd ? dwd.verlauf : null;

  // --- Holzhausen: Temperatur und Taupunkt, stündlich ---
  if (h) {
    zeichne("d-temperatur", [
      linie(T.temperatur, FARBE.holzhausen, 1),
      { ...linie(T.taupunkt, FARBE.holzhausen, 1), dash: [4, 4], width: 1.5 },
    ], [h.zeit, h.temperatur, h.taupunkt], von, bis);
  } else {
    keineDaten("d-temperatur");
  }

  // --- Niederschlag: Holzhausen und Melpitz auf gemeinsamer Stundenachse ---
  const mRegen = cloudnet?.stationen.melpitz.niederschlag_stuendlich;
  if (h || mRegen) {
    const quellen = [h ? { zeit: h.zeit, wert: h.niederschlag } : { zeit: [], wert: [] },
                     mRegen ? { zeit: mRegen.zeit, wert: mRegen.mm } : { zeit: [], wert: [] }];
    const stunden = [...new Set(quellen.flatMap((q) => q.zeit))].sort((a, b) => a - b);
    const [regenH, regenM] = aufAchse(stunden, quellen);
    zeichne("d-niederschlag", [
      balken(T.holzhausen, FARBE.holzhausen, 0.9),
      balken(T.melpitz, FARBE.melpitz, 0.45),
    ], [stunden, regenH, regenM], von, bis, { scales: { y: { range: (u, min, max) => [0, Math.max(1, max)] } } });
  } else {
    keineDaten("d-niederschlag");
  }

  // --- TROPOS-Stationen: 5-Minuten-Werte aus Cloudnet ---
  if (!cloudnet) {
    for (const id of ["d-wasserdampf", "d-fluessigwasser", "d-wolken", "d-klassen-leipzig", "d-klassen-melpitz"]) keineDaten(id);
    setze("verlauf-stand", T.tropNichtErreichbar);
    return;
  }
  const l = cloudnet.stationen.leipzig.reihen;
  const mr = cloudnet.stationen.melpitz.reihen;
  const zeit = [...new Set([...l.zeit, ...mr.zeit])].sort((a, b) => a - b);
  const reihe = (r, name) => ({ zeit: r.zeit, wert: r[name] || [] });

  const [iwvL, iwvM] = aufAchse(zeit, [reihe(l, "iwv_kg_m2"), reihe(mr, "iwv_kg_m2")]);
  zeichne("d-wasserdampf", [
    linie(T.tropDach, FARBE.tropos, 1),
    linie(T.melpitz, FARBE.melpitz, 1),
  ], [zeit, iwvL, iwvM], von, bis);

  const [lwpL, lwpM] = aufAchse(zeit, [reihe(l, "lwp_g_m2"), reihe(mr, "lwp_g_m2")]);
  zeichne("d-fluessigwasser", [
    linie(T.tropDach, FARBE.tropos, 0),
    linie(T.melpitz, FARBE.melpitz, 0),
  ], [zeit, lwpL, lwpM], von, bis);

  const [basisL, topL, basisM, topM] = aufAchse(zeit, [
    reihe(l, "wolkenbasis_km"), reihe(l, "wolkentop_km"),
    reihe(mr, "wolkenbasis_km"), reihe(mr, "wolkentop_km"),
  ]);
  zeichne("d-wolken", [
    punkte(T.basis(T.tropDach), FARBE.tropos, true),
    punkte(T.obergrenze(T.tropDach), FARBE.tropos, false),
    punkte(T.basis(T.melpitz), FARBE.melpitz, true),
    punkte(T.obergrenze(T.melpitz), FARBE.melpitz, false),
  ], [zeit, basisL, topL, basisM, topM], von, bis, { scales: { y: { range: [0, 13] } } });

  // Höhen-Zeit-Schnitte der Klassifikation, eine Grafik je Station
  schreibeKlassenLegende();
  for (const [name, id] of [["leipzig", "d-klassen-leipzig"], ["melpitz", "d-klassen-melpitz"]]) {
    const station = cloudnet.stationen[name];
    if (station.klassifikation) zeichneKlassen(id, station, von, bis); else keineDaten(id);
  }

  // Stand der Cloudnet-Daten anzeigen (die ältere der beiden Stationen)
  const letzte = Math.min(...Object.values(cloudnet.stationen).map((s) => s.letzte_messung).filter(Boolean));
  setze("verlauf-stand", T.tropBis(ortszeit(letzte)));
}

// Bei Größenänderung des Fensters alle Diagramme an die neue Breite anpassen
window.addEventListener("resize", () => {
  for (const d of diagramme.values()) d.setSize({ width: d.root.parentElement.clientWidth, height: d.height });
});
