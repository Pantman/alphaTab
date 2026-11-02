// SPDX-License-Identifier: MPL-2.0
import type { Score } from '@coderline/alphatab/model/Score';
import { XmlDocument } from '@coderline/alphatab/xml/XmlDocument';
import type { XmlNode } from '@coderline/alphatab/xml/XmlNode';
import type { ImportedScoreMetadata, SourceElement } from './types';
import { ScoreImportError, type ImportDiagnostic } from './types';
import { sourceBendPerformance, type BendPerformance } from './bendPerformance';
import type { Note } from '@coderline/alphatab/model/Note';

function preserve(node: XmlNode, depth = 0): SourceElement {
    if (depth > 64) throw new ScoreImportError('metadata-depth', 'Source metadata is too deeply nested.');
    return { name: node.localName, attributes: Object.fromEntries(node.attributes), text: node.innerText,
        children: node.childElements().map(child => preserve(child, depth + 1)) };
}

/** Extract before conversion: alphaTab intentionally does not model full RSE chains. */
export function sourceMetadata(xml: string, score: Score, diagnostics: ImportDiagnostic[] = []): { metadata: ImportedScoreMetadata; version: string; bends: WeakMap<Note, BendPerformance> } {
    const doc = new XmlDocument();
    doc.parse(xml);
    const root = doc.firstElement;
    if (root?.localName !== 'GPIF') throw new ScoreImportError('invalid-gpif', 'Expected a GPIF score.');
    const tracks = root.findChildElement('Tracks')?.childElements() ?? [];
    const byId = new Map(tracks.map(track => [track.getAttribute('id'), track]));
    const trackOrder = root.findChildElement('MasterTrack')?.findChildElement('Tracks')?.innerText.trim().split(/\s+/) ?? [];
    if (trackOrder.length !== score.tracks.length || new Set(trackOrder).size !== trackOrder.length ||
        byId.size !== tracks.length || trackOrder.some(id => !byId.has(id))) {
        throw new ScoreImportError('track-identity', 'Source track identities do not match the parsed score.');
    }
    const retained = new Set(['Sounds', 'RSE', 'Automations', 'GeneralMidi', 'MidiConnection', 'MIDISettings',
        'PlaybackState', 'AudioEngineState', 'ForcedSound', 'Instrument', 'InstrumentSet', 'Properties', 'Staves', 'Transpose', 'PartSounding']);
    const metadata: ImportedScoreMetadata = {
        schema: 'score-import.metadata.v1',
        tracks: score.tracks.map((track, i) => {
            const info = track.playbackInfo;
            return { sourceTrackId: trackOrder[i], partId: `P${i + 1}`, name: track.name,
                midi: { program: info.program, bank: info.bank, channel: info.primaryChannel,
                    volume: info.volume, balance: info.balance, mute: info.isMute, solo: info.isSolo },
                source: byId.get(trackOrder[i])!.childElements().filter(child => retained.has(child.localName)).map(child => preserve(child)) };
        }),
        master: root.childElements().filter(child => child.localName === 'MasterTrack' || child.localName === 'BackingTrack').map(child => preserve(child))
    };
    return { metadata, version: root.findChildElement('GPVersion')?.innerText || 'unknown', bends: sourceBendPerformance(root, score, diagnostics) };
}
