# CLAUDE.md: ZERO-DRAFT

## What we're building

ZERO-DRAFT is our entry for NASA Space Apps 2026, challenge "Flame in Freefall". It's a mission-control style web app that summarizes, ranks and interprets NASA's BASS-II microgravity fire experiments, with an AI "Lab Partner" that answers questions and drives the simulators. Every number on screen comes from NASA data or NASA's own published models.

The full plan is `docs/SPEC.md`. Before writing code for a milestone, read that milestone in SPEC §9 and every section it points to. Build only that milestone.

## Working with me

- I'm learning to code. After every change, tell me in plain words what changed, which files changed, and exactly how to check it: the command to run, what to click, what I should see.
- One milestone per session. If you notice something broken outside the milestone, tell me; don't fix it silently.
- Ask me before you add a dependency that isn't listed below, change a data shape in SPEC §6, delete files, or change any value or quote in `src/data/claims.json`.
- When a test fails, show me the failure and your fix. Never weaken, skip or delete a test to make it pass.
- If SPEC and this file disagree, this file wins. If SPEC is unclear, ask; don't guess.

## Stack (installed in M0; don't swap)

- Vite 8, React 19, TypeScript
- Tailwind CSS v4 through `@tailwindcss/vite`. There is no `tailwind.config.js`; tokens live in `@theme` in `src/index.css`.
- Recharts 3 for charts, `motion` (import from `motion/react`) for animation, lucide-react for icons, MiniSearch for text search
- Fonts: `@fontsource-variable/archivo` for our words, `@fontsource-variable/source-serif-4` for NASA's quoted words, `@fontsource-variable/jetbrains-mono` for numbers
- Vitest for tests, tsx to run scripts, unpdf to read PDF text
- Deploy on Vercel: static site plus serverless functions in `api/`
- The LLM is Groq (`GROQ_API_KEY`, `GROQ_MODEL`, e.g. `openai/gpt-oss-120b`), called with plain `fetch`, whenever `GROQ_API_KEY` is set; otherwise Gemini through `@google/genai` (`GEMINI_API_KEY`, `GEMINI_MODEL`). Only `pipeline/scripts/llm.ts` talks to either (SPEC §7.3); `api/` uses that module.
- Node 22 or newer.

## Commands

- `npm run dev`: local site
- `npm test`: unit tests (`vitest run`)
- `npm run build`: must pass before a milestone is done. It also runs `npm run build:api`, which bundles `api/_src/lab-partner.ts` into `api/lab-partner.js`
- `npm run check:claims`: confirms every quote in `src/data/claims.json` is on its stated PDF page, or its stated line of a PSI file
- `npm run llm:smoke`: sends "say ok" to the LLM with the key and model in `.env.local`; prints ok
- `npm run lab:ask -- "question"`: asks Lab Partner one question from the terminal and prints every tool, checked sentence and dropped sentence. `LAB_VERBOSE=1` also prints Gemini's raw replies
- `npm run lab:cache` (or `-- m5 lunar` for some): regenerates the suggested questions' cached answers in `src/data/labPartnerCache.json`. Read every answer against its sources before committing
- `npm run data:bass2`: rebuilds `public/data/bass2.json` and `audit.json` from the raw CSV
- The AI pipeline (SPEC §7). Each LLM script reuses the replies kept in `pipeline/out/raw/`; add `-- --fresh` to ask again. Read every generated sentence against its source before committing
  - `npm run pipeline:text`: sources to `pipeline/text/<ID>.pages.json` (no LLM)
  - `npm run pipeline:outcomes`: reads NASA's notes on each test into `public/data/test-outcomes.json`
  - `npm run pipeline:extract`, then `npm run pipeline:verify`: the investigation summaries, checked into `public/data/investigations.json`, with failures in `pipeline/out/review.md`
  - `npm run pipeline:briefing`: the dataset briefing, `public/data/briefing.json`
  - `npm run pipeline:chunks`: Lab Partner's search chunks (no LLM)

## Folder layout

