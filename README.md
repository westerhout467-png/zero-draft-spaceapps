# ZERO-DRAFT

**NASA Space Apps Challenge 2026, "Flame in Freefall".**

ZERO-DRAFT turns NASA's 129 BASS-II fire tests on the International Space Station into a mission-control console. It audits NASA's raw data, ranks what the orbit tests measured, runs NASA's own published relations live, and has an AI Lab Partner that answers questions, drives the simulators and cites the page for every sentence.

> **Before submitting, fill in every line marked TODO** and re-check this file against the 2026 Project Submission Guide.

| | |
|---|---|
| Team | TODO: names |
| Demo video (30 s or less, public, English subtitles) | TODO: link |
| Live app | TODO: Vercel URL |
| Source | https://github.com/westerhout467-png/zero-draft-spaceapps |

## The idea

NASA's own BASS record says spacecraft materials are screened with an Earth test "without consideration of low gravity effects" (PSI-26). BASS-II shows why that matters:

- A PMMA rod that goes out at 15.4% oxygen in 1g (with 4 cm/s forced flow) kept burning to about 13.5% in BASS-II. In NASA's fitted Eq. 6.1, at a gentle 2 cm/s airflow the limit is 13.61%, 1.79 points lower (BASS-II report, p. 76).
- The most dangerous airflow is the gentle kind: NASA calls it a "Goldilocks" zone "typical of spacecraft ventilation flows near surfaces" (p. 76).
- NASA's Earth test gives the igniter about 25 s; in orbit, ignitions took up to 230 s (p. 68, p. 69).

**Every number on screen can be clicked.** It opens the source's exact words, checked by script against the PDF page or file line it cites, or the formula and inputs it was calculated from.

## What's in it

