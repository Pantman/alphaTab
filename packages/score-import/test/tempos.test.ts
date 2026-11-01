// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { AlphaTexImporter } from '@coderline/alphatab/importer/AlphaTexImporter';
import { Gp7Exporter } from '@coderline/alphatab/exporter/Gp7Exporter';
import { Automation } from '@coderline/alphatab/model/Automation';
import { Settings } from '@coderline/alphatab/Settings';
import { planTempos } from '../src/tempos';
import { importScore } from '../src/index';
import type { ImportDiagnostic } from '../src/types';

const tempo = (bpm: number, linear = false, ratio = 0, visible = true) => Automation.buildTempoAutomation(linear, ratio, bpm, 2, visible);
function score(tex = '. :1 0.6 | 1.6 | 2.6 | 3.6 | 4.6') {
    const parser = new AlphaTexImporter(); parser.initFromString(tex, new Settings());
    const s = parser.readScore();
    s.masterBars.forEach(b => { b.tempoAutomations = []; }); return s;
}
function elapsed(events: { tick: number; value: number }[], from: number, to: number) {
    let ms = 0, cursor = from, bpm = events[0].value;
    for (const e of events) {
        if (e.tick <= from) { bpm = e.value; continue; }
        if (e.tick >= to) break;
        ms += (e.tick - cursor) / 960 * 60000 / bpm; cursor = e.tick; bpm = e.value;
    }
    return ms + (to - cursor) / 960 * 60000 / bpm;
}
const exact = (q: number, from: number, to: number) => 60000 * q * Math.log(to / from) / (to - from);

describe('progressive Guitar Pro tempo conversion', () => {
    it.each([[128, 96], [60, 180]])('samples %i to %i BPM to the NEXT point with exact endpoints and bounded timing error', (from, to) => {
        const s = score(), diagnostics: ImportDiagnostic[] = [];
        s.masterBars[0].tempoAutomations = [tempo(from)];
        s.masterBars[1].tempoAutomations = [tempo(from, true)];
        s.masterBars[2].tempoAutomations = [tempo(to)];
        const plan = planTempos(s, diagnostics);
        expect(plan[0]).toEqual([{ offset: 0, value: from, visible: true }]);
        expect(plan[1][0]).toEqual({ offset: 0, value: from, visible: true });
        expect(plan[2][0]).toEqual({ offset: 0, value: to, visible: true });
        const events = plan.flatMap((bar, i) => bar.map(e => ({ tick: i * 3840 + e.offset, value: e.value })));
        for (const q of [0.125, 0.5, 1, 1.75, 3, 4]) {
            const target = from + (to - from) * q / 4;
            expect(Math.abs(elapsed(events, 3840, 3840 + q * 960) - exact(q, from, target))).toBeLessThan(0.1);
        }
        expect(diagnostics.map(d => [d.severity, d.code, d.measure])).toEqual([['warning', 'linear-tempo-sampled', 2]]);
        expect(plan[1].slice(1).every(e => !e.visible)).toBe(true);
    });
    it('distributes samples across meter changes and fractional within-bar offsets', () => {
        const s = score('. :1 0.6 | \\ts 3 4 :2 1.6 :4 1.6 | \\ts 4 4 :1 2.6');
        s.masterBars[0].tempoAutomations = [tempo(128, true, 0.37)];
        s.masterBars[2].tempoAutomations = [tempo(96, false, 0.25)];
        const diagnostics: ImportDiagnostic[] = [], plan = planTempos(s, diagnostics);
        expect(plan[0][0]).toEqual({ offset: 0, value: 128, visible: true });
        expect(plan[1].length).toBeGreaterThan(90);
        expect(plan[2][plan[2].length - 1]).toEqual({ offset: 960, value: 96, visible: true });
        expect(plan.every((bar, i) => bar.every(e => e.offset >= 0 && e.offset <= s.masterBars[i].calculateDuration()))).toBe(true);
        expect(diagnostics.every(d => d.severity !== 'error')).toBe(true);
    });
    it('does not invent ramps after final points or between identical values; retains visibility', () => {
        const s = score(); s.masterBars[0].tempoAutomations = [tempo(128, true, 0, false)];
        s.masterBars[1].tempoAutomations = [tempo(128, true)];
        expect(planTempos(s, []).flat().length).toBe(2);
        expect(planTempos(s, [])[0][0].visible).toBe(false);
    });
    it('uses the full meter for pickup automation positions', () => {
        const s = score('\\ts 2 4 . :8 0.6*3 | :2 1.6');
        s.masterBars[0].isAnacrusis = true;
        s.masterBars[0].tempoAutomations = [tempo(110, false, 0.5)];
        expect(planTempos(s, [])[0][1].offset).toBe(960);
    });
    it('bounds sample expansion and rejects invalid positions/tempos', () => {
        const s = score(); s.masterBars[0].tempoAutomations = [tempo(1, true)];
        s.masterBars[1].tempoAutomations = [tempo(2000)];
        const diagnostics: ImportDiagnostic[] = [];
        expect(planTempos(s, diagnostics).flat().length).toBe(2);
        expect(diagnostics[0].code).toBe('linear-tempo-limit');
        expect(diagnostics[0].severity).toBe('error');
        s.masterBars[0].tempoAutomations = [tempo(0)]; expect(() => planTempos(s, [])).toThrow(/invalid value/);
        s.masterBars[0].tempoAutomations = [tempo(120, false, 2)]; expect(() => planTempos(s, [])).toThrow(/invalid value/);
    });
    it('roundtrips a genuine GP ramp as hidden sound directions without dropping notes or authored tempo marks', async () => {
        const s = score(); s.masterBars[0].tempoAutomations = [tempo(128)];
        s.masterBars[1].tempoAutomations = [tempo(128, true)]; s.masterBars[2].tempoAutomations = [tempo(96)];
        const imported = await importScore(new Gp7Exporter().export(s));
        expect(imported.practiceReady).toBe(true);
        expect(imported.musicXml.match(/<note>/g)?.length).toBe(5);
        expect(imported.musicXml.match(/<metronome>/g)?.length).toBe(3);
        expect(imported.musicXml.match(/<words\/>/g)?.length).toBe(128);
        expect(imported.musicXml).toContain('<offset sound="yes">15</offset><sound tempo="127.75"/>');
        expect(imported.diagnostics.some(d => d.code === 'linear-tempo-sampled')).toBe(true);
    });
});
