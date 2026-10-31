// SPDX-License-Identifier: MPL-2.0
import { describe, it, expect } from 'vitest';
import { AlphaTexImporter } from '@coderline/alphatab/importer/AlphaTexImporter';
import { Gp7Exporter } from '@coderline/alphatab/exporter/Gp7Exporter';
import { Settings } from '@coderline/alphatab/Settings';
import { importScore } from '../src/index';
import { writeMusicXml } from '../src/musicxml';

function score(tex: string) {
    const parser = new AlphaTexImporter(); parser.initFromString(tex, new Settings()); return parser.readScore();
}
const directions = (xml: string) => [...xml.matchAll(/<direction[^>]*>(.*?)<\/direction>/g)].map(m => m[0]);
const starts = (xml: string) => directions(xml).filter(s => s.includes('<dashes type="start"'));
const stops = (xml: string) => directions(xml).filter(s => s.includes('<dashes type="stop"'));

describe('performance instructions and beat text', () => {
    it('writes escaped beat text at its source onset and voice/staff, once per chord', async () => {
        const s = score('. :4 0.6 (2.6 3.5) 0.6 0.6');
        s.tracks[0].staves[0].bars[0].voices[0].beats[1].text = 'Verse <1> & "play softly"';
        const result = await importScore(new Gp7Exporter().export(s));
        expect(result.musicXml.match(/Verse &lt;1&gt; &amp; &quot;play softly&quot;/g)).toHaveLength(1);
        expect(result.musicXml).toMatch(/<words>Verse .*?<\/words><\/direction-type><voice>1<\/voice><staff>1<\/staff><\/direction><note>/);
    });
    it('groups P.M. beats and bounds dashes to each measure, including a single marked beat', () => {
        const xml = writeMusicXml(score('. :4 0.6{pm} 1.6{pm} 2.6 3.6{pm} | 0.6{pm} 1.6 2.6 3.6'), []);
        expect(starts(xml)).toHaveLength(3); expect(stops(xml)).toHaveLength(3);
        expect(starts(xml).every(s => s.includes('<words>P.M.</words>'))).toBe(true);
        expect(stops(xml).every(s => s.includes('<voice>1</voice><staff>1</staff>'))).toBe(true);
        expect(xml).toMatch(/<dashes type="stop"[^>]*\/><\/direction-type><voice>1<\/voice><staff>1<\/staff><\/direction><\/measure>/);
    });
    it('splits instructions at rests and gaps and distinguishes let ring', () => {
        const s = score('. :4 0.6{lr} r 2.6{lr} 3.6{lr}');
        expect(starts(writeMusicXml(s, []))).toHaveLength(2);
        const v = s.tracks[0].staves[0].bars[0].voices[0];v.beats[3].displayStart += 10;
        const xml = writeMusicXml(s, []);
        expect(starts(xml)).toHaveLength(3);
        expect(starts(xml).every(s => s.includes('<words>let ring</words>'))).toBe(true);
    });
    it('qualifies partial chords and combines simultaneous techniques without implying every note', () => {
        const s = score('. :4 (0.6 2.5) 0.6 0.6 0.6');
        const notes = s.tracks[0].staves[0].bars[0].voices[0].beats[0].notes;
        notes[0].isPalmMute = true; notes[1].isLetRing = true;
        const xml = writeMusicXml(s, []);
        expect(starts(xml)).toHaveLength(1);
        expect(xml).toContain('<words>P.M. (string 6) / let ring (string 5)</words>');
    });
    it('keeps voices separate and emits lyrics once per chord with their verse numbers', () => {
        const s = score('\\voice . :1 (0.6 2.5) \\voice :1 0.4');
        const voices = s.tracks[0].staves[0].bars[0].voices;
        voices[0].beats[0].notes.forEach(n => { n.isPalmMute = true; });
        voices[1].beats[0].notes[0].isLetRing = true;
        voices[0].beats[0].lyrics = ['A & B', '', 'Third <verse>'];
        const xml = writeMusicXml(s, []);
        expect(starts(xml)).toHaveLength(2);
        expect(starts(xml).map(s => s.match(/<voice>(.*?)<\/voice>/)![1])).toEqual(['1', '2']);
        expect(xml).toContain('<lyric number="1"><text>A &amp; B</text></lyric>');
        expect(xml).toContain('<lyric number="3"><text>Third &lt;verse&gt;</text></lyric>');
        expect(xml.match(/<lyric /g)).toHaveLength(2);
    });
});
