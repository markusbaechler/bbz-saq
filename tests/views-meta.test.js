// tests/views-meta.test.js – Metadaten aller Ansichten (PROMPT-2 A.2/A.3): id, label, Navigationsgruppe.
// Die View-Module verwenden das DOM nur innerhalb von build(); sie lassen sich deshalb in Node importieren.
import { test, assert, assertEqual } from './runner.js';
import { glossaryEntry } from '../glossary.js';
import * as overview from '../views/overview.js';
import * as written from '../views/written.js';
import * as oral from '../views/oral.js';
import * as vssVsm from '../views/vssVsm.js';
import * as zeitverlauf from '../views/zeitverlauf.js';
import * as historie from '../views/historie.js';
import * as ranking from '../views/ranking.js';
import * as bankReport from '../views/bankReport.js';
import * as offen from '../views/offen.js';
import * as planned from '../views/planned.js';
import * as personen from '../views/personen.js';
import * as experten from '../views/experten.js';
import * as glossar from '../views/glossar.js';

export const VIEW_MODULES = { overview, written, oral, vssVsm, zeitverlauf, historie, ranking, bankReport, offen, planned, personen, experten, glossar };
const GROUPS = ['Kennzahlen', 'Personen', 'Experten', 'Daten'];
// Felder der globalen Filterleiste plus «wertung» (Bedienelement der Bestenlisten, nicht in der Leiste)
const FILTER_KEYS = ['jahr', 'von', 'bis', 'profil', 'sprache', 'bank', 'vssVsm', 'versuche', 'zertifikate', 'wertung'];

test('views: jede View hat id, label und eine der vier Navigationsgruppen (A.2)', () => {
  for (const [name, v] of Object.entries(VIEW_MODULES)) {
    assert(typeof v.id === 'string' && v.id && typeof v.label === 'string' && v.label, name + ': id/label');
    assert(GROUPS.includes(v.group), name + ': Gruppe «' + v.group + '»');
  }
  assertEqual(new Set(Object.values(VIEW_MODULES).map((v) => v.id)).size, Object.keys(VIEW_MODULES).length, 'ids eindeutig');
  assertEqual(overview.group, 'Kennzahlen');
  assertEqual(bankReport.group, 'Kennzahlen');
  assertEqual(offen.group, 'Personen');
  assertEqual(personen.group, 'Personen');
  assertEqual(experten.group, 'Experten');
  assertEqual(ranking.group, 'Personen');
  assertEqual(historie.group, 'Daten');
  assertEqual(glossar.group, 'Daten');
});

test('views: Kurzbeschreibung (intro) mit höchstens 160 Zeichen und Glossar-Begriff für «Definitionen» (A.3)', () => {
  for (const [name, v] of Object.entries(VIEW_MODULES)) {
    assert(typeof v.intro === 'string' && v.intro.length >= 20 && v.intro.length <= 160, name + ': intro (' + String(v.intro || '').length + ' Zeichen)');
    assert(!/ß/.test(v.intro), name + ': ss statt ß');
    if (v.id !== 'glossar') assert(glossaryEntry(v.glossar), name + ': Glossar-Begriff «' + v.glossar + '» fehlt');
  }
});

// Paket A (A1): Wirksamkeit der Filterleiste je Ansicht. Fehlt `filters`, gilt alles als wirksam (Rückwärtskompatibilität);
// jedes abgeschaltete Feld braucht eine Begründung, damit die Leiste sie als title zeigen kann.
test('views: filters nennt je Steuerelement die Wirksamkeit, jedes abgeschaltete Feld hat einen Grund (A1)', () => {
  for (const [name, v] of Object.entries(VIEW_MODULES)) {
    if (v.filters === undefined) continue;
    const f = v.filters;
    for (const key of Object.keys(f)) {
      if (key === 'grund' || key === 'hinweis') continue;
      assert(FILTER_KEYS.includes(key), name + ': unbekanntes Filterfeld «' + key + '»');
      assertEqual(typeof f[key], 'boolean', name + ': ' + key + ' muss true oder false sein');
    }
    for (const key of FILTER_KEYS) {
      if (f[key] !== false) continue;
      const grund = (f.grund || {})[key];
      assert(typeof grund === 'string' && grund.length >= 10, name + ': Begründung für «' + key + '» fehlt');
      assert(!/ß/.test(grund), name + ': ss statt ß in der Begründung für «' + key + '»');
    }
    if (f.hinweis !== undefined) assert(typeof f.hinweis === 'string' && f.hinweis.length >= 10 && !/ß/.test(f.hinweis), name + ': hinweis');
  }
});

test('views: die abgeschalteten Felder je Ansicht (A1, Abnahme)', () => {
  const off = (v) => FILTER_KEYS.filter((k) => v.filters && v.filters[k] === false);
  assertEqual(off(zeitverlauf).join(','), 'jahr,von,bis', 'Zeitverlauf: Zeitraum ohne Wirkung');
  assertEqual(off(offen).join(','), 'jahr,von,bis', 'Offene Vorgänge: Zeitraum ohne Wirkung');
  assertEqual(off(planned).join(','), 'jahr,von,bis', 'Geplante Prüfungen: Zeitraum ohne Wirkung');
  assertEqual(off(personen).join(','), 'jahr,von,bis,versuche,wertung', 'Personen: Zeitraum, Versuche, Wertung ohne Wirkung');
  assertEqual(off(experten).join(','), 'versuche,wertung', 'Experten: Versuche und Wertung ohne Wirkung, Zeitraum bleibt aktiv');
  assert(experten.filters.hinweis.includes('Run-Datum'), 'Experten: sichtbarer Hinweis zum Zeitraum');
  for (const v of [overview, written, oral, vssVsm, ranking, bankReport]) assertEqual(off(v).length, 0, v.id + ': alle Felder wirksam');
});
