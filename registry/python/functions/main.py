from fastapi import FastAPI, Request

app = FastAPI()


@app.api_route("/{path:path}", methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def hello(request: Request):
    return {"message": "Hello from Neon Functions!", "method": request.method}
