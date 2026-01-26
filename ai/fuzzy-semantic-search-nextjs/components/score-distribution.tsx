'use client'

import { BarChart, Bar, XAxis, YAxis, ReferenceLine, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import type { ScoreDistribution } from '@/app/api/search/route'

interface ScoreDistributionChartProps {
  distribution: ScoreDistribution[]
  threshold: number // 0-100
  variant: 'fuzzy' | 'semantic'
  totalMatches?: number
}

export function ScoreDistributionChart({ 
  distribution, 
  threshold, 
  variant,
  totalMatches 
}: ScoreDistributionChartProps) {
  const thresholdDecimal = threshold / 100
  const color = variant === 'fuzzy' ? '#5280FF' : '#37C38F' // Neon blue / green
  const colorMuted = variant === 'fuzzy' ? '#5280FF80' : '#37C38F80' // 50% opacity

  // Add above/below threshold info to data
  const data = distribution.map(d => ({
    ...d,
    aboveThreshold: d.min >= thresholdDecimal,
  }))

  const totalInDistribution = distribution.reduce((sum, d) => sum + d.count, 0)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium capitalize">{variant} Score Distribution</span>
        {totalMatches !== undefined && (
          <span>
            {totalMatches} of {totalInDistribution} above {threshold}%
          </span>
        )}
      </div>
      
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <XAxis 
              dataKey="bucket" 
              tick={{ fontSize: 9 }} 
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide />
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload as ScoreDistribution & { aboveThreshold: boolean }
                  return (
                    <div className="bg-popover border rounded px-2 py-1 text-xs shadow-md">
                      <div className="font-medium">{data.bucket}%</div>
                      <div className="text-muted-foreground">{data.count} results</div>
                    </div>
                  )
                }
                return null
              }}
            />
            <ReferenceLine 
              x={`${Math.floor(thresholdDecimal * 10) * 10}-${(Math.floor(thresholdDecimal * 10) + 1) * 10}`}
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              strokeDasharray="3 3"
            />
            <Bar dataKey="count" radius={[2, 2, 0, 0]}>
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.aboveThreshold ? color : colorMuted}
                  opacity={entry.aboveThreshold ? 1 : 0.4}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
          <span>Included</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: colorMuted, opacity: 0.4 }} />
          <span>Filtered out</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 border-t-2 border-dashed border-foreground" />
          <span>Threshold</span>
        </div>
      </div>
    </div>
  )
}
