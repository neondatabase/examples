# Python function

This template is a minimal [Neon Function](https://neon.com/docs/compute/functions/overview) written in Python. It is a [FastAPI](https://fastapi.tiangolo.com/) app that answers every request with the same JSON response. Replace the route in `main.py` with your own code.

## Scaffold it

Install the latest Neon CLI and [uv](https://docs.astral.sh/uv/), then create the function from the registry:

```bash
npm install -g neon@latest
neon login
neon link
neon functions new python
```

The CLI writes `functions/python/pyproject.toml` and `functions/python/main.py`, locks the project's dependencies with `uv lock`, and declares the function in `neon.ts` with its runtime and app:

```ts
python: {
  name: "Python function",
  source: "./functions/python",
  runtime: "python314",
  entrypoint: "main:app",
},
```

Add dependencies with `uv add` in `functions/python`, which keeps `uv.lock` current. A deploy installs exactly what `uv.lock` pins.

## Run locally

```bash
neon dev
```

Call the URL that `neon dev` prints, for example with `curl`:

```bash
curl <URL from neon dev>
```

```json
{ "message": "Hello from Neon Functions!", "method": "GET" }
```

The function returns this JSON for every path and method, with `method` set to the method of the request.

## Deploy

```bash
neon deploy
neon functions get python
```

`neon functions get` prints the function's public URL, which you call the same way as the local one.
