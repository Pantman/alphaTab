// SPDX-License-Identifier: MPL-2.0
import { describe, it, expect } from 'vitest';
import { Gp7Exporter } from '@coderline/alphatab/exporter/Gp7Exporter';
import { AlphaTexImporter } from '@coderline/alphatab/importer/AlphaTexImporter';
import { MusicXmlImporter } from '@coderline/alphatab/importer/MusicXmlImporter';
import { Settings } from '@coderline/alphatab/Settings';
import { ByteBuffer } from '@coderline/alphatab/io/ByteBuffer';
import { XmlDocument } from '@coderline/alphatab/xml/XmlDocument';
import { XmlNode, XmlNodeType } from '@coderline/alphatab/xml/XmlNode';
import { ZipWriter } from '@coderline/alphatab/zip/ZipWriter';
import { ZipEntry } from '@coderline/alphatab/zip/ZipEntry';
import { ZipReader } from '@coderline/alphatab/zip/ZipReader';
import { importScore, ScoreImportError } from '../src/index';
import { readGpif, importLimits } from '../src/archive';
import { GpifParser } from '@coderline/alphatab/importer/GpifParser';
import { Logger } from '@coderline/alphatab/Logger';
import { ImportSettings } from '../src/settings';
import { LogLevel } from '@coderline/alphatab/LogLevel';

function makeGp(tex = '\\title "Import fixture" \\tempo 96 . :4 0.6 2.6 3.6 0.5 | 0.6.4') {
    const parser = new AlphaTexImporter();
    parser.initFromString(tex, new Settings());
    return new Gp7Exporter().export(parser.readScore());
}

function rewriteGp(bytes: Uint8Array, transform: (xml: string) => string): Uint8Array {
    const entries = new ZipReader(ByteBuffer.fromBuffer(bytes), importLimits.entryBytes).read();
    const out = ByteBuffer.withCapacity(1024);
    const writer = new ZipWriter(out);
    for (const entry of entries) writer.writeEntry(entry.fullName === 'Content/score.gpif'
        ? new ZipEntry(entry.fullName, new TextEncoder().encode(transform(new TextDecoder().decode(entry.data)))) : entry);
    writer.end();
    return out.toArray();
}

/** Original generated fixture, rewritten to the two descriptor conventions seen in GP archives. */
function streamedZip(bytes: Uint8Array, reverse: boolean): Uint8Array {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = bytes.length - 22, count = view.getUint16(end + 10, true);
    const local: Uint8Array[] = [], central: Uint8Array[] = [];
    let cursor = view.getUint32(end + 16, true), offset = 0;
    for (let i = 0; i < count; i++) {
        const csize = view.getUint32(cursor + 20, true), usize = view.getUint32(cursor + 24, true);
        const oldOffset = view.getUint32(cursor + 42, true);
        const length = 46 + view.getUint16(cursor + 28, true) + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
        const header = bytes.slice(cursor, cursor + length); const h = new DataView(header.buffer);
        h.setUint16(8, h.getUint16(8, true) | 8, true); h.setUint32(42, offset, true);
        const entryLength = 30 + view.getUint16(oldOffset + 26, true) + view.getUint16(oldOffset + 28, true) + csize;
        const entry = bytes.slice(oldOffset, oldOffset + entryLength); const e = new DataView(entry.buffer);
        e.setUint16(6, e.getUint16(6, true) | 8, true);
        const descriptor = new Uint8Array(16); const d = new DataView(descriptor.buffer);
        d.setUint32(0, 0x08074b50, true); d.setUint32(4, h.getUint32(16, true), true);
        d.setUint32(8, reverse ? usize : csize, true); d.setUint32(12, reverse ? csize : usize, true);
        local.push(entry, descriptor); central.push(header); offset += entry.length + descriptor.length; cursor += length;
    }
    const directorySize = central.reduce((sum, b) => sum + b.length, 0);
    const footer = bytes.slice(end); const f = new DataView(footer.buffer);
    f.setUint32(12, directorySize, true); f.setUint32(16, offset, true);
    const out = new Uint8Array(offset + directorySize + footer.length); let p = 0;
    for (const chunk of [...local, ...central, footer]) { out.set(chunk, p); p += chunk.length; }
    return out;
}

