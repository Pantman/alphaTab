// SPDX-License-Identifier: MPL-2.0
import { MidiUtils } from '@coderline/alphatab/midi/MidiUtils';
import { AutomationType } from '@coderline/alphatab/model/Automation';
import { SlideOutType } from '@coderline/alphatab/model/SlideOutType';
import { GraceType } from '@coderline/alphatab/model/GraceType';
import type { Beat } from '@coderline/alphatab/model/Beat';
import type { Note } from '@coderline/alphatab/model/Note';
import type { Score } from '@coderline/alphatab/model/Score';
import type { Staff } from '@coderline/alphatab/model/Staff';
import type { Track } from '@coderline/alphatab/model/Track';
import { HarmonicType } from '@coderline/alphatab/model/HarmonicType';
import { PercussionMapper } from '@coderline/alphatab/model/PercussionMapper';
import type { ImportDiagnostic } from './types';
import { ScoreImportError } from './types';
import { planBeams } from './beaming';
import { planInstructions } from './instructions';
import { planTempos } from './tempos';
import { planVibratos } from './vibrato';
import type { BendPerformance } from './bendPerformance';
import { percussionNotehead } from './percussionNoteheads';

const divisions = MidiUtils.QuarterTime;
const noteTypes: Record<number, string> = { [-4]: 'long', [-2]: 'breve', 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth',
    16: '16th', 32: '32nd', 64: '64th', 128: '128th', 256: '256th' };
const dynamics = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'pppp', 'ppppp', 'pppppp', 'ffff', 'fffff', 'ffffff',
    'sf', 'sfp', 'sfpp', 'fp', 'rf', 'rfz', 'sfz', 'sffz', 'fz', 'n'];
export const xmlText = (value: unknown): string => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const element = (name: string, value: unknown): string => `<${name}>${xmlText(value)}</${name}>`;
const validMidi = (value: number): boolean => Number.isInteger(value) && value >= 0 && value <= 127;
const percussionId = (value: number): string => validMidi(value) ? `D${value}` : 'UnknownPercussion';

function pitch(midi: number, prefix = ''): string {
    if (!Number.isFinite(midi) || midi < 12 || midi > 127) throw new ScoreImportError('invalid-pitch', `A source pitch (${midi}) cannot be represented in MusicXML's octave range.`);
    const steps = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
    const alterations = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
    const semitone = Math.floor(midi);
    const alter = alterations[semitone % 12] + midi - semitone;
    return element(`${prefix}step`, steps[semitone % 12]) +
        (alter ? element(`${prefix}alter`, alter) : '') + element(`${prefix}octave`, Math.floor(midi / 12) - 1);
}

function numbersFromMask(mask: number): string {
    return Array.from({ length: 8 }, (_, i) => i + 1).filter(n => mask & (1 << (n - 1))).join(',');
}

