import { test, assert, assertEqual } from './runner.js';
import {
  decodeXml, parseRels, parseWorkbookSheets, resolvePath, parseThreadedCommentsXml, extractThreadedComments,
} from '../datasource/threadedComments.js';

// Synthetische XML-Fragmente nach dem Muster von Excel / SheetJS. Keine Personendaten.
const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="First Certification" sheetId="1" r:id="rId1"/><sheet r:id="rId2" sheetId="2" name="Ausgestellte Zertifikate"/><sheet name="Legende &amp; Info" sheetId="5" r:id="rId3"/></sheets>
</workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/>
<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const SHEET1_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vmlDrawing1.vml"/><Relationship Id="rId2" Type="http://schemas.microsoft.com/office/2017/10/relationships/threadedComment" Target="../threadedComments/threadedComment1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/></Relationships>`;

const SHEET2_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2017/10/relationships/threadedComment" Target="/xl/threadedComments/threadedComment2.xml"/></Relationships>`;

const TC1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ThreadedComments xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments" xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<threadedComment ref="B14" dT="2024-09-05T10:00:00.00" personId="{P1}" id="{C1}"><text>VSM 8718 28.08./05.09.24: Testperson</text></threadedComment>
<threadedComment ref="B14" dT="2024-09-06T10:00:00.00" personId="{P1}" id="{C2}" parentId="{C1}"><text>Antwort &amp; Nachtrag</text><mentions/></threadedComment>
<threadedComment ref="B20" dT="2026-05-07T08:00:00.00" personId="{P2}" id="{C3}"><text xml:space="preserve">VSS 07.05.2026: Testperson</text></threadedComment>
<threadedComment ref="C21" personId="{P2}" id="{C4}"><text>Kommentar auf anderer Spalte</text></threadedComment>
</ThreadedComments>`;

const TC2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ThreadedComments xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments"><threadedComment ref="B11" id="{C9}" personId="{P1}"><text>VSS 01.01.2025: Testperson</text></threadedComment></ThreadedComments>`;

function files() {
  return {
    'xl/workbook.xml': WORKBOOK,
    'xl/_rels/workbook.xml.rels': WORKBOOK_RELS,
    'xl/worksheets/_rels/sheet1.xml.rels': SHEET1_RELS,
    'xl/worksheets/_rels/sheet2.xml.rels': SHEET2_RELS,
    'xl/threadedComments/threadedComment1.xml': TC1,
    'xl/threadedComments/threadedComment2.xml': TC2,
  };
}

test('threadedComments.decodeXml: Entities', () => {
  assertEqual(decodeXml('A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos; &#65;&#x42;'), 'A & B <C> "D" \'E\' AB');
  assertEqual(decodeXml(''), '');
});

test('threadedComments.parseRels: Id, Type, Target', () => {
  const rels = parseRels(SHEET1_RELS);
  assertEqual(rels.length, 3);
  assertEqual(rels[1], { id: 'rId2', type: 'http://schemas.microsoft.com/office/2017/10/relationships/threadedComment', target: '../threadedComments/threadedComment1.xml' });
});

test('threadedComments.parseWorkbookSheets: Name (entschlüsselt), sheetId, r:id – Attributreihenfolge egal', () => {
  const sheets = parseWorkbookSheets(WORKBOOK);
  assertEqual(sheets, [
    { name: 'First Certification', sheetId: '1', rId: 'rId1' },
    { name: 'Ausgestellte Zertifikate', sheetId: '2', rId: 'rId2' },
    { name: 'Legende & Info', sheetId: '5', rId: 'rId3' },
  ]);
});

test('threadedComments.resolvePath: relative und absolute Targets', () => {
  assertEqual(resolvePath('xl/worksheets/', '../threadedComments/threadedComment1.xml'), 'xl/threadedComments/threadedComment1.xml');
  assertEqual(resolvePath('xl/', 'worksheets/sheet1.xml'), 'xl/worksheets/sheet1.xml');
  assertEqual(resolvePath('xl/', '/xl/worksheets/sheet2.xml'), 'xl/worksheets/sheet2.xml');
  assertEqual(resolvePath('xl/worksheets/', './x.xml'), 'xl/worksheets/x.xml');
});

test('threadedComments.parseThreadedCommentsXml: ref, id, parentId, Text mit Entities', () => {
  const list = parseThreadedCommentsXml(TC1);
  assertEqual(list.length, 4);
  assertEqual(list[0], { ref: 'B14', id: '{C1}', parentId: null, text: 'VSM 8718 28.08./05.09.24: Testperson' });
  assertEqual(list[1], { ref: 'B14', id: '{C2}', parentId: '{C1}', text: 'Antwort & Nachtrag' });
  assertEqual(list[2].text, 'VSS 07.05.2026: Testperson');
  assertEqual(list[3].ref, 'C21');
  assertEqual(parseThreadedCommentsXml('<ThreadedComments/>'), []);
});

test('threadedComments.extractThreadedComments: pro Sheet und Zelle, Antworten angehängt', () => {
  const out = extractThreadedComments(files(), ['First Certification', 'Ausgestellte Zertifikate']);
  assertEqual(Object.keys(out).sort(), ['Ausgestellte Zertifikate', 'First Certification']);
  assertEqual(out['First Certification'].B14, 'VSM 8718 28.08./05.09.24: Testperson\nAntwort & Nachtrag');
  assertEqual(out['First Certification'].B20, 'VSS 07.05.2026: Testperson');
  assertEqual(out['First Certification'].C21, 'Kommentar auf anderer Spalte');
  assertEqual(out['Ausgestellte Zertifikate'], { B11: 'VSS 01.01.2025: Testperson' });
});

test('threadedComments.extractThreadedComments: nur angefragte Sheets, ohne Kommentare leeres Objekt', () => {
  const out = extractThreadedComments(files(), ['First Certification', 'Legende & Info', 'Gibt es nicht']);
  assertEqual(Object.keys(out).sort(), ['First Certification', 'Gibt es nicht', 'Legende & Info']);
  assertEqual(out['Legende & Info'], {});
  assertEqual(out['Gibt es nicht'], {});
  assert(!('Ausgestellte Zertifikate' in out));
});

test('threadedComments.extractThreadedComments: fehlende Workbook-Teile → leere Ergebnisse, kein Fehler', () => {
  assertEqual(extractThreadedComments({}, ['First Certification']), { 'First Certification': {} });
  const partial = files();
  delete partial['xl/threadedComments/threadedComment1.xml'];
  assertEqual(extractThreadedComments(partial, ['First Certification'])['First Certification'], {});
});
