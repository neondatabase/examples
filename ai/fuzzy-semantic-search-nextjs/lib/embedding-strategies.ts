/**
 * Embedding strategies for semantic search.
 * Different strategies include different fields for richer or simpler embeddings.
 */

export type EmbeddingStrategy = 'minimal' | 'basic' | 'rich'

export interface ShowData {
  title: string | null
  description: string | null
  director: string | null
  cast_members: string | null
  listed_in: string | null
  country: string | null
}

/**
 * Build text for embedding based on strategy
 */
export function buildEmbeddingText(show: ShowData, strategy: EmbeddingStrategy): string {
  switch (strategy) {
    case 'minimal':
      // Just title - fast but limited
      return (show.title || '').trim()

    case 'basic':
      // Title + description (original approach)
      return `${show.title || ''} ${show.description || ''}`.trim()

    case 'rich':
      // All relevant fields for comprehensive semantic matching
      const parts: string[] = []
      
      if (show.title) {
        parts.push(show.title)
      }
      
      if (show.description) {
        parts.push(show.description)
      }
      
      if (show.director) {
        parts.push(`Directed by ${show.director}.`)
      }
      
      if (show.cast_members) {
        // Truncate cast to avoid overwhelming the embedding
        const cast = show.cast_members.split(',').slice(0, 5).join(', ')
        parts.push(`Starring: ${cast}.`)
      }
      
      if (show.listed_in) {
        parts.push(`Genres: ${show.listed_in}.`)
      }
      
      if (show.country) {
        parts.push(`From ${show.country}.`)
      }
      
      return parts.join(' ').trim()

    default:
      return `${show.title || ''} ${show.description || ''}`.trim()
  }
}

export const STRATEGY_DESCRIPTIONS: Record<EmbeddingStrategy, string> = {
  minimal: 'Title only - fast but limited semantic matching',
  basic: 'Title + description - balanced approach',
  rich: 'All fields (title, description, director, cast, genres, country) - best semantic matching',
}
