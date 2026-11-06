import { defineConfig } from "@neon/config/v1";

export default defineConfig({
    functions: {
        "todos": {
            name: "todo api",
            source: "src/index.ts"
        }    
    }
})
