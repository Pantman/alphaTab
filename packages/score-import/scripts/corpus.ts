// SPDX-License-Identifier: MPL-2.0
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { importScore } from '../src/index';

const directory = process.argv[2];
const output = process.argv[3];
if (!directory || !output) throw new Error('Usage: npm run corpus -- /private/corpus /private/results');
// No corpus path is embedded in tracked configuration; outputs are explicitly chosen by the caller.
await mkdir(output, { recursive: true });
const results: unknown[] = [];
for (const name of (await readdir(directory)).sort()) {
    if (!name.endsWith('.gp')) continue;
    try {
        const imported = await importScore(await readFile(resolve(directory, name)), { fileName: name });
        await writeFile(resolve(output, `${basename(name)}.musicxml`), imported.musicXml);
        await writeFile(resolve(output, `${basename(name)}.json`), JSON.stringify({ ...imported, musicXml: undefined }, null, 2));
        results.push({ file: name, practiceReady: imported.practiceReady, diagnostics: imported.diagnostics,
            parts: imported.metadata.tracks.length, bytes: imported.musicXml.length });
    } catch (error) { results.push({ file: name, error: String(error) }); }
}
await writeFile(resolve(output, 'summary.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map((r: any) => ({ file: r.file, practiceReady: r.practiceReady, parts: r.parts,
    errors: r.diagnostics?.filter((d: any) => d.severity === 'error').map((d: any) => d.code), error: r.error })), null, 2));
