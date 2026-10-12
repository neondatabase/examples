# Neon Function Registry

Templates for `neon functions new`. Each folder here is one template: a `template.json`, the
function modules it ships, and `template.tar.gz`, an archive of those modules that
`scripts/pack.mjs` generates.

```bash
neon functions templates list   # what's available
neon functions new basic        # scaffold one into the current project
```

## Where the CLI reads it from

The CLI does not read this folder from GitHub. neon.com serves five kinds of file from `main`
through a cache that refreshes about once an hour, and nothing else in the folder:

| URL | File here |
| --- | --- |
| `https://neon.com/functions/registry/registry.json` | `registry.json` |
| `https://neon.com/functions/registry/schemas/registry.schema.json` | `schemas/registry.schema.json` |
| `https://neon.com/functions/registry/schemas/template.schema.json` | `schemas/template.schema.json` |
| `https://neon.com/functions/registry/<id>/template.json` | `<id>/template.json` |
| `https://neon.com/functions/registry/<id>/template.tar.gz` | `<id>/template.tar.gz` |

Listing templates costs one request for `registry.json`. Installing one costs two more: its
`template.json` and its `template.tar.gz`. The loose `.ts` files are the source the archive is
built from, so neon.com does not serve them.

A merge to `main` reaches users within about an hour, without a CLI release or a website deploy.
When neon.com is unreachable, the CLI falls back to
`raw.githubusercontent.com/neondatabase/examples/main/registry/registry.json`.

## Trying a change

Point the CLI at your checkout:

```bash
NEON_FUNCTION_REGISTRY_DIR=./registry neon functions templates list
NEON_FUNCTION_REGISTRY_DIR=./registry neon functions new <id>
```

To add or change a template, see [CONTRIBUTING.md](CONTRIBUTING.md).
