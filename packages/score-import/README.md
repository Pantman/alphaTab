# score-import (experimental)

Headless modern Guitar Pro `.gp` -> MusicXML + structured source metadata.
This is an additive alphaTab workspace package; upstream readers stay intact.

```ts
import { importScore } from '@pantman/score-import';
const result = await importScore(new Uint8Array(await file.arrayBuffer()));
// result.musicXml, result.metadata, result.diagnostics, result.provenance
// Only admit result.practiceReady === true into a practice/scoring pipeline.
```

The v0.1 prototype accepts ZIP-based Guitar Pro 7/8, not GP3/4/5 or GPX yet.
It preserves raw sound/effect XML data with source track IDs and output part IDs.
It never applies proprietary DSP parameters to a different synthesizer.
MusicXML uses sounding pitches and tablature for stringed staves; source
engraving is normalized. Some performance techniques have warnings, while
unconverted navigation, swing, measure repeats or unsafe timing produce errors
and practiceReady=false. A successfully parsed result is not proof of fidelity.

Input size, ZIP entry/expanded sizes, archive paths and checksums are validated.
XML external declarations are rejected. The caller retains source bytes.

From the repository root, install relevant workspaces and generate helpers:

```sh
npm ci -w packages/alphatab -w packages/transpiler -w packages/tooling --include-workspace-root
npm run generate-typescript
npm run typecheck -w packages/score-import
npm run test -w packages/score-import
npm run build -w packages/score-import
```

Private corpus conversions (do not put song files or outputs in Git):

```sh
npm run corpus -w packages/score-import -- /private/corpus /private/results
```

MPL-2.0. Retain LICENSE, LICENSE.header, NOTICE and corresponding source notices.
No public package publication or upstream PR is implied by this prototype.

## Validation and limits

The generated fixture tests exercise pitch/duration, capo, voices, tuplets,
repeats, percussion identity, raw effect chains, XML escaping, deterministic
output, archive expansion guards, checksums and both GP ZIP descriptor orders.
Generate an original application fixture with `npx tsx scripts/fixture.ts PATH`.

A private 14-file modern GP corpus currently produces 14 schema-valid MusicXML
outputs. Twelve match source-model note pitch/onset/duration/voice/tie/fingering
through MusicMaster's independent timeline parser, excluding diagnosed unresolved
pitches. Four have no blocking diagnostics. Remaining cases include unknown
percussion IDs, fractional starting pitches, invalid frets and overfull measures.
This is a regression baseline, not an import accuracy benchmark or independent
validation of alphaTab's source interpretation. Third-party scores/outputs are
kept outside Git.

Before-beat grace notes and bend segments need further renderer/playback QA.
On-beat grace notes, navigation, swing and measure-repeat shorthand block practice.
Articulations such as palm mute/let ring, pedals and whammy are diagnosed but
not reproduced in audio. Enharmonic spelling and engraving are normalized.

The unminified bundle is approximately 2.7 MB: alphaTab's `Settings` transitively
includes rendering/environment classes, although this entry does not initialize
them. Load it in an isolated worker on demand; a smaller import context is
future work. The application must impose a worker deadline because byte limits
alone cannot impose a CPU deadline on synchronous source parsing.
