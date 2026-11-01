// SPDX-License-Identifier: MPL-2.0
import type { Score } from '@coderline/alphatab/model/Score';
import { MidiUtils } from '@coderline/alphatab/midi/MidiUtils';
import type { ImportDiagnostic } from './types';
import { ScoreImportError } from './types';

export interface PlannedTempo {
    offset: number;
    value: number;
    visible: boolean;
}

// Bound both temporal resolution and pitch-independent tempo error. A finite budget
// prevents malicious/very long ramps from multiplying the output without limit.
const maxSampleGap = MidiUtils.QuarterTime / 32;
const maxBpmStep = 0.25;
const sampleBudget = 4096;

/** Guitar Pro's Linear flag means progressive TO THE NEXT automation point.
 * MusicXML has discrete playback tempos, so switch between evenly spaced BPM
 * samples at their temporal midpoints (trapezoidal integration of seconds/beat).
 * Authored points stay exact; only generated samples are invisible.
 */
export function planTempos(score: Score, diagnostics: ImportDiagnostic[]): PlannedTempo[][] {
    const starts: number[] = [];
    let end = 0;
    const result: PlannedTempo[][] = score.masterBars.map(master => {
        starts.push(end);
        const duration = master.calculateDuration();
        if (!Number.isInteger(duration) || duration <= 0) throw new ScoreImportError('invalid-meter', 'Measure duration must be a positive whole number of ticks.');
        end += duration;
        return [];
    });
    const points = score.masterBars.flatMap((master, measure) => master.tempoAutomations.map(tempo => {
        // Positions use the full meter even in a shorter pickup bar.
        const offset = Math.round(tempo.ratioPosition * master.calculateDuration(false));
        if (!Number.isFinite(tempo.value) || tempo.value <= 0 || !Number.isFinite(offset) || offset < 0 || offset > master.calculateDuration()) {
            throw new ScoreImportError('invalid-tempo', 'A tempo automation has an invalid value or position.');
        }
        return { tick: starts[measure] + offset, offset, measure, value: tempo.value, linear: tempo.isLinear, visible: tempo.isVisible };
    })).sort((a, b) => a.tick - b.tick);
    if (!points.length || points[0].tick > 0) {
        if (!Number.isFinite(score.tempo) || score.tempo <= 0) throw new ScoreImportError('invalid-tempo', 'The initial tempo must be positive.');
        result[0].push({ offset: 0, value: score.tempo, visible: true });
    }
    let generated = 0;
    for (let i = 0; i < points.length; i++) {
        const point = points[i], next = points[i + 1];
        result[point.measure].push({ offset: point.offset, value: point.value, visible: point.visible });
        // A final progressive point has no destination; it simply keeps its value.
        if (!point.linear || !next || next.value === point.value || next.tick === point.tick) continue;
        const duration = next.tick - point.tick;
        const count = Math.max(1, Math.ceil(duration / maxSampleGap), Math.ceil(Math.abs(next.value - point.value) / maxBpmStep));
        if (generated + count > sampleBudget) {
            diagnostics.push({ severity: 'error', code: 'linear-tempo-limit', measure: point.measure + 1,
                message: 'The tempo ramp exceeds the bounded conversion sample budget; playback cannot be converted safely.' });
            continue;
        }
        generated += count;
        let measure = point.measure;
        for (let sample = 1; sample <= count; sample++) {
            // Fractional offsets are valid MusicXML division values and avoid
            // quantizing short or unusually positioned ramps to whole MIDI ticks.
            const tick = point.tick + duration * (sample - 0.5) / count;
            while (measure + 1 < starts.length && tick >= starts[measure + 1]) measure++;
            result[measure].push({ offset: tick - starts[measure],
                value: point.value + (next.value - point.value) * sample / count, visible: false });
        }
        diagnostics.push({ severity: 'warning', code: 'linear-tempo-sampled', measure: point.measure + 1,
            message: 'A progressive tempo is converted to hidden MusicXML tempo samples at intervals of at most 1/32 quarter note and 0.25 BPM; original automation is retained in metadata.' });
    }
    return result.map(tempos => tempos.sort((a, b) => a.offset - b.offset));
}
