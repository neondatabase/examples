'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { Search, ChevronDown, X, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { SearchResults } from '@/components/search-results'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/theme-toggle'
import { ScoreDistributionChart } from '@/components/score-distribution'
import { AboutSection } from '@/components/about-section'
import type { SearchResponse } from '@/app/api/search/route'

const QUICK_EXAMPLES = [
  { query: 'stranger things', hint: 'title' },
  { query: 'strngr thngs', hint: 'typos' },
  { query: 'shows about time travel', hint: 'concept' },
]


const MORE_EXAMPLES = {
  'Fuzzy shines': [
    { query: 'breaking bad' },
    { query: 'breking bad' },
    { query: 'the crown' },
    { query: 'black mirror' },
  ],
  'Semantic shines': [
    { query: 'drug cartel crime boss' },
    { query: 'royal family british monarchy' },
    { query: 'dystopian future technology' },
    { query: 'heartwarming family stories' },
  ],
  'Try both': [
    { query: 'funny office workplace' },
    { query: 'dark crime mystery' },
    { query: 'true crime documentary' },
    { query: 'anime japanese animation' },
  ],
}

const DEFAULT_FUZZY_THRESHOLD = 20 // 20%
const DEFAULT_SEMANTIC_THRESHOLD = 40 // 40%

