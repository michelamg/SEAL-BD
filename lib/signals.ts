import type { SignalType } from './scoring'

// Maps free-text trigger descriptions to a structured signal type. Used to
// normalize the legacy `companies.trigger_signal` text and any source connector
// output into the typed signals the scoring engine consumes. First match wins.
// Prefix tokens use \w* so a stem matches its inflections (expan → expansion,
// expanding; relocat → relocating, relocation; appoint → appointed). A trailing
// \b alone would (wrongly) reject those longer forms.
const SIGNAL_KEYWORDS: [RegExp, SignalType][] = [
  [/\b(series\s+[a-e]|seed|raise(?:s|d)?|funding|round|venture|investment)\b/i, 'funding'],
  [/\b(8-?k|10-?k|10-?q|s-1|sec filing|prospectus|registration statement)\b/i, 'filing'],
  [/\b(contract|award|dod|defense|gsa|federal|government)\b/i, 'gov_contract'],
  [/\b(lease|expir\w*|relocat\w*|sublease|sublet|renewal)\b/i, 'lease'],
  [/\b(expan\w*|new (office|facility|hq|location)|opening|relocation)\b/i, 'expansion'],
  [/\b(ceo|cfo|coo|cto|chief|appoint\w*|named|new (exec|leader)|leadership)\b/i, 'leadership'],
  [/\b(hir\w*|headcount|jobs|growing the team|workforce)\b/i, 'hiring'],
]

export function inferSignalType(text?: string | null): SignalType {
  if (!text) return 'other'
  for (const [re, type] of SIGNAL_KEYWORDS) {
    if (re.test(text)) return type
  }
  return 'other'
}
