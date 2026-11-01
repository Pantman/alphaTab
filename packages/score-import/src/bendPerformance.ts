// SPDX-License-Identifier: MPL-2.0
import type { Note } from '@coderline/alphatab/model/Note';
import type { Score } from '@coderline/alphatab/model/Score';
import type { XmlNode } from '@coderline/alphatab/xml/XmlNode';
import type { ImportDiagnostic } from './types';

export interface BendPerformance {
    points: Array<{ percent: number; semitones: number }>;
}
const refs = (node: XmlNode | null | undefined, name: string): string[] =>
    node?.findChildElement(name)?.innerText.trim().split(/\s+/).filter(Boolean) ?? [];
const indexed = (root: XmlNode, name: string): Map<string, XmlNode> =>
    new Map((root.findChildElement(name)?.childElements() ?? []).map(node => [node.getAttribute('id'), node]));

/** Preserve GPIF's authored points independently of the engraving model's simplification. */
export function sourceBendPerformance(root: XmlNode, score: Score, diagnostics: ImportDiagnostic[]): WeakMap<Note, BendPerformance> {
    const result = new WeakMap<Note, BendPerformance>();
    const bars = indexed(root, 'Bars'), voices = indexed(root, 'Voices');
    const beats = indexed(root, 'Beats'), notes = indexed(root, 'Notes');
    const masterBars = root.findChildElement('MasterBars')?.childElements() ?? [];
    const barIndexes = new Map<Score['tracks'][number]['staves'][number], number>();
    for (const master of masterBars) {
        let trackIndex = 0, staffIndex = 0;
        for (const barId of refs(master, 'Bars')) {
            if (trackIndex >= score.tracks.length) break;
            if (barId === '-1') { trackIndex++; staffIndex = 0; continue; }
            const staff = score.tracks[trackIndex].staves[staffIndex];
            const barIndex = barIndexes.get(staff) ?? 0;
            barIndexes.set(staff, barIndex + 1);
            const bar = staff.bars[barIndex];
            const partId = `P${trackIndex + 1}`, measure = barIndex + 1;
            const fail = (message: string) => diagnostics.push({severity: 'warning', code: 'bend-performance-fallback', message: `${message} Standard bend playback is retained.`, partId, measure});
            const voiceIds = refs(bars.get(barId), 'Voices');
            voiceIds.forEach((voiceId, v) => {
                if (voiceId === '-1') return;
                refs(voices.get(voiceId), 'Beats').filter(id => id !== '-1').forEach((beatId, b) => {
                    const sourceNotes = refs(beats.get(beatId), 'Notes').filter(id => id !== '-1').map(id => notes.get(id));
                    const modelNotes = bar?.voices[v]?.beats[b]?.notes;
                    for (const source of sourceNotes) {
                        if (!source) continue;
                        const properties = new Map((source.findChildElement('Properties')?.childElements() ?? []).map(p => [p.getAttribute('name'), p]));
                        if (!properties.has('Bended')) continue;
                        const value = (name: string, fallback: number): number => {
                            const text = properties.get(name)?.findChildElement('Float')?.innerText;
                            return text === undefined ? fallback : Number(text);
                        };
                        const string = Number(properties.get('String')?.findChildElement('String')?.innerText) + 1;
                        const matches = modelNotes?.filter(note => note.string === string) ?? [];
                        if (sourceNotes.length !== modelNotes?.length || matches.length !== 1 || !matches[0].isStringed) {
                            fail('An authored bend cannot be matched uniquely to its source string and beat.'); continue;
                        }
                        const raw = [
                            {percent: value('BendOriginOffset', 0), semitones: value('BendOriginValue', 0) / 50},
                            {percent: value('BendMiddleOffset1', 50), semitones: value('BendMiddleValue', 0) / 50},
                            {percent: value('BendMiddleOffset2', 50), semitones: value('BendMiddleValue', 0) / 50},
                            {percent: value('BendDestinationOffset', 100), semitones: value('BendDestinationValue', 0) / 50},
                        ];
                        // Missing middle fields do not imply an authored dip to zero.
                        if (!properties.has('BendMiddleValue')) raw.splice(1, 2);
                        // GPIF can retain unused middle handles outside the active origin /
                        // destination interval. Endpoints own their positions; those
                        // inactive handles do not imply a backwards or instant bend.
                        const active = raw.filter((p, i) => i === 0 || i === raw.length - 1 ||
                            (p.percent > raw[0].percent && p.percent < raw[raw.length-1].percent));
                        const points = active.filter((p, i) => !i || p.percent !== active[i-1].percent || p.semitones !== active[i-1].semitones);
                        const initial = (matches[0].bendPoints?.[0]?.value ?? 0) / 2;
                        if (points.some((p, i) => !Number.isFinite(p.percent) || !Number.isFinite(p.semitones) || p.percent < 0 || p.percent > 100 ||
                            Math.abs(p.semitones) > 24 || (i > 0 && p.percent <= points[i-1].percent)) ||
                            Math.abs(initial - points[0].semitones) > 1e-6) {
                            fail('An authored bend has invalid timing/pitch points or an unsupported starting pitch.'); continue;
                        }
                        result.set(matches[0], {points: points.map(p => ({percent: p.percent, semitones: p.semitones - initial}))});
                    }
                });
            });
            if (++staffIndex >= score.tracks[trackIndex].staves.length) { trackIndex++; staffIndex = 0; }
        }
    }
    return result;
}
