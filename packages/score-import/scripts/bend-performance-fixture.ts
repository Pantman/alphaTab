// SPDX-License-Identifier: MPL-2.0
// Original independent study; no third-party score material.
import { writeFile } from 'node:fs/promises';
import { AlphaTexImporter } from '@coderline/alphatab/importer/AlphaTexImporter';
import { Gp7Exporter } from '@coderline/alphatab/exporter/Gp7Exporter';
import { BendPoint } from '@coderline/alphatab/model/BendPoint';
import { Settings } from '@coderline/alphatab/Settings';
const path = process.argv[2]; if (!path) throw new Error('Supply an output GP path');
const parser = new AlphaTexImporter();
parser.initFromString(String.raw`\title "Authored bend timing study" \tempo 100 . :4 5.4{b (0 4)} 7.3{b (0 4)} 9.2{b (0 4)} 12.1{b (4 4)}`, new Settings());
const score = parser.readScore();
const points = [ [[0,0],[12,3],[30,3],[60,4]], [[0,0],[30,1],[48,1],[60,4]],
    [[0,0],[15,4],[45,4],[60,4]], [[0,4],[30,0],[30,0],[60,4]] ];
score.tracks[0].staves[0].bars[0].voices[0].beats.forEach((beat,i) => {
    beat.notes[0].bendPoints = points[i].map(p=>new BendPoint(p[0],p[1]));
});
await writeFile(path, new Gp7Exporter().export(score));
