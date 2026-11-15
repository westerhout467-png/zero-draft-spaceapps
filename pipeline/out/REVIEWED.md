# Review of the AI pipeline's outputs

SPEC §7.2 asks for a human to read `review.md`, spot-check the outputs against the sources, and
record who checked and when. This file records what has been checked so far and by whom.

## 2026-11-15, by Claude (the AI coding assistant), not yet by a person

Read against the source text in `pipeline/text/`:

- **`public/data/test-outcomes.json`** (gemini-3.5-flash, read-outcomes@5): every one of the 126
  notes in Appendix A against its label and quote. The 13 "brief", 5 "no ignition" and 6 "not
  stated" labels, and the 102 "sustained" labels, follow the prompt's definitions. Two labels are
  judgment calls a person should decide:
  - F1, "no ignition", from "extinguished while the igniter was still on". The same note opens
    "Ignited briefly", so it could be read as brief.
  - P21b, "no ignition", from "Igniter broke after third attempt to ignite". The note doesn't say
    whether the sample lit.
- **`public/data/investigations.json`** (gemini-3.5-flash, extract-investigation@3): every value
  and every summary sentence of the 8 investigations against its quotes. Nothing shown contradicts
  its record. Two wordings go a little past their quotes and are left as written: PSI-62 "ground
  research" (the record's Project Type says "Ground Investigation", which the sentence doesn't
  quote) and PSI-69 "safety models" (the quote says "predictive models for combustion limits").
  Saffire-III's platform is the record's own Flight Platform field (ISS), which the record's
  description contradicts; the page says so next to it.
- **`public/data/briefing.json`** (gemini-3.5-flash, briefing@1): all 6 sentences against the stats.

## Still owed

A person's spot-check: 3 fields per investigation against the PSI records, and a sample of the
outcome labels against Appendix A (PDF pp. 111 to 121). Add a dated line here when it is done.
