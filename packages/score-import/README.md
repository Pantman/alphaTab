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
repeats, meter-aware beam groups/secondary hooks/source beam overrides, percussion identity, raw effect chains, XML escaping, deterministic
output, archive expansion guards, checksums and both GP ZIP descriptor orders.
Generate an original application fixture with `npx tsx scripts/fixture.ts PATH`.

A private 14-file modern GP corpus currently produces 14 schema-valid MusicXML
outputs. Twelve match source-model note pitch/onset/duration/voice/tie/fingering
through MusicMaster's independent timeline parser, excluding diagnosed unresolved
pitches. The original strict baseline had four scores without blocking diagnostics. Remaining blocking cases include fractional starting pitches, invalid frets and
overfull measures. Unidentified percussion is retained with a warning and no
MIDI mapping; callers must exclude such entries from playback/practice targets.
This is a regression baseline, not an import accuracy benchmark or independent
validation of alphaTab's source interpretation. Third-party scores/outputs are
kept outside Git.

Before-beat grace notes and bend segments need further renderer/playback QA.
On-beat grace notes, navigation, swing and measure-repeat shorthand block practice.
Articulations such as palm mute/let ring, pedals and whammy are diagnosed but
not reproduced in audio. Enharmonic spelling and engraving are normalized.

The unminified import bundle is approximately 416 KB. `ImportSettings` implements
alphaTab's full Settings type while constructing only notation/importer settings;
access to renderer/player subsystems fails explicitly. A build graph guard rejects
renderer, synth and platform code except three audited shared enum/constant files.
No upstream source changes or unchecked partial Settings casts are needed.
Load it in an isolated worker on demand; byte limits alone cannot impose a CPU
deadline on synchronous parsing, so the application must impose a worker deadline.

MusicXML includes explicit beam groups per voice and measure. Source custom groups
and beam breaks/joins take priority; meter supplies defaults. Rests/gaps and
grace boundaries split groups. Beams do not change note timing.

Beat annotations and lyrics are escaped and preserved with source voice/staff
scope. P.M./let-ring instructions use words plus standard MusicXML dashes, split
at measure boundaries, rests, gaps and changes of affected strings. Partial
chords name affected strings. These visual instructions do not apply audio DSP;
renderers that ignore direction dashes need their own drawing support.

Since 0.1.5, unresolved percussion alone no longer blocks practice admission.
Its explicit unmapped instrument reference and generic G5 display position
preserve the source rhythm without assigning a drum sound. The consumer must
filter these entries from playback and scoring requirements; valid drum hits
and other notes in mixed chords remain intact. Original bytes remain with the
consumer for recovery and later converter improvements.

Since 0.1.6, percussion notehead shapes come from the resolved source articulation,
including its half/whole-duration variants. MusicXML carries X, circle-X, diamond,
triangle, normal and supported slashed heads, explicit hollow/filled appearance
and ghost parentheses. Unsupported symbols emit `percussion-notehead` warnings
and use normal heads. Shape and staff position never determine MIDI identity;
unidentified entries retain their generic silent placeholder. Additional
technique glyphs and exact SMuFL stylistic variants are not reproduced.

Version 0.1.7 also maps heavy/ornate X source heads (including China/crash
cymbals) to MusicXML X semantics. Exact glyph weight and hat styling remain
renderer-dependent; these entries must not fall back to round heads.

Since 0.1.8, a fractional starting pitch from a resolved guitar bend is retained
with a `fractional-bend-start` warning. The MusicXML pitch remains exact and its
pre-bend records the offset from an integer fret-pitch anchor, including inherited
holds. Consumers must preserve that offset for playback; an integer MIDI key
alone is insufficient. Practice may use the fret-pitch anchor, but must not claim
to assess bend intonation. Other fractional pitches remain blocking errors.
Generate the original study with `npx tsx scripts/fractional-bend-fixture.ts PATH`.
