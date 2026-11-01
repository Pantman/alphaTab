// SPDX-License-Identifier: MPL-2.0
// Original synthetic study; no third-party tablature.
import { writeFile } from 'node:fs/promises';
import { AlphaTexImporter } from '@coderline/alphatab/importer/AlphaTexImporter';
import { Gp7Exporter } from '@coderline/alphatab/exporter/Gp7Exporter';
import { Settings } from '@coderline/alphatab/Settings';
const output = process.argv[2];
if (!output) throw new Error('Usage: tsx scripts/fractional-bend-fixture.ts PATH');
const parser = new AlphaTexImporter();
parser.initFromString(String.raw`\title "Fractional bend study" \tempo 120
. \track "Guitar" \instrument 27
:4 3.6{b (0 1)} -.6{b (1 0)} 0.6 0.6 |
:4 3.6{b (1 0)} 3.6{b (3 0)} 0.6 0.6 |
:4 3.6{b (1 1)} -.6 0.6 0.6 |
\track "Keys" \instrument 0 \staff {score}
:1 C4 | C4 | C4`, new Settings());
await writeFile(output, new Gp7Exporter().export(parser.readScore()));
