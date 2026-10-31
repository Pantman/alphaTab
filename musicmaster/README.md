# MusicMaster import extension

This fork preserves alphaTab's repository layout and history. MusicMaster-owned
planning and integration material lives here; runtime conversion code will live
in an additive workspace package, `packages/musicmaster-import`, once the first
import slice is implemented. No converter is implemented by this setup commit.

## Boundary

Guitar Pro bytes -> alphaTab score model + original-format metadata ->
MusicXML + MusicMaster metadata + explicit conversion diagnostics.

OSMD remains MusicMaster's renderer. The importer must not initialize alphaTab's
UI, renderer, workers, player, or audio engine. Parsing may use shared model code;
we will measure bundle dependencies before claiming a standalone import bundle.

Start with modern `.gp` archives, followed by `.gpx` and GP3-5. Other formats are
added only with a behavior contract and fidelity fixtures. Prefer existing
alphaTab readers over copied or rewritten parsers.

See [the import contract](IMPORT_CONTRACT.md) and [upstream baseline](upstream.json).

## Keeping the fork maintainable

- `upstream` is CoderLine/alphaTab; `origin` is Pantman/alphaTab.
- Keep upstream `develop` as the baseline; work on `codex/musicmaster-import`.
- Put our additions in separate files/packages. Make necessary upstream fixes
  as separate commits, with regression tests, so they can be offered upstream.
- Avoid renaming upstream packages, formatting unrelated files, or rewriting
  repository-wide build configuration to suit MusicMaster.
- Record each deliberately adopted upstream revision in `upstream.json`.
- Integrate upstream by merge, preserving history:

```sh
git fetch upstream
git switch codex/musicmaster-import
git merge upstream/develop
```

After a merge, run importer regressions, our conversion fidelity tests, package
build/typecheck, and MusicMaster's import/render/timeline checks before updating
the app's pinned package revision. Do not use a floating Git branch in releases.

## Implementation slices

1. Add an import-only workspace entry and a modern GP fixture that parses without
   a DOM, UI, renderer, or audio initialization. Capture version and provenance.
2. Preserve GPIF sound definitions, ordered RSE effect chains, channel strips,
   parameter arrays and automation alongside the parsed model.
3. Write MusicXML for basic notes/rests, tracks, voices, tuning and timing. Reject
   unsupported musical constructs until supported or explicitly diagnosed.
4. Add techniques, repeats, tempo changes and percussion, comparing semantic
   results with source fixtures and an independent converter.
5. Integrate the pinned package into MusicMaster's transactional file loading,
   persistence, part projection, score sharing and native file pickers.
6. Add legacy readers and proven sound mappings incrementally.

## Licensing and upstream contributions

Retain the upstream MPL-2.0 license and all applicable third-party notices. Treat
our import extension as MPL-2.0 too, avoiding ambiguity when adapting upstream
code. Release source corresponding to each distributed importer build and link
it from MusicMaster's open-source notices. Soundbank assets and score fixtures
need their own rights review; a code license does not license song content.

Future submissions to CoderLine/alphaTab must follow [AGENTS.md](../AGENTS.md)
and [CONTRIBUTING.md](../CONTRIBUTING.md), including maintainer acceptance of an
issue before a nontrivial PR and the required AI-authorship disclosure. No issue
or PR is being submitted as part of this setup.
