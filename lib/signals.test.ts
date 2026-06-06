import { describe, it, expect } from 'vitest'
import { inferSignalType } from './signals'

describe('inferSignalType', () => {
  it('classifies funding language', () => {
    expect(inferSignalType('Closed a $40M Series C round')).toBe('funding')
    expect(inferSignalType('raised seed funding')).toBe('funding')
  })
  it('classifies government contracts', () => {
    expect(inferSignalType('Awarded a DoD contract')).toBe('gov_contract')
  })
  it('classifies lease activity', () => {
    expect(inferSignalType('Current lease expiring in 2027')).toBe('lease')
  })
  it('classifies leadership changes', () => {
    expect(inferSignalType('Named new CFO')).toBe('leadership')
  })
  it('classifies expansion', () => {
    expect(inferSignalType('Opening a new office in San Diego')).toBe('expansion')
  })
  it('classifies SEC filings', () => {
    expect(inferSignalType('Filed an 8-K with the SEC')).toBe('filing')
  })
  it('falls back to other for unrecognized text', () => {
    expect(inferSignalType('quarterly newsletter')).toBe('other')
    expect(inferSignalType('')).toBe('other')
    expect(inferSignalType(null)).toBe('other')
  })
})
