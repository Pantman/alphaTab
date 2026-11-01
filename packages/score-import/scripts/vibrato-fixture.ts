// SPDX-License-Identifier: MPL-2.0
// Original independent study; no third-party score material.
import { writeFile } from 'node:fs/promises';
import { AlphaTexImporter } from '@coderline/alphatab/importer/AlphaTexImporter';
import { Gp7Exporter } from '@coderline/alphatab/exporter/Gp7Exporter';
import { Settings } from '@coderline/alphatab/Settings';
import { VibratoType } from '@coderline/alphatab/model/VibratoType';
const path=process.argv[2]; if(!path) throw new Error('Supply an output GP path');
const parser=new AlphaTexImporter();
parser.initFromString(String.raw`\title "Vibrato playback study" \tempo 100 .
:1 5.4{v} | :1 7.3{vw} |
:2 7.4{b (0 4)} -.4{b (4 4) v} | :1 -.4{b (4 4) v} |
:1 (5.4{v} 7.3{v}) | :1 (5.4{v} 7.3) |
:1 (5.4 7.3) | :2 5.4{v} r`,new Settings());
const score=parser.readScore();score.tracks[0].staves[0].bars[6].voices[0].beats[0].vibrato=VibratoType.Wide;
await writeFile(path,new Gp7Exporter().export(score));