```
api/_src/lab-partner.ts      Lab Partner endpoint, the source (M6)
api/lab-partner.js           the same, bundled by `npm run build:api`: what Vercel runs. Generated, never hand-edited
api/_data/chunks.json        generated search chunks (`npm run pipeline:chunks`)
vercel.json                  gives the endpoint 60 s for its two Gemini calls
pipeline/
  sources/<ID>/              raw files: NASA CSV, PSI metadata, PDFs. Never edit these.
  text/<ID>.pages.json       normalized text, split by page
  prompts/                   LLM prompts. Changing one means bumping its version line.
  out/raw/                   untouched LLM responses. Keep them; they're our evidence.
  out/review.md              fields that failed verification, for human review
  scripts/                   compile-bass2.ts, check-claims.ts, llm.ts, pipelineIo.ts, text.ts, extract.ts, verify.ts, outcomes.ts, briefing.ts, chunks.ts, lab-ask.ts, lab-cache.ts
docs/fixtures/               expected values from the verified audit. Tests must reproduce them; never edit them to make a test pass.
public/data/                 JSON the site loads. Generated, never hand-edited.
public/img/                  NASA figures we extracted, credited in sources.json
src/
  lib/route.ts               hash routes (#/, #/summarize, #/rank, #/interpret) and query params. Pure, tested. lib/useRoute.ts is the React hook.
  lib/normalize.ts           the single text-normalizing function used everywhere
  lib/physics.ts             Eq. 6.1, stretch rate, t_s. Pure, fully tested.
  lib/cabin.ts               cabin fire, toxicity and N2 dilution model. Pure, fully tested.
  lib/audit.ts               BASS-II spreadsheet checks. Pure, fully tested.
  lib/risk.ts                Orbital Risk Index. Pure, fully tested.
  lib/investigations.ts      the investigation index: what each PSI investigation tested, each fact on a verified claim. Pure.
  lib/relevance.ts           investigation relevance scoring (P1). Pure, fully tested.
  lib/outcomes.ts            the outcome reader's checks: splits Appendix A into rows, keeps a quote only if it is in its test's row. Pure, fully tested. lib/useOutcome.ts is the React hook.
  lib/investigationVerify.ts verify.ts's checks on the AI's investigation summaries. Pure, fully tested.
  lib/briefing.ts            the dataset briefing's stats and its number check. Pure, fully tested.
  lib/generatedData.ts       loads the AI pipeline's files (briefing, test outcomes, investigation summaries); each renders nothing when its file is missing
  lib/burnTwin.ts            Burn Twin state: which flame is lit, where each went out, the drain. Pure, fully tested. lib/burnStore.ts is its store and React hook.
  lib/twinLayout.ts          where things sit on the Burn Twin stage. Pure, tested.
  draw/                      canvas drawing for the stage: flames, rod, airflow, smoke, bloom. Illustration only. M5 reuses the orbit flame.
  components/twin/           the Burn Twin's parts: stage and its animation loop, gauge, annotations, controls, Eq. 6.1 inset
  lib/labPartner.ts          Lab Partner's flow: retrieve, choose tools, run them, write, check. Pure, with the LLM passed in; tested with a mock
  lib/answerCheck.ts         the checks every Lab Partner sentence passes (quotes, numbers, attribution, no orders). Pure, fully tested
  lib/labTools.ts, labToolRun.ts   the seven tools: what Gemini is told, argument checks, and running them with the views' own functions
  lib/labStore.ts, labActions.ts   the dock's transcript, and what each tool does on screen (with Undo)
  components/lab/            the dock's parts: turns, tool lines, citation chips, suggested questions, the question box
  data/claims.json           every sourced number and sentence shown in the UI
  data/labPartnerCache.json  the suggested questions' answers, generated by `npm run lab:cache`
  data/sources.json          bibliography
  components/                one component per file, under 250 lines
  views/                     AuditBar, Overview (shows BurnTwin), BurnTwin, Summarize, Rank, Interpret, LabPartnerDock
```

## Data integrity rules (non-negotiable; this is how we win "Validity")

