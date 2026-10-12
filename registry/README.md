# Neon Function Registry

Templates for `neon functions new`. Each folder here is one template: a `template.json` and the
function modules it ships. Those files are the source of truth. The repo does not contain generated
archives.

```bash
neon functions templates list   # what's available
neon functions new basic        # scaffold one into the current project
```

## Where the CLI reads it from

Listing works like `neon bootstrap`. neon.com serves the catalog from `main` through a cache that
refreshes about once an hour:

| URL | File here |
| --- | --- |
| `https://neon.com/functions/registry/registry.json` | `registry.json` |
| `https://neon.com/functions/registry/schemas/registry.schema.json` | `schemas/registry.schema.json` |
| `https://neon.com/functions/registry/schemas/template.schema.json` | `schemas/template.schema.json` |

When neon.com is unreachable, the CLI falls back to
`raw.githubusercontent.com/neondatabase/examples/main/registry/registry.json`.

Installing a template does not fetch modules from neon.com. The CLI downloads the
`neondatabase/examples` tarball from GitHub (`codeload.github.com`) and extracts only
`registry/<id>/`, the same way `neon bootstrap` extracts a template subdirectory.

A merge to `main` updates the cached catalog within about an hour, without a CLI release or a
website deploy. The next `functions new` then sees the new files in the tarball.

## Trying a change

Point the CLI at your checkout. Local mode reads the loose files in this folder and does not
download the GitHub tarball:

```bash
NEON_FUNCTION_REGISTRY_DIR=./registry neon functions templates list
NEON_FUNCTION_REGISTRY_DIR=./registry neon functions new <id>
```

To add or change a template, see [CONTRIBUTING.md](CONTRIBUTING.md).
