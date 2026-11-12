// Write a DAX query file that DEFINEs measures from a measures-*.mjs module, so new measures can be
// tested against the open Desktop model before they are written to TMDL (no restart needed).
// Usage: node scripts/dax-define.mjs <measures module> <export name> <out.dax> "<EVALUATE ...>"
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [modPath, exportName, out, evaluate] = process.argv.slice(2);
const mod = await import(pathToFileURL(path.resolve(modPath)).href);
const define = 'DEFINE\n' + mod[exportName].map(([, name, , dax]) => `MEASURE _Measures[${name}] =\n${dax}`).join('\n');
fs.writeFileSync(out, `${define}\n${evaluate}\n`);
console.log(`Wrote ${out}`);
