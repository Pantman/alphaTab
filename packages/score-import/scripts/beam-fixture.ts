// SPDX-License-Identifier: MPL-2.0
// Original rhythm fixture for application-level worker + OSMD checks.
import { writeFile } from 'node:fs/promises';
import { AlphaTexImporter } from '@coderline/alphatab/importer/AlphaTexImporter';
import { Gp7Exporter } from '@coderline/alphatab/exporter/Gp7Exporter';
import { Settings } from '@coderline/alphatab/Settings';
const path = process.argv[2];
if (!path) throw new Error('Usage: npx tsx scripts/beam-fixture.ts OUTPUT.gp');
const parser = new AlphaTexImporter();
parser.initFromString('\\title "Beam grouping fixture" . :8 0.6*8 | \\ts 6 8 :8 0.6*6 | \\ts 2 4 :16 0.6 2.6 :8 3.6 0.5{d} :16 2.5', new Settings());
await writeFile(path, new Gp7Exporter().export(parser.readScore()));
