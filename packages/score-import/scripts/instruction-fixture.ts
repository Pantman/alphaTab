// SPDX-License-Identifier: MPL-2.0
// Original instructions, rhythm and lyrics, with no third-party score content.
import { writeFile } from 'node:fs/promises';
import { AlphaTexImporter } from '@coderline/alphatab/importer/AlphaTexImporter';
import { Gp7Exporter } from '@coderline/alphatab/exporter/Gp7Exporter';
import { Settings } from '@coderline/alphatab/Settings';
const output = process.argv[2];
if (!output) throw new Error('Usage: tsx scripts/instruction-fixture.ts OUTPUT.gp');
const parser = new AlphaTexImporter();
parser.initFromString(String.raw`\title "Technique notation fixture" \tempo 157 .
\section "Intro" :4 0.6{pm txt "Verse 1"} 2.6{pm} 3.6 0.5{lr txt "Let it ring"} |
:4 2.5{lr} r (0.6 2.5) 3.6{txt "Play <softly> & clean"} |
:4 0.6{pm} 2.6{pm} 3.6{pm} 0.5{pm}`, new Settings());
const score = parser.readScore();
const bars = score.tracks[0].staves[0].bars;
bars[1].voices[0].beats[2].notes[0].isPalmMute = true;
bars[1].voices[0].beats[3].lyrics = ['Words & music'];
await writeFile(output, new Gp7Exporter().export(score));
