import { defineConfig } from "@neondatabase/config/v1";

export default defineConfig({
    preview: {
        functions: {
            "contacts": {
                name: "contacts mcp server",
                source: "src/index.ts"
            }
        }
    }
})
