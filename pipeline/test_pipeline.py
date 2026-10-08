"""Tests für die Rechenschritte der Pipeline.

Aufruf:  python -m unittest discover pipeline
GitHub führt die Tests vor jedem Datenabruf aus. Schlägt einer fehl, wird nichts
veröffentlicht und die bisherige Fassung der Seite bleibt online.
"""

import unittest
from datetime import date

import numpy as np

import cloudnet_holen as c


class AufRaster(unittest.TestCase):
    kanten = np.array([0, 300, 600, 900])

    def test_mittelwert_je_intervall(self):
        t = np.array([10, 20, 310, 320])
        v = np.array([1.0, 3.0, 10.0, 20.0])
        self.assertEqual(c.auf_raster(t, v, self.kanten), [2.0, 15.0, None])

    def test_fehlende_werte_werden_ignoriert(self):
        t = np.array([10, 20])
        v = np.array([np.nan, 4.0])
        self.assertEqual(c.auf_raster(t, v, self.kanten)[0], 4.0)

    def test_summe_und_median(self):
        t = np.array([10, 20, 30])
        v = np.array([1.0, 2.0, 9.0])
        self.assertEqual(c.auf_raster(t, v, self.kanten, "summe")[0], 12.0)
        self.assertEqual(c.auf_raster(t, v, self.kanten, "median")[0], 2.0)


class ZeitInUnix(unittest.TestCase):
    def test_stunden_seit_mitternacht(self):
        datei = {"time": np.array([0.0, 1.5])}
        ergebnis = c.zeit_in_unix(datei, date(2026, 10, 8))
        # 08.10.2026 00:00 UTC = 1791417600
        self.assertEqual(list(ergebnis), [1791417600.0, 1791417600.0 + 5400])


class KlassenJeHoehe(unittest.TestCase):
    def test_duenne_schicht_bleibt_erhalten(self):
        # Ein Profil, vier Messbereiche in der untersten 120-m-Stufe, nur einer mit Eis
        hoehe = np.array([10.0, 40.0, 70.0, 100.0])
        klasse = np.array([[0, 4, 0, 0]])
        ergebnis = c.klassen_je_hoehe(klasse, hoehe)
        self.assertEqual(ergebnis[0, 0], 4)
        self.assertEqual(ergebnis.shape, (1, c.HOEHE_MAX // c.HOEHE_SCHRITT))

    def test_haeufigste_klasse_gewinnt(self):
        hoehe = np.array([10.0, 40.0, 70.0, 100.0])
        klasse = np.array([[1, 1, 4, 0]])
        self.assertEqual(c.klassen_je_hoehe(klasse, hoehe)[0, 0], 1)

    def test_unter_grund_und_zu_hoch_wird_verworfen(self):
        hoehe = np.array([-50.0, 13000.0])
        klasse = np.array([[2, 2]])
        self.assertTrue((c.klassen_je_hoehe(klasse, hoehe) == 0).all())


class KlassifikationRaster(unittest.TestCase):
    def test_zeichen_und_luecken(self):
        kanten = np.array([0, 300, 600])
        t = np.array([10.0, 20.0, 30.0])         # drei Profile im ersten Intervall, keins im zweiten
        klasse = np.array([[1, 0], [1, 0], [0, 0]], dtype=np.int8)
        spalten = c.klassifikation_raster(t, klasse, kanten)
        self.assertEqual(spalten, ["10", "--"])

    def test_vereinzelte_treffer_gelten_als_klar(self):
        kanten = np.array([0, 300])
        t = np.arange(10.0)                       # zehn Profile
        klasse = np.zeros((10, 1), dtype=np.int8)
        klasse[0, 0] = 8                          # nur eins zeigt Aerosol, unter 30 %
        self.assertEqual(c.klassifikation_raster(t, klasse, kanten), ["0"])


if __name__ == "__main__":
    unittest.main()
