// Entity-name matching for source connectors. Sources query external datasets by
// company name (SEC full-text, Socrata LIKE '%name%', USASpending fuzzy recipient
// search) and those queries over-match: a search for "Apex" returns every filer
// with "Apex" in its name, "IBM" LIKE-matches "ZIBMAT". Attributing another
// entity's filing/permit to your prospect — then storing it confidence:'verified'
// and feeding it to the score + the AI narrative — is silent data corruption. So
// verified sources must confirm the result actually refers to the target company.

const CORP_SUFFIXES =
  /\b(inc|incorporated|llc|l l c|corp|corporation|co|company|ltd|limited|lp|llp|plc|holdings|group|gmbh|sa|nv|ag|the)\b/g

// Lowercase, drop punctuation + common corporate suffixes, collapse whitespace.
export function normalizeName(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[.,&/\\'"()]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(CORP_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Does `text` plausibly refer to the company `name`? Requires the company's full
// normalized core to appear as a whole-word run in the normalized text — high
// precision (avoids 'IBM' ⊂ 'ZIBMAT'), and an empty/trivial company name (core
// < 2 chars) matches nothing (stops blank-name rows from pulling the whole
// dataset). Intended for VERIFIED sources where the candidate carries a full
// entity name (SEC display_names, permit applicant, USASpending recipient).
export function nameMatches(text: string | null | undefined, name: string | null | undefined): boolean {
  const core = normalizeName(name)
  if (core.length < 2) return false
  const hay = normalizeName(text)
  if (!hay) return false
  if (hay === core) return true
  return new RegExp(`(^| )${escapeRegExp(core)}( |$)`).test(hay)
}
