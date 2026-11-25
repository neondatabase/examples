# Contributing to the Neon Function Registry

The registry is a folder of templates that `neon functions new` scaffolds from. To contribute, open
a pull request on `neondatabase/examples` that adds one template folder and one index entry. Neon
reviews the change, and you do not publish anything yourself. After the PR merges to `main`,
neon.com picks it up within about an hour (see [README.md](README.md)). The CLI copies merged files
into people's projects, so only reviewed content should land on `main`.

## Layout

```
registry.json                # the index the CLI reads first
schemas/
  registry.schema.json       # shape of registry.json; neon.com serves this
  template.schema.json       # shape of each template.json; neon.com serves this
<template-id>/
  template.json              # metadata, no inline source
  README.md                  # required; neon.com renders it on the template page
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
do network work at import time. Don't declare the variables Neon injects: `DATABASE_URL`, and the
`NEON_AI_GATEWAY_*` and `NEON_AUTH_*` variables that Neon adds when AI Gateway or Managed Better
Auth is enabled on the branch. The CLI copies each module on its own, so a module must not import
a sibling from the template folder.

### 2. Write `template.json`

```json
{
	"$schema": "https://neon.com/functions/registry/schemas/template.schema.json",
	"id": "sendgrid",
	"provider": "SendGrid",
	"title": "Send email with SendGrid",
	"description": "Send transactional email through the SendGrid v3 API.",
	"categories": ["email"],
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
| `categories` | no | Topical listing labels (`lowercase-with-hyphens`), such as `ai` or `email`. The schema allows leaving it out, but every template in this registry has at least one; reuse an existing label where it fits. The source label (`first-party`, `partner`, `community`) goes in the index entry, not here. Display-only; the CLI does not use it to scaffold. See [Categories](README.md#categories). |
| `provider` | no | Who built and maintains the template, shown in listings. Defaults to `Neon`. Use `Neon` for templates Neon writes, even when they wrap a third-party SDK, and give the index entry the `first-party` category. Name another company only when that company wrote the template, and give the index entry `partner` if Neon works with that company closely, otherwise `community`. |
| `layout` | yes | `router` or `separate`; see below. |
| `dependencies` | no | Exact `name@version` pins, scoped packages included. No ranges, no `latest`. The version a reviewer approved is the version that gets installed. |
| `environment` | no | `UPPER_SNAKE` names, each with a description and an optional `required`. The CLI declares each one on every scaffolded function in `neon.ts` as `process.env.<NAME>!` and adds it, with the description as a comment, to the project's `.env.example`. Write the description for someone filling that file in. See [`required`](#required). |
| `operations` | no | 1-40 entries. Omit them for a single-module template. |
| `triggers` | no | Function Triggers the CLI declares in `neon.ts` next to the function. See [`triggers`](#triggers). |
| `features` | no | The Neon products the template uses, shown as Built with on its neon.com page. Display-only; the CLI does not use it to scaffold. See [`features`](#features). |

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

### `required`

Set `required` on each `environment` entry to say when the variable must be set. Once the CLI
supports it, it copies `required` into the declaration in `neon.ts` as
`{ value: process.env.<NAME>, required }`:

| `required` | Unset on `neon deploy` | Unset in `neon dev` |
| --- | --- | --- |
| `true` (the default) | fails before any change | fails before any function starts |
| `"default-branch"` | fails on the project's default branch; left out of the deployment elsewhere | runs without it |
| `false` | left out of the deployment | runs without it |

Use `false` only when the module handles the variable being unset, for example an SDK that stays
disabled without its key. No released version of `neon` writes `required` yet: they ignore it and
write `process.env.<NAME>!`, which makes `neon.ts` fail to load wherever the variable is unset.
The CLI change is
[neondatabase/neon-pkgs#1078](https://github.com/neondatabase/neon-pkgs/pull/1078); update this
paragraph with the version that ships it.

### `triggers`

List the Function Triggers the template needs, and `neon functions new` writes them to `triggers`
in `neon.ts` after the function. `neon` 9.11.0 and later write them. Older versions ignore the
field, so keep the README's manual `neon.ts` steps for them (see below).

```json
"triggers": [
	{ "name": "cleanup", "type": "schedule", "cron": "0 * * * *", "path": "/__scheduled" },
	{ "name": "describe-uploads", "type": "storage_object_created", "bucket": "uploads", "prefix": "images/", "path": "/object" }
]
```

| Field | Rule |
| --- | --- |
| `name` | Up to 63 lowercase letters, digits, and hyphens, unique within the template. It becomes the trigger's key in `neon.ts`. |
| `type` | `schedule` or `storage_object_created`. |
| `cron` | `schedule` only, and required there. A numeric five-field cron expression in UTC, such as `0 * * * *`, with single spaces between fields. Day and month names (`MON`) and macros (`@hourly`) are not allowed. |
| `bucket` | `storage_object_created` only, and required there. The bucket to watch: 3-63 lowercase letters, digits, dots, and hyphens. |
| `prefix` | `storage_object_created` only, optional. An exact object-key prefix, such as `images/`. Omit it to match every key. |
| `operation` | Required when the template has `operations`, and not allowed when it has none. The id of the operation whose function the trigger calls. The trigger is written only when that operation is scaffolded. |
| `path` | Optional. The URL path the trigger posts to, starting with `/`. Not allowed on the trigger of a `router` operation, which always posts to the operation's `route`. |

What the CLI writes for each layout:

| Template | `function` in `neon.ts` | `functionPath` in `neon.ts` |
| --- | --- | --- |
| No `operations` | The scaffolded slug | `path` |
| `router` with `operations` | The scaffolded slug | The operation's `route` |
| `separate` | The operation's `slug` | `path` |

The CLI leaves `functionPath` out when it is `/`, which is the default. Each trigger takes one line:

```ts
triggers: {
  cleanup: { type: "schedule", function: "jalcodrop", cron: "0 * * * *", functionPath: "/__scheduled" },
},
```

- When `neon.ts` already declares a trigger with the same name, the CLI leaves that declaration as
  it is and prints this template's declaration to add by hand.
- The CLI never declares a bucket. A `storage_object_created` trigger must name a bucket that
  `neon.ts` declares, so when `neon.ts` lacks it, the CLI tells the user to run
  `neon config add bucket <name>`, and `neon.ts` does not load until they do. Declaring a bucket
  sets its access, which is why the CLI leaves it to the user. If the template needs a
  `public_read` bucket, say so in the README.
- With `--no-add-to-config`, the CLI prints a `neon triggers create` command for each trigger
  instead.
- Keep the `function-triggers` entry in [`features`](#features). `triggers` does not add the Built
  with badge.

In the README, describe what the CLI writes, then keep the manual `triggers` snippet under a step
for `neon` versions older than 9.11.0. Remove it once those versions are no longer in use.

### `features`

List the Neon products the template's code uses. The template page on neon.com shows them under
Built with in the order you write them, so put the product the template is mainly about first.
Leave out Functions, because every template is one, and leave `features` out entirely when the
template uses nothing else.

| Feature | Product | List it when the template |
| --- | --- | --- |
| `postgres` | Lakebase Postgres | Connects to the database, for example with `pg` or `drizzle-orm` and `DATABASE_URL`. |
| `lakebase-search` | Lakebase Search | Runs vector, full-text, or hybrid search queries. |
| `auth` | Managed Better Auth | Verifies Managed Better Auth sessions or tokens, for example with `@neon/oauth` or the `NEON_AUTH_*` variables. |
| `data-api` | Data API | Calls the branch's Data API. |
| `realtime` | Realtime | Uses Neon Realtime. A WebSocket from `upgradeWebSocket` alone is Functions, not Realtime. |
| `object-storage` | Object Storage | Reads or writes a bucket. |
| `ai-gateway` | AI Gateway | Calls models through AI Gateway. |
| `function-triggers` | Function Triggers | Sets up a trigger, declared in [`triggers`](#triggers) or added to `neon.ts` by its README. |

Write each feature as its id. For `function-triggers`, prefer the object form, which names the
trigger types the template sets up: `schedule` for a cron schedule and `storage_object_created`
for an upload to a bucket. These match the trigger `type` in `neon.ts` and the Neon API. List each
feature once.

```json
"features": [
	"ai-gateway",
	"object-storage",
	{ "id": "function-triggers", "types": ["storage_object_created"] }
]
```

### 3. Add the index entry

Append to `templates` in `registry.json`:

```json
{
	"id": "sendgrid",
	"provider": "SendGrid",
	"title": "Send email with SendGrid",
	"description": "Send transactional email through the SendGrid v3 API.",
	"path": "sendgrid/template.json",
	"categories": ["community"],
	"logo": "https://example.com/sendgrid.svg",
	"website": "https://example.com/"
}
```

`id`, `title`, `description`, and `provider` should match `template.json`. `categories` is required
here and holds exactly one source label: `first-party` when Neon wrote the template, `partner` when
a company Neon works with closely wrote it, and `community` otherwise. Topical labels go in
`template.json` and are not repeated here; listings combine the two. The labels are defined in
[README.md](README.md#categories). `logo`, `logoDark`, and `website` are optional
display metadata: absolute `https://` URLs that the CLI never fetches or writes. The templates page
uses them for the Built by block; omit them on first-party templates so listings default to Neon,
even when the template wraps a third-party SDK. Set them only when another company wrote the
template. Set `logoDark` when `logo` is dark on a transparent background; listings show it in dark
mode and fall back to `logo` without it.

#### Templates hosted in another repo

A partner can keep the template in its own public GitHub repo while Neon keeps the index entry.
Such entries go in the index of
[neondatabase/registry](https://github.com/neondatabase/registry), not in this one. `neon` 9.4.0
and later ignore an entry here that sets `source`, and older versions would list it and then fail
to load it, because they read `path` from this folder. Older versions never read
`neondatabase/registry`, so an entry there is safe for every user.

```json
{
	"id": "acme-sync",
	"provider": "Acme",
	"title": "Sync Acme users",
	"description": "Sync Acme users and organizations into Postgres.",
	"path": "template.json",
	"categories": ["partner"],
	"source": {
		"github": {
			"owner": "acme",
			"repo": "neon-templates",
			"ref": "v1.2.3",
			"dir": "packages/neon"
		}
	}
}
```

| `source.github` field | Required | Meaning |
| --- | --- | --- |
| `owner` | yes | GitHub user or organization. |
| `repo` | yes | Repository name. The repo must be public; the CLI sends no token. |
| `ref` | no | Branch, tag, or commit SHA. Defaults to `HEAD`, the repo's default branch. Pin a tag or full commit SHA so a push mid-download cannot mix files from two commits. |
| `dir` | no | Directory in the repo that `path` and the template's module paths are relative to. Defaults to the repo root. |

The CLI reads `template.json` and each module it names from
`raw.githubusercontent.com/<owner>/<repo>/<ref>/<dir>/`, file by file. The same path rules apply:
every path is relative and must stay inside `dir`.

An entry that fails validation is dropped from the listing without an error, so check that your
template shows up (see below). Do not add generated archives. The CLI builds what it needs from
this folder's source files.

## README components

When `template.json` lists `operations`, wrap the README's routes section in an `<Operations>` block.
When it lists `environment` entries, wrap the env var section in an `<EnvironmentVariables>` block.
neon.com renders the README and replaces each block with its own component, built from
`template.json`. GitHub drops the tags and shows the markdown inside, so the README still reads
normally there.

```md
<Operations>

...markdown list or table of the template's routes/operations...

</Operations>

<EnvironmentVariables>

...markdown list or table of the env vars...

</EnvironmentVariables>
```

- Wrap the README's existing routes and env var sections instead of writing them twice.
- Put each tag on its own line at the top level of the README, never inside a list, blockquote, or
  code block.
- Leave a blank line after the opening tag and before the closing tag, so the markdown inside still
  renders.
- Keep the wrapped content consistent with `operations` and `environment` in `template.json`.
- Leave a block out when the template has nothing to list for it, such as a single-module template
  with no routes or a template with no env vars. neon.com shows nothing for an empty block.

When a README leaves out a block that has data, neon.com adds its own section for it after the
README. When you wrap content but `template.json` has no data for that block, neon.com shows the
wrapped markdown instead.

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

The `$schema` field must be the neon.com URL
(`https://neon.com/functions/registry/schemas/template.schema.json`), which is served from
`schemas/` in this folder. It gives editor completion; the CLI's parser is what actually decides.
A template that passes the schema but fails the commands above is not ready. The CLI also
validates `template.json` against the schema neon.com serves, not the one in your checkout, so a
template that uses a field neon.com does not serve yet fails to load until the schema change is
merged and live.

## Review checklist

- [ ] The template is listed, and `functions new <id> -y` succeeds against a local checkout.
- [ ] Every operation was run once with `neon dev`.
- [ ] Dependencies are pinned and come from the provider's official SDK.
- [ ] Every `process.env` read, other than the variables Neon injects, is declared in
      `environment`, and no secret or default key is hard-coded.
- [ ] No network calls at import time, and no telemetry the user didn't ask for.
- [ ] Recommended operations are the ones most users want on day one.
- [ ] The index entry has one source label, and `template.json` has at least one topical label
      from the [categories table](README.md#categories).
- [ ] `features` lists the Neon products the code uses, most important first, or is left out when
      it uses none besides Functions.

## Changing the schema

The format is enforced by the Neon CLI's parser (`REGISTRY_CONTRACT` in
`packages/cli/src/functions/registry.ts` in
[neondatabase/neon-pkgs](https://github.com/neondatabase/neon-pkgs)) and the JSON Schemas in
`schemas/` here, which neon.com serves at `https://neon.com/functions/registry/schemas/`. Keep them
in agreement.

Change the CLI first for fields the parser uses. A field the published CLI does not know about is
either ignored or makes the template invalid for every user on that version, so do not use a new
field in a template until a CLI release that understands it is out. `neon` 8.11.2 and later
validate each `template.json` against the schema served from neon.com, also with
`NEON_FUNCTION_REGISTRY_DIR`, and that schema has `additionalProperties: false`. Merge a new
template field into `schemas/` and wait for neon.com to serve it before a template uses the field. Display-only index fields
(`logo`, `logoDark`, `website`, `categories`) may land here; the CLI never fetches them.
