# Basic function

This template is a minimal [Neon Function](https://neon.com/docs/compute/functions/overview) that answers every request with the same JSON response. Replace the handler in `index.ts` with your own code.

## Scaffold it

Install the latest Neon CLI, then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new basic
```

The CLI writes `functions/basic/index.ts` and declares the function in `neon.ts`.

## Run locally

```bash
neon dev
```

Call the URL that `neon dev` prints (the default is `http://localhost:8787/`):

```bash
curl http://localhost:8787/
```

```json
{ "message": "Hello from Neon Functions!", "method": "GET" }
```

The function returns this JSON for every path and method, with `method` set to the method of the request.

## Deploy

```bash
neon deploy
neon functions get basic
```

`neon functions get` prints the function's public URL, which you call the same way as the local one.
