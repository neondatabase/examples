import { defineConfig } from "@neon/config/v1";

export default defineConfig({
    functions: {
        "contacts": {
            name: "contacts mcp server",
            source: "src/index.ts"
        }
    }
})
