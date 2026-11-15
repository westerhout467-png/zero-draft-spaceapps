# Fields that failed verification

Written by `pipeline/scripts/verify.ts` on 2026-11-15 from the replies of `gemini-3.5-flash` to `extract-investigation@3`.

8 investigations, 48 fields and 16 summary sentences checked. **2 failed** and are "Not stated" (fields) or left out (sentences) in `public/data/investigations.json`.

A field that is null because the source does not state it is not a failure and is not listed.

## PSI-26

- **flowRange**: its quote “40 cm/s” is under 3 words, too short to prove a number.
  ```json
  {"value":{"min":40,"max":40,"unit":"cm/s"},"evidence":[{"file":"i_Investigation.txt","page":1,"quote":"40 cm/s"}]}
  ```

## PSI-98

- **flowRange**: its quote “20 cm/s” is under 3 words, too short to prove a number.
  ```json
  {"value":{"min":20,"max":20,"unit":"cm/s"},"evidence":[{"file":"i_Investigation.txt","page":1,"quote":"20 cm/s"}]}
  ```

## Human review

Read each summary against its source and spot-check 3 fields per investigation; record who checked and when in `pipeline/out/REVIEWED.md` (SPEC §7.2).
