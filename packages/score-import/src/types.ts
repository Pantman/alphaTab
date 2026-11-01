// SPDX-License-Identifier: MPL-2.0

/** JSON-safe source XML data. Parameter ordering, units and identifiers are retained. */
export interface SourceElement {
    name: string;
    attributes: Record<string, string>;
    text: string;
    children: SourceElement[];
}

export interface ImportDiagnostic {
    severity: 'warning' | 'error';
    code: string;
    message: string;
    partId?: string;
    measure?: number;
}

export interface ImportedTrackMetadata {
    sourceTrackId: string;
    partId: string;
    name: string;
    midi: { program: number; bank: number; channel: number; volume: number; balance: number; mute: boolean; solo: boolean };
    source: SourceElement[];
}

export interface ImportedScoreMetadata {
    schema: 'score-import.metadata.v1';
    tracks: ImportedTrackMetadata[];
    master: SourceElement[];
}

export interface ImportedScore {
    musicXml: string;
    metadata: ImportedScoreMetadata;
    diagnostics: ImportDiagnostic[];
    /** False means a blocking musical construct remains. Warnings may include deliberately silent unidentified percussion. */
    practiceReady: boolean;
    provenance: {
        schema: 'score-import.provenance.v1';
        format: 'gp';
        sourceVersion: string;
        sourceSha256: string;
        importerVersion: string;
        sourceRevision: string;
    };
}

export interface ImportOptions {
    /** Modern ZIP-based .gp only in v0.1; extensions are never used for format detection. */
    fileName?: string;
}

export class ScoreImportError extends Error {
    public constructor(public readonly code: string, message: string) {
        super(message);
        this.name = 'ScoreImportError';
    }
}
