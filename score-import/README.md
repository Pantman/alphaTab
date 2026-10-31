# Score import extension

This fork preserves alphaTab's repository layout and history. Format import and conversion
contracts live here. The experimental implementation is an additive workspace
package, [`packages/score-import`](../packages/score-import/README.md).

## Boundary

Guitar Pro bytes -> alphaTab score model + original-format metadata ->
MusicXML + structured source metadata + explicit conversion diagnostics.

The importer is independent of the consuming application and its renderer.
It must not initialize alphaTab's
UI, renderer, workers, player, or audio engine. Parsing may use shared model code;
we will measure bundle dependencies before claiming a standalone import bundle.

Start with modern `.gp` archives, followed by `.gpx` and GP3-5. Other formats are
added only with a behavior contract and fidelity fixtures. Prefer existing
alphaTab readers over copied or rewritten parsers.

See [the import contract](IMPORT_CONTRACT.md) and [upstream baseline](upstream.json).

The public result is `ImportedScore`: MusicXML, structured metadata, diagnostics
and provenance. The v0.1 prototype accepts modern `.gp` only; other formats
remain future work.

## Keeping the fork maintainable

- `upstream` is CoderLine/alphaTab; `origin` is Pantman/alphaTab.
- Keep upstream `develop` as the baseline; work on `codex/score-import`.
- Put our additions in separate files/packages. Make necessary upstream fixes
  as separate commits, with regression tests, so they can be offered upstream.
- Avoid renaming upstream packages, formatting unrelated files, or rewriting
  repository-wide build configuration to suit a consuming application.
- Record each deliberately adopted upstream revision in `upstream.json`.
- Integrate upstream by merge, preserving history:

```sh
git fetch upstream
git switch codex/score-import
git merge upstream/develop
```

After a merge, run importer regressions, our conversion fidelity tests, package
build/typecheck, and consuming applications' import/render/timeline checks before updating
a consuming application's pinned package revision. Do not use a floating Git branch in releases.

## Implementation slices

1. Add an import-only workspace entry and a modern GP fixture that parses without
   a DOM, UI, renderer, or audio initialization. Capture version and provenance.
2. Preserve GPIF sound definitions, ordered RSE effect chains, channel strips,
   parameter arrays and automation alongside the parsed model.
3. Write MusicXML for basic notes/rests, tracks, voices, tuning and timing. Reject
   unsupported musical constructs until supported or explicitly diagnosed.
4. Add techniques, repeats, tempo changes and percussion, comparing semantic
   results with source fixtures and an independent converter.
5. Validate the import result in a consuming application, including persistence,
   part projection and score sharing. Application-specific DSP mappings stay
   in the application, outside this package.
6. Add legacy readers incrementally.

## Licensing and upstream contributions

Retain the upstream MPL-2.0 license and all applicable third-party notices. Treat
our import extension as MPL-2.0 too, avoiding ambiguity when adapting upstream
code. Release source corresponding to each distributed importer build and link
it from consuming applications' open-source notices. Soundbank assets and score fixtures
need their own rights review; a code license does not license song content.

Future submissions to CoderLine/alphaTab must follow [AGENTS.md](../AGENTS.md)
and [CONTRIBUTING.md](../CONTRIBUTING.md), including maintainer acceptance of an
issue before a nontrivial PR and the required AI-authorship disclosure. No issue
or PR is being submitted as part of this setup.
