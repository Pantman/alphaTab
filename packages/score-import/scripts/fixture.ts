// SPDX-License-Identifier: MPL-2.0
// An original synthetic score. No third-party tablature is copied into this fixture.
import { writeFile } from 'node:fs/promises';
import { AlphaTexImporter } from '@coderline/alphatab/importer/AlphaTexImporter';
import { Gp7Exporter } from '@coderline/alphatab/exporter/Gp7Exporter';
import { Settings } from '@coderline/alphatab/Settings';
const output = process.argv[2];
if (!output) throw new Error('Usage: tsx scripts/fixture.ts /path/import-basics.gp');
const tex = String.raw`\title "Score import verification"
\artist "MusicMaster synthetic fixture"
\tempo 96
.
\track "Guitar" \instrument 25 \capo 2
\ro :4 0.6 2.6 3.6 0.5 | \rc 2 :1 0.6
\track "Bass" \instrument 33 \tuning (G2 D2 A1 E1)
:4 0.4 2.4 3.4 0.3 | :1 0.4
\track "Keys" \instrument 0 \staff {score} \clef G2
:1 C4 | D4
\track "Drums" \instrument "percussion"
:4 30 31 33 34 | :1 34`;
const parser = new AlphaTexImporter(); parser.initFromString(tex, new Settings());
await writeFile(output, new Gp7Exporter().export(parser.readScore()));
console.log(`Wrote original synthetic GP fixture to ${output}`);
