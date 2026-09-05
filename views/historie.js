// views/historie.js – Ansicht «Historie» (b7): Snapshots der Aggregate erzeugen, laden und Stichtage vergleichen.
// Kein Backend, keine Persistenz im Browser: der Snapshot ist eine JSON-Datei ohne Namen, die der Auftraggeber selbst ablegt
// (z. B. SharePoint neben der Excel) und später wieder lädt (nur Memory). Vergleich immer ohne Filter (Stand der Datei).

import { historyTables } from './tables.js';
import { renderKpis, renderTable, section, el } from './common.js';
import { buildSnapshot, parseSnapshot, snapshotFileName, snapshotJson, sortSnapshots } from '../snapshot.js';
import { downloadBlob, fmtDate, fmtDateTime } from '../export.js';

export const id = 'historie';
export const label = 'Historie';
export const noPersonExport = true; // Snapshots und Vergleich enthalten keine Namen

function dayLabel(stichtag) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stichtag || '');
  return m ? m[3] + '.' + m[2] + '.' + m[1] : String(stichtag || '–');
}

function whenLabel(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? fmtDateTime(d) : '–';
}

export function build(ctx) {
  const current = buildSnapshot({ persons: ctx.allPersons || [], meta: ctx.meta, today: ctx.today || new Date() });
  const snapshots = sortSnapshots(ctx.snapshots || []);
  const errors = ctx.snapshotErrors || [];
  const onChange = ctx.onSnapshotsChange || (() => {});
  const t = historyTables(snapshots, current);

  const download = el('button', {
    type: 'button', class: 'secondary', text: 'Snapshot herunterladen (JSON, ohne Namen)',
    onclick: () => downloadBlob(snapshotFileName(current), new Blob([snapshotJson(current)], { type: 'application/json' })),
  });
  const input = el('input', {
    type: 'file', accept: '.json,application/json', multiple: true, 'aria-label': 'Snapshot-Dateien laden (JSON)',
    onchange: async (ev) => {
      const files = Array.from(ev.target.files || []);
      ev.target.value = '';
      const merged = snapshots.slice();
      const errs = [];
      for (const f of files) {
        try {
          const s = parseSnapshot(await f.text(), f.name);
          if (!merged.some((x) => x.stichtag === s.stichtag && x.erstellt === s.erstellt)) merged.push(s);
        } catch (e) {
          errs.push(e && e.message ? e.message : String(e));
        }
      }
      onChange(merged, errs);
    },
  });
  const list = el('ul', { class: 'snapshot-list' }, snapshots.map((s) => el('li', {}, [
    el('strong', { text: 'Stichtag ' + dayLabel(s.stichtag) }),
    el('span', { class: 'meta-list', text: (s.datei ? s.datei + ' · ' : '') + 'erstellt ' + whenLabel(s.erstellt) + (s.quelle.dateiname ? ' · Quelle ' + s.quelle.dateiname : '') + ' · ' + (s.zaehler.vorgaenge ?? '–') + ' Vorgänge, ' + (s.zaehler.personen ?? '–') + ' Personen' }),
    el('button', { type: 'button', class: 'secondary small-button', text: 'Entfernen', onclick: () => onChange(snapshots.filter((x) => x !== s), []) }),
  ])));

  const compareNodes = snapshots.length
    ? [renderTable(t.kennzahlen), renderTable(t.zaehler)].concat(t.jeProfil.map((tbl) => renderTable(tbl)))
    : [el('p', { class: 'empty', text: 'Noch kein Snapshot geladen. Erst nach dem Laden mindestens eines Snapshots erscheinen hier die Stichtage nebeneinander.' })];

  return {
    nodes: [
      el('p', { class: 'meta-list', text: 'Historisierung ohne Backend: Ein Snapshot hält die Aggregate zum Stichtag fest (Datei-Zähler, Kennzahlen gesamt, je Profil und je Jahr) – ohne Namen und ohne Zeilen. Die Datei wird heruntergeladen und vom Auftraggeber abgelegt, z. B. auf SharePoint neben der Excel; sie lässt sich später wieder laden und mit dem heutigen Stand vergleichen. Immer ohne Filter (Stand der Datei), nichts wird im Browser gespeichert.' }),
      section('Snapshot erzeugen', [
        renderKpis([
          { label: 'Stichtag', value: dayLabel(current.stichtag), n: current.kennzahlen.vorgaenge.n, small: false, hint: 'Heutiges Datum; Dateiname ' + snapshotFileName(current) },
          { label: 'Vorgänge', value: String(current.kennzahlen.vorgaenge.value), n: current.kennzahlen.vorgaenge.n, small: false, hint: 'Kennzahlrelevante Vorgänge ohne Filter' },
          { label: 'Personen', value: String(current.kennzahlen.personen.value), n: current.kennzahlen.vorgaenge.n, small: false, hint: 'Menschen hinter den Vorgängen (Personenschlüssel)' },
          { label: 'Quelle', value: current.quelle.dateiname || '–', n: current.zaehler.zeilen ?? 0, small: false, hint: 'Excel-Datei, geändert ' + whenLabel(current.quelle.geaendert) + '; n = Zeilen beider Sheets' },
        ]),
        el('div', { class: 'toolbar' }, [download, el('span', { class: 'meta-list', text: 'Empfehlung: einmal pro Monat oder vor jeder Auswertung erzeugen und im SharePoint-Ordner der Excel ablegen.' })]),
      ]),
      section('Snapshots laden', [
        el('div', { class: 'toolbar' }, [input, el('span', { class: 'meta-list', text: 'Mehrere Dateien möglich. Die Snapshots bleiben nur im Speicher dieses Browser-Tabs.' })]),
        errors.length ? el('div', { class: 'note snapshot-errors', role: 'alert' }, errors.map((m) => el('p', { text: 'Nicht geladen – ' + m }))) : null,
        snapshots.length ? list : el('p', { class: 'empty', text: 'Keine Snapshots geladen.' }),
      ]),
      section('Vergleich der Stichtage', compareNodes, { intro: snapshots.length ? 'Spalten = geladene Snapshots (chronologisch) und der heutige Stand; Differenz = heute gegenüber dem jüngsten Snapshot, Anteile in Prozentpunkten. Ohne Filter.' : null }),
    ],
    tables: [t.kennzahlen, t.zaehler].concat(t.jeProfil),
  };
}