export function writeMusicXml(score: Score, diagnostics: ImportDiagnostic[], bends = new WeakMap<Note, BendPerformance>()): string {
    const seen = new Set<string>();
    const report = (severity: ImportDiagnostic['severity'], code: string, message: string, partId?: string, measure?: number) => {
        const key = `${code}:${partId ?? ''}:${measure ?? ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        diagnostics.push({ severity, code, message, ...(partId ? { partId } : {}), ...(measure ? { measure } : {}) });
    };
    if (!score.tracks.length || !score.masterBars.length) throw new ScoreImportError('empty-score', 'The score has no parts or measures.');
    report('warning', 'pitch-spelling', 'Pitches use sounding pitch and a canonical sharp spelling; original enharmonic engraving may differ.');
    const percussionNotes = (track: Track): number[] => {
        const notes = new Set<number>();
        for (const staff of track.staves) for (const bar of staff.bars) for (const voice of bar.voices)
            for (const beat of voice.beats) for (const note of beat.notes) if (note.isPercussion) notes.add(note.realValue);
        return [...notes].sort((a, b) => a - b);
    };
    const partList = score.tracks.map((track, t) => {
        const id = `P${t + 1}`;
        const info = track.playbackInfo;
        const drums = percussionNotes(track);
        const instruments = drums.length ? drums.map(midi => `<score-instrument id="${id}-${percussionId(midi)}">${element('instrument-name', validMidi(midi) ? `Percussion ${midi}` : 'Unresolved percussion')}</score-instrument>`).join('')
            : `<score-instrument id="${id}-I">${element('instrument-name', track.name)}</score-instrument>`;
        if (!drums.length && (info.primaryChannel < 0 || info.primaryChannel > 15)) report('warning', 'midi-channel-omitted', 'The source virtual MIDI channel exceeds MusicXML MIDI channel limits; its original value is retained in metadata.', id);
        const midiInstruments = drums.length ? drums.filter(validMidi).map(midi => `<midi-instrument id="${id}-${percussionId(midi)}"><midi-channel>10</midi-channel>${element('midi-unpitched', midi + 1)}</midi-instrument>`).join('')
            : `<midi-instrument id="${id}-I">${info.primaryChannel >= 0 && info.primaryChannel <= 15 ? element('midi-channel', info.primaryChannel + 1) : ''}${element('midi-bank', info.bank + 1)}${element('midi-program', info.program + 1)}${element('volume', Math.max(0, Math.min(100, info.volume / 16 * 100)))}${element('pan', (info.balance - 8) / 8 * 90)}</midi-instrument>`;
        return `<score-part id="${id}">${element('part-name', track.name || `Track ${t + 1}`)}${instruments}${midiInstruments}</score-part>`;
    }).join('');

    const tempos = planTempos(score, diagnostics);
    const parts = score.tracks.map((track, t) => {
        const partId = `P${t + 1}`;
        let previousDynamic = -1;
        const vibratos = planVibratos(track);
        const measures = score.masterBars.map((master, m) => {
            const measure = m + 1;
            const duration = master.calculateDuration();
            if (!Number.isInteger(duration) || duration <= 0) throw new ScoreImportError('invalid-meter', 'Measure duration must be a positive whole number of ticks.');
            if (master.directions?.size) report('error', 'navigation-unconverted', 'Segno, coda or other navigation is not yet converted.', partId, measure);
            if (master.tripletFeel) report('error', 'swing-unconverted', 'Swing feel is preserved in the source but is not yet converted.', partId, measure);
            if (master.fermata?.size) report('warning', 'fermata-playback', 'Fermata playback extensions are not yet converted.', partId, measure);
            let attributes = `<attributes><divisions>${divisions}</divisions>`;
            track.staves.forEach((staff, s) => {
                const bar = staff.bars[m];
                if (bar && (m === 0 || bar.keySignature !== staff.bars[m - 1]?.keySignature)) {
                    attributes += `<key number="${s + 1}">${element('fifths', bar.keySignature)}${element('mode', bar.keySignatureType === 1 ? 'minor' : 'major')}</key>`;
                }
            });
            if (m === 0 || master.timeSignatureNumerator !== score.masterBars[m - 1].timeSignatureNumerator ||
                master.timeSignatureDenominator !== score.masterBars[m - 1].timeSignatureDenominator) {
                attributes += `<time>${element('beats', master.timeSignatureNumerator)}${element('beat-type', master.timeSignatureDenominator)}</time>`;
            }
            if (m === 0) attributes += element('staves', track.staves.length);
            track.staves.forEach((staff, s) => {
                const bar = staff.bars[m];
                if (m === 0 || bar?.clef !== staff.bars[m - 1]?.clef) {
                    const clef = staff.isPercussion ? ['percussion', '2'] : staff.isStringed ? ['TAB', '5'] :
                        bar?.clef === 3 ? ['F', '4'] : bar?.clef === 1 ? ['C', '3'] : bar?.clef === 2 ? ['C', '4'] : ['G', '2'];
                    attributes += `<clef number="${s + 1}">${element('sign', clef[0])}${element('line', clef[1])}</clef>`;
                }
                if (staff.displayTranspositionPitch || bar?.clefOttava !== 2) report('warning', 'display-transposition', 'Source display-octave conventions are normalized to sounding pitch.', partId);
            });
            track.staves.forEach((staff, s) => {
                if (m === 0 && staff.isStringed && !staff.isPercussion) attributes += `<staff-details number="${s + 1}">${element('staff-lines', staff.tuning.length)}` +
                    [...staff.tuning].reverse().map((tuning, i) => `<staff-tuning line="${i + 1}">${pitch(tuning, 'tuning-')}</staff-tuning>`).join('') +
                    (staff.capo ? element('capo', staff.capo) : '') + '</staff-details>';
            });
            attributes += '</attributes>';
            let body = attributes;
            if (m === 0) track.staves.forEach((staff, s) => {
                if (staff.capo > 0 && !staff.isPercussion) body += `<direction><direction-type>${element('words', `Capo ${staff.capo}`)}</direction-type>${element('staff', s + 1)}</direction>`;
            });
            if (master.section) body += `<direction><direction-type>${element('rehearsal', master.section.text)}</direction-type></direction>`;
            for (const tempo of tempos[m]) {
                // A sound-only direction still needs a direction-type. Empty words
                // are valid MusicXML and avoid engraving generated ramp labels.
                const mark = tempo.visible ? `<metronome><beat-unit>quarter</beat-unit>${element('per-minute', tempo.value)}</metronome>` : '<words/>';
                body += `<direction><direction-type>${mark}</direction-type><offset sound="yes">${tempo.offset}</offset><sound tempo="${tempo.value}"/></direction>`;
            }
            if (master.isRepeatStart) body += '<barline location="left"><repeat direction="forward"/></barline>';
            const ending = master.alternateEndings;
            if (ending && ending !== score.masterBars[m - 1]?.alternateEndings) body += `<barline location="left"><ending number="${numbersFromMask(ending)}" type="start"/></barline>`;
            let firstVoice = true;
            track.staves.forEach((staff, s) => {
                const bar = staff.bars[m];
                if (bar?.simileMark) report('error', 'measure-repeat', 'Measure-repeat shorthand is not yet expanded.', partId, measure);
                if (bar?.sustainPedals.length) report('warning', 'pedal-playback', 'Pedal markers are preserved in the original file but not yet converted.', partId, measure);
                const voices = bar?.voices.filter(voice => !voice.isEmpty) ?? [];
                const active = voices.length ? voices : [null];
                active.forEach(voice => {
                    if (!firstVoice) body += `<backup><duration>${duration}</duration></backup>`;
                    firstVoice = false;
                    const voiceNumber = s * 4 + (voice?.index ?? 0) + 1;
                    let position = 0;
                    const beams = voice ? planBeams(voice) : new Map<Beat, string>();
                    const instructions = voice ? planInstructions(voice, s + 1, voiceNumber, `${partId}-${m}-${voiceNumber}`, xmlText) : undefined;
                    for (const beat of voice?.beats ?? []) {
                        if (beat.isEmpty) continue;
                        const grace = beat.graceType !== GraceType.None;
                        if (beat.graceType === GraceType.OnBeat) report('error', 'on-beat-grace', 'On-beat grace timing is not yet supported by the practice pipeline.', partId, measure);
                        if (beat.graceType === GraceType.BendGrace) report('error', 'bend-grace', 'Bend-grace timing is not yet converted.', partId, measure);
                        if (!grace && beat.displayStart < position) report('error', 'overlapping-beats', 'Overlapping voice durations cannot be converted safely.', partId, measure);
                        if (!grace && beat.displayStart > position) { body += `<forward><duration>${beat.displayStart - position}</duration><voice>${voiceNumber}</voice><staff>${s + 1}</staff></forward>`; position = beat.displayStart; }
                        if (!grace && (beat.displayDuration <= 0 || !Number.isInteger(beat.displayDuration))) throw new ScoreImportError('invalid-duration', 'A beat has an invalid duration.');
                        if (beat.hasWhammyBar) report('warning', 'whammy-playback', 'Whammy curves are not yet converted.', partId, measure);
                        if (beat.tremoloPicking || beat.brushType || beat.rasgueado) report('warning', 'performance-pattern', 'Tremolo, brush or rasgueado playback patterns are not yet converted.', partId, measure);
                        for (const automation of beat.automations) {
                            if (automation.type === AutomationType.Tempo) continue;
                            report('warning', 'sound-automation-unapplied', 'Timed sound or mix changes are preserved as source metadata but not yet applied.', partId, measure);
                        }
                        if (beat.dynamics !== previousDynamic && dynamics[beat.dynamics]) {
                            body += `<direction><direction-type><dynamics><${dynamics[beat.dynamics]}/></dynamics></direction-type><staff>${s + 1}</staff></direction>`;
                            previousDynamic = beat.dynamics;
                        }
                        body += instructions?.get(beat)?.before ?? '';
                        if (beat.isRest) body += `<note><rest/>${element('duration', beat.displayDuration)}${element('voice', voiceNumber)}${element('type', noteTypes[beat.duration])}${'<dot/>'.repeat(beat.dots)}${timeModification(beat)}${element('staff', s + 1)}${vibratos.has(beat) ? `<notations>${vibratos.get(beat)}</notations>` : ''}</note>`;
                        else beat.notes.forEach((note, n) => { body += writeNote(note, beat, staff, s + 1, voiceNumber, n > 0, partId, measure, report, n === 0 ? beams.get(beat) ?? '' : '', n === 0 ? vibratos.get(beat) ?? '' : '', bends.get(note)); });
                        body += instructions?.get(beat)?.after ?? '';
                        if (!grace) position = Math.max(position, beat.displayStart + beat.displayDuration);
                    }
                    if (position < duration) body += `<forward><duration>${duration - position}</duration><voice>${voiceNumber}</voice><staff>${s + 1}</staff></forward>`;
                    if (position > duration) report('error', 'overfull-measure', 'A voice extends beyond the declared measure.', partId, measure);
                });
            });
            if (ending && ending !== score.masterBars[m + 1]?.alternateEndings) body += `<barline location="right"><ending number="${numbersFromMask(ending)}" type="${master.repeatCount ? 'stop' : 'discontinue'}"/></barline>`;
            if (master.repeatCount > 0) body += `<barline location="right"><repeat direction="backward" times="${master.repeatCount}"/></barline>`;
            return `<measure number="${measure}"${master.isAnacrusis ? ' implicit="yes"' : ''}>${body}</measure>`;
        }).join('');
        return `<part id="${partId}">${measures}</part>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work>${element('work-title', score.title)}</work><identification><creator type="composer">${xmlText(score.music || score.artist)}</creator></identification><part-list>${partList}</part-list>${parts}</score-partwise>`;
}

function timeModification(beat: Beat): string {
    return beat.hasTuplet ? `<time-modification>${element('actual-notes', beat.tupletNumerator)}${element('normal-notes', beat.tupletDenominator)}</time-modification>` : '';
}

type Report = (severity: ImportDiagnostic['severity'], code: string, message: string, partId?: string, measure?: number) => void;

function writeNote(note: Note, beat: Beat, staff: Staff, staffNumber: number, voice: number, chord: boolean, partId: string, measure: number, report: Report, beams: string, vibrato: string, performance?: BendPerformance): string {
    const grace = beat.graceType !== GraceType.None;
    // MusicXML prebends describe the approach to the starting pitch. The pitch itself must already include it.
    const previousPoints = note.bendOrigin?.bendPoints;
    const initialBend = note.bendPoints?.[0]?.value ?? (previousPoints?.[previousPoints.length - 1]?.value ?? 0);
    const soundingPitch = note.realValue + initialBend / 2;
    if (!note.isPercussion && !Number.isInteger(soundingPitch)) {
        if (note.isStringed && validMidi(note.realValue) && initialBend !== 0) {
            report('warning', 'fractional-bend-start', 'A fractional guitar bend start is preserved in MusicXML; playback needs its pitch offset above an integer fret-pitch anchor. Practice does not judge bend intonation.', partId, measure);
        } else report('error', 'microtonal-start', 'A fractional-semitone starting pitch without a resolved guitar bend cannot yet be used for MIDI practice targets.', partId, measure);
    }
    let body = grace ? `<grace${beat.graceType === GraceType.BeforeBeat ? ' slash="yes"' : ''}/>` : '';
    if (chord) body += '<chord/>';
    if (note.isPercussion) {
        const art = PercussionMapper.getArticulation(note);
        const midi = note.realValue;
        if (!validMidi(midi)) report('warning', 'unresolved-percussion', 'An unidentified percussion entry is retained as a visual placeholder only; omit it from playback and practice targets.', partId, measure);
        // Percussion identity comes from the score-instrument, independently of its visual position.
        // G5 is the generic placeholder at the source staffLine=0 position.
        // Its display position never supplies a MIDI identity.
        const diatonic = art ? 39 - art.staffLine : 39;
        const step = ['C', 'D', 'E', 'F', 'G', 'A', 'B'][((diatonic % 7) + 7) % 7];
        body += `<unpitched><display-step>${step}</display-step><display-octave>${Math.floor(diatonic / 7)}</display-octave></unpitched>`;
        if (!art) report('warning', 'percussion-display', 'A percussion note uses a generic visual staff position.', partId, measure);
    } else body += `<pitch>${pitch(soundingPitch)}</pitch>`;
    if (!grace) body += element('duration', beat.displayDuration);
    if (note.isTieDestination) body += '<tie type="stop"/>';
    if (note.isTieOrigin) body += '<tie type="start"/>';
    if (!noteTypes[beat.duration]) throw new ScoreImportError('unsupported-duration', 'Unknown written note duration.');
    body += `<instrument id="${partId}-${note.isPercussion ? percussionId(note.realValue) : 'I'}"/>${element('voice', voice)}${element('type', noteTypes[beat.duration])}${'<dot/>'.repeat(beat.dots)}${timeModification(beat)}`;
    const art = note.isPercussion ? PercussionMapper.getArticulation(note) : undefined;
    const head = art ? percussionNotehead(art.getSymbol(beat.duration)) : undefined;
    if (art && !head) report('warning', 'percussion-notehead', 'A source percussion notehead has no supported MusicXML equivalent; a normal head is used.', partId, measure);
    // A sustained fret becomes a useful courtesy anchor when a new slide
    // starts there. Parentheses describe engraving, not ghost-note dynamics.
    const courtesyFret = note.isStringed && note.isTieDestination && !!note.slideTarget;
    if (head || note.isDead || note.isGhost || courtesyFret) {
        const value = head?.value ?? (note.isDead && !note.isPercussion ? 'x' : 'normal');
        body += `<notehead${head?.filled !== undefined ? ` filled="${head.filled ? 'yes' : 'no'}"` : ''}${note.isGhost || courtesyFret ? ' parentheses="yes"' : ''}>${value}</notehead>`;
    }
    body += element('staff', staffNumber) + beams;
    let technical = '';
    if (note.isStringed && !note.isPercussion) {
        if (Number.isInteger(note.fret) && note.fret >= 0 && note.string >= 1 && note.string <= staff.tuning.length) {
            technical += element('string', staff.tuning.length - note.string + 1) + element('fret', note.fret);
        } else report('error', 'invalid-fingering', 'A source string/fret is outside the representable range; it is retained only in the original file.', partId, measure);
    }
    if (note.harmonicType) technical += `<harmonic>${note.harmonicType === HarmonicType.Natural ? '<natural/>' : '<artificial/>'}</harmonic>`;
    if (note.isHammerPullOrigin) {
        const pull = note.hammerPullDestination && note.hammerPullDestination.fret < note.fret;
        const tag = pull ? 'pull-off' : 'hammer-on';
        technical += `<${tag} number="${Math.max(1, note.string)}" type="start">${pull ? 'P' : 'H'}</${tag}>`;
    }
    if (note.isHammerPullDestination) {
        const pull = note.hammerPullOrigin && note.fret < note.hammerPullOrigin.fret;
        const tag = pull ? 'pull-off' : 'hammer-on';
        technical += `<${tag} number="${Math.max(1, note.string)}" type="stop"/>`;
    }
    const points = note.bendPoints;
    if (initialBend) technical += `<bend><bend-alter>${initialBend / 2}</bend-alter><pre-bend/></bend>`;
    if (points?.length) {
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];
            const delta = (b.value - a.value) / 2;
            if (!delta) continue;
            if (a.offset >= b.offset) { report('error', 'instant-bend', 'An instantaneous bend cannot be represented by this converter.', partId, measure); continue; }
            technical += `<bend first-beat="${a.offset / 60 * 100}" last-beat="${b.offset / 60 * 100}"><bend-alter>${Math.abs(delta)}</bend-alter>${delta < 0 ? '<release/>' : ''}</bend>`;
        }
        report('warning', 'bend-curve', 'Bend points are expressed as MusicXML segments; renderer and playback fidelity require validation.', partId, measure);
    }
    const tied = (note.isTieDestination ? '<tied type="stop"/>' : '') + (note.isTieOrigin ? '<tied type="start"/>' : '');
    const slideNumber = Math.max(1, note.string);
    let slides = '';
    if (note.slideOrigin) slides += `<slide type="stop" number="${slideNumber}"/>`;
    if (note.slideTarget) slides += `<slide type="start" number="${slideNumber}"/>`;
    // A shift slide is picked; a legato slide also carries its curved slur.
    if (note.slideOrigin?.slideOutType === SlideOutType.Legato) slides += `<slur type="stop" number="${slideNumber}"/>`;
    if (note.slideTarget && note.slideOutType === SlideOutType.Legato) slides += `<slur type="start" number="${slideNumber}"/>`;
    if (note.slideInType || (note.slideOutType && !note.slideTarget)) report('warning', 'unconnected-slide', 'An unconnected slide is preserved in the original file but not yet converted.', partId, measure);
    const articulation = note.accentuated === 1 ? '<accent/>' : note.accentuated === 2 ? '<strong-accent/>' : note.accentuated === 3 ? '<tenuto/>' : '';
    const articulations = articulation + (note.isStaccato ? '<staccato/>' : '');
    body += `<notations>${tied}${slides}${vibrato}${articulations ? `<articulations>${articulations}</articulations>` : ''}${technical ? `<technical>${technical}</technical>` : ''}</notations>`;
    if (note.isPalmMute || note.isLetRing || note.vibrato || note.trillValue >= 0) report('warning', 'note-performance', 'Palm mute, let ring, vibrato or trill playback needs application interpretation.', partId, measure);
    if (!chord) beat.lyrics?.forEach((text, verse) => {
        if (text) body += `<lyric number="${verse + 1}">${element('text', text)}</lyric>`;
    });
    if (performance) body += `<play><other-play type="musicmaster:bend-curve-v1">${xmlText(JSON.stringify(performance))}</other-play></play>`;
    return `<note>${body}</note>`;
}
