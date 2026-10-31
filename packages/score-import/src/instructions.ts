// SPDX-License-Identifier: MPL-2.0
import type { Beat } from '@coderline/alphatab/model/Beat';
import type { Note } from '@coderline/alphatab/model/Note';
import type { Voice } from '@coderline/alphatab/model/Voice';
import { GraceType } from '@coderline/alphatab/model/GraceType';

/** Words/dashes are engraving only. Source flags continue to drive audio diagnostics. */
export function planInstructions(voice: Voice, staff: number, voiceNumber: number, idPrefix: string,
    escape: (value: unknown) => string): Map<Beat, { before: string; after: string }> {
    const result = new Map<Beat, { before: string; after: string }>();
    const scoped = `<voice>${voiceNumber}</voice><staff>${staff}</staff>`;
    const words = (label: string) => `<direction placement="above"><direction-type><words>${escape(label)}</words></direction-type>${scoped}</direction>`;
    const instruction = (beat: Beat) => {
        if (beat.isRest || beat.isEmpty) return '';
        return ([['P.M.', (n: Note) => n.isPalmMute], ['let ring', (n: Note) => n.isLetRing]] as const).map(([label, active]) => {
            const notes = beat.notes.filter(active);
            if (!notes.length) return '';
            if (notes.length === beat.notes.length) return label;
            const strings = notes.map(n => n.isStringed ? voice.bar.staff.tuning.length - n.string + 1 : 0);
            return strings.every(s => s > 0) ? `${label} (string${strings.length > 1 ? 's' : ''} ${strings.sort((a, b) => a - b).join(', ')})` : `${label} (partial chord)`;
        }).filter(Boolean).join(' / ');
    };
    const beats = voice.beats;
    for (const beat of beats) result.set(beat, { before: beat.text ? words(beat.text) : '', after: '' });
    for (let i = 0; i < beats.length; i++) {
        const first = beats[i], label = instruction(first);
        if (!label) continue;
        if (first.graceType !== GraceType.None) { result.get(first)!.before += words(label); continue; }
        let last = first;
        while (i + 1 < beats.length && beats[i + 1].graceType === GraceType.None &&
            last.displayStart + last.displayDuration === beats[i + 1].displayStart && instruction(beats[i + 1]) === label) {
            last = beats[++i];
        }
        const id = `score-import-technique-${idPrefix}-${first.index}`;
        result.get(first)!.before += `<direction id="${id}" placement="above"><direction-type><words>${escape(label)}</words></direction-type><direction-type><dashes type="start" number="${voice.index + 1}"/></direction-type>${scoped}</direction>`;
        result.get(last)!.after += `<direction placement="above"><direction-type><dashes type="stop" number="${voice.index + 1}"/></direction-type>${scoped}</direction>`;
    }
    return result;
}
