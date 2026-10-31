// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { AlphaTexImporter } from '@coderline/alphatab/importer/AlphaTexImporter';
import { Gp7Exporter } from '@coderline/alphatab/exporter/Gp7Exporter';
import { Settings } from '@coderline/alphatab/Settings';
import { BeatBeamingMode } from '@coderline/alphatab/model/Beat';
import { BeamingRules } from '@coderline/alphatab/model/MasterBar';
import { Duration } from '@coderline/alphatab/model/Duration';
import { planBeams } from '../src/beaming';
import { importScore } from '../src/index';

function score(tex: string) {
    const parser = new AlphaTexImporter(); parser.initFromString(tex, new Settings()); return parser.readScore();
}
function beams(tex: string) {
    const voice = score(tex).tracks[0].staves[0].bars[0].voices[0];
    const plan = planBeams(voice);
    return voice.beats.map(b => plan.get(b) ?? '');
}
const beam = (value: string, number = 1) => `<beam number="${number}">${value}</beam>`;
const pair = [beam('begin'), beam('end')];

describe('MusicXML beam engraving', () => {
    it('groups simple meter by quarter beat and never across barlines', () => {
        expect(beams('. :8 0.6*8')).toEqual([...pair, ...pair, ...pair, ...pair]);
        const s = score('. :8 0.6 | 0.6');
        for (const bar of s.tracks[0].staves[0].bars) expect(planBeams(bar.voices[0]).size).toBe(0);
    });
    it('groups compound meter in threes and honors meter changes', () => {
        expect(beams('\\ts 4 8 . :8 0.6*4')).toEqual([...pair, ...pair]);
        expect(beams('\\ts 6 8 . :8 0.6*6')).toEqual([beam('begin'), beam('continue'), beam('end'), beam('begin'), beam('continue'), beam('end')]);
        const s = score('\\ts 6 8 . :8 0.6*6 | \\ts 2 4 :8 0.6*4');
        const v = s.tracks[0].staves[0].bars[1].voices[0];
        expect(v.beats.map(b => planBeams(v).get(b))).toEqual([...pair, ...pair]);
    });
    it('emits secondary beams and both hook directions for mixed durations', () => {
        expect(beams('. :16 0.6*4')).toEqual(['begin', 'continue', 'continue', 'end'].map(v => beam(v) + beam(v, 2)));
        expect(beams('. :8 0.6 :16 0.6*2')).toEqual([beam('begin'), beam('continue') + beam('begin', 2), beam('end') + beam('end', 2)]);
        expect(beams('. :8 0.6{d} :16 0.6')).toEqual([beam('begin'), beam('end') + beam('backward hook', 2)]);
        expect(beams('. :16 0.6 :8 0.6{d}')).toEqual([beam('begin') + beam('forward hook', 2), beam('end')]);
    });
    it('breaks at rests, long notes and gaps', () => {
        expect(beams('. :16 0.6 r 0.6 0.6')).toEqual(['', '', ...pair.map(v => v + v.replace('number="1"', 'number="2"'))]);
        expect(beams('. :8 0.6 :4 0.6 :8 0.6')).toEqual(['', '', '']);
        const v = score('. :8 0.6*2').tracks[0].staves[0].bars[0].voices[0];
        v.beats[1].displayStart += 120;
        expect(planBeams(v).size).toBe(0);
    });
    it('keeps complete tuplets together and separate from neighboring notes', () => {
        expect(beams('. :8 0.6{tu 3}*3 0.6*2')).toEqual([beam('begin'), beam('continue'), beam('end'), ...pair]);
    });
    it('keeps grace groups separate from main-note beams', () => {
        expect(beams('. :8 0.6{gr} 1.6{gr} 2.6 3.6 4.6{gr} 5.6')).toEqual([...pair.map(v => v + v.replace('number="1"', 'number="2"')), ...pair, '', '']);
    });
    it('honors source beam split, merge, and secondary split settings', () => {
        expect(beams('. :8 0.6{beam split} 0.6')).toEqual(['', '']);
        expect(beams('. :8 0.6 0.6{beam merge} 0.6 0.6')).toEqual(['begin', 'continue', 'continue', 'end'].map(v => beam(v)));
        const v = score('. :16 0.6*4').tracks[0].staves[0].bars[0].voices[0];
        v.beats[1].beamingMode = BeatBeamingMode.ForceSplitOnSecondaryToNext;
        expect(v.beats.map(b => planBeams(v).get(b))).toEqual([beam('begin') + beam('begin', 2), beam('continue') + beam('end', 2), beam('continue') + beam('begin', 2), beam('end') + beam('end', 2)]);
    });
    it('uses custom groups and aligns pickups to the end of their meter', () => {
        const s = score('. :8 0.6*8'); const v = s.tracks[0].staves[0].bars[0].voices[0];
        s.masterBars[0].actualBeamingRules = BeamingRules.createSimple(4, 4, Duration.Eighth, [4, 4]);
        expect(v.beats.map(b => planBeams(v).get(b))).toEqual(['begin', 'continue', 'continue', 'end', 'begin', 'continue', 'continue', 'end'].map(v => beam(v)));
        const pickup = score('. :8 0.6*3'); const pv = pickup.tracks[0].staves[0].bars[0].voices[0];
        pickup.masterBars[0].anacrusisOffset = 2400;
        expect(pv.beats.map(b => planBeams(pv).get(b) ?? '')).toEqual(['', ...pair]);
    });
    it('writes beams once per chord in each voice without changing musical data', async () => {
        const input = score('\\voice . :8 (0.6 2.5)*8 \\voice :8 0.4*8');
        const result = await importScore(new Gp7Exporter().export(input));
        const notes = [...result.musicXml.matchAll(/<note>(.*?)<\/note>/g)].map(m => m[1]);
        expect(notes.filter(n => n.includes('<beam')).length).toBe(16);
        expect(notes.filter(n => n.includes('<chord/>')).every(n => !n.includes('<beam'))).toBe(true);
        expect(notes.filter(n => n.includes('<beam')).every(n => /<staff>1<\/staff><beam/.test(n))).toBe(true);
        // Removing engraving alone leaves every pitch, onset, duration, voice and technique intact.
        const { writeMusicXml } = await import('../src/musicxml');
        expect(result.musicXml.replace(/<beam[^>]*>[^<]*<\/beam>/g, '')).toBe(writeMusicXml(input, []).replace(/<beam[^>]*>[^<]*<\/beam>/g, ''));
    });
});
