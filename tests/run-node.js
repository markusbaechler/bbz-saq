// CLI-Runner: `node tests/run-node.js` – Exit-Code 1 bei roten Tests.
import { runAll } from './runner.js';
import './all.js';

const { results, total, failed, passed } = await runAll();
for (const r of results) {
  if (r.ok) console.log('  ok   ' + r.name);
  else console.log('  FAIL ' + r.name + '\n       ' + (r.error && r.error.message));
}
console.log('\n' + passed + '/' + total + ' Tests grün, ' + failed + ' rot.');
process.exit(failed ? 1 : 0);