function readOutput(xml: string) {
    const parser = new MusicXmlImporter();
    parser.init(ByteBuffer.fromBuffer(new TextEncoder().encode(xml)), new Settings());
    return parser.readScore();
}

describe('score-import', () => {
    it('fails explicitly if a reader crosses the audited headless settings boundary', () => {
        const settings = new ImportSettings();
        expect(() => settings.player).toThrow(/unexpectedly requires player/);
        expect(() => settings.display).toThrow(/unexpectedly requires display/);
    });
    it('converts a generated guitar fixture headlessly and preserves sounding pitch, duration and fingering', async () => {
        expect(typeof document).toBe('undefined');
        const bytes = makeGp();
        const result = await importScore(bytes);
        expect(result.practiceReady).toBe(true);
        expect(result.provenance.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(result.musicXml).toContain('<string>6</string><fret>0</fret>');
        const parser = new MusicXmlImporter();
        parser.init(ByteBuffer.fromBuffer(new TextEncoder().encode(result.musicXml)), new Settings());
        const score = parser.readScore();
        expect(score.tempo).toBe(96);
        const beats = score.tracks[0].staves[0].bars[0].voices[0].beats;
        expect(beats.map(b => b.notes[0].realValue)).toEqual([40, 42, 43, 45]);
        expect(beats.map(b => b.displayDuration)).toEqual([960, 960, 960, 960]);
        expect(result.metadata.tracks[0].partId).toBe('P1');
    });

    it('preserves every source sound/effect parameter, order, identifiers, mix and automation', async () => {
        const input = rewriteGp(makeGp(), xml => {
            const doc = new XmlDocument(); doc.parse(xml);
            const track = doc.firstElement!.findChildElement('Tracks')!.firstElement!;
            const rse = new XmlNode(XmlNodeType.Element, 'RSE');
            const chain = new XmlNode(XmlNodeType.Element, 'EffectChain');
            for (const id of ['AmpFixture', 'ReverbFixture']) {
                const effect = new XmlNode(XmlNodeType.Element, 'Effect'); effect.attributes.set('id', id);
                const parameters = new XmlNode(XmlNodeType.Element, 'Parameters'); parameters.innerText = '0.1 0.2 0.3';
                effect.addChild(parameters); chain.addChild(effect);
            }
            rse.addChild(chain); track.addChild(rse);
            return doc.toFormattedString();
        });
        const result = await importScore(input);
        const source = result.metadata.tracks[0].source;
        expect(JSON.stringify(source)).toContain('0.1 0.2 0.3');
        const effects = source.filter(s => s.name === 'RSE').flatMap(s => s.children)
            .filter(s => s.name === 'EffectChain').flatMap(s => s.children);
        expect(effects.map(e => e.attributes.id)).toEqual(['AmpFixture', 'ReverbFixture']);
        expect(result.diagnostics.some(d => d.code === 'source-audio-unapplied')).toBe(true);
    });

    it('retains authored engine and forced-sound fields without interpreting them', async () => {
        const input = rewriteGp(makeGp(), xml => {
            const doc = new XmlDocument(); doc.parse(xml);
            const track = doc.firstElement!.findChildElement('Tracks')!.firstElement!;
            for (const [name, value] of [['AudioEngineState', 'MIDI'], ['ForcedSound', '-2']]) {
                const field = track.findChildElement(name) ?? new XmlNode(XmlNodeType.Element, name);
                field.innerText = value;
                if (!track.childElements().includes(field)) track.addChild(field);
            }
            return doc.toFormattedString();
        });
        const result = await importScore(input);
        const source = result.metadata.tracks[0].source;
        expect(source.find(s => s.name === 'AudioEngineState')?.text).toBe('MIDI');
        expect(source.find(s => s.name === 'ForcedSound')?.text).toBe('-2');
        expect(result.diagnostics.some(d => d.code === 'source-audio-unapplied')).toBe(true);
    });

    it('is deterministic across repeated imports, independent of alphaTab global note IDs', async () => {
        const bytes = makeGp();
        expect(await importScore(bytes)).toEqual(await importScore(bytes));
    });

    it('escapes text so source titles cannot create XML elements', async () => {
        const input = rewriteGp(makeGp(), xml => {
            const doc = new XmlDocument(); doc.parse(xml);
            doc.firstElement!.findChildElement('Score')!.findChildElement('Title')!.innerText = 'Safe & <script>';
            return doc.toFormattedString();
        });
        const result = await importScore(input);
        expect(result.musicXml).toContain('Safe &amp; &lt;script&gt;');
        expect(result.musicXml).not.toContain('<script>');
    });

    it('rejects truncated archives, fake extensions, duplicate paths and external declarations', async () => {
        const input = makeGp();
        await expect(importScore(input.subarray(0, input.length - 10))).rejects.toBeInstanceOf(ScoreImportError);
        await expect(importScore(new TextEncoder().encode('not a gp file'), { fileName: 'fake.gp' })).rejects.toMatchObject({ code: 'unsupported-format' });
        const out = ByteBuffer.withCapacity(1024); const writer = new ZipWriter(out);
        writer.writeEntry(new ZipEntry('Content/score.gpif', new Uint8Array()));
        writer.writeEntry(new ZipEntry('Content/score.gpif', new Uint8Array())); writer.end();
        expect(() => readGpif(out.toArray())).toThrow(/duplicate/);
        const external = rewriteGp(input, xml => '<!DOCTYPE GPIF SYSTEM "https://example.invalid/evil">' + xml);
        await expect(importScore(external)).rejects.toMatchObject({ code: 'invalid-archive' });
    });

    it('rejects archive expansion bombs before decompression', () => {
        const bytes = makeGp();
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let i = 0; i < bytes.length - 46; i++) {
            if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, importLimits.entryBytes + 1, true); break; }
        }
        expect(() => readGpif(bytes)).toThrow(/oversized/);
    });

    it.each([false, true])('accepts bounded streamed ZIP descriptors (GP reversed sizes: %s)', async reverse => {
        const bytes = makeGp();
        const streamed = streamedZip(bytes, reverse);
        expect(readGpif(streamed)).toBe(readGpif(bytes));
        expect((await importScore(streamed)).musicXml).toBe((await importScore(bytes)).musicXml);
        const v = new DataView(streamed.buffer);
        for (let i = 0; i < streamed.length - 16; i++) if (v.getUint32(i, true) === 0x08074b50) {
            v.setUint32(i + 4, v.getUint32(i + 4, true) ^ 1, true); break;
        }
        expect(() => readGpif(streamed)).toThrow(/checksum/);
    });

    it('preserves capo sounding pitches, tuplets, simultaneous voices and repeat counts', async () => {
        const input = makeGp('\\capo 2 . \\voice \\ro :8 0.6{tu 3}*3 2.6.2 | \\rc 3 3.6.1 \\voice :1 0.5 | 2.5');
        const result = await importScore(input);
        const source = new GpifParser(); source.parseXml(readGpif(input), new Settings());
        const output = readOutput(result.musicXml);
        expect(result.practiceReady).toBe(true);
        expect(result.musicXml).toContain('<capo>2</capo>');
        expect(result.musicXml).toContain('<words>Capo 2</words>');
        expect(result.musicXml).toContain('<actual-notes>3</actual-notes><normal-notes>2</normal-notes>');
        expect(output.masterBars.map(b => [b.isRepeatStart, b.repeatCount])).toEqual(source.score.masterBars.map(b => [b.isRepeatStart, b.repeatCount]));
        const summary = (score: typeof output) => score.tracks[0].staves[0].bars.map(bar => bar.voices.filter(v => !v.isEmpty).map(v => v.beats.map(b => [b.displayStart, b.displayDuration, b.notes.map(n => n.realValue)])));
        expect(summary(output)).toEqual(summary(source.score));
    });

    it('retains quarter-tone bend continuations with exact starting pitch, tie and pre-bend metadata', async () => {
        const result = await importScore(makeGp('. :4 3.6{b (0 1)} -.6{b (1 0)} 0.6 0.6'));
        expect(result.practiceReady).toBe(true);
        expect(result.diagnostics).toContainEqual(expect.objectContaining({code: 'fractional-bend-start', severity: 'warning'}));
        expect(result.musicXml).toContain('<alter>0.5</alter>');
        expect(result.musicXml).toContain('<bend-alter>0.5</bend-alter><pre-bend/>');
        expect(result.musicXml).toContain('<tie type="stop"/>');
        expect(result.musicXml).toContain('<release/>');
    });

    it('preserves percussion MIDI identity independently of its staff position', async () => {
        const result = await importScore(makeGp('\\instrument "percussion" . :4 30 31 33 34'));
        expect(result.practiceReady).toBe(true);
        expect(result.musicXml).toContain('<unpitched>');
        expect(result.musicXml).not.toContain('<staff-tuning');
        expect(readOutput(result.musicXml).tracks[0].staves[0].bars[0].voices[0].beats.map(b => b.notes[0].realValue)).toEqual([49, 40, 37, 38]);
    });

    it('preserves source cymbal shapes and fill independently of MIDI and ghost parentheses', async () => {
        const input = rewriteGp(makeGp('\\instrument "percussion" . :4 30 31 33 34'), xml => xml
            .replace(/<Noteheads>[^<]+<\/Noteheads>/, '<Noteheads>noteheadDiamondWhite noteheadXHalf noteheadCircleX</Noteheads>'));
        const result = await importScore(input);
        const doc = new XmlDocument(); doc.parse(result.musicXml);
        const notes = doc.firstElement!.findChildElement('part')!.firstElement!.childElements().filter(n => n.localName === 'note');
        expect(notes[0].findChildElement('notehead')!.innerText).toBe('diamond');
        expect(notes[0].findChildElement('notehead')!.getAttribute('filled')).toBe('no');
        expect(readOutput(result.musicXml).tracks[0].staves[0].bars[0].voices[0].beats.map(b => b.notes[0].realValue)).toEqual([49, 40, 37, 38]);
        const crash = await importScore(makeGp('\\instrument "percussion" . :4 30{g} 30 :2 30'));
        expect(crash.musicXml).toMatch(/<notehead[^>]*parentheses="yes"[^>]*>x<\/notehead>/);
        expect(crash.musicXml.match(/>x<\/notehead>/g)).toHaveLength(3);
        const varied = await importScore(rewriteGp(makeGp('\\instrument "percussion" . :4 30 30{g} :2 30 | :1 30'), xml => xml
            .replace(/<Noteheads>[^<]+<\/Noteheads>/, '<Noteheads>noteheadDiamondWhite noteheadXHalf noteheadCircleX</Noteheads>')));
        const variedDoc = new XmlDocument(); variedDoc.parse(varied.musicXml);
        const heads = variedDoc.firstElement!.findChildElement('part')!.childElements()
            .flatMap(m => m.childElements().filter(n => n.localName === 'note').map(n => n.findChildElement('notehead')!));
        expect(heads.map(h => h.innerText)).toEqual(['diamond', 'diamond', 'x', 'circle-x']);
        expect(heads[1].getAttribute('parentheses')).toBe('yes');
        expect(varied.diagnostics.some(d => d.code === 'percussion-notehead')).toBe(false);
        const heavy = await importScore(rewriteGp(makeGp('\\instrument "percussion" . :4 30 :2 30'), xml => xml
            .replace(/<Noteheads>[^<]+<\/Noteheads>/, '<Noteheads>noteheadHeavyX noteheadHeavyXHat noteheadXOrnate</Noteheads>')));
        expect(heavy.musicXml.match(/>x<\/notehead>/g)).toHaveLength(2);
        expect(heavy.diagnostics.some(d => d.code === 'percussion-notehead')).toBe(false);
    });

    it('retains silent unknown percussion while still blocking invalid frets', async () => {
        const percussion = rewriteGp(makeGp('\\instrument "percussion" . 30'), xml => xml.replace(/<InstrumentArticulation>\d+<\/InstrumentArticulation>/g, '<InstrumentArticulation>-1</InstrumentArticulation>'));
        const drumResult = await importScore(percussion);
        expect(drumResult.practiceReady).toBe(true);
        expect(drumResult.diagnostics).toContainEqual(expect.objectContaining({ code: 'unresolved-percussion', severity: 'warning' }));
        expect(drumResult.musicXml).not.toContain('<midi-unpitched>');
        expect(drumResult.musicXml).toContain('<unpitched><display-step>G</display-step><display-octave>5</display-octave></unpitched>');
        expect(drumResult.musicXml).toContain('<instrument id="P1-UnknownPercussion"/>');
        const fret = await importScore(rewriteGp(makeGp(), xml => {
            const doc = new XmlDocument(); doc.parse(xml);
            doc.firstElement!.findChildElement('Notes')!.firstElement!.findChildElement('Properties')!
                .childElements().find(p => p.getAttribute('name') === 'Fret')!.findChildElement('Fret')!.innerText = '-2';
            return doc.toFormattedString();
        }));
        expect(fret.practiceReady).toBe(false);
        expect(fret.diagnostics).toContainEqual(expect.objectContaining({ code: 'invalid-fingering' }));
        expect(fret.musicXml).not.toContain('<fret>-2</fret>');
    });

    it('keeps known drum hits, chords and timing beside unidentified entries without a MIDI fallback', async () => {
        const original = makeGp('\\instrument "percussion" . :4 (30 31) 33 34 30');
        const bytes = rewriteGp(original, xml => {
            const doc = new XmlDocument(); doc.parse(xml);
            doc.firstElement!.findChildElement('Notes')!.firstElement!.findChildElement('InstrumentArticulation')!.innerText = '-1';
            return doc.toFormattedString();
        });
        const result = await importScore(bytes);
        expect(result.practiceReady).toBe(true);
        expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
        const doc = new XmlDocument(); doc.parse(result.musicXml);
        const list = doc.firstElement!.findChildElement('part-list')!.firstElement!;
        const mappings = list.childElements().filter(n => n.localName === 'midi-instrument');
        expect(mappings.some(n => n.getAttribute('id') === 'P1-UnknownPercussion')).toBe(false);
        expect(mappings.map(n => n.findChildElement('midi-unpitched')!.innerText).sort()).toEqual(['38','39','41','50']);
        const notes = doc.firstElement!.findChildElement('part')!.firstElement!.childElements().filter(n => n.localName === 'note');
        expect(notes).toHaveLength(5);
        expect(notes.map(n => n.findChildElement('duration')!.innerText)).toEqual(['960','960','960','960','960']);
        expect(notes[1].findChildElement('chord')).toBeDefined();
        expect(notes[0].findChildElement('instrument')!.getAttribute('id')).toBe('P1-UnknownPercussion');
        expect(notes[1].findChildElement('instrument')!.getAttribute('id')).toBe('P1-D40');
    });

    it('restores host logging even when parsing fails', async () => {
        const logger = Logger.log, level = Logger.logLevel;
        Logger.logLevel = LogLevel.None;
        try {
            await expect(importScore(rewriteGp(makeGp(), () => '<GPIF/>'))).rejects.toBeInstanceOf(ScoreImportError);
            expect(Logger.log).toBe(logger);
            expect(Logger.logLevel).toBe(LogLevel.None);
        } finally { Logger.logLevel = level; }
    });
});
