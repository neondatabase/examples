/**
 * Normalize text for fuzzy matching.
 * Removes noise, lowercases, and simplifies for better trigram matching.
 */
export function normalize(text: string): string {
  if (!text) return ''

  let cleaned = text.toLowerCase().trim()

  // Remove common noise patterns for movies/TV shows
  const noisePatterns = [
    /\(\d{4}\)/g,                           // Year in parentheses: "(2019)"
    /\[\d{4}\]/g,                           // Year in brackets: "[2019]"
    /\((?:us|uk|au|ca)\)/gi,               // Country codes: "(US)", "(UK)"
    /\((?:hd|4k|uhd)\)/gi,                 // Quality markers: "(HD)", "(4K)"
    /:\s*(?:the\s+)?(?:movie|film|series|show)$/gi,  // Trailing ": The Movie", ": The Series"
    /\s+-\s+(?:the\s+)?(?:movie|film|series|show)$/gi, // " - The Movie"
    /\((?:extended|director'?s)\s*(?:cut|edition)?\)/gi, // "(Extended Cut)", "(Director's Cut)"
    /\((?:unrated|theatrical)\s*(?:cut|edition|version)?\)/gi, // "(Unrated)", "(Theatrical)"
    /\((?:limited|mini)\s*series\)/gi,     // "(Limited Series)", "(Miniseries)"
    /\(original\s+series\)/gi,             // "(Original Series)"
    /\bseason\s+\d+\b/gi,                  // "Season 1", "Season 2"
    /\bpart\s+\d+\b/gi,                    // "Part 1", "Part 2"
    /\b(?:vol|volume)\s*\.?\s*\d+\b/gi,    // "Vol 1", "Vol. 1", "Volume 2"
  ]

  for (const pattern of noisePatterns) {
    cleaned = cleaned.replace(pattern, '')
  }

  // Remove leading articles for better matching
  const leadingArticles = ['the ', 'a ', 'an ']
  for (const article of leadingArticles) {
    if (cleaned.startsWith(article)) {
      cleaned = cleaned.slice(article.length)
      break
    }
  }

  // Remove apostrophes entirely (for possessives/contractions like "Queen's" → "Queens")
  cleaned = cleaned.replace(/'/g, '')

  // Remove other punctuation (replace with space)
  cleaned = cleaned
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned
}
