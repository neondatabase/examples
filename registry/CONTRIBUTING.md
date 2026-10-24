# Contributing to the Neon Function Registry

The registry is a folder of templates that `neon functions new` scaffolds from. To contribute, open
a pull request on `neondatabase/examples` that adds one template folder and one index entry. Neon
reviews the change, and you do not publish anything yourself. After the PR merges to `main`,
neon.com picks it up within about an hour (see [README.md](README.md)). The CLI copies merged files
into people's projects, so only reviewed content should land on `main`.

## Layout

```
registry.json                # the index the CLI reads first
<template-id>/
  template.json              # metadata, no inline source
  functions/
    <operation>.ts           # one module per operation
```

Listing fetches `registry.json` from neon.com, the same way `neon bootstrap` fetches
`bootstrap.yaml`. Installing downloads the `neondatabase/examples` tarball from GitHub and extracts
only `registry/<id>/`, including `template.json` and the modules it names. Every path is relative
and must stay inside the registry. Absolute paths, `..`, backslashes, and symlinks that lead
outside it are not allowed.

## Adding a template

### 1. Write the modules

Each module default-exports a fetch handler:

```ts
export default {
	async fetch(request: Request): Promise<Response> {
		return Response.json({ ok: true });
	},
};
```

Read configuration from `process.env`, declare every variable you read in `environment`, and do not
do network work at import time. The CLI copies each module on its own, so a module must not import
a sibling from the template folder.

### 2. Write `template.json`

```json
{
	"$schema": "https://neon.com/functions/registry/schemas/template.schema.json",
	"id": "sendgrid",
	"provider": "SendGrid",
	"title": "Send email with SendGrid",
	"description": "Send transactional email through the SendGrid v3 API.",
	"layout": "separate",
	"dependencies": ["@sendgrid/mail@8.1.3"],
	"environment": [
		{ "name": "SENDGRID_API_KEY", "description": "API key from the SendGrid dashboard." }
	],
	"operations": [
		{
			"id": "send-email",
			"title": "Send an email",
			"description": "Send a single transactional email.",
			"source": "functions/send-email.ts",
			"slug": "sendemail",
			"recommended": true
		}
	]
}
```

| Field | Required | Rule |
| --- | --- | --- |
| `id` | yes | Lowercase letters, digits and hyphens, starting with a letter or digit. Must match the index entry's `id`; use it as the folder name too. |
| `title`, `description` | yes | Non-empty. |
| `provider` | no | Shown in listings. Defaults to `Neon`. |
| `layout` | yes | `router` or `separate`; see below. |
| `dependencies` | no | Exact `name@version` pins, scoped packages included. No ranges, no `latest`. The version a reviewer approved is the version that gets installed. |
| `environment` | no | `UPPER_SNAKE` names, each with a description. The CLI declares each one on every scaffolded function in `neon.ts` and adds it, with the description as a comment, to the project's `.env.example`. Write the description for someone filling that file in. |
| `operations` | no | 1-40 entries. Omit them for a single-module template. |

Each operation needs:

| Field | Rule |
| --- | --- |
| `id` | Same rule as the template `id`; unique within the template. It names the scaffolded file (`<id>.ts`). |
| `title`, `description` | Non-empty. |
| `source` | Path to the module, relative to `template.json`; unique. |
| `recommended` | Boolean. At least one operation must be `true`; the recommended set is what `-y` and non-interactive runs scaffold. |
| `route` | `router` only. A URL path starting with `/`, unique. Defaults to `/<id>`. |
| `slug` | `separate` only, and required there. 1-20 lowercase letters and digits, no hyphens, unique. It is the Neon function slug. |

### Layouts

A `router` template scaffolds one Neon function. The CLI copies the selected modules and generates
an `index.ts` that dispatches on the URL path to each operation's `route`. Any other path returns
404 and lists the valid routes.

A `separate` template scaffolds one Neon function per selected operation, each under its own
`slug`. Use it when operations should scale, fail, or receive secrets independently.

If you omit `operations`, the template ships exactly one module at `functions/index.ts`, which the
CLI scaffolds as `index.ts`. Set `layout` to `router`.

### 3. Add the index entry

Append to `templates` in `registry.json`:

```json
{
	"id": "sendgrid",
	"provider": "SendGrid",
	"title": "Send email with SendGrid",
	"description": "Send transactional email through the SendGrid v3 API.",
	"path": "sendgrid/template.json",
	"logo": "https://example.com/sendgrid.svg"
}
```

`id`, `title`, and `description` should match `template.json`. `logo` is optional display metadata:
an absolute `https://` URL that the CLI never fetches or writes.

An entry that fails validation is dropped from the listing without an error, so check that your
template shows up (see below). Do not add generated archives. The CLI builds what it needs from
this folder's source files.

## Limits

| | |
| --- | --- |
| Entries in `registry.json` | 500 |
| `registry.json` or a `template.json` | 1 MB |
| One module | 256 KB |
| All modules of one template | 2 MB |
| Path length | 255 characters |

## Testing locally

Point the CLI at your checkout of this folder with `NEON_FUNCTION_REGISTRY_DIR`:

```bash
export NEON_FUNCTION_REGISTRY_DIR=/path/to/examples/registry

# Your template should be listed. If it isn't, its index entry failed validation.
neon functions templates list

# Loads template.json and every module it references, then scaffolds into a scratch directory.
neon functions new <id> -y --dir /tmp/<id> --no-add-to-config --no-install
```

The command prints a `neon dev --source …` line for each function it created. Run those commands
and call each route or function once.

The `$schema` field must be the neon.com hosted schema
(`https://neon.com/functions/registry/schemas/template.schema.json`). It gives editor completion;
the CLI's parser is what actually decides. A template that passes the schema but fails the
commands above is not ready.

## Review checklist

- [ ] The template is listed, and `functions new <id> -y` succeeds against a local checkout.
- [ ] Every operation was run once with `neon dev`.
- [ ] Dependencies are pinned and come from the provider's official SDK.
- [ ] Every `process.env` read is declared in `environment`, and no secret or default key is
      hard-coded.
- [ ] No network calls at import time, and no telemetry the user didn't ask for.
- [ ] Recommended operations are the ones most users want on day one.

## Changing the schema

Do not add JSON Schemas to this repo. Use the neon.com hosted files:

- `https://neon.com/functions/registry/schemas/registry.schema.json`
- `https://neon.com/functions/registry/schemas/template.schema.json`

The format is enforced by the Neon CLI's parser (`REGISTRY_CONTRACT` in
`packages/cli/src/functions/registry.ts` in
[neondatabase/neon-pkgs](https://github.com/neondatabase/neon-pkgs)). Change the CLI first. A field
the published CLI does not know about is either ignored or makes the template invalid for every
user on that version, so do not use a new field in a template until a CLI release that understands
it is out.
