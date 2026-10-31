# Import behavior contract (proposed v1)

The importer is a deterministic byte-to-data operation. It does not render,
play audio, fetch remote resources or mutate MusicMaster application state.

## Successful result

- MusicXML score-partwise text, consumed by MusicMaster's existing pipeline.
- Versioned metadata containing source format/version, source hash, importer
  revision and a mapping from original track IDs to MusicXML part IDs. Names
  and current selection order are not identities. One source track may map to
  multiple output parts/staves; preserve that relationship explicitly.
- Source sound definitions, patch identifiers, ordered effect IDs, parameter
  arrays, mixer values and automation where present. Preserve original units,
  indexes, version tags and source locations before any normalization.
- Structured diagnostics distinguishing unsupported musical data, preserved
  but unapplied sound settings, and deliberately approximated mappings.

Preserve source bytes in MusicMaster's score package so later extraction can
recover fields not understood by this importer version. Do not embed opaque
JSON in arbitrary MusicXML nodes and assume OSMD will preserve it.

## Sound interpretation

Metadata applies to all instruments, including guitar, bass, drums and keys.
Only verified mappings affect playback. Unknown parameter arrays remain opaque;
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

This is a setup contract, not a claim of working conversion. The initial
implementation will establish the concrete TypeScript API and fixture suite.
