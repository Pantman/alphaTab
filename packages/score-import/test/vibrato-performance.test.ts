// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { AlphaTexImporter } from '@coderline/alphatab/importer/AlphaTexImporter';
import { Gp7Exporter } from '@coderline/alphatab/exporter/Gp7Exporter';
import { Settings } from '@coderline/alphatab/Settings';
import { VibratoType } from '@coderline/alphatab/model/VibratoType';
import { XmlDocument } from '@coderline/alphatab/xml/XmlDocument';
import { importScore } from '../src/index';
async function convert(noteType: VibratoType, beatType: VibratoType) {
    const parser = new AlphaTexImporter(); parser.initFromString('. :1 (5.4{b (0 4)} 7.3)', new Settings());
    const score = parser.readScore(), beat = score.tracks[0].staves[0].bars[0].voices[0].beats[0];
    beat.notes[0].vibrato = noteType; beat.vibrato = beatType;
    const result = await importScore(new Gp7Exporter().export(score));
    const doc = new XmlDocument(); doc.parse(result.musicXml);
    const notes = doc.firstElement!.findChildElement('part')!.findChildElement('measure')!.childElements().filter(n=>n.localName==='note');
    const layers = notes.map(note => {
        const play = note.childElements().filter(n=>n.localName==='play');
        expect(play.length).toBeLessThanOrEqual(1);
        const mark = play[0]?.childElements().find(n=>n.getAttribute('type')==='musicmaster:vibrato-v1');
        return mark ? JSON.parse(mark.innerText).layers : [];
    });
    return {result,layers};
}
describe('vibrato playback metadata', () => {
    it.each([VibratoType.Slight,VibratoType.Wide])('preserves finger strength %i on only the authored chord string', async type => {
        const {result,layers} = await convert(type,VibratoType.None);
        expect(result.practiceReady).toBe(true);
        expect(layers).toEqual([[{kind:'finger',strength:type===VibratoType.Wide?'wide':'slight'}],[]]);
        expect(result.musicXml).toContain('musicmaster:bend-curve-v1');
    });
    it('distinguishes a beat-wide bar vibrato from a single-string finger vibrato', async () => {
        const {layers} = await convert(VibratoType.Slight,VibratoType.Wide);
        expect(layers).toEqual([[{kind:'finger',strength:'slight'},{kind:'bar',strength:'wide'}],[{kind:'bar',strength:'wide'}]]);
    });
    it('does not add playback vibrato to unmarked notes', async () => {
        const {result,layers} = await convert(VibratoType.None,VibratoType.None);
        expect(layers).toEqual([[],[]]); expect(result.musicXml).not.toContain('musicmaster:vibrato-v1');
    });
});
