// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { AlphaTexImporter } from '@coderline/alphatab/importer/AlphaTexImporter';
import { Gp7Exporter } from '@coderline/alphatab/exporter/Gp7Exporter';
import { Settings } from '@coderline/alphatab/Settings';
import { importScore } from '../src/index';
function score(tex: string) {
    const parser = new AlphaTexImporter(); parser.initFromString(tex, new Settings()); return parser.readScore();
}
async function convert(tex: string) { return importScore(new Gp7Exporter().export(score(tex))); }
describe('held bend and slide notation', () => {
    it('retains a tied bend with a courtesy slide anchor and paired legato slur', async () => {
        const input = score('. :2 7.4{b (0 4)} -.4{b (4 4) v} | :4 -.4{b (4 4) v sl} x.4 :2 r');
        const imported = await importScore(new Gp7Exporter().export(input));
        expect(imported.practiceReady).toBe(true);
        const notes = [...imported.musicXml.matchAll(/<note>(.*?)<\/note>/g)].map(m => m[1]);
        expect(notes[2]).toContain('<notehead parentheses="yes">normal</notehead>');
        expect(notes[2]).toContain('<tie type="stop"/>');
        expect(notes[2]).toContain('<pre-bend/>');
        expect(notes[2]).toContain('<slide type="start" number="3"/><slur type="start" number="3"/>');
        expect(notes[3]).toContain('<slide type="stop" number="3"/><slur type="stop" number="3"/>');
        expect(notes[3]).toContain('<notehead>x</notehead>');
        expect(input.tracks[0].staves[0].bars[1].voices[0].beats[0].notes[0].isGhost).toBe(false);
    });
    it('keeps shift slides unslurred and newly attacked pre-bends unparenthesized', async () => {
        const imported = await convert('. :4 7.4{b (4 4)} 7.4{b (4 4)} 5.4{ss} 3.4');
        expect(imported.musicXml).not.toContain('<slur');
        expect(imported.musicXml).not.toContain('parentheses');
        expect(imported.musicXml.match(/<slide /g)?.length).toBe(2);
    });
    it('joins contiguous vibrato beats, deduplicates chords and ends before the next attack', async () => {
        const imported = await convert('. :4 5.4{v} 7.4{vw} (5.4{v} 7.3{v}) 5.4');
        // Three vibrating beats form one span ending at the final plain control.
        expect(imported.practiceReady).toBe(true);
        expect(imported.musicXml.match(/<ornaments>/g)?.length).toBe(2);
        expect(imported.musicXml.match(/<wavy-line type="start"\/>/g)?.length).toBe(1);
        expect(imported.musicXml.match(/<wavy-line type="stop"\/>/g)?.length).toBe(1);
        expect(imported.musicXml).not.toContain('trill-mark');
        expect(imported.diagnostics.some(d => d.code === 'note-performance')).toBe(true);
    });
});
