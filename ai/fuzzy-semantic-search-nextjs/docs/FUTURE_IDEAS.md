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

---

## 3. Hybrid Search Enhancements

**Status:** Idea (not planned)

Inspired by [Hybrid Search With PostgreSQL and Pgvector](https://jkatz05.com/post/postgres/hybrid-search-postgres-pgvector/).

### 3a. Add tsearch2 Full-Text Search

Add PostgreSQL full-text search as a third method alongside pg_trgm and pgvector.

**What it provides:**
- Word stemming: "comedies" matches "comedy", "traveling" matches "travel"
- Stop word removal: ignores "the", "a", "is"
- Word proximity ranking with `ts_rank_cd()`

**Trade-off:** pg_trgm already handles typos (e.g., "strngr thngs"), which tsearch2 cannot. Adds UI complexity with limited demo impact.

### 3b. Increase RRF Candidate Pool

Fetch a larger candidate pool before RRF (e.g., 2–4x the final limit) to increase overlap.

**Trade-off:** Slightly higher query/transfer cost; RRF computation remains negligible (~0.1ms in JS).

### 3c. SQL-Based RRF

Move RRF computation from JavaScript into a single SQL query (UNION ALL + aggregation):

```sql
SELECT id, sum(1.0 / (rank + 60)) AS rrf_score
FROM (
    (SELECT id, rank() OVER (...) FROM ... ORDER BY fuzzy LIMIT 40)
    UNION ALL
    (SELECT id, rank() OVER (...) FROM ... ORDER BY semantic LIMIT 40)
) searches
GROUP BY id
ORDER BY rrf_score DESC
LIMIT 10;
```

**Trade-off:** Loses per-method timing in the UI; JS computation is negligible so perf gain is minimal.
