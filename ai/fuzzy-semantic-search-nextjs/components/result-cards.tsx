'use client'

import { Blend } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { SearchResult, HybridResult } from '@/app/api/search/route'

export function ScoreRing({ score, size = 28 }: { score: number; size?: number }) {
  const percentage = score * 100
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference
  
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/50"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-foreground/70 transition-all duration-300"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium">
        {percentage.toFixed(0)}
      </span>
    </div>
  )
}

export function ResultCard({ result }: { result: SearchResult }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">{result.title}</CardTitle>
          <ScoreRing score={Number(result.score)} />
        </div>
        <CardDescription className="flex items-center gap-1.5 mt-1 text-xs">
          <Badge variant="secondary" className="text-xs">{result.type}</Badge>
          {result.release_year && <span>{result.release_year}</span>}
          {result.rating && <span>• {result.rating}</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-1.5">
        {result.director && (
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground/70">Director:</span> {result.director}
          </p>
        )}
        {result.cast_members && (
          <p className="text-xs text-muted-foreground line-clamp-1">
            <span className="text-foreground/70">Cast:</span> {result.cast_members}
          </p>
        )}
        {result.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{result.description}</p>
        )}
        {result.listed_in && (
          <div className="mt-2 flex flex-wrap gap-1">
            {result.listed_in.split(', ').slice(0, 3).map((genre) => (
              <Badge key={genre} variant="secondary" className="text-[10px] px-1.5 py-0">
                {genre}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function HybridResultCard({ result }: { result: HybridResult }) {
  const inBoth = result.sources.length === 2
  return (
    <Card className={`h-full ${inBoth ? 'ring-1 ring-primary/30' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">{result.title}</CardTitle>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="outline" className="shrink-0 text-xs">
              RRF: {result.rrfScore.toFixed(4)}
            </Badge>
          </div>
        </div>
        <CardDescription className="flex items-center gap-1.5 mt-1 text-xs flex-wrap">
          <Badge variant="secondary" className="text-xs">{result.type}</Badge>
          {result.release_year && <span>{result.release_year}</span>}
          <span className="text-muted-foreground">•</span>
          {result.sources.map((source) => (
            <Badge 
              key={source} 
              variant={source} 
              className="text-[10px] px-1.5 py-0"
            >
              {source === 'fuzzy' ? `F#${result.fuzzyRank}` : `S#${result.semanticRank}`}
            </Badge>
          ))}
          {inBoth && (
            <Badge variant="default" className="text-[10px] px-1.5 py-0 gap-0.5">
              <Blend className="h-2.5 w-2.5" />
              both
            </Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-1.5">
        {result.director && (
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground/70">Director:</span> {result.director}
          </p>
        )}
        {result.cast_members && (
          <p className="text-xs text-muted-foreground line-clamp-1">
            <span className="text-foreground/70">Cast:</span> {result.cast_members}
          </p>
        )}
        {result.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{result.description}</p>
        )}
        {result.listed_in && (
          <div className="mt-2 flex flex-wrap gap-1">
            {result.listed_in.split(', ').slice(0, 3).map((genre) => (
              <Badge key={genre} variant="secondary" className="text-[10px] px-1.5 py-0">
                {genre}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