export default function Home() {
  const [query, setQuery] = useState('')
  const [searchData, setSearchData] = useState<SearchResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMoreExamples, setShowMoreExamples] = useState(false)
  const [showThresholds, setShowThresholds] = useState(false)
  const [fuzzyThreshold, setFuzzyThreshold] = useState(DEFAULT_FUZZY_THRESHOLD)
  const [semanticThreshold, setSemanticThreshold] = useState(DEFAULT_SEMANTIC_THRESHOLD)
  const [showDistribution, setShowDistribution] = useState(false)
  
  // Keep track of current query for threshold changes
  const currentQueryRef = useRef('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Global "/" keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus search on "/" when not already in an input
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])


  const performSearch = useCallback(async (searchQuery: string, fuzzyT?: number, semanticT?: number, includeDist?: boolean) => {
    const trimmedQuery = searchQuery.trim()
    if (!trimmedQuery) {
      setSearchData(null)
      setError(null)
      return
    }

    currentQueryRef.current = trimmedQuery
    setIsLoading(true)
    setError(null)

    const ft = fuzzyT ?? fuzzyThreshold
    const st = semanticT ?? semanticThreshold
    const dist = includeDist ?? showDistribution

    try {
      const params = new URLSearchParams({
        q: searchQuery,
        fuzzyThreshold: ft.toString(),
        semanticThreshold: st.toString(),
      })
      if (dist) {
        params.set('distribution', 'true')
      }
      const response = await fetch(`/api/search?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Search failed')
      }

      setSearchData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setSearchData(null)
    } finally {
      setIsLoading(false)
    }
  }, [fuzzyThreshold, semanticThreshold, showDistribution])

  const debouncedSearch = useDebouncedCallback(performSearch, 300)
  
  // Debounced threshold search - only re-search if there's a query
  const debouncedThresholdSearch = useDebouncedCallback(
    (fuzzyT: number, semanticT: number) => {
      if (currentQueryRef.current) {
        performSearch(currentQueryRef.current, fuzzyT, semanticT)
      }
    },
    500
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    // Only trigger search if trimmed value changed (ignore trailing/leading spaces)
    const trimmed = value.trim()
    if (trimmed !== currentQueryRef.current.trim()) {
      debouncedSearch(trimmed)
    }
  }

  const handleFuzzyThresholdChange = (value: number) => {
    setFuzzyThreshold(value)
    debouncedThresholdSearch(value, semanticThreshold)
  }

  const handleSemanticThresholdChange = (value: number) => {
    setSemanticThreshold(value)
    debouncedThresholdSearch(fuzzyThreshold, value)
  }

  const resetThresholds = () => {
    setFuzzyThreshold(DEFAULT_FUZZY_THRESHOLD)
    setSemanticThreshold(DEFAULT_SEMANTIC_THRESHOLD)
    if (currentQueryRef.current) {
      performSearch(currentQueryRef.current, DEFAULT_FUZZY_THRESHOLD, DEFAULT_SEMANTIC_THRESHOLD)
    }
  }

  const handleDistributionToggle = () => {
    const newValue = !showDistribution
    setShowDistribution(newValue)
    if (currentQueryRef.current) {
      performSearch(currentQueryRef.current, fuzzyThreshold, semanticThreshold, newValue)
    }
  }

  const clearSearch = () => {
    setQuery('')
    setSearchData(null)
    setError(null)
    currentQueryRef.current = ''
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      clearSearch()
    }
  }

  return (
    <main className="min-h-screen bg-background dot-grid">
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        {/* Hero section with search */}
        <div className="relative mb-10 max-w-3xl mx-auto">
          <div className="bg-card/50 backdrop-blur-sm border rounded-2xl p-8 shadow-sm">
            {/* Theme toggle and about in top right */}
            <div className="absolute top-4 right-4 flex items-center gap-1">
              <AboutSection />
              <ThemeToggle />
            </div>
            
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold tracking-tight mb-2">Netflix Search</h1>
              <p className="text-muted-foreground">
                Compare{' '}
                <code className="text-sm bg-muted px-1 py-0.5 rounded">pg_trgm</code> fuzzy matching vs{' '}
                <code className="text-sm bg-muted px-1 py-0.5 rounded">pgvector</code> semantic search
              </p>
            </div>

            <div className="relative mb-4 max-w-2xl mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search by title or describe what you're looking for..."
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="pl-10 pr-16 h-12 text-lg"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {query ? (
              <button
                onClick={clearSearch}
                className="h-5 w-5 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                /
              </kbd>
            )}
          </div>
        </div>

        {/* Threshold controls */}
        <div className="max-w-2xl mx-auto mb-8">
          <button
            onClick={() => setShowThresholds(!showThresholds)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Adjust thresholds
            <ChevronDown className={`h-3 w-3 transition-transform ${showThresholds ? 'rotate-180' : ''}`} />
          </button>
          
          {showThresholds && (
            <div className="mt-4 p-4 bg-muted/30 rounded-lg space-y-4">
              <div className="grid grid-cols-2 gap-6">
                {/* Fuzzy threshold */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">
                      <Badge variant="fuzzy" className="mr-2">Fuzzy</Badge>
                      min score
                    </label>
                    <span className="text-sm text-muted-foreground">{fuzzyThreshold}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={fuzzyThreshold}
                    onChange={(e) => handleFuzzyThresholdChange(Number(e.target.value))}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-[#5280FF]"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0%</span>
                    <span>More results ← → Higher quality</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Semantic threshold */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">
                      <Badge variant="semantic" className="mr-2">Semantic</Badge>
                      min score
                    </label>
                    <span className="text-sm text-muted-foreground">{semanticThreshold}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={semanticThreshold}
                    onChange={(e) => handleSemanticThresholdChange(Number(e.target.value))}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-[#37C38F]"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0%</span>
                    <span>More results ← → Higher quality</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              {/* Distribution toggle and charts */}
              <div className="pt-2 border-t">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showDistribution}
                    onChange={handleDistributionToggle}
                    className="rounded border-muted-foreground/50"
                  />
                  <span className="text-muted-foreground">Show score distribution</span>
                </label>
                
                {showDistribution && searchData && (
                  <div className="mt-4 grid grid-cols-2 gap-6">
                    {searchData.fuzzy.distribution && (
                      <ScoreDistributionChart
                        distribution={searchData.fuzzy.distribution}
                        threshold={fuzzyThreshold}
                        variant="fuzzy"
                        totalMatches={searchData.fuzzy.totalMatches}
                      />
                    )}
                    {searchData.semantic.distribution && (
                      <ScoreDistributionChart
                        distribution={searchData.semantic.distribution}
                        threshold={semanticThreshold}
                        variant="semantic"
                        totalMatches={searchData.semantic.totalMatches}
                      />
                    )}
                    {!searchData.fuzzy.distribution && !searchData.semantic.distribution && (
                      <div className="col-span-2 text-center text-sm text-muted-foreground py-4">
                        Run a search to see score distribution
                      </div>
                    )}
                  </div>
                )}
              </div>

              {(fuzzyThreshold !== DEFAULT_FUZZY_THRESHOLD || semanticThreshold !== DEFAULT_SEMANTIC_THRESHOLD) && (
                <button
                  onClick={resetThresholds}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Reset to defaults
                </button>
              )}
            </div>
          )}
            </div>

            {/* Examples inside hero when no query */}
            {!query && (
              <div className="text-center text-muted-foreground mt-6">
                {/* Quick examples */}
                <div className="flex flex-wrap justify-center gap-2 mb-3">
                  {QUICK_EXAMPLES.map(({ query: q, hint }) => (
                    <button
                      key={q}
                      onClick={() => {
                        setQuery(q)
                        performSearch(q)
                      }}
                      className="px-3 py-1 bg-muted hover:bg-muted/80 rounded-full text-sm transition-colors"
                    >
                      {q} <span className="text-muted-foreground/50 text-xs">({hint})</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setShowMoreExamples(!showMoreExamples)}
                    className="px-3 py-1 text-sm text-muted-foreground/70 hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    more
                    <ChevronDown className={`h-3 w-3 transition-transform ${showMoreExamples ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Expanded examples */}
                {showMoreExamples && (
                  <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
                      {Object.entries(MORE_EXAMPLES).map(([category, examples]) => (
                        <div key={category}>
                          <Badge 
                            variant={category.includes('Fuzzy') ? 'fuzzy' : category.includes('Semantic') ? 'semantic' : 'outline'}
                            className="mb-2 text-xs"
                          >
                            {category}
                          </Badge>
                          <div className="space-y-1">
                            {examples.map(({ query: q }) => (
                              <button
                                key={q}
                                onClick={() => {
                                  setQuery(q)
                                  performSearch(q)
                                  setShowMoreExamples(false)
                                }}
                                className="block w-full text-left px-2 py-1 text-sm hover:bg-muted rounded transition-colors truncate"
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm max-w-2xl mx-auto">
            {error}
          </div>
        )}

        <SearchResults data={searchData} isLoading={isLoading} originalQuery={query} />

        <footer className="mt-16 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>
            Built with{' '}
            <a href="https://neon.tech" className="underline text-[#37C38F] hover:text-[#34D59A] transition-colors">
              Neon
            </a>{' '}
            +{' '}
            <a href="https://nextjs.org" className="underline hover:text-foreground">
              Next.js
            </a>
          </p>
        </footer>
      </div>
    </main>
  )
}
