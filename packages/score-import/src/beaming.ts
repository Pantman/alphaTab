// SPDX-License-Identifier: MPL-2.0
import { MidiUtils } from '@coderline/alphatab/midi/MidiUtils';
import { BeatBeamingMode, type Beat } from '@coderline/alphatab/model/Beat';
import { GraceType } from '@coderline/alphatab/model/GraceType';
import type { Voice } from '@coderline/alphatab/model/Voice';

const levels = (beat: Beat): number => beat.duration >= 8 ? Math.log2(beat.duration) - 2 : 0;

/** Plan engraving only; never modify the source model or join different voices/measures. */
export function planBeams(voice: Voice): Map<Beat, string> {
    const master = voice.bar.masterBar;
    const custom = master.actualBeamingRules?.findRule(voice.bar.shortestDuration);
    const metricStart = (beat: Beat) => beat.displayStart + master.anacrusisOffset;
    const group = (beat: Beat): number => {
        const start = metricStart(beat);
        if (custom) {
            const [duration, groups] = custom;
            let slot = Math.floor(start / MidiUtils.toTicks(duration));
            for (let i = 0; i < groups.length; i++) {
                if (slot < groups[i]) return i;
                slot -= groups[i];
            }
            // Unspecified slots are individual groups, not one remaining mega-group.
            return groups.length + slot;
        }
        const numerator = master.timeSignatureNumerator, denominator = master.timeSignatureDenominator;
        const unit = MidiUtils.QuarterTime * 4 / denominator;
        if (denominator >= 8) {
            if (numerator % 3 === 0) return Math.floor(start / (unit * 3));
            const oddGroups: Record<number, number[]> = { 4: [2, 2], 5: [3, 2], 7: [4, 3], 8: [3, 3, 2], 10: [4, 3, 3] };
            const groups = oddGroups[numerator];
            if (groups) {
                let boundary = 0;
                for (let i = 0; i < groups.length; i++) {
                    boundary += unit * groups[i];
                    if (start < boundary) return i;
                }
            }
        }
        return Math.floor(start / unit);
    };
    const joins = (left: Beat, right: Beat): boolean => {
        if (!levels(left) || !levels(right) || left.isRest || right.isRest || left.isEmpty || right.isEmpty ||
            left.deadSlapped || right.deadSlapped || left.graceType !== right.graceType ||
            left.graceType === GraceType.BendGrace) return false;
        if (left.beamingMode === BeatBeamingMode.ForceSplitToNext) return false;
        if (left.graceType !== GraceType.None) return left.graceGroup === right.graceGroup;
        if (left.displayStart + left.displayDuration !== right.displayStart) return false;
        if (left.beamingMode === BeatBeamingMode.ForceMergeWithNext) return true;
        if (left.tupletGroup !== right.tupletGroup) return false;
        if (left.hasTuplet && left.tupletGroup?.isFull) return true;
        return group(left) === group(right);
    };
    const result = new Map<Beat, string>();
    const beats = voice.beats.filter(b => !b.isEmpty);
    const linked = beats.slice(1).map((beat, i) => joins(beats[i], beat));
    for (let i = 0; i < beats.length; i++) {
        const beat = beats[i];
        const primaryLeft = i > 0 && linked[i - 1], primaryRight = i < linked.length && linked[i];
        if (!primaryLeft && !primaryRight) continue; // A single note keeps its flags.
        let xml = '';
        for (let level = 1; level <= levels(beat); level++) {
            const left = primaryLeft && levels(beats[i - 1]) >= level &&
                (level === 1 || beats[i - 1].beamingMode !== BeatBeamingMode.ForceSplitOnSecondaryToNext);
            const right = primaryRight && levels(beats[i + 1]) >= level &&
                (level === 1 || beat.beamingMode !== BeatBeamingMode.ForceSplitOnSecondaryToNext);
            let value: string;
            if (left && right) value = 'continue';
            else if (left) value = 'end';
            else if (right) value = 'begin';
            else {
                // An isolated secondary beam points into its rhythmic subdivision.
                const subdivision = MidiUtils.QuarterTime * 4 / (2 ** (level + 1));
                const startsSubdivision = metricStart(beat) % subdivision === 0;
                value = primaryRight && (!primaryLeft || startsSubdivision) ? 'forward hook' : 'backward hook';
            }
            xml += `<beam number="${level}">${value}</beam>`;
        }
        result.set(beat, xml);
    }
    return result;
}
