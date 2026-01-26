'use client'

import { useState, useEffect } from 'react'
import { Star, Blend, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ResultCard, HybridResultCard } from '@/components/result-cards'
import { LatencyNotice } from '@/components/latency-notice'
import type { SearchResult, SearchResponse, HybridResult } from '@/app/api/search/route'
import type { StatsResponse } from '@/app/api/stats/route'

interface SearchResultsProps {
  data: SearchResponse | null
  isLoading: boolean
  originalQuery: string
}

function formatTime(ms: number): string {
  if (ms < 1) return `${ms.toFixed(1)}ms`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function ResultColumn({ 
  title, 
  results, 
  timeMs, 
  variant,
  error,
  isRecommended,
  normalizedQuery,
  originalQuery,
  dbAvgMs,
  embeddingsAvailable,
}: { 
  title: string
  results: SearchResult[]
  timeMs: number
  variant: 'fuzzy' | 'semantic'
  error?: string
  isRecommended?: boolean
  normalizedQuery?: string
  originalQuery?: string
  dbAvgMs?: number
  embeddingsAvailable?: boolean
}) {
  const [showQueryInfo, setShowQueryInfo] = useState(false)
  const queryWasNormalized = originalQuery && normalizedQuery && originalQuery.toLowerCase().trim() !== normalizedQuery
  
  return (
    <div className={`flex-1 min-w-0 ${isRecommended ? 'outline outline-2 outline-primary/20 rounded-lg p-3' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge variant={variant} className="text-xs">
            {title}
          </Badge>
          {variant === 'fuzzy' && queryWasNormalized && (
            <button
              onClick={() => setShowQueryInfo(!showQueryInfo)}
              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Show query normalization"
            >
              <Info className="h-3 w-3" />
            </button>
          )}
          {isRecommended && (
            <Badge variant="default" className="text-xs gap-1">
              <Star className="h-3 w-3" />
              Recommended
            </Badge>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">
            {timeMs}ms
          </div>
          {dbAvgMs !== undefined && (
            <div className="text-[10px] text-muted-foreground/70 group relative inline-flex items-center gap-0.5 cursor-help">
              {formatTime(dbAvgMs)} DB avg
              <span className="text-[8px]">(?)</span>
              <span className="absolute bottom-full right-0 mb-1 hidden group-hover:block w-48 p-2 text-[10px] bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 border border-zinc-700 dark:border-zinc-300 rounded shadow-lg z-50">
                Historical average from pg_stat_statements, not this specific query
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* Query normalization info - only shown when query was transformed */}
      {showQueryInfo && queryWasNormalized && (
        <div className="mb-3 p-2 bg-muted/50 rounded text-xs border">
          <div className="text-muted-foreground">
            <span className="font-medium text-foreground">Query normalized:</span>{' '}
            &ldquo;{originalQuery}&rdquo; → &ldquo;{normalizedQuery}&rdquo;
          </div>
        </div>
      )}
      
      {embeddingsAvailable === false ? (
        <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-lg text-center space-y-2">
          <p>Embeddings not generated</p>
          <p className="text-xs opacity-70">
            Run <code className="px-1 py-0.5 bg-muted rounded font-mono text-[10px]">npm run embed</code> to enable semantic search
          </p>
        </div>
      ) : error ? (
        <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-lg text-center">
          {error}
        </div>
      ) : results.length === 0 ? (
        <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-lg text-center">
          No results
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((result, index) => (
            <div
              key={result.show_id}
              className="animate-fade-slide-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <ResultCard result={result} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function HybridColumn({ results, embeddingsAvailable }: { results: HybridResult[]; embeddingsAvailable?: boolean }) {
  const bothCount = results.filter(r => r.sources.length === 2).length
  const fuzzyOnlyResults = embeddingsAvailable === false && results.length > 0
  
  return (
    <div className="flex-1 min-w-0 outline outline-2 outline-primary/20 rounded-lg p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge className="text-xs bg-gradient-to-r from-[#5280FF] to-[#37C38F] text-white border-0">
            <Blend className="h-3 w-3 mr-1" />
            Hybrid (RRF)
          </Badge>
          {embeddingsAvailable !== false && (
            <Badge variant="default" className="text-xs gap-1">
              <Star className="h-3 w-3" />
              Best
            </Badge>
          )}
        </div>
        {bothCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {bothCount} in both
          </span>
        )}
        {fuzzyOnlyResults && (
          <span className="text-xs text-muted-foreground">
            fuzzy only
          </span>
        )}
      </div>
      
      {results.length === 0 ? (
        <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-lg text-center">
          No results
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((result, index) => (
            <div
              key={result.show_id}
              className="animate-fade-slide-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <HybridResultCard result={result} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-6">
      {[0, 1, 2].map((col) => (
        <div key={col} className="space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="skeleton h-5 w-24 rounded-full" />
          </div>
          {[0, 1, 2].map((card) => (
            <div key={card} className="rounded-lg border p-4 space-y-3">
              <div className="flex justify-between">
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-5 w-10 rounded-full" />
              </div>
              <div className="flex gap-2">
                <div className="skeleton h-4 w-12 rounded" />
                <div className="skeleton h-4 w-16 rounded" />
              </div>
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-2/3 rounded" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function SearchResults({ data, isLoading, originalQuery }: SearchResultsProps) {
  const [stats, setStats] = useState<StatsResponse | null>(null)

  // Fetch stats when results are displayed
  useEffect(() => {
    if (data) {
      fetch('/api/stats')
        .then(res => res.json())
        .then(setStats)
        .catch(console.error)
    }
  }, [data])

  const fuzzyDbAvg = stats?.stats.find(s => s.queryType === 'fuzzy')?.avgTimeMs
  const semanticDbAvg = stats?.stats.find(s => s.queryType === 'semantic')?.avgTimeMs

  // Detect high latency (likely local development against remote Neon)
  const fuzzyNetworkOverhead = (fuzzyDbAvg && data) ? data.fuzzy.timeMs - fuzzyDbAvg : null
  const isHighLatency = fuzzyNetworkOverhead !== null && fuzzyNetworkOverhead > 200
  
  // Estimate production time: DB avg + ~30ms network (when deployed near Neon)
  const PRODUCTION_NETWORK_MS = 30
  const fuzzyProdEstimate = fuzzyDbAvg ? Math.round(fuzzyDbAvg + PRODUCTION_NETWORK_MS) : null
  const semanticProdEstimate = semanticDbAvg ? Math.round(semanticDbAvg + PRODUCTION_NETWORK_MS) : null

  if (isLoading) {
    return <LoadingSkeleton />
  }

  if (!data) {
    return null
  }

  const hasResults = data.fuzzy.results.length > 0 || data.semantic.results.length > 0
  const hasEmbeddingIssue = data.semantic.error || data.semantic.embeddingsAvailable === false

  // Show UI if we have results OR there's something to explain (error/no embeddings)
  if (!hasResults && !hasEmbeddingIssue) {
    return null
  }

  return (
    <div className="space-y-4">
      {isHighLatency && fuzzyProdEstimate && (
        <LatencyNotice
          networkOverhead={fuzzyNetworkOverhead!}
          fuzzyProdEstimate={fuzzyProdEstimate}
          semanticProdEstimate={semanticProdEstimate}
        />
      )}

      <div className="grid grid-cols-3 gap-6">
        <ResultColumn
          title="Fuzzy (pg_trgm)"
          results={data.fuzzy.results}
          timeMs={data.fuzzy.timeMs}
          variant="fuzzy"
          isRecommended={data.recommended === 'fuzzy'}
          normalizedQuery={data.fuzzy.query}
          originalQuery={originalQuery}
          dbAvgMs={fuzzyDbAvg}
        />
        <ResultColumn
          title="Semantic (pgvector)"
          results={data.semantic.results}
          timeMs={data.semantic.timeMs}
          variant="semantic"
          error={data.semantic.error}
          isRecommended={data.recommended === 'semantic'}
          dbAvgMs={semanticDbAvg}
          embeddingsAvailable={data.semantic.embeddingsAvailable}
        />
        <HybridColumn results={data.hybrid.results} embeddingsAvailable={data.semantic.embeddingsAvailable} />
      </div>
    </div>
  )
}
