'use client'

import { HelpCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'

export function AboutSection() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
          <HelpCircle className="h-5 w-5" />
          <span className="sr-only">About this demo</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>About this demo</DialogTitle>
        </DialogHeader>

        <Accordion type="single" collapsible defaultValue="what" className="w-full">
          <AccordionItem value="what">
            <AccordionTrigger className="text-sm hover:no-underline">
              What this demo does
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              <p className="mb-3">
                Shows how PostgreSQL can power search that handles keywords, typos, and natural language—no 
                external search engine needed. Uses a Netflix dataset (~8,800 shows) to compare four approaches:
              </p>
              <ul className="space-y-2 ml-4">
                <li>
                  <strong className="text-foreground">Full-text</strong> (<code className="text-xs bg-muted px-1 py-0.5 rounded">tsvector</code>) — 
                  Built-in PostgreSQL word matching with stemming. "comedies" matches "comedy",
                  supports <code className="text-xs bg-muted px-1 py-0.5 rounded">-exclusion</code> and{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">"phrases"</code>. No extensions needed.
                </li>
                <li>
                  <strong className="text-foreground">Fuzzy</strong> (<code className="text-xs bg-muted px-1 py-0.5 rounded">pg_trgm</code>) — 
                  Compares character sequences (trigrams) to find similar text. Handles typos 
                  and partial matches: "strngr thngs" → "Stranger Things"
                </li>
                <li>
                  <strong className="text-foreground">Semantic</strong> (<code className="text-xs bg-muted px-1 py-0.5 rounded">pgvector</code>) — 
                  Converts text to vectors that capture meaning, then finds similar vectors. 
                  "shows about time travel" finds relevant results even without exact word matches.
                </li>
                <li>
                  <strong className="text-foreground">Hybrid</strong> — 
                  Combines all three using Reciprocal Rank Fusion: if a result ranks highly in any method, 
                  it rises in the combined list.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="fields">
            <AccordionTrigger className="text-sm hover:no-underline">
              What fields are searched
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              <p className="mb-3 text-xs">
                <strong className="text-foreground">Note:</strong> This demo intentionally uses different fields 
                for each method to highlight their strengths. In production, you might configure them 
                differently based on your needs.
              </p>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="font-medium text-foreground mb-1">Full-text (tsvector)</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-1">
                    <li>Title</li>
                    <li>Description</li>
                    <li>Genres</li>
                  </ul>
                  <p className="mt-2 text-muted-foreground/80 italic">
                    Best for: keyword search with stemming
                  </p>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Fuzzy (pg_trgm)</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-1">
                    <li>Title</li>
                    <li>Director</li>
                    <li>Cast</li>
                  </ul>
                  <p className="mt-2 text-muted-foreground/80 italic">
                    Best for: "I know the name"
                  </p>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Semantic (pgvector)</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-1">
                    <li>Title</li>
                    <li>Description</li>
                    <li>Director</li>
                    <li>Cast (top 5)</li>
                    <li>Genres</li>
                    <li>Country</li>
                  </ul>
                  <p className="mt-2 text-muted-foreground/80 italic">
                    Best for: "something like..."
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="considerations">
            <AccordionTrigger className="text-sm hover:no-underline">
              Things to know
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              <ul className="space-y-3">
                <li>
                  <strong className="text-foreground">Full-text scores are relative</strong> — 
                  Unlike fuzzy (0-100% similarity) and semantic (0-100% cosine similarity), full-text{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">ts_rank</code> returns arbitrary
                  floats. Scores are normalized per-query so the top result = 100% and others are relative.
                  This means scores aren't comparable across methods.
                </li>
                <li>
                  <strong className="text-foreground">Full-text is binary match</strong> — 
                  A document either matches the query or it doesn't — there's no threshold to tune.
                  The ranking only orders matched documents. Fuzzy and semantic, by contrast, produce a
                  continuous similarity score for every document.
                </li>
                <li>
                  <strong className="text-foreground">Small dataset effects</strong> — 
                  With only 8.8K records, fuzzy search scans quickly even without perfect index usage. 
                  At 100K+ records, you'd see bigger performance gaps between indexed vs. sequential scans, 
                  and score distributions would be more spread out.
                </li>
                <li>
                  <strong className="text-foreground">Semantic scores are less granular</strong> — 
                  Embedding similarity tends to cluster (70-80% range) rather than spread evenly. 
                  This is inherent to how embeddings work—they measure "related vs. unrelated" more 
                  than degree of relevance. Small threshold changes have less visible impact than with fuzzy.
                </li>
                <li>
                  <strong className="text-foreground">First semantic search is slow</strong> — 
                  The embedding model (~30MB) loads on the first search, taking ~5 seconds. 
                  After that, it stays in memory and subsequent searches are fast (~200ms for embedding generation).
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="how" className="border-b-0">
            <AccordionTrigger className="text-sm hover:no-underline">
              How it works
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              <div className="mb-4 p-3 bg-muted/50 rounded font-mono text-xs overflow-x-auto">
                <pre className="whitespace-pre">{`User Query: "comedy -horror"
              ↓
       Normalize text
     (lowercase, strip noise)
              ↓
┌─────────────────────────────────────────────────────────────┐
│              Run searches in parallel                       │
├──────────────────┬──────────────────┬───────────────────────┤
│ Full-text (tsv)  │ Fuzzy (pg_trgm)  │ Semantic (pgvector)   │
│                  │                  │                       │
│ Parse tsquery,   │ Compare trigrams │ 1. Generate embedding │
│ match stems      │ against title,   │ 2. Find nearest       │
│ via GIN index    │ director, cast   │    vectors (IVF)      │
└──────────────────┴──────────────────┴───────────────────────┘
              ↓
      Merge via RRF (Reciprocal Rank Fusion)
              ↓
         Display results`}</pre>
              </div>
              <div className="space-y-2 text-xs">
                <p>
                  <strong className="text-foreground">Normalization:</strong> Before fuzzy matching, 
                  titles are cleaned—lowercased, leading articles stripped ("The", "A"), 
                  noise removed ("[Remastered]", "(2020)"). This helps "queens gambit" match "The Queen's Gambit".
                </p>
                <p>
                  <strong className="text-foreground">Thresholds:</strong> Fuzzy defaults to 20% similarity, 
                  Semantic to 40%. Adjust using the sliders in the main UI (click "Adjust thresholds").
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="technical" className="border-b-0">
            <AccordionTrigger className="text-sm hover:no-underline">
              Technical notes
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              <ul className="space-y-3 text-xs">
                <li>
                  <strong className="text-foreground">Embeddings:</strong> Show embeddings are pre-generated 
                  during setup. Query embeddings are generated on-the-fly in the API route 
                  using <a href="https://huggingface.co/docs/transformers.js" className="underline hover:text-foreground">Transformers.js</a> with 
                  the <code className="bg-muted px-1 py-0.5 rounded">gte-small</code> model (384 dimensions). 
                  No external API keys needed. Tradeoff: ~200ms per query vs. ~50ms with hosted APIs.
                </li>
                <li>
                  <strong className="text-foreground">Indexes:</strong> Full-text uses a GIN index
                  on the <code className="bg-muted px-1 py-0.5 rounded">tsvector</code> column (built-in,
                  no extension). Fuzzy uses a GIN index
                  with <code className="bg-muted px-1 py-0.5 rounded">gin_trgm_ops</code> for
                  trigram lookups. Semantic uses IVFFlat
                  with <code className="bg-muted px-1 py-0.5 rounded">vector_cosine_ops</code> (93 lists, ~√n).
                </li>
                <li>
                  <strong className="text-foreground">Full-text query syntax:</strong> Uses{' '}
                  <code className="bg-muted px-1 py-0.5 rounded">websearch_to_tsquery</code> which
                  supports Google-like syntax: quoted phrases for exact match, <code className="bg-muted px-1 py-0.5 rounded">-word</code> for
                  exclusion, and implicit AND between terms. Stemming is automatic via
                  the English dictionary ("comedies" → "comedi").
                </li>
                <li>
                  <strong className="text-foreground">Why fuzzy DB time {">"} semantic:</strong> Fuzzy 
                  uses <code className="bg-muted px-1 py-0.5 rounded">word_similarity()</code> which 
                  slides through text finding the best substring match—CPU intensive for variable-length strings. 
                  Semantic compares fixed-size vectors (384 floats) with simple dot products, often SIMD-optimized. 
                  IVFFlat also pre-clusters vectors, searching only ~1-2% of data.
                </li>
                <li>
                  <strong className="text-foreground">Network latency:</strong> Running locally against 
                  a remote Neon database adds ~500-700ms round-trip. Deployed in the same region as Neon, 
                  expect ~20-40ms.
                </li>
                <li>
                  <strong className="text-foreground">Timing display:</strong> The main time shown (e.g., "523ms") 
                  is total round-trip time including network. The "DB avg" is a historical average of pure database 
                  execution time from <code className="bg-muted px-1 py-0.5 rounded">pg_stat_statements</code>—it 
                  reflects past queries, not necessarily this specific query. Stats reset when Neon suspends.
                </li>
                <li>
                  <strong className="text-foreground">Source:</strong> Inspired 
                  by <a href="https://rendiment.io/postgresql/2026/01/21/pgtrgm-pgvector-music.html" className="underline hover:text-foreground">Fuzzy and Semantic Search in PostgreSQL</a> by Daniel Guzman Burgos.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </DialogContent>
    </Dialog>
  )
}
