// Bundles the real prompt builders (drawup-team.ts, drawup-coach-persona.ts, drawup-reasoning.ts) with the
// stand-in server module, so the tests run the same code the routes run.
const path = require('path'), fs = require('fs');
const esbuild = require('esbuild');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const entry = path.join(OUT, 'entry.ts');
fs.writeFileSync(entry, `export * as team from '${ROOT}/src/lib/drawup-team';\nexport * as persona from '${ROOT}/src/lib/drawup-coach-persona';\nexport * as reasoning from '${ROOT}/src/lib/drawup-reasoning';\n`);
esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(OUT, 'bundle.js'), logLevel: 'error',
  alias: { '@/lib/drawup-server': path.join(__dirname, 'stub-server.js'), '@/lib/drawup-quick': path.join(__dirname, 'stub-server.js') } });
module.exports = require(path.join(OUT, 'bundle.js'));