1. **No invented numbers.** Every scientific number in the UI comes from `src/data/claims.json` (quoted from a source), from the CSV through `lib/audit.ts`, or from a function in `src/lib/` with cited inputs. Components never hardcode scientific values, including the audit counts.
2. **Every claim is clickable.** Wrap sourced values and sentences in `<Cite id="..." />`, which renders a numbered footnote. The drawer shows the verbatim quote, source, report page and PDF page, and for computed values the formula and its inputs. Row-level data shows the raw CSV cells.
3. **Quotes are machine-checked.** `check:claims` confirms each quote is on its stated page after `normalize()`. Anything unverified is hidden from the main UI.
4. **Unknown means unknown.** If a source doesn't state a value, store `null` and show "Not stated". Never fill a gap with a typical value.
5. **Alarms are earned.** Every verdict, alarm and color state (burns, out, above SMAC, sensor ceiling) comes from model state in `src/lib/`. Never trigger or style an alarm the model didn't produce.
6. **Models say where they stop.** Eq. 6.1 is for PMMA rods at 1 atm. The cabin model is for a sealed, well-mixed volume at 1 atm. Outside those ranges the UI shows "Outside tested range" and makes no prediction.
7. **Label what isn't data.** Flame drawings say "Illustration". Readouts from models say "Model". Replays calibrated from a test's own numbers say "Replay".
8. **No fake instruments.** No simulated values styled as live sensor channels. No real hardware part numbers next to model values.
9. **Scope the words.** Say "PMMA rods", not "materials". Say "in BASS-II tests", not "in space". 15.4% is a 1g research limit for PMMA rods with 4 cm/s forced flow (Olson & Ferkul 2017, cited in the BASS-II report p. 76), not a NASA-STD-6001 Test 1 result. Never say "safe"; say "extinguishes (model)" or "below the 1-hour limit".
10. **The AI never makes up numbers.** Lab Partner chooses parameters and calls tools; numbers come from `src/lib/` or verified quotes. The server strips any answer sentence containing a number it can't trace to a tool result or a verified quote.
11. **AI output is labeled.** Anything an LLM wrote shows "AI-written, checked". Every generated JSON file carries `generatedBy`, `model` and `promptVersion` fields.
12. **No NASA logos or insignia** anywhere (Space Apps rule). NASA figures and photos are allowed with a credit in `sources.json`.
13. **Secrets** live in `.env.local`, which is git-ignored. Nothing secret goes in `src/` or `public/`.

## Design rules

- Mission-control look. Tokens go in `@theme` in `src/index.css`:
  - `graphite #141518` page background
  - `window #000000` inside the frames of chambers and charts: they are windows
  - `panel #1b1c20` for overlays only (citation drawer, footnote previews, menus), never for page sections
  - `line #2a2b31` borders
  - `ink #d9d6cf` text (warm off-white), `muted #8b8880` secondary text
  - `cyan #06b6d4`: microgravity, active selection, live model values
  - `amber #f59e0b`: 1g reference, cautions, 10 ppm limit
  - `red #ef4444`: flammable region, 55 ppm limit, quarantined data
  - `emerald #10b981`: verified data and checks
- Nothing in the interface chrome is blue-tinted. Cyan and amber are only for data, live values and interactive states (focus, selection, links, footnotes). On the Overview, the flames are the only saturated light.
- Three type voices, never swapped:
  - Archivo is our interface words: headings, labels, buttons, our own sentences, and citations.
  - Source Serif 4 (`font-serif`) is NASA's own words: every quote taken from a source, verbatim, and nothing else.
  - JetBrains Mono with `tabular-nums` (the `num` utility) is for numbers that stand alone: data readouts, slider values, axis ticks, table cells, timestamps and the "Show the math" sum. Mono is never used for labels or citations.
  - A number inside a sentence or a chip is Archivo with `tabular-nums`, never Mono: Mono's wide period makes "13.6%" read "13 . 6%".
  - Test ids (O4, P22b) are Archivo semibold with `tabular-nums` (the `test-id` utility) everywhere, so O4 never reads as "04".
