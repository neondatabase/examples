# Future Ideas

Ideas for future development, not yet planned or prioritized.

---

## 1. Make App Generic (Config-Driven)

**Status:** Planned

Refactor the app to be config-driven via `search.config.ts`. Users edit the config to adapt for any dataset (fish species, products, recipes, etc.) without modifying core code.

Key changes:
- Create `search.config.ts` with schema, branding, and example queries
- Refactor API route, result cards, and setup script to use config
- Support different data sources (SQL, CSV, JSON)

**Prerequisite for:** Interactive Init CLI

---

## 2. Interactive Init CLI

**Status:** Idea (not planned)

**Depends on:** Make App Generic (need `search.config.ts` to exist first)

Instead of manually editing `search.config.ts`, offer an interactive setup:

```bash
npm run init

? Table name: fish_species
? ID field: species_id
? Title field: common_name  
? Description field: habitat_description
? Fields for fuzzy search: [common_name, scientific_name]
? Fields for embeddings: [common_name, habitat_description, diet]

✓ Generated search.config.ts - review and run npm run setup
```

**Why:**
- Lower barrier to entry
- Users don't need to understand config format upfront
- "Just works" experience for new datasets

**Considerations:**
- Would benefit from a CLI library (inquirer, prompts, etc.)
- Could optionally parse SQL files to suggest defaults
- Heuristics for field detection: `*_id` → ID, `title`/`name` → title, etc.

**Alternative:** Full SQL parsing to auto-generate config, but this is more complex (many SQL dialects, edge cases).