| View | What it does |
|---|---|
| **Audit bar** (every view) | NASA's raw PSI-25 CSV, audited row by row: 129 tests, 122 with usable final oxygen, 7 quarantined (5 physically impossible, 2 missing), 4 with CO above the sensor's range, 18 sensor warnings, 3 date errors. |
| **Overview: Earth vs Orbit Burn Twin** | Two PMMA rods on one stage. "Drain oxygen" lowers O2 from 17% to 13%: the Earth flame goes out at 15.4%, the orbit flame at its Eq. 6.1 limit for the airflow and rod size you set. |
| **Summarize** | All 129 tests on a wall, with filters, each record's raw CSV cells, and a quarantine bay. Each tile carries what NASA's own note says the flame did (AI-read, quote checked), beside what the sensors confirm, and the two can be filtered and compared. For each impossible O2 value it shows the arithmetic that reproduces it from NASA's Appendix A (e.g. P22b: 19.1 + 20.0 = 39.1). A "Checked against NASA" panel compares our recomputed statistics with the report's, "Investigations" gives an AI summary of each of the eight challenge-named investigations with a footnote on every sentence, and "Record inconsistencies" lists five places where NASA's PSI investigation records contradict themselves (e.g. Saffire-I's record carries SAME's dates). |
| **Rank** | The Orbital Risk Index of 8 BASS-II sample types (formula below), the flammability map (Eq. 6.1's U-curve), the ignition race (25 s Earth igniter vs. rod response times), and the challenge-named investigations (BASS, BASS-II, Saffire-I/II/III, SAME, FLEX, PSI-62) ranked by relevance to NASA's two lunar lander atmospheres, every cell a checked quote or "Not stated". |
| **Interpret** | A cabin fire simulator: what a fire does to O2, CO2 and CO in a sealed volume at 1 atm, with alarms at the 10 and 55 ppm CO limits. Presets: replay Test M5, move that fire into the US Lab, a small sealed cabin, N2 dilution, and a 34% O2 lunar lander atmosphere, where it refuses to predict and says why. |
| **Lab Partner** (dock on every view) | Answers questions, runs the tools that change the views (with Undo), and cites the source of every sentence. |

## How the models were checked against NASA

- **Physics** (`src/lib/physics.ts`): Eq. 6.1, the stretch rate and the solid response time. The tests reproduce the values in `docs/SPEC.md` §8.1 within 0.01, e.g. a = 9.441 s⁻¹ and an O2 limit of 13.611% at U = 2 cm/s, d = 6.35 mm.
- **Cabin model** (`src/lib/cabin.ts`): gas amount (Eq. 1.3), Huggett's 13.1 kJ per gram of O2, PMMA stoichiometry (Eq. 1.1), NASA's CO-per-CO2 averages, and the N2 dilution model (Eq. B.2). The tests reproduce every value in §8.2 within 0.5%. On screen it is checked against NASA: Test M5's O2 replay, which starts from the test's own CO2 and CO cells, its CO (996 ppm from the model: 9 ppm at the start plus 987 from the fire, against the sensor's ">1,000 ppm full scale" over-range), and the US Lab (2.3 ppm from the model against the report's "1.5 ppm").
- **Audit** (`src/lib/audit.ts`): reproduces every count and test id in `docs/fixtures/`, which were worked out from the raw CSV independently.
- **Quotes**: `npm run check:claims` confirms all 145 quotes are on their stated PDF page or file line.
- **Limits stated on screen**: Eq. 6.1 is for PMMA rods at 1 atm. The cabin model is for a sealed, well-mixed volume at 1 atm, with no scrubbing and no exposure time. Outside those ranges the app makes no prediction.

## The Orbital Risk Index

ZERO-DRAFT's composite of measured BASS-II indicators. **It is not a NASA rating.**

```
index = 100 × Σ(wᵢ · cᵢ) / Σ(wᵢ)      over two components, each scored 0 to 1 across the 8 ranked types
```

1. **Low-O2 burning**: the lowest final O2 among a type's burn-confirmed tests (lower scores higher).
2. **CO yield**: the median ppm of CO per 1% CO2 over its burn-confirmed tests (higher scores higher).

A test is "burn-confirmed" when its O2 is usable and CO2 rose by at least 0.2%, twice the sensor's resolution. The weights are adjustable and start equal.

The caveats are shown on screen. Low-O2 burning also reflects what was tested: slab tests never started below 17.9% O2, and rods had 8 to 25 burn-confirmed tests each against 3 to 4 for slabs. CO yield also reflects flow direction, since slabs were only tested in opposed flow. The top two types are 0.2 points apart at equal weights. Ignition time is deliberately not in the index: the solid response time depends only on a rod's diameter, so it would be the same number on Earth.

## Investigation relevance

Which of the challenge-named investigations can say most about a lunar habitat? The targets are the two atmospheres NASA Glenn names for the lunar lander and rover: 21% O2 at 14.7 psia and 34% O2 at 8.2 psia (Zayac 2024). **The weights are our judgment call, not a NASA rating.**

```
relevance = 100 × (0.35 atmosphere + 0.25 gravity + 0.20 phenomena + 0.10 spacecraft materials + 0.10 test table)
```

- **Atmosphere**: half for O2 within half a point of the tested range, half for pressure within 0.3 psi of it.
- **Gravity**: half for microgravity (none ran in lunar gravity), 0 for a ground study.
- **Phenomena**: the share of ignition, flame spread, extinction, suppression and detection the record names.
- Anything a record doesn't state scores 0 and shows "Not stated".

For 21% O2 at 14.7 psia, BASS-II and BASS tested both the O2 and the pressure. For 34% O2 at 8.2 psia, nothing indexed did: the closest is FLEX's pressure range, with liquid droplets.

## How Lab Partner works

1. **Retrieve**: MiniSearch picks the 6 best of 686 passages from the BASS-II report, the PSI records and the Zayac 2024 poster.
2. **Choose tools**: the LLM picks up to 3 of 7 tools (set the Burn Twin, run a cabin preset, change the cabin, open a view, filter the tests, highlight a ranked type, open a source).
3. **Run them**: on the server, with the same functions the views use. Each value comes back with the claim behind it.
4. **Write**: the LLM answers as JSON sentences, each citing a passage quote or a tool value.
5. **Check**: the server drops any sentence whose quote isn't in its passage, whose numbers aren't in what it cites, that tells the crew what to do, or that credits the report or BASS-II without citing them. If nothing is left, it replies "The indexed sources don't answer this." The dock says how many sentences were dropped and why.

**What the checks can't do:** they prove every quote and number is real, not that a sentence uses them correctly. The cached answers for the suggested questions were each read against their sources by a person before they were committed.

## NASA data used

| Source | Identifier |
|---|---|
| Burning and Suppression of Solids–II (BASS–II) Summary Report, Olson et al., NASA, 2021 | NASA/TM-20210011385, https://ntrs.nasa.gov/citations/20210011385 |
| BASS-II test data (PSI-25), including the raw experimental table CSV, NASA PSI Data Repository | DOI 10.60555/4qc4-de67 |
| Burning and Suppression of Solids (BASS), PSI-26 | DOI 10.60555/58h4-dy80 |
| Concurrent Flame Spread Modeling … with Comparison to BASS Experiments, PSI-62 | DOI 10.60555/e9xp-ex83 |
| Flame Extinguishment Experiment (FLEX), PSI-69 | DOI 10.60555/mbq8-0451 |
| Spacecraft Fire Safety Experiment-I (Saffire-I), PSI-98, with its experimental table | DOI 10.60555/0t15-1z43 |
| Spacecraft Fire Experiment-II (Saffire-II), PSI-99 | DOI 10.60555/2chp-m469 |
| Spacecraft Fire Experiment-III (Saffire-III), PSI-100 | DOI 10.60555/040q-4h36 |
| Smoke and Aerosol Measurement Experiment (SAME), PSI-102 | DOI 10.60555/gd4k-8h62 |
| Flammability of Materials on the Moon (poster), Zayac, Johnston, Ruff and Ferkul, NASA Glenn, 2024 | https://ntrs.nasa.gov/citations/20240015307 |
| Olson & Ferkul, Microgravity Flammability Boundary for PMMA Rods in Axial Stagnation Flow, Combustion and Flame 180 (2017) 217–229 | cited through the BASS-II report, Ref. 23 |

No NASA logos or insignia are used anywhere.

## Other resources

- **npm packages**: React, React DOM, Vite, TypeScript, Tailwind CSS (`@tailwindcss/vite`), Recharts, Motion, lucide-react, MiniSearch, `@google/genai`, unpdf, Vitest, tsx, oxlint, `@vitejs/plugin-react`, and type packages. Versions are in `package.json`.
- **Fonts** (SIL Open Font License, via Fontsource): Archivo, Source Serif 4, JetBrains Mono.
- **Interaction guidelines** adapted from Rauno Freiberg's Web Interface Guidelines, https://interfaces.rauno.me.
- **Design skill** used while building: `emil-design-eng` by Emil Kowalski (MIT License), in `.claude/skills/`.
- **LLM APIs**: Groq (`openai/gpt-oss-120b`) for Lab Partner, with Google Gemini as the fallback; Google Gemini (`gemini-3.5-flash`) for the offline pipeline (test outcomes, investigation summaries, briefing).

## Use of AI

**Yes.**

- **Code**: Claude Code (Anthropic) wrote the application code, directed and reviewed by the team. Commits it made carry a `Co-Authored-By: Claude` line.
- **Lab Partner**: an LLM (Groq, `openai/gpt-oss-120b`; Gemini when no Groq key is set) chooses tools and writes the answers. Every answer shows **"AI-written, checked"**.
- **Test outcomes**: an LLM (Google `gemini-3.5-flash`) read NASA's "Test observations" note for each test in Appendix A of the BASS-II report and said what the flame did (sustained, brief, no ignition, or not stated). A script keeps an outcome only if its quote is in that test's own row. Shown as **"AI-read from NASA's notes, quote checked"**, apart from the sensors' verdict. The notes describe a sustained flame in 102 tests against the 65 the sensors confirm, including 19 of the 25 SIBAL fabric tests whose fires were too small for the sensors.
- **Investigation summaries**: the same Gemini model summarized each investigation from NASA's own PSI record of it. A script keeps a value or sentence only if its quote is in that record and its numbers are in the quote; the rest is "Not stated" and listed in `pipeline/out/review.md`. Shown as **"AI-written, checked"**.
- **Dataset briefing**: 4 to 6 sentences written by the same Gemini model from the audit's statistics only. A sentence is kept only if every number in it is in those statistics; `npm test` runs that check. Shown as **"AI-written, numbers checked"**.
- **Cached answers**: the suggested questions' answers in `src/data/labPartnerCache.json` were written by the same LLM, checked by the server, then reviewed by hand.
- **How AI output is checked**: the quote check, number check, attribution check and no-orders rule above, plus human review of the cached answers.
- **Metadata**: every generated JSON file carries `generatedBy`, `model` and `promptVersion` (`model` is null where no LLM was involved). Prompts are in `pipeline/prompts/` with version lines, and every raw LLM reply is kept in `pipeline/out/raw/`.
- **No AI images or video.** The flames are drawings rendered in code and labelled "Illustration". The demo video is a screen recording of the app.

## Run it

Needs Node 22 or newer.

```bash
npm ci
```

Create `.env.local` (it's git-ignored; never commit it):

```
GROQ_API_KEY=your Groq key
GROQ_MODEL=openai/gpt-oss-120b
```

```bash
npm run dev
```

| Command | What it does |
|---|---|
| `npm test` | unit tests |
| `npm run build` | type-check and build the site and the Lab Partner endpoint |
| `npm run check:claims` | confirm every quote is on its stated page or line |
| `npm run llm:smoke` | check the LLM key works: prints `ok` |
| `npm run lab:ask -- "question"` | ask Lab Partner from the terminal |
| `npm run pipeline:outcomes`, `pipeline:extract`, `pipeline:verify`, `pipeline:briefing` | re-run the AI pipeline (reuses the kept replies; `-- --fresh` asks again) |

## Deploy on Vercel

1. Import the GitHub repository in Vercel. The framework preset is **Vite**: build command `npm run build`, output directory `dist`.
2. In **Project → Settings → Environment Variables**, add `GROQ_API_KEY` and `GROQ_MODEL` (`openai/gpt-oss-120b`).
3. Deploy. `vercel.json` gives the `/api/lab-partner` function 60 s for its two LLM calls.
4. Check it:
   - Open `/api/lab-partner` in a browser. It should say `{"error":"Ask with POST."}`.
   - Open the site, open Lab Partner and ask a question. A tool line and checked sentences should appear.
5. **Limits**: Groq's free tier allows 1,000 requests a day but 8,000 tokens a minute, about one live question a minute for everyone. The cached suggested questions don't count against it.

## Known limitations

- **Orbital Risk Index**: low-O2 burning is shaped by how many tests each type had and how low they started, and CO yield by flow direction. Both are stated on screen.
- **Eq. 6.1 source**: the PDF's text layer garbles the equation, so it can't be a checked quote. The drawer shows it as printed (report p. 75), and `check:claims` confirms its four coefficients are on that page in that order; a test confirms they are the ones the model uses.
- **Cached answers**: all six suggested questions are cached (Groq, `openai/gpt-oss-120b`), each read against its sources. The 39% answer says "the initial O2 reading was blank" where the uncalibrated initial reading was; its citation chip opens the exact Appendix A row.
- **Narrow screens**: at 1280 px wide with the Lab Partner dock open, the Burn Twin's labels crowd. The demo size is 1440 × 900. Below 1024 px (a phone) the app says it needs a wider screen, with a button to show it anyway.
- **Investigation index**: the relevance ranking on Rank is built from quotes we checked by hand-written claims, not from the AI summaries. SAME-R has no record in our sources. No ISS cabin atmosphere is quoted in our sources, so relevance is scored against the lunar atmospheres only.
- **AI-read outcomes**: the reader judges each test from NASA's one-line note, so a terse note can be read differently by a different model or prompt. Every outcome shows the quote it rests on. 9 of 129 read "Not stated": 3 tests aren't in Appendix A and 6 notes don't describe the flame. A flame the crew put out by changing the airflow counts as sustained, however soon it went out: it was burning until then.
- **AI summaries**: 2 of 48 extracted fields failed the quote check and read "Not stated" (`pipeline/out/review.md`).
