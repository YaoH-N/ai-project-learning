import { readFileSync, readdirSync } from 'node:fs';
import { unzipSync } from 'fflate';
const dir = 'data/.cache/http';
const files = readdirSync(dir);
let zipFile = null;
for (const f of files) { const b = readFileSync(`${dir}/${f}`); if (b[0]===0x50 && b[1]===0x4b && b.length>100000) { zipFile=f; break; } }
console.log('zip:', zipFile);
const z = unzipSync(new Uint8Array(readFileSync(`${dir}/${zipFile}`)));
for (const k of Object.keys(z).sort()) console.log(k, z[k].length);
