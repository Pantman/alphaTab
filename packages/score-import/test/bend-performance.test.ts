// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { AlphaTexImporter } from '@coderline/alphatab/importer/AlphaTexImporter';
import { Gp7Exporter } from '@coderline/alphatab/exporter/Gp7Exporter';
import { BendPoint } from '@coderline/alphatab/model/BendPoint';
import { Settings } from '@coderline/alphatab/Settings';
import { XmlDocument } from '@coderline/alphatab/xml/XmlDocument';
import { importScore } from '../src/index';
function study(points: number[][]) {
    const parser = new AlphaTexImporter();
    parser.initFromString('. :1 5.4{b (0 4)}', new Settings());
    const score = parser.readScore();
    score.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0].bendPoints = points.map(p => new BendPoint(p[0], p[1]));
    return new Gp7Exporter().export(score);
}
function performance(xml: string) {
    const doc = new XmlDocument(); doc.parse(xml);
    const note = doc.firstElement!.findChildElement('part')!.findChildElement('measure')!.findChildElement('note')!;
    return JSON.parse(note.findChildElement('play')!.findChildElement('other-play')!.innerText);
}
describe('authored bend performance points', () => {
    it('preserves an early rise, intermediate hold and final rise while keeping compact notation', async () => {
        const imported = await importScore(study([[0,0],[12,3],[30,3],[60,4]]));
        expect(imported.practiceReady).toBe(true);
        expect(performance(imported.musicXml).points).toEqual([
            {percent:0,semitones:0},{percent:20,semitones:1.5},{percent:50,semitones:1.5},{percent:100,semitones:2},
        ]);
        expect(imported.musicXml.match(/<bend first-beat=/g)?.length).toBe(1);
    });
    it('retains an authored zero-valued middle point in a pre-bend release and rebend', async () => {
        const imported = await importScore(study([[0,4],[30,0],[30,0],[60,4]]));
        expect(imported.practiceReady).toBe(true);
        expect(performance(imported.musicXml).points).toEqual([
            {percent:0,semitones:0},{percent:50,semitones:-2},{percent:100,semitones:0},
        ]);
        expect(imported.musicXml).toContain('<pre-bend/>');
    });
    it('ignores inactive middle handles beyond an early destination', async () => {
        const imported = await importScore(study([[0,0],[30,4],[60,4],[30,4]]));
        expect(imported.practiceReady).toBe(true);
        expect(performance(imported.musicXml).points).toEqual([{percent:0,semitones:0},{percent:50,semitones:2}]);
    });
    it('preserves fractional timing positions without rounding to a model tick grid', async () => {
        const imported = await importScore(study([[0,0],[7.5,2],[37.5,2],[60,4]]));
        expect(imported.practiceReady).toBe(true);
        expect(performance(imported.musicXml).points.map((p: {percent:number})=>p.percent)).toEqual([0,12.5,62.5,100]);
    });
    it('falls back to the standard bend for malformed points instead of guessing a curve', async () => {
        const imported = await importScore(study([[0,0],[40,3],[20,3],[60,4]]));
        expect(imported.practiceReady).toBe(true);
        expect(imported.diagnostics).toContainEqual(expect.objectContaining({code:'bend-performance-fallback',severity:'warning',partId:'P1',measure:1}));
    });
});
