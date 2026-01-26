import { describe, it, expect } from 'vitest'
import { normalize } from './normalize'

describe('normalize', () => {
  describe('basic normalization', () => {
    it('lowercases text', () => {
      expect(normalize('Breaking Bad')).toBe('breaking bad')
    })

    it('trims whitespace', () => {
      expect(normalize('  Stranger Things  ')).toBe('stranger things')
    })

    it('normalizes multiple spaces', () => {
      expect(normalize('The   Office')).toBe('office')
    })

    it('handles empty string', () => {
      expect(normalize('')).toBe('')
    })

    it('handles null/undefined gracefully', () => {
      expect(normalize(null as unknown as string)).toBe('')
      expect(normalize(undefined as unknown as string)).toBe('')
    })
  })

  describe('removes leading articles', () => {
    it('removes "the"', () => {
      expect(normalize('The Office')).toBe('office')
    })

    it('removes "a"', () => {
      expect(normalize('A Series of Unfortunate Events')).toBe('series of unfortunate events')
    })

    it('removes "an"', () => {
      expect(normalize('An Education')).toBe('education')
    })

    it('does not remove articles in the middle', () => {
      expect(normalize('Man in the High Castle')).toBe('man in the high castle')
    })
  })

  describe('removes movie/TV noise patterns', () => {
    it('removes year in parentheses', () => {
      expect(normalize('Blade Runner (1982)')).toBe('blade runner')
    })

    it('removes year in brackets', () => {
      expect(normalize('Blade Runner [1982]')).toBe('blade runner')
    })

    it('removes country codes', () => {
      expect(normalize('The Office (US)')).toBe('office')
      expect(normalize('Shameless (UK)')).toBe('shameless')
    })

    it('removes quality markers', () => {
      expect(normalize('Planet Earth (4K)')).toBe('planet earth')
      expect(normalize('Blue Planet (HD)')).toBe('blue planet')
    })

    it('removes ": The Movie" suffix', () => {
      expect(normalize('SpongeBob: The Movie')).toBe('spongebob')
    })

    it('removes ": The Series" suffix', () => {
      expect(normalize('Star Wars: The Series')).toBe('star wars')
    })

    it('removes "- The Movie" suffix', () => {
      expect(normalize('Pokemon - The Movie')).toBe('pokemon')
    })

    it('removes (Extended Cut)', () => {
      expect(normalize('Lord of the Rings (Extended Cut)')).toBe('lord of the rings')
    })

    it('removes (Director\'s Cut)', () => {
      expect(normalize("Blade Runner (Director's Cut)")).toBe('blade runner')
    })

    it('removes (Unrated)', () => {
      expect(normalize('Bad Santa (Unrated)')).toBe('bad santa')
    })

    it('removes (Theatrical)', () => {
      expect(normalize('Justice League (Theatrical)')).toBe('justice league')
    })

    it('removes (Limited Series)', () => {
      expect(normalize('Chernobyl (Limited Series)')).toBe('chernobyl')
    })

    it('removes Season N', () => {
      expect(normalize('Breaking Bad Season 1')).toBe('breaking bad')
    })

    it('removes Part N', () => {
      expect(normalize('Money Heist Part 4')).toBe('money heist')
    })

    it('removes Volume N', () => {
      expect(normalize('Stranger Things Volume 2')).toBe('stranger things')
      expect(normalize('Kill Bill Vol 1')).toBe('kill bill')
    })
  })

  describe('handles punctuation', () => {
    it('removes colons', () => {
      expect(normalize('Star Wars: A New Hope')).toBe('star wars a new hope')
    })

    it('removes apostrophes', () => {
      expect(normalize("Schitt's Creek")).toBe('schitts creek')
    })

    it('removes hyphens', () => {
      expect(normalize('Spider-Man')).toBe('spider man')
    })

    it('removes exclamation marks', () => {
      expect(normalize('Mamma Mia!')).toBe('mamma mia')
    })
  })

  describe('real-world Netflix titles', () => {
    it('normalizes "Stranger Things"', () => {
      expect(normalize('Stranger Things')).toBe('stranger things')
    })

    it('normalizes "The Queen\'s Gambit"', () => {
      expect(normalize("The Queen's Gambit")).toBe('queens gambit')
    })

    it('normalizes "Money Heist" variations', () => {
      expect(normalize('Money Heist')).toBe('money heist')
      expect(normalize('La Casa de Papel')).toBe('la casa de papel')
    })

    it('normalizes "Breaking Bad"', () => {
      expect(normalize('Breaking Bad')).toBe('breaking bad')
    })

    it('normalizes documentary titles with colons', () => {
      expect(normalize('The Social Dilemma: A Documentary')).toBe('social dilemma a documentary')
    })

    it('normalizes "13 Reasons Why"', () => {
      expect(normalize('13 Reasons Why')).toBe('13 reasons why')
    })

    it('normalizes "Ozark"', () => {
      expect(normalize('Ozark')).toBe('ozark')
    })
  })

  describe('user query normalization', () => {
    it('handles typos gracefully (just lowercases)', () => {
      // normalize doesn't fix typos, but should handle them without errors
      expect(normalize('strngr thngs')).toBe('strngr thngs')
    })

    it('handles abbreviated queries', () => {
      expect(normalize('breaking bad s1')).toBe('breaking bad s1')
    })

    it('handles queries with extra spaces', () => {
      expect(normalize('  stranger   things  ')).toBe('stranger things')
    })

    it('handles conceptual queries', () => {
      expect(normalize('shows about time travel')).toBe('shows about time travel')
    })
  })
})
