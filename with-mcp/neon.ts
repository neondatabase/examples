import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  functions: {
    contacts: {
      name: 'Contacts MCP server',
      source: 'src/index.ts',
    },
  },
});
