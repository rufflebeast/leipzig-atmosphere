// Zweisprachigkeit: Deutsch und Englisch.
//
// Die Sprache steht in der Adresse (?lang=en). Fehlt sie, gilt die Sprache des Browsers.
// Nichts wird auf dem Gerät gespeichert. Längere Texte stehen in beiden Sprachen in der
// HTML-Datei (Attribut data-sprache), CSS blendet die jeweils andere aus. Hier stehen nur
// die Texte, die JavaScript selbst erzeugt.

const SPRACHE = document.documentElement.lang === "en" ? "en" : "de";
const GEBIETSSCHEMA = SPRACHE === "de" ? "de-DE" : "en-GB";

const TEXTE = {
  de: {
    titel: "Wetter über Leipzig",
    laden: "Daten werden geladen …",
    messungVom: (zeit) => `Messung vom ${zeit} Uhr`,
    nichtErreichbar: "Daten derzeit nicht erreichbar.",
    keineDaten: "Daten derzeit nicht verfügbar.",
    windAus: (richtung) => `aus ${richtung}`,
    richtungen: ["N", "NNO", "NO", "ONO", "O", "OSO", "SO", "SSO", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"],
    tropBis: (zeit) => `TROPOS-Daten bis ${zeit} Uhr`,
    tropNichtErreichbar: "TROPOS-Daten derzeit nicht erreichbar.",
    veraltet: (zeit) => `Die Daten wurden zuletzt am ${zeit} Uhr aktualisiert und sind deshalb nicht aktuell.`,
    tropAlt: "Von den TROPOS-Stationen liegen seit mehr als 24 Stunden keine neuen Messungen vor.",
    zeit: "Zeit",
    zeitFormat: "{DD}.{MM}. {HH}:{mm}",
    temperatur: "Temperatur Holzhausen",
    taupunkt: "Taupunkt Holzhausen",
    holzhausen: "Holzhausen",
    melpitz: "Melpitz",
    tropDach: "TROPOS-Dach",
    basis: (ort) => `Basis ${ort}`,
    obergrenze: (ort) => `Obergrenze ${ort}`,
    inDieserHoehe: "In dieser Höhe",
    klar: "klar",
    keineMessung: "keine Messung",
    klassen: {
      "1": "Wolkentröpfchen", "2": "Niesel oder Regen", "3": "Regen und Wolkentröpfchen",
      "4": "Eis", "5": "Eis und unterkühlte Tröpfchen", "6": "Schmelzendes Eis",
      "7": "Schmelzendes Eis und Tröpfchen", "8": "Aerosol (Staub, Rauch, Salz)",
      "9": "Insekten", "a": "Aerosol und Insekten",
    },
    // Kurzbeschreibungen der Diagramme für Screenreader
    beschreibung: {
      "d-temperatur": "Liniendiagramm der Temperatur und des Taupunkts in Leipzig-Holzhausen über 48 Stunden.",
      "d-niederschlag": "Balkendiagramm des stündlichen Niederschlags in Holzhausen und Melpitz über 48 Stunden.",
      "d-wasserdampf": "Liniendiagramm des Wasserdampfs in der Luftsäule über dem TROPOS-Dach und Melpitz.",
      "d-fluessigwasser": "Liniendiagramm des Flüssigwassers in Wolken über dem TROPOS-Dach und Melpitz.",
      "d-wolken": "Punktdiagramm der Wolkenbasis und Wolkenobergrenze über dem TROPOS-Dach und Melpitz.",
      "d-klassen-leipzig": "Höhen-Zeit-Schnitt der Cloudnet-Klassifikation über dem TROPOS-Dach, farbig nach Wolkentröpfchen, Eis, Regen, Aerosol und Insekten.",
      "d-klassen-melpitz": "Höhen-Zeit-Schnitt der Cloudnet-Klassifikation über Melpitz, farbig nach Wolkentröpfchen, Eis, Regen, Aerosol und Insekten.",
    },
    monate: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    monateKurz: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
    tage: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
    tageKurz: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
  },
  en: {
    titel: "Weather above Leipzig",
    laden: "Loading data …",
    messungVom: (zeit) => `Measured ${zeit}`,
    nichtErreichbar: "Data currently unavailable.",
    keineDaten: "Data currently unavailable.",
    windAus: (richtung) => `from ${richtung}`,
    richtungen: ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"],
    tropBis: (zeit) => `TROPOS data up to ${zeit}`,
    tropNichtErreichbar: "TROPOS data currently unavailable.",
    veraltet: (zeit) => `The data were last updated on ${zeit} and are therefore not current.`,
    tropAlt: "No new measurements from the TROPOS stations for more than 24 hours.",
    zeit: "Time",
    zeitFormat: "{DD}/{MM} {HH}:{mm}",
    temperatur: "Temperature Holzhausen",
    taupunkt: "Dew point Holzhausen",
    holzhausen: "Holzhausen",
    melpitz: "Melpitz",
    tropDach: "TROPOS roof",
    basis: (ort) => `Base ${ort}`,
    obergrenze: (ort) => `Top ${ort}`,
    inDieserHoehe: "At this height",
    klar: "clear",
    keineMessung: "no measurement",
    klassen: {
      "1": "Cloud droplets", "2": "Drizzle or rain", "3": "Rain and cloud droplets",
      "4": "Ice", "5": "Ice and supercooled droplets", "6": "Melting ice",
      "7": "Melting ice and droplets", "8": "Aerosol (dust, smoke, salt)",
      "9": "Insects", "a": "Aerosol and insects",
    },
    beschreibung: {
      "d-temperatur": "Line chart of temperature and dew point at Leipzig-Holzhausen over 48 hours.",
      "d-niederschlag": "Bar chart of hourly precipitation at Holzhausen and Melpitz over 48 hours.",
      "d-wasserdampf": "Line chart of column water vapour above the TROPOS roof and Melpitz.",
      "d-fluessigwasser": "Line chart of cloud liquid water above the TROPOS roof and Melpitz.",
      "d-wolken": "Scatter chart of cloud base and cloud top above the TROPOS roof and Melpitz.",
      "d-klassen-leipzig": "Time-height section of the Cloudnet classification above the TROPOS roof, coloured by cloud droplets, ice, rain, aerosol and insects.",
      "d-klassen-melpitz": "Time-height section of the Cloudnet classification above Melpitz, coloured by cloud droplets, ice, rain, aerosol and insects.",
    },
    monate: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    monateKurz: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    tage: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    tageKurz: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  },
};

const T = TEXTE[SPRACHE];

// Interne Links behalten die gewählte Sprache, Seitentitel passt sich an
window.addEventListener("DOMContentLoaded", () => {
  for (const a of document.querySelectorAll("a[data-intern]")) {
    const ziel = new URL(a.getAttribute("href"), location.href);
    ziel.searchParams.set("lang", SPRACHE);
    a.href = ziel.pathname.split("/").pop() + ziel.search + ziel.hash;
  }
  const titel = document.querySelector(`[data-titel-${SPRACHE}]`);
  if (titel) document.title = titel.getAttribute(`data-titel-${SPRACHE}`);
});
