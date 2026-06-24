import { describe, it, expect } from 'vitest'
import { normalizeName, nameMatches } from './match'

describe('normalizeName', () => {
  it('lowercases, strips punctuation and corporate suffixes', () => {
    expect(normalizeName('Acme Therapeutics, Inc.')).toBe('acme therapeutics')
    expect(normalizeName('ACME Holdings LLC')).toBe('acme')
    expect(normalizeName('The Vertex Group')).toBe('vertex')
  })
})

describe('nameMatches', () => {
  it('matches the same entity across suffix/punctuation variation', () => {
    expect(nameMatches('Acme Therapeutics Inc. (CIK 0001234567)', 'Acme Therapeutics')).toBe(true)
    expect(nameMatches('ACME THERAPEUTICS, LLC', 'Acme Therapeutics Inc')).toBe(true)
  })

  it('rejects a different company that merely shares a substring', () => {
    expect(nameMatches('ZIBMAT Corporation', 'IBM')).toBe(false) // substring, not whole-word
    expect(nameMatches('Acme Bank', 'Acme Therapeutics')).toBe(false) // different entity
  })

  it('matches a single-word name as a whole word within a longer name', () => {
    expect(nameMatches('Apex Holdings LLC', 'Apex')).toBe(true)
    expect(nameMatches('Apexion Systems', 'Apex')).toBe(false) // not a whole word
  })

  it('an empty or trivial company name matches nothing (no match-everything)', () => {
    expect(nameMatches('Anything At All Corp', '')).toBe(false)
    expect(nameMatches('Anything', '  ')).toBe(false)
    expect(nameMatches('', 'Acme')).toBe(false)
  })
})
