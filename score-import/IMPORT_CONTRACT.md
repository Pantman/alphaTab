# Import behavior contract (v1 prototype)

The importer is a deterministic byte-to-data operation. It does not render,
play audio, fetch remote resources or mutate application state.

## Successful result

- MusicXML score-partwise text, consumed by existing MusicXML pipelines.
- Versioned metadata containing source format/version, source hash, importer
  revision and a mapping from original track IDs to MusicXML part IDs. Names
  and current selection order are not identities. One source track may map to
  multiple output parts/staves; preserve that relationship explicitly.
- Source sound definitions, patch identifiers, ordered effect IDs, parameter
  arrays, mixer values and automation where present. Preserve original units,
  indexes, version tags and source locations before any normalization.
- Structured diagnostics distinguishing unsupported musical data, preserved
  but unapplied sound settings, and deliberately approximated mappings.

The consuming application retains original source bytes so later extraction can
recover fields not understood by this importer version. Do not embed opaque
JSON in arbitrary MusicXML nodes and assume renderers will preserve it.

## Sound interpretation

Metadata applies to all instruments, including guitar, bass, drums and keys.
Playback mappings belong to the consuming application, not this importer.
Unknown parameter arrays remain opaque;
an amp's normalized control value must not be assigned directly to a different
DSP model simply because its range is similar. Preserve all sound definitions
and timed sound changes, not just the first/default sound on a track.

Keep imported defaults, user overrides and effective playback settings distinct.
Loading or restoring a score must not overwrite a user's deliberate tone choice.
Derived scores, selected-part projections and shared score packages must retain
metadata using the stable source-to-part mapping.

## Failure and fidelity

Invalid, truncated or resource-exhausting input must produce a bounded failure.
Define archive expansion/entry-count and parser resource limits before accepting
untrusted user files. Do not resolve external XML entities or archive paths.

Unsupported duration, voice, repeat, tie, pitch or technique semantics must not
silently become plausible but incorrect practice targets. Initial support is
explicitly limited; advertise only formats and features verified by fixtures.

Verification compares pitches, onset/duration, voice assignment, strings/frets,
tuning/capo, bends, grace notes, ties, tuplets, repeat order, tempo maps and
percussion identity. Test audio metadata separately from notation. Snapshot
XML and readable rendering alone do not demonstrate musical equivalence.

## Current status

`packages/score-import` implements the modern `.gp` slice. Its TypeScript API,
synthetic fixtures, archive guards and documented limitations are experimental.
`practiceReady` means no known blocking conversion diagnostic; it does not certify
the original score or establish complete playback/engraving fidelity.
GP3/4/5 and GPX are not yet accepted by this package.

## Beam engraving

Export explicit MusicXML beam groups per voice and measure, without changing
pitch or timing. Honor source beam breaks/joins and custom meter groups. Otherwise
use meter-based groups (quarter beats in simple meter, dotted beats in compound
meter). Keep full tuplets together; break at rests, gaps and grace/main boundaries.
Emit secondary beams and hooks for mixed durations, once per chord. Grace groups
remain separate. Beams are engraving, not playback or practice semantics.

## Performance instructions and text

Preserve beat text as escaped, voice/staff-scoped MusicXML words at its source
onset. Export P.M. and let-ring instructions with standard words/dashes, grouped
over contiguous marked beats, bounded by measure, voice, rests and timing gaps.
Repeat labels at measure boundaries so renderers can reserve their layout rows
and display continuations after reflow. Partial-chord instructions name the
affected strings rather than implying the entire chord. Single notes retain an
instruction; before-beat grace instructions do not extend into main-note spans.
Lyrics are emitted once per chord with verse numbers and escaped text. These
notation additions do not change pitch, duration, practice targets or audio DSP.

## Unidentified percussion

An unpitched percussion entry without a resolved MIDI identity remains in
MusicXML at its original onset/duration, with an explicit score-instrument ID
that has no midi-instrument mapping. Emit `unresolved-percussion` as a warning;
the generic G5/top-line notehead is a visual placeholder, never an inferred drum.
Consumers must omit these entries from playback and scoring targets while
retaining their rhythm/notation and valid hits in the same part or chord.
User comparison found Ultimate Guitar and MuseScore display these entries;
the user reports MuseScore produces no sound. No default drum mapping is assumed.

Since 0.1.6, percussion notehead shapes come from the resolved source articulation,
including its half/whole-duration variants. MusicXML carries X, circle-X, diamond,
triangle, normal and supported slashed heads, explicit hollow/filled appearance
and ghost parentheses. Unsupported symbols emit `percussion-notehead` warnings
and use normal heads. Shape and staff position never determine MIDI identity;
unidentified entries retain their generic silent placeholder. Additional
technique glyphs and exact SMuFL stylistic variants are not reproduced.
