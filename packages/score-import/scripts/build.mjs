// SPDX-License-Identifier: MPL-2.0
import { build } from 'esbuild';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('../..');
const packageInfo = JSON.parse(readFileSync('package.json', 'utf8'));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
mkdirSync('dist', { recursive: true });
const result = await build({ entryPoints: ['src/index.ts'], outfile: 'dist/index.js', bundle: true,
    format: 'esm', platform: 'neutral', target: 'es2022', sourcemap: true, metafile: true,
    alias: { '@coderline/alphatab': resolve(root, 'packages/alphatab/src') },
    define: { __SCORE_IMPORT_REVISION__: JSON.stringify(revision), __SCORE_IMPORT_VERSION__: JSON.stringify(packageInfo.version) },
    banner: { js: '/*! score-import / alphaTab — MPL-2.0. Corresponding source and notices must accompany distribution. */' } });
// These model dependencies contain only enums/numeric constants, no renderer or player.
const sharedConstants = ['platform/ICanvas.ts', 'synth/SynthConstants.ts', 'rendering/utils/BeamDirection.ts'];
const forbidden = Object.keys(result.metafile.inputs).filter(p => /alphatab\/src\/(rendering|synth|platform|Environment|AlphaTabApi)/.test(p) &&
    !sharedConstants.some(c => p.endsWith(`alphatab/src/${c}`)));
if (forbidden.length) throw new Error(`Headless import pulled forbidden runtime subsystems: ${forbidden.join(', ')}`);
writeFileSync('dist/metafile.json', JSON.stringify(result.metafile, null, 2));
const program = ts.createProgram(['src/types.ts'], { declaration: true, emitDeclarationOnly: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, skipLibCheck: true, outDir: 'dist', types: [] });
const emitted = program.emit();
const errors = ts.getPreEmitDiagnostics(program).concat(emitted.diagnostics).filter(d => d.category === ts.DiagnosticCategory.Error);
if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, { getCurrentDirectory: () => process.cwd(), getCanonicalFileName: p => p, getNewLine: () => '\n' }));
writeFileSync('dist/index.d.ts', "export * from './types.js';\nimport type { ImportedScore, ImportOptions } from './types.js';\nexport declare function importScore(bytes: Uint8Array, options?: ImportOptions): Promise<ImportedScore>;\n");
copyFileSync('LICENSE', 'dist/LICENSE');
copyFileSync('NOTICE', 'dist/NOTICE');
copyFileSync('LICENSE.header', 'dist/LICENSE.header');
writeFileSync('dist/build.json', JSON.stringify({ package: '@pantman/score-import', version: packageInfo.version, sourceRevision: revision,
    upstream: JSON.parse(readFileSync(resolve(root, 'score-import/upstream.json'), 'utf8')), runtime: 'browser or Node with Web Crypto' }, null, 2));
console.log(`Built score-import from ${revision}: ${Object.keys(result.metafile.inputs).length} source files.`);
