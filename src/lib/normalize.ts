// The single text-normalizing function (SPEC §7.2). Everything that compares a quote with
// source text (check:claims, the pipeline, Lab Partner's verifier) runs both through this.

/**
 * 1. Unicode NFKC (so ligatures such as "ﬁ" become "fi", and full-width forms become plain)
 * 2. ‘ ’ become ' and “ ” become "
 * 3. U+2010 to U+2015 (hyphens and dashes) and U+2212 (minus) become -
 * 4. Runs of whitespace collapse to one space, and the ends are trimmed
 */
export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}
