// SPDX-License-Identifier: MPL-2.0
import { GpifParser } from '@coderline/alphatab/importer/GpifParser';
import { ImportSettings } from './settings';
import { Logger } from '@coderline/alphatab/Logger';
import { LogLevel } from '@coderline/alphatab/LogLevel';
import { readGpif, importLimits } from './archive';
import { sourceMetadata } from './metadata';
import { writeMusicXml } from './musicxml';
import { ScoreImportError, type ImportedScore, type ImportOptions, type ImportDiagnostic } from './types';
export * from './types';

declare const __SCORE_IMPORT_VERSION__: string;
const importerVersion = typeof __SCORE_IMPORT_VERSION__ === 'string' ? __SCORE_IMPORT_VERSION__ : 'development';
declare const __SCORE_IMPORT_REVISION__: string;
const sourceRevision = typeof __SCORE_IMPORT_REVISION__ === 'string' ? __SCORE_IMPORT_REVISION__ : 'development';

/** Convert a modern .gp archive without initializing a renderer, DOM, player or network connection. */
export async function importScore(input: Uint8Array, _options: ImportOptions = {}): Promise<ImportedScore> {
    if (!(input instanceof Uint8Array) || input.byteLength === 0 || input.byteLength > importLimits.inputBytes) {
        throw new ScoreImportError('input-size', 'The score must be between 1 byte and 32 MB.');
    }
    // Snapshot caller-owned bytes before awaiting hashing, including SharedArrayBuffer-backed inputs.
    const bytes = Uint8Array.from(input);
    const diagnostics: ImportDiagnostic[] = [];
    try {
        const gpif = readGpif(bytes);
        const parser = new GpifParser();
        const settings = new ImportSettings();
        settings.importer.maxDecodingBufferSize = 16 * 1024 * 1024;
        // Parsing is synchronous. Restore shared logging before the first await so
        // concurrent imports cannot capture each other's diagnostics or host logging.
        const previousLogger = Logger.log, previousLevel = Logger.logLevel;
        const parserReport = (category: string, message: string): void => {
            if (!diagnostics.some(d => d.code === 'source-parser-warning' && d.message === `${category}: ${message}`)) {
                diagnostics.push({ severity: 'error', code: 'source-parser-warning', message: `${category}: ${message}` });
            }
        };
        try {
            Logger.logLevel = LogLevel.Warning;
            Logger.log = { debug() {}, info() {}, warning: parserReport, error: parserReport };
            parser.parseXml(gpif, settings);
        } finally { Logger.log = previousLogger; Logger.logLevel = previousLevel; }
        const score = parser.score;
        const { metadata, version } = sourceMetadata(gpif, score);
        diagnostics.push({ severity: 'warning', code: 'source-audio-unapplied', message: 'Original instrument and effect settings are preserved as metadata; only standard MIDI defaults are written to MusicXML.' });
        const musicXml = writeMusicXml(score, diagnostics);
        const hash = await crypto.subtle.digest('SHA-256', bytes.buffer);
        return { musicXml, metadata, diagnostics, practiceReady: !diagnostics.some(d => d.severity === 'error'),
            provenance: { schema: 'score-import.provenance.v1', format: 'gp', sourceVersion: version,
                sourceSha256: [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join(''),
                importerVersion, sourceRevision } };
    } catch (error) {
        if (error instanceof ScoreImportError) throw error;
        throw new ScoreImportError('invalid-score', `Unable to import Guitar Pro score: ${error instanceof Error ? error.message : String(error)}`);
    }
}
