# Neon Function Registry

Templates for `neon functions new`. Each folder here is one template: a `template.json` and the
function modules it ships.

```bash
neon functions templates list   # what's available
neon functions new basic        # scaffold one into the current project
```

## Where the CLI reads it from

The CLI does not read this folder from GitHub. neon.com serves the files from `main` through a
cache that refreshes about once an hour:

| URL | File here |
| --- | --- |
| `https://neon.com/functions/registry/registry.json` | `registry.json` |
| `https://neon.com/functions/registry/schemas/registry.schema.json` | `schemas/registry.schema.json` |
| `https://neon.com/functions/registry/schemas/template.schema.json` | `schemas/template.schema.json` |
| `https://neon.com/functions/registry/<id>/…` | `<id>/…` |

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
