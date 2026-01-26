interface LatencyNoticeProps {
  networkOverhead: number
  fuzzyProdEstimate: number
  semanticProdEstimate?: number | null
}

export function LatencyNotice({ 
  networkOverhead, 
  fuzzyProdEstimate, 
  semanticProdEstimate 
}: LatencyNoticeProps) {
  return (
    <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-3 text-center">
      <p>
        <span className="font-medium text-foreground">Running locally?</span>{' '}
        Network latency is ~{Math.round(networkOverhead)}ms from your machine to Neon.
      </p>
      <p className="mt-1">
        Estimated production latency (DB avg + ~30ms network):{' '}
        <span className="font-medium">Fuzzy ~{fuzzyProdEstimate}ms</span>
        {semanticProdEstimate && (
          <span> · <span className="font-medium">Semantic ~{semanticProdEstimate}ms</span> + embedding generation</span>
        )}
      </p>
    </div>
  )
}
