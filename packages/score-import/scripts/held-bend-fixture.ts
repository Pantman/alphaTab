// SPDX-License-Identifier: MPL-2.0
// Original independent study, not copied from a song.
import { writeFile } from 'node:fs/promises';
import { AlphaTexImporter } from '@coderline/alphatab/importer/AlphaTexImporter';
import { Gp7Exporter } from '@coderline/alphatab/exporter/Gp7Exporter';
import { Settings } from '@coderline/alphatab/Settings';
const output = process.argv[2];
if (!output) throw new Error('Usage: tsx scripts/held-bend-fixture.ts PATH');
const parser = new AlphaTexImporter();
parser.initFromString(String.raw`\title "Held bend and vibrato study" \tempo 100
. :2 7.4{b (0 4)} -.4{b (4 4) v} |
:1 -.4{b (4 4) v} |
:4 -.4{b (4 4) v sl} x.4 :2 r |
:4 7.4{b (4 4)} 7.4{b (4 4)} 5.4{ss} 3.4 |
:1 (5.4{v} 7.3{v})`, new Settings());
await writeFile(output, new Gp7Exporter().export(parser.readScore()));
