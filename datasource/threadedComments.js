// datasource/threadedComments.js – Threaded Comments (Excel 365) aus dem XLSX-Paket lesen.
//
// Quelle: xl/threadedComments/threadedCommentN.xml, Attribut ref="B14" (Zellreferenz), Text in <text>.
// Zuordnung zum Sheet: xl/workbook.xml (Sheet-Name → r:id) → xl/_rels/workbook.xml.rels (r:id → Sheet-Datei)
// → xl/worksheets/_rels/sheetN.xml.rels (Relationship-Typ …/threadedComment → Datei).
// Legacy-Notizen (xl/comments*.xml) enthalten nur Platzhaltertext und werden ignoriert.
//
// Reine Funktionen auf XML-Text; die Entpackung (fflate) macht fileAdapter.js.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(text) {
  return String(text === null || text === undefined ? '' : text).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return entity in ENTITIES ? ENTITIES[entity] : match;
  });
}

export function parseAttributes(attrText) {
  const out = {};
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(attrText))) {
    out[m[1]] = decodeXml(m[2] !== undefined ? m[2] : m[3]);
  }
  return out;
}

// Alle Elemente <tag …>…</tag> bzw. <tag …/> als { attrs, inner }
function elements(xml, tag) {
  const out = [];
  const open = new RegExp('<' + tag + '(?=[\\s/>])([^>]*)>', 'g');
  const close = '</' + tag + '>';
  let m;
  while ((m = open.exec(xml))) {
    const attrText = m[1];
    if (/\/\s*$/.test(attrText)) {
      out.push({ attrs: parseAttributes(attrText.replace(/\/\s*$/, '')), inner: '' });
      continue;
    }
    const end = xml.indexOf(close, open.lastIndex);
    const inner = end < 0 ? xml.slice(open.lastIndex) : xml.slice(open.lastIndex, end);
    out.push({ attrs: parseAttributes(attrText), inner });
    if (end >= 0) open.lastIndex = end + close.length;
  }
  return out;
}

// [Content]_rels: [{ id, type, target }]
export function parseRels(xml) {
  return elements(xml, 'Relationship').map(({ attrs }) => ({ id: attrs.Id, type: attrs.Type, target: attrs.Target }));
}

// xl/workbook.xml: [{ name, sheetId, rId }]
export function parseWorkbookSheets(xml) {
  return elements(xml, 'sheet').map(({ attrs }) => ({ name: attrs.name, sheetId: attrs.sheetId, rId: attrs['r:id'] }));
}

// Pfad im Paket auflösen: baseDir endet mit '/', target relativ ('../x', './x', 'x') oder absolut ('/xl/x')
export function resolvePath(baseDir, target) {
  const segments = target.startsWith('/') ? target.slice(1).split('/') : (baseDir + target).split('/');
  const out = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

// xl/threadedComments/threadedCommentN.xml: [{ ref, id, parentId, text }] in Dokumentreihenfolge
export function parseThreadedCommentsXml(xml) {
  return elements(xml, 'threadedComment').map(({ attrs, inner }) => {
    const t = /<text(?:\s[^>]*)?>([\s\S]*?)<\/text>/.exec(inner);
    return {
      ref: attrs.ref,
      id: attrs.id === undefined ? null : attrs.id,
      parentId: attrs.parentId === undefined ? null : attrs.parentId,
      text: t ? decodeXml(t[1]) : '',
    };
  });
}

// files: { 'xl/workbook.xml': '<xml…>', … } → { [sheetName]: { [ref]: text } }
// Antworten (parentId) werden in Dokumentreihenfolge mit Zeilenumbruch an den Ausgangskommentar angehängt.
export function extractThreadedComments(files, sheetNames) {
  const get = (path) => (typeof files[path] === 'string' ? files[path] : null);
  const out = {};
  for (const name of sheetNames) out[name] = {};

  const workbookXml = get('xl/workbook.xml');
  const workbookRelsXml = get('xl/_rels/workbook.xml.rels');
  if (!workbookXml || !workbookRelsXml) return out;

  const sheets = parseWorkbookSheets(workbookXml);
  const workbookRels = parseRels(workbookRelsXml);

  for (const name of sheetNames) {
    const sheet = sheets.find((s) => s.name === name);
    if (!sheet) continue;
    const rel = workbookRels.find((r) => r.id === sheet.rId);
    if (!rel) continue;
    const sheetPath = resolvePath('xl/', rel.target);
    const dir = sheetPath.slice(0, sheetPath.lastIndexOf('/') + 1);
    const file = sheetPath.slice(dir.length);
    const sheetRelsXml = get(dir + '_rels/' + file + '.rels');
    if (!sheetRelsXml) continue;
    for (const r of parseRels(sheetRelsXml)) {
      if (!/threadedcomment/i.test(r.type || '')) continue;
      const xml = get(resolvePath(dir, r.target));
      if (!xml) continue;
      for (const c of parseThreadedCommentsXml(xml)) {
        if (!c.ref) continue;
        out[name][c.ref] = c.ref in out[name] ? out[name][c.ref] + '\n' + c.text : c.text;
      }
    }
  }
  return out;
}