- Citations are scientific footnotes. `<Cite>` is a small cyan superscript number, ¹ ² ³ in order of appearance on the current view (a claim cited twice keeps its number), with no brackets and no mono. Hover or keyboard focus shows a one-line preview (source short name plus page or line); a click opens the drawer.
- Square or near-square corners (`rounded-none` or `rounded-sm`), 1px borders, small `+` corner ticks on instrument panels. No gradients or emoji in the interface chrome. Only the flame illustrations may use blur and glow.
- **Every view has one signature motion** (listed in SPEC §5). Make it excellent and keep everything else still.
  - Animate with `motion` or `requestAnimationFrame` plus refs; never re-render the whole page every frame.
  - Under `prefers-reduced-motion`, every animation becomes an instant state change.
- Never rely on color alone. Pair every status color with a text label or icon.
- Desktop-first: 1440×900 is the demo size, and nothing may break at 1280 wide. Text in charts is at least 12px so it reads in a video.
- Sentence case and plain words. Buttons say what they do ("Drain oxygen", "Show source").
- No uppercase or letter-spaced labels anywhere.
- No "·" separators in titles. Use a comma or a plain word ("Earth, 1g").
- Frames and corner ticks only on instrument panels (chambers and charts), never on text sections, and only at a panel's four outer corners.
- At most one status badge per screen.
- Text sections sit on the page background, not in a lighter box. Chambers and charts are windows: black inside their frames.
- Spacing is on an 8px grid, with 24px gutters.
- Visible keyboard focus everywhere.

## Interaction details

Adapted for this app from Rauno Freiberg's Web Interface Guidelines, https://interfaces.rauno.me (source: github.com/raunofreiberg/interfaces). Credit to Rauno for the ideas; the rules below are ours, in our words.

1. Interaction animations take 200 ms or less. Only a view's signature motion may run longer.
2. Motion is in proportion to the element: a drawer slides from just off screen, a popover fades or scales from about 95%, a pressed button shrinks a few percent. Nothing grows from zero.
3. Things people trigger again and again (footnote previews, menus, row hover) appear without animation.
4. Looping motion (a pulsing flame, a playing replay) pauses when it is off screen or the tab is hidden.
5. Values that change every frame (slider readouts, strip charts, flame shapes) go to the DOM through refs, an SVG attribute or a canvas, never through React state on each frame.
6. Numbers that update in place use `tabular-nums`, so their width never jumps.
7. Hover and selected states never change font weight; they change color or a border, so nothing shifts.
8. Anything the pointer can do, the keyboard can do, with a visible focus ring. Lists you step through (leaderboard rows, test tiles) also move with arrow keys.
9. Icon-only buttons carry an `aria-label`. A drawing built from HTML or SVG (a chamber, a flame) carries one label for the whole picture, so a screen reader doesn't read its parts.
10. Hover previews and tooltips hold no buttons or links, also open on keyboard focus, close on Esc, and stay open while the pointer moves onto them. A disabled control gets no tooltip.
11. Small targets (footnote numbers, chart points, slider thumbs) get a hit area larger than what they draw, without covering their neighbors.
12. Clicking a label focuses its control. Text inputs sit in a `<form>`, so Enter submits (the Lab Partner box).
13. Toggles (quarantine, units, layers) take effect at once, with no confirm step. A submit button is disabled while its request runs, so a question is never sent twice.
14. Feedback appears next to what caused it: a check beside "Copy", an outline on the field that is wrong. No toasts in a corner.
15. Glows, blurs and other decorative layers set `pointer-events: none`, so they never block a click. Large blurs stay on the flame illustrations and must still hold 60 fps.

## Definition of done (every milestone)

- `npm test` and `npm run build` pass with zero TypeScript errors.
- Each acceptance criterion for the milestone in SPEC is met, and you've told me how you checked it.
- No errors in the browser console; animations hold 60 fps on my laptop.
- You've told me how to see it working.
- Commit with a message naming the milestone, e.g. `M2: burn twin`.
