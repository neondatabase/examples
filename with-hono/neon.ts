import { defineConfig } from "@neondatabase/config/v1";

export default defineConfig({
    preview: {
        functions: {
            "todos": {
                name: "todo api",
                source: "src/index.ts"
            }    
        }
    }
})