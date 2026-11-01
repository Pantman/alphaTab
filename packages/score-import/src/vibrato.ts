// SPDX-License-Identifier: MPL-2.0
import type { Beat } from '@coderline/alphatab/model/Beat';
import type { Track } from '@coderline/alphatab/model/Track';

/** A wavy-line stop belongs at the first non-vibrating onset. Keep adjacent
 * vibrating beats in one span, including ties and chords across barlines.
 * At a gap/score end use same-note start+stop pairs, which cover each final
 * beat's full duration without inventing an extra source note as an endpoint.
 */
export function planVibratos(track: Track): Map<Beat, string> {
    const marks = new Map<Beat, string>();
    const add = (beat: Beat, type: string) => marks.set(beat, (marks.get(beat) ?? '') + `<wavy-line type="${type}" number="${beat.voice.index + 1}"/>`);
    const active = (beat: Beat) => !beat.isRest && !!(beat.vibrato || beat.notes.some(note => note.vibrato));
    const start = (beat: Beat) => beat.voice.bar.masterBar.start + beat.displayStart;
    const adjacent = (first: Beat, last: Beat) => Math.abs(start(first) + first.displayDuration - start(last)) < 1e-6;
    for (const staff of track.staves) {
        const voices = new Map<number, Beat[]>();
        for (const bar of staff.bars) for (const voice of bar.voices) {
            if (!voices.has(voice.index)) voices.set(voice.index, []);
            voices.get(voice.index)!.push(...voice.beats.filter(beat => !beat.isEmpty && !beat.graceType));
        }
        for (const beats of voices.values()) for (let i = 0; i < beats.length; i++) {
            if (!active(beats[i])) continue;
            let end = i;
            while (end + 1 < beats.length && adjacent(beats[end], beats[end + 1]) && active(beats[end + 1])) end++;
            if (end + 1 < beats.length && adjacent(beats[end], beats[end + 1])) {
                add(beats[i], 'start'); add(beats[end + 1], 'stop');
            } else {
                for (let j = i; j <= end; j++) { add(beats[j], 'start'); add(beats[j], 'stop'); }
            }
            i = end;
        }
    }
    return new Map([...marks].map(([beat, tags]) => [beat, `<ornaments>${tags}</ornaments>`]));
}
