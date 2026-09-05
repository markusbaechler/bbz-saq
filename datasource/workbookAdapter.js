// datasource/workbookAdapter.js – Phase 2: Graph Workbook-API (Erfassen/Mutieren).
// Stub mit demselben Interface wie fileAdapter.js; noch nicht implementiert.

import { NotImplementedError } from './fileAdapter.js';

export function createWorkbookAdapter() {
  return {
    async load() {
      throw new NotImplementedError('Workbook-API (Phase 2) ist noch nicht implementiert – Phase 1 nutzt den fileAdapter.');
    },
    async write() {
      throw new NotImplementedError('Schreiben über die Workbook-API ist erst in Phase 2 vorgesehen.');
    },
  };
}
