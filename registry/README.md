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

`$schema` in `registry.json` and each `template.json` must point at those neon.com URLs. The
website serves the schema files from this folder.

When neon.com is unreachable, the CLI falls back to
`raw.githubusercontent.com/neondatabase/examples/main/registry/registry.json`.

Installing a template does not fetch modules from neon.com. The CLI downloads the
`neondatabase/examples` tarball from GitHub (`codeload.github.com`) and extracts only
`registry/<id>/`, the same way `neon bootstrap` extracts a template subdirectory.

A merge to `main` updates the cached catalog within about an hour, without a CLI release or a
website deploy. The next `functions new` then sees the new files in the tarball.

## Categories

Categories are split across the two files, and neither repeats the other. Listings such as the
templates page on neon.com combine them to filter and group; the CLI ignores both.

The index entry in `registry.json` has exactly one source label that says who wrote the template:

| Category | Meaning |
| --- | --- |
| `first-party` | Written and maintained by Neon (`provider` is `Neon`), even when it wraps a third-party SDK. |
| `partner` | Written by a company Neon works with closely, such as Mastra, TanStack, Context.dev, or WorkOS. |
| `community` | Written by someone outside Neon who is not a partner. |

Each `template.json` has at least one topical label, and more when several fit. Reuse a label from
this table before adding a new one:

| Category | Meaning |
| --- | --- |
| `agents` | Multi-turn agent framework or agent runtime. |
| `ai` | Uses AI Gateway or an AI framework. |
| `ai-infrastructure` | Third-party AI data or tooling provider. |
| `api` | HTTP API, with or without Postgres. |
| `auth` | Authentication or access control. |
| `bots` | Chat or messaging bot. |
| `email` | Transactional or marketing email. |
| `mcp` | Model Context Protocol server. |
| `observability` | Logging, tracing, or error reporting. |
| `payments` | Charges for requests through x402 or another payment rail. |
| `storage` | Uses Neon Object Storage. |
| `websocket` | Live updates over a WebSocket connection. |
| `workflow` | Durable or background job orchestration. |

Topical labels are lowercase hyphenated strings, not a fixed list. Add one only when no existing
label fits: use it in a `template.json` and add a row here.

## Trying a change

Point the CLI at your checkout. Local mode reads the loose files in this folder and does not
download the GitHub tarball:

```bash
NEON_FUNCTION_REGISTRY_DIR=./registry neon functions templates list
NEON_FUNCTION_REGISTRY_DIR=./registry neon functions new <id>
```

To add or change a template, see [CONTRIBUTING.md](CONTRIBUTING.md).
