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
import * as glossar from '../views/glossar.js';

export const VIEW_MODULES = { overview, written, oral, vssVsm, zeitverlauf, historie, ranking, bankReport, offen, planned, personen, glossar };
const GROUPS = ['Kennzahlen', 'Personen', 'Experten', 'Daten'];

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
