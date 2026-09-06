// tests/headers.test.js – tools/headers.js: Header-Übersicht ohne Zellwerte (PROMPT-2 D.2, Header-Verifikation)
import { test, assert, assertEqual } from './runner.js';
import { headerSummary, columnLetter, formatSummary, EXPERT_HEADER_REGEX } from '../tools/headers.js';
import { makeSheet, runValues } from './fixtures.js';

test('headers.columnLetter: A, Z, AA, AB', () => {
  assertEqual([columnLetter(0), columnLetter(25), columnLetter(26), columnLetter(27)], ['A', 'Z', 'AA', 'AB']);
});

test('headers.headerSummary: je Header Spalte, gefüllte Zellen, unterschiedliche Werte und Experten-Markierung – nie Zellwerte', () => {
  const sheet = makeSheet('first', [
    { lastName: 'Muster', firstName: 'Anna', employer: 'Testbank AG', ...runValues('oe', { 1: [{ passed: 'yes', date: '01.06.2024' }] }) },
    { lastName: 'Beispiel', firstName: 'Ben', employer: 'Testbank AG' },
  ]);
  sheet.headerRow = sheet.headerRow.concat(['OE1 RUN1 Expert 1', 'Prüfer 2']);
  sheet.rows[0].cells = sheet.rows[0].cells.concat(['Prüfer Pia', 'Experte Emil']);
  sheet.rows[1].cells = sheet.rows[1].cells.concat([null, 'Experte Emil']);
  const s = headerSummary(sheet);
  const byHeader = new Map(s.map((x) => [x.header, x]));
  assertEqual(byHeader.get('Last Name').column, 'B');
  assertEqual([byHeader.get('Last Name').filled, byHeader.get('Last Name').distinct], [2, 2]);
  assertEqual([byHeader.get('Employer').filled, byHeader.get('Employer').distinct], [2, 1]);
  assertEqual([byHeader.get('OE1 RUN1 Expert 1').filled, byHeader.get('OE1 RUN1 Expert 1').distinct, byHeader.get('OE1 RUN1 Expert 1').expert], [1, 1, true]);
  assertEqual([byHeader.get('Prüfer 2').filled, byHeader.get('Prüfer 2').distinct, byHeader.get('Prüfer 2').expert], [2, 1, true]);
  assertEqual(byHeader.get('OE1 RUN1 Date').expert, false);
  const text = JSON.stringify(s) + formatSummary([sheet]);
  assert(!/Muster|Anna|Pia|Emil|Testbank/.test(text), 'keine Zellwerte in der Ausgabe');
  assert(/\| B \| Last Name \| 2 \| 2 \|/.test(formatSummary([sheet])), 'Markdown-Zeile je Header');
  assert(EXPERT_HEADER_REGEX.test('Examiner 1') && !EXPERT_HEADER_REGEX.test('Result'));
});
