// SPDX-License-Identifier: MPL-2.0
// Original synthetic study; no third-party tablature.
import { writeFile } from 'node:fs/promises';
import { AlphaTexImporter } from '@coderline/alphatab/importer/AlphaTexImporter';
import { Gp7Exporter } from '@coderline/alphatab/exporter/Gp7Exporter';
import { Automation } from '@coderline/alphatab/model/Automation';
import { Settings } from '@coderline/alphatab/Settings';
const output = process.argv[2];
if (!output) throw new Error('Usage: tsx scripts/tempo-ramp-fixture.ts PATH');
const parser = new AlphaTexImporter();
parser.initFromString(String.raw`\title "Progressive tempo study" \tempo 128
. \track "Guitar" \instrument 27
:4 0.6 1.6 2.6 3.6 | 4.6 3.6 2.6 1.6 | 0.6 1.6 2.6 3.6 | 4.6 3.6 2.6 1.6 | :1 0.6
\track "Keys" \instrument 0 \staff {score}
:1 C4 | D4 | E4 | F4 | G4`, new Settings());
const score = parser.readScore();
const tempo = (bpm: number, linear = false, ratio = 0) => Automation.buildTempoAutomation(linear, ratio, bpm, 2);
score.masterBars.forEach(b => { b.tempoAutomations = []; });
score.masterBars[0].tempoAutomations = [tempo(128)];
score.masterBars[1].tempoAutomations = [tempo(128, true)];
score.masterBars[2].tempoAutomations = [tempo(96)];
score.masterBars[3].tempoAutomations = [tempo(96, true, 0.5)];
score.masterBars[4].tempoAutomations = [tempo(144, false, 0.5)];
await writeFile(output, new Gp7Exporter().export(score));
