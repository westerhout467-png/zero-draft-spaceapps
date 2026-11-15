# ZERO-DRAFT build spec, v2

Written Mon 9 Nov 2026. Event: Sat 14 to Sun 15 Nov 2026. Read `CLAUDE.md` first.

---

## 0. Status

**What changed from v1:** the app is now built around the team's modules: the audit bar, the Earth vs Orbit Burn Twin, SUMMARIZE, RANK, INTERPRET (the cabin fire, toxicity and suppression simulator) and the Lab Partner AI. Every module has a signature "wow" moment, and every alarm and number in it is earned from NASA data.

**Verified by script against the files:**
- 81 verbatim quotes from the BASS-II Summary Report (NASA/TM-20210011385), each pinned to its report page and PDF page, in `docs/claims.seed.json`.
- 36 verbatim quotes from the PSI metadata files for BASS (PSI-26), PSI-62, FLEX (PSI-69), Saffire-I (PSI-98, plus its CSV), Saffire-II (PSI-99), Saffire-III (PSI-100) and SAME (PSI-102), each pinned to its file and line, in `docs/claims.psi-seed.json`.
- A full audit of the raw PSI-25 CSV, in `docs/fixtures/`. These files are the expected values for tests:
  - `audit-expected.json`: every flag, its rule, its count and its test ids
  - `per-test-expected.json`: per test, the sample type, flow direction, burn confirmation, CO per CO2 and flags
  - `flow-by-test.json`: each test's flow direction with its Appendix A quote and page
  - `o2-forensics.json`: the arithmetic that reproduces the five impossible O2 values
  - `risk-components.json`: the measured Orbital Risk components
- Every value in §8.
- The stack installs, type-checks, tests and builds: React 19.3, Vite 8.3, Tailwind 4.3, Recharts 3.10, motion 14.11, Vitest 5.1, TypeScript 7.0. The Gemini SDK `@google/genai` 3.0 needs Node 22 or newer.

**Decided:**
- LLM: Gemini through `@google/genai` (§7.3). A Claude Pro plan doesn't include API access.
- The challenge's Resources tab is empty until 13 Nov. Check it then, and add any new NASA datasets to §8.5.

**Changed on 14 Nov, after M6:** the LLM is now Groq (`openai/gpt-oss-120b`) whenever `GROQ_API_KEY` is set; Gemini remains the fallback. Groq's free tier allows 1,000 requests a day but 8,000 tokens a minute, and one question uses about 6,000, so expect about one live question a minute. A paid Groq tier lifts that. The tool step no longer gets the excerpts (only the answer step needs them), which saves about 1,500 tokens a question. gpt-oss reasons before it writes and its reasoning counts against the token cap, so on Groq's reasoning models the cap is the answer's 400 plus 1,024 for reasoning: at 400 alone, Groq refused the answer as cut off. The answer stays short through the prompt (2 to 4 sentences) and the schema (at most 4).

**Found on 14 Nov (M6):**
- The Gemini key is on the free tier: **20 requests a day per model**, and a Lab Partner question takes 2. That is about 10 live questions a day for everyone, judges included. Enable billing on the key's Google AI Studio project before deploying, or live questions will mostly show "Gemini's usage limit for this key is used up for now".
- The suggested questions' cached answers were generated with `gemini-3.5-flash-lite`, because the `gemini-3.5-flash` quota was spent and the newer Flash models were overloaded. Five of six were kept after review; the lunar one asks live. Regenerate with Flash (`npm run lab:cache`), read every answer against its sources, then commit.

**Still pending:**
1. NASA sources for the ISS cabin atmosphere and lunar gravity (§8.4).
2. Optional: Saffire-III's "Experimental Details" file from PSI. Its record says the sample details are in it (`psi100.details-file`). The earlier Saffire-III image zip is only a camera-calibration checkerboard; don't use it.

---

## 1. The brief

**The challenge, verbatim:** "Your challenge is to build an SI-powered, web-based dashboard that summarizes, ranks, and interprets combustion science investigations to deliver critical foundational insights for fire safety."

**The challenge suggests users should be able to:**
- identify investigations most relevant to habitable crew environments: spacecraft, stations, lunar and Martian bases, pressurized rovers
- extract data that supports predictive modeling of flammability and fire scenarios
- highlight research that informs next-generation fire safety controls and equipment

**The challenge background names** BASS, BASS-II, Saffire-I/II/III, SAME, SAME-R and FLEX, and says Moon bases and pressurized rovers will use more oxygen at lower pressure.

**One-line pitch:** ZERO-DRAFT turns 129 ISS fire tests into a mission-control console. It audits NASA's raw data, ranks hidden orbital fire risk, and runs NASA's own validated models live, with an AI Lab Partner that explains every answer and cites the page.

**Thesis:** Earth fire screening misses how materials burn in orbit. NASA's own BASS record says it: "Current NASA spacecraft materials selection is based on a standard test method (NASA–STD–6001 Test 1) that segregates material based on 1-g behavior without consideration of low gravity effects" (`psi26.impacts`).
- The same PMMA rod that goes out at 15.4% O2 on Earth kept burning to about 13.5% in BASS-II (`bass2.flam.min-o2`, `bass2.flam.vs-1g`).
- NASA's Earth test gives the igniter about 25 s, but orbit ignitions took up to 230 s (`bass2.ign.test1-25s`, `bass2.ign.230s`).
- The most dangerous airflow is the gentle kind "typical of spacecraft ventilation flows near surfaces" (`bass2.flam.goldilocks`).

**The rule that makes the wow believable:** a NASA judge can click any number, alarm or verdict and see where it came from. The demo's big moments are big because they're true. For example:
- Test M5's predicted CO lands at the edge of the sensor's 1,000 ppm range, and in reality the sensor over-ranged.
- A fire that size crosses the 1-hour CO limit in any sealed space under about 4.5 m³.

---

## 2. What judges score, and what answers it

Criteria are from the 2024 Judging & Awards Guide. The 2026 guide comes out 13 Nov; re-check then.

| Criterion | Judges ask | ZERO-DRAFT's answer |
|---|---|---|
| Influence | Big problem or small? | Fire safety for the ISS, Artemis landers and rovers. Shows where Earth screening and NASA's data both fall short. |
| Creativity | New, or incremental? | Earth vs Orbit twin driven by NASA's equation. An AI that operates NASA's models instead of just chatting. A raw-data audit nobody else will do. |
| Validity | Can it work in the real world? | Every claim quote-checked with page numbers. Models labeled with their limits. The simulator checked against NASA's own results. Anomalies quarantined, not hidden. |
| Relevance | Answers the challenge, complete, usable | SUMMARIZE, RANK and INTERPRET views map to the prompt's three verbs. AI-powered through Lab Partner and the pipeline. Lunar atmosphere covered (honestly: there's no data). |
| Presentation | Did they explain it? Judges weight this equally. | A 30-second video with one wow per beat. |

**Awards to aim at:**
- Best Use of Science: for the strongest, most valid application of the scientific method.
- Best Use of Data: for making space data more accessible or applying it in a unique way.

**Hard rules from the 2025 Project Submission Guide** (re-check against the 2026 guide on 13 Nov):
- The demo is a video of 30 seconds or less, or 7 slides or fewer. Over the limit means ineligible for Global Judging.
- The video needs English subtitles and a public link.
- AI use must be disclosed:
  - AI images or video need a visible watermark.
  - AI code or data needs an acknowledgment in text and in metadata.
  - No NASA branding.
- You must use NASA data to be eligible for Global Awards.
- List every external resource.

---

## 3. The 30-second video (build the app backwards from this)

Rewritten on 14 Nov. Screen recording at 1440×900, captions burned in, no voice. Most judges see only this, so it shows the one thing other teams won't have: a number you click opens NASA's own words, checked by script. Rank is left out: the risk index is our weakest science and its beat crammed three actions into 5 seconds.

| Time | Screen | Action | Caption |
|---|---|---|---|
| 0–8 s | Overview (Burn Twin), dock closed | Press "Drain oxygen". The Earth flame goes out at 15.4%; the orbit flame turns blue, pulses, and goes out at 13.61%. "Kept burning 1.79 points of oxygen longer" appears. | "A PMMA rod in 1g goes out at 15.4% oxygen. In a gentle orbit airflow, NASA's model keeps it burning to 13.61%." |
| 8–13 s | Same, the header | Click footnote ¹ on the thesis line, "NASA screens spacecraft materials with a 1g test that ignores low gravity." The drawer slides in; the underline draws under "based on 1-g behavior without consideration of low gravity effects"; "Quote checked" in green. | "Every claim opens NASA's own words, checked by script against the source." |
| 13–19 s | Audit bar to Summarize | Close the drawer (Esc). Click "Quarantined 7" in the audit bar. The tiles fly into the quarantine bay; P22b's math opens: 19.1 + 20.0 = 39.1. | "We audited all 129 ISS tests in NASA's raw data. 7 readings are impossible or missing, and we show why." |
| 19–26 s | Lab Partner and Interpret | The dock is already open, with "Would a Test M5 fire be dangerous in a small cabin?" typed in. Press Enter: Interpret opens, the simulator runs at 600×, CO crosses 10 and then 55 ppm, and the answer arrives with its citation chips. | "Lab Partner runs the app's models and cites every sentence. A script checks each quote and number first." |
| 26–30 s | Close card | none | "ZERO-DRAFT. Every number traced to NASA data." Then the URL. |

**Recording notes:**
- Ask the Lab Partner beat live, not from the cache: Groq answers in about 3 seconds, and a "Cached answer" label on screen reads as canned. If the live answer is slow or weak, click the same suggested question instead (cached, instant) and keep that take.
- Before the take: Reset the Burn Twin, close the drawer, set Interpret to its first preset, and open the dock with the question typed (open the dock at the end of the Summarize beat, so the layout change happens off the important frames).
- Drain at the default 2 cm/s and 6.35 mm rod: the last frame of the drain is the one with 13.61%, 1.79 and the "now" dot clear of every label.
- Rehearse five times. Count the captions: about 2.5 words a second is the most a viewer reads.
- Keep it to 30 s or less, with English subtitles, public. Re-check the 2026 Project Submission Guide first.

---

## 4. App shell and feature overview

The app is four full-screen views, one at a time, chosen by the URL hash. The header, the audit strip, the Lab Partner dock and the citation drawer stay mounted on every view; only the main area changes.

```
+-- Zero-draft   NASA screens spacecraft materials with a 1g test that ignores low gravity.   Overview  Summarize  Rank  Interpret --+
| F0 audit strip, 40px: counts from the CSV, clickable, segment bar              |                           |
+--------------------------------------------------------------------------------+ F5 Lab Partner dock,      |
|                                                                                | full height. A 48px rail  |
| main area: one view fills it, and scrolls inside itself if it is taller        | by default, 384px wide    |
|                                                                                | when open. Transcript,    |
|                                                                                | tool lines, citation chips|
+--------------------------------------------------------------------------------+---------------------------+
F6 citation drawer slides over from the right on any view.
```

| Route | View | What fills the main area |
|---|---|---|
| `#/` | Overview | F1 Burn Twin. One black stage with Earth on the left, Orbit on the right and the oxygen gauge on the seam. Under it, a slim strip with the controls and, at its right end, the Eq. 6.1 inset. |
| `#/summarize` | Summarize | F2 telemetry explorer |
| `#/rank` | Rank | F3 Orbital Risk Index, flammability map, ignition race |
| `#/interpret` | Interpret | F4 cabin fire, toxicity and suppression simulator |

**Routing rules:**
- An unknown hash shows the Overview and rewrites the address to `#/`.
- Back and forward work, because each view change is a history entry.
- Query parameters are parsed for deep links and passed to the view as `params`: `#/interpret?preset=m5`, `#/summarize?test=P22b`. Each view reads its own parameters in the milestone that builds it. The Lab Partner's `navigate` tool uses the same links.
- A view fits a 1440×900 window without page scrolling where possible. If it is taller, the main area scrolls inside itself.
- A view change is a 150 ms crossfade, and instant under reduced motion.

**Shell:**
- Header: the product name in bold, the thesis line in full-brightness ink, and the navigation. The active view has a 2px cyan underline and nothing else.
- Audit strip: 40px, no box and no title. Its text and segment bar are F0.
- Lab Partner dock: collapsed by default. Open it from the rail button.
- Design rules (no uppercase labels, frames only on chambers and charts, an 8px grid with 24px gutters) are in `CLAUDE.md`.

**P0, all must ship:**

| Id | Module | Signature motion |
|---|---|---|
| F0 | Data hygiene audit bar | Counters tick up and the segmented bar fills once on load |
| F1 | Earth vs Orbit Burn Twin (hero) | Oxygen drain: the Earth flame dies, the orbit flame turns blue, pulses at 1.1 Hz, then goes out |
| F2 | SUMMARIZE: telemetry explorer | Quarantine toggle: anomalous test tiles fly into the quarantine bay |
| F3 | RANK: Orbital Risk Index, flammability map, ignition race | The leaderboard reorders live as weights change; the ignition race plays |
| F4 | INTERPRET: cabin fire, toxicity and suppression simulator | Live strip charts cross alarm lines while the chamber flame reacts |
| F5 | Lab Partner AI | Answers stream in; tool calls visibly drive the other modules |
| F6 | Citation drawer | Slides in, then an underline draws under the quote's emphasis phrase |

**P1:**
- F7 Investigation index: AI summaries of the challenge-named investigations, a "Why BASS-II" strip, and relevance ranking.
- F8 Real NASA flame photo reveal in F1 (Fig. 6.3).

**P2:**
- Evidence map of tested O2 and pressure
- Lab Partner voice output (Web Speech API, off by default)
- A 1D brightness profile computed from the pixels of the real Fig. 6.3 photo (the honest version of the SDSU strip)
- Print view

**Cut, with the honest replacement:**

| Old idea | Why | Replacement |
|---|---|---|
| HUD channels with ISS part numbers (CH1–CH4) | Invented sensor values next to real hardware names; the radiometer "was not calibrated" (`bass2.radiometer`) | A model readout panel labeled "Model": O2, U, a, limit, margin |
| SDSU brightness strip driven by sliders | Looks like measurement but isn't | P2: compute it from the real photo's pixels |
| SMAC alarms for a BASS-II-sized fire in the ISS | The report says 1.5 ppm, below both limits (`bass2.co.smac`) | The simulator shows when CO really crosses limits: smaller volumes or bigger fires |
| "Orbital Hazard Index" with no formula | Indefensible when a judge asks | The Orbital Risk Index: an explicit formula from measured components |
| Rule-based "AI Lab Partner" | Not AI | A real LLM with retrieval, citations and tool calls |

---

## 5. Feature specs

### F0. Data hygiene audit bar (P0)

**Purpose:** in the first second, prove the team audited NASA's raw PSI-25 CSV instead of trusting it blindly.

**What the audit found.** The rules and test ids are in `docs/fixtures/audit-expected.json`:

| Finding | Count | Tests |
|---|---|---|
| Total tests | 129 | Bhattacharjee 22, Ferkul 4, Miller 20, Olson 27, Fernandez-Pello 27, T'ien 29 |
| Final O2 usable | 122 | |
| Quarantined: final O2 impossible | 5 | B2, P22a, P22b, T28a, T28b |
| Quarantined: final O2 missing | 2 | B14, F3 |
| CO above the sensor's range | 4 | M5, O4, O12, O13b |
| Final CO missing | 5 | B2, B14, F3, P22a, T28a |
| A CO2 reading missing | 8 | B2, B14, F3, P3b, P22a, P22b, T28a, T28b |
| Negative initial CO (sensor zero drift) | 13 | B4, B21, B22, M10, O1, O2, O5a, O20, T25, T26, T27, T28a, T29 |
| Final O2 above initial, within the ±0.1 resolution | 5 | T5, T10, T12, T13, T23 |
| Date errors | 3 | T9 and T18 (year 2018, also in NASA's table); O10 (GMT 213 in the CSV, 203 in Table A.5) |

The old spec's headline counts (129, 122, 5, 2 and 4) are confirmed. Everything else in this table is new.

**The proof behind the quarantine** (`docs/fixtures/o2-forensics.json`):
- NASA's Appendix A lists both calibrated and uncalibrated O2 for every test (`bass2.table.o2-columns`). Calibrated = uncalibrated + that day's offset (`bass2.sensor.mca-offset`).
- Where an uncalibrated reading was blank, the formula produced nonsense:
  - **P22b:** the uncalibrated initial reading was blank, so the offset became 20.0. Then 19.1 + 20.0 = 39.1.
  - **T28b:** the same pattern gives 19.7 + 20.7 = 40.4.
  - **B2, P22a and T28a:** the uncalibrated final reading was blank, so the "reading" is just the offset: 1.6, 0.6 and 0.9.
- All five reproduce exactly, and each links to its Appendix A row.

**Layout:** a full-width strip under the header.
- Left, in mono: "PSI-25 raw CSV audited".
- Counters: tests, O2 usable, quarantined, CO over range, sensor warnings, date errors.
- Right: a segmented bar, one segment per test, colored by its most serious flag: red (quarantined), amber (CO over range), dim amber (other sensor warnings), emerald (clean).

**Data:** `public/data/audit.json`, produced by `npm run data:bass2` through `lib/audit.ts`. Nothing is typed in by hand.

**Signature motion:**
- On first load, the counters tick from 0 to their values over 900 ms (ease-out).
- The segments fill left to right over the same 900 ms.
- It plays once per session.

**Interaction:**
- Clicking a counter or segment opens SUMMARIZE with that filter on and the quarantine bay open.
- Hovering shows the definition, e.g. "Quarantined: final O2 missing, or physically impossible such as 39.1%".

**Acceptance:**
- `audit.test.ts` reproduces every count and test-id list in `audit-expected.json`, and every row in `o2-forensics.json`.
- There is no number literal in the component.
- Under reduced motion, the final values show immediately.

### F1. Earth vs Orbit Burn Twin (P0, hero)

**Purpose:** show the whole thesis in ten seconds without reading.

**Layout:**
- One frameless, full-bleed, pure black stage under the header and audit bar. No boxes, frames or corner ticks.
- The left half is "Earth, 1g" and the right half is "Orbit, ISS glovebox". Each is labeled once, small, at the top of its half.
- **The seam between the halves is the oxygen gauge:** a thin vertical scale from 23% at the top to 12% at the bottom, with fine tick marks and numbers in mono.
- **Two limit marks on the gauge:**
  - Left: "Earth limit 15.4%", with the line "1g limit, PMMA rods, 4 cm/s forced flow" (`bass2.flam.vs-1g`).
  - Right: "Orbit limit 13.61%, model". It is the Eq. 6.1 value for the current flow and rod size, so it moves when they change (`bass2.flam.stretch-def`, `bass2.flam.r0`, `bass2.flam.eq61-branches`).
- **The oxygen line:** the current O2 is a thin, faintly glowing horizontal line across the full stage width, at its height on the gauge, with its value riding on it at the left edge.
- Under the stage, a slim strip on the page background:
  - the controls: O2 slider (12.0–23.0%), orbit airflow U (0.2–40 cm/s, log), rod size (6.35, 9.525 or 12.7 mm) as a three-option segmented control, and the buttons "Ignite", "Drain oxygen" and "Reset"
  - at its right end, the Eq. 6.1 inset (Recharts) as a black panel: the curve for the selected rod (O2 vs flow, log x-axis), the 15.4% and 13.4% lines (`bass2.flam.vs-1g`, `bass2.flam.derate`), and a dot that moves with O2 and U. Each line is labeled where it is drawn; there is no legend, only the axis titles "Airflow, cm/s" and "Oxygen, %"
- At 1440×900 the stage, the controls and the inset are all visible without scrolling.

**Rendering:**
- One `<canvas>` for the whole stage, sharp on high-DPI screens, animated with `requestAnimationFrame` and refs. React never re-renders per frame.
- The gauge text, annotations, stamps and tags are an HTML overlay on top of it.
- Flames are light, not shapes: layered radial gradients drawn with additive blending, plus a blurred copy for bloom. No outlines.
- The flame, rod and airflow drawing are reusable functions in `src/draw/`; F4 reuses the orbit flame.
- Each rod tip sits near the center of its half. At the default settings each flame fills about a quarter to a third of its half's width.
- The flames and airflow shift a few pixels in parallax with the pointer, more than the gauge does, and the stage edges have a soft vignette.
- The loop pauses when the tab is hidden or the stage is off screen.

**Earth half (illustration):**
- The rod stands vertically like a candle, with the flame on its tip.
- A teardrop rising upward: blue base, orange-yellow body, warm white core. It flickers irregularly (a small random sway and stretch, about 10 times a second), with a faint smoke wisp rising above it.
- It goes out when O2 drops below 15.4% (`bass2.flam.vs-1g`): it collapses over 400 ms and leaves a wisp drifting up.

**Orbit half (illustration):**
- Airflow comes from the left and meets the rod's tip head-on (axial stagnation flow, the setup Eq. 6.1 was fitted for). The rod runs toward the flow from the right.
- The airflow is thin cyan-white streaks, at most about 300, moving left to right at a speed proportional to U and parting around the rod tip. They stay inside the right half.
- The flame is drawn after NASA's photos of limit flames (Fig. 6.3, `bass2.fig63`):
  - **Near quenching, (a) to (c):** a translucent blue cup wrapped around the rod tip and open downstream. It is brightest along its outer rim and fades to a soft translucent blue inside, with a thin dark gap between flame and rod. No white-hot core and no thin crescent rim (`bass2.blue-hemispherical`).
  - **At the quenching limit it is a hemisphere.** The report says the flame's length-to-width ratio "decreases incrementally to 0.5 at extinction, indicating a hemispherical flame at the quenching limit" (`bass2.aspect-0.5`). On the quenching branch the drawn cup shortens toward exactly 0.5 as the margin runs out, so the drain animates it.
  - **In fast airflow close to blowoff, (d) to (f):** the tip opens up and warm orange-yellow light trails downstream beside the rod, with blue only at the edges.
- Higher U flattens it against the tip.
- Its size and brightness scale with the margin above the Eq. 6.1 limit for the current U and rod.
- It is steady, with no flicker.
- **1.1 Hz pulse** (`bass2.osc-1.1hz`): only on the quenching branch (a < 10.38) and only when the margin is under 0.15 points.
- It goes out at the Eq. 6.1 limit: it fades over 600 ms into a faint spherical halo that doesn't rise, because there's no buoyancy.
- Both rods are clear PMMA, as in the photos: a translucent cylinder with soft highlights, the flame visible through it, a few small bubbles in the hot end, and only a faint reflection of the flame near the tip. Hovering the orbit rod's bubbles shows their source (`bass2.vapor-jet`).

**Annotations** (the model readout; every value comes from `physics.ts`; numbers in mono, words in Archivo, 12px, ink at 70%):
- A thin corner-bracket box tracks the orbit flame, labeled with the live stretch rate, e.g. "Stretch rate a = 9.44 s⁻¹".
- Under each flame, its live O2 margin to its limit, with a small "Model" tag on the orbit side. Under the orbit margin, one line on what the drawn shape is based on: "Nears a hemisphere at the quenching limit" (`bass2.aspect-0.5`) on the quenching branch, "Shape drawn after NASA's photos of limit flames" (`bass2.fig63`) on the blowoff branch.
- A footnote marker never touches a unit or an exponent: a space comes first. Each label has one marker. A label that needs several sources cites a computed claim (`twin.stretch-rate`, `twin.orbit-limit`, `twin.gap`), whose drawer lists them all.
- O2 is on the oxygen line and its slider, U is on its slider, and each limit is on the gauge.
- No fake sensor channels and no hardware part numbers.

**Ignite:**
- The orbit rod won't light below 14.5% O2. It shows "Won't ignite below ~14.5% (BASS-II rods)" (`bass2.ign.limit-14.5`).
- Flames lit higher can survive lower O2 (`bass2.ign.survive-13.6`).
- A flame also won't light below its own limit. The Earth side shows "Won't stay lit below 15.4%"; the orbit side shows "Below the Eq. 6.1 limit at this airflow (model)".

**Drain oxygen, the signature motion:**
1. Both flames are lit at 17.0%.
2. O2 falls linearly to 13.0% over 10 s of display time, and the oxygen line sinks with it like a falling tide. A small caption on the line reads "In BASS-II, oxygen fell gradually as the flame burned" (`bass2.o2-gradual`).
3. Each flame goes out the moment the line passes its own limit mark.
4. At 15.4% the Earth flame collapses over 400 ms and is stamped "Out at 15.4%" beside it.
5. The orbit flame shrinks, turns blue, pulses, and is stamped "Out at 13.61% (model)" beside it, at the U = 2 cm/s, 6.35 mm defaults.
6. The stamps appear with a 200 ms fade and a slight scale from 0.96.
7. The result "Kept burning 1.79 points of oxygen longer" appears beside the gauge, in the gap between the two marks, with Cites. The 1.79 is computed, not typed. If the orbit flame went out first (very low flow), it reads "Went out … points of oxygen sooner".
8. P1: a "Show NASA's photo" button opens the real Fig. 6.3 image with its credit (`bass2.fig63`).

Moving the O2 slider during a drain stops the drain.

**Labels:**
- Each half has a small "Illustration" tag in its bottom corner.
- The drawings are not to scale, and no scale bar is drawn.

**Acceptance:**
- At U = 2 and 6.35 mm, the drain stops the Earth flame at 15.40 and the orbit flame at 13.61 (±0.01).
- The pulse appears only under the conditions above.
- It holds 60 fps at 1440×900: the canvas and every per-frame value are driven by `requestAnimationFrame` plus refs, never by React state per frame.
- Under reduced motion there is no flicker, pulse, parallax or drifting particle, and states change instantly (the drain jumps to its end).
- Every number has a working Cite.
- The moment where the Earth flame is out and the orbit flame glows blue above the sinking oxygen line is worth a screenshot.

### F2. SUMMARIZE: telemetry explorer (P0)

**Purpose:** make 129 messy ISS test records explorable and trustworthy.

**The test wall:**
- 129 tiles in a grid, grouped into columns by PI and ordered by date. The three date errors are shown flagged, never silently fixed.
- Each tile shows the test id in mono. Its fill uses a sequential cyan scale for initial O2.
- Corner glyphs show flow direction and status as well as color.

**Flow direction** comes from `docs/fixtures/flow-by-test.json`. The CSV has no flow column; NASA's Appendix A does.
- 120 tests have it, each with its Appendix A quote: 67 opposed, 38 concurrent, 15 stagnation.
- 9 are "Not stated":
  - O1 and O2 show "?" in NASA's table.
  - T1, T2, T4 and T15 come from a table without a flow column.
  - O20, O21 and O22 were run in 2016 and aren't in the appendix.

**Quarantine toggle, the signature motion:**
- Turned on, anomalous tiles lift out of the wall and fly into a "Quarantine bay" panel on the right over 500 ms (motion `layout`).
- Each lands with a reason chip, e.g. "Final O2 39.1%: impossible", "Final O2 not recorded", "CO over range: OR".
- Each impossible-O2 tile has a "Show the math" button that expands its forensic line from F0, e.g. "19.1 + 20.0 = 39.1", with a Cite to its Appendix A row.
- Turned off, they fly back.

**Burn confirmation:**
- A test counts as "burn confirmed by sensors" if its O2 is usable and CO2 rose by at least 0.2%: twice the 0.1% resolution of the CO2 sensor (`bass2.sensor.co2-res`).
- 65 of 129 tests qualify.
- SIBAL fabric never passes: its largest CO2 rise is 0.07%. Label those tiles "Fire too small for the sensors", never "didn't burn".
- F2b gives the real outcome from NASA's notes.

**Filters:** PI, sample type, flow direction, O2 range, burn confirmed. Summary numbers animate between values.

**Record drawer:** click a tile to see:
- every field
- the raw CSV cell text behind each parsed value
- flags, and CO per CO2 when burn is confirmed
- the flow direction with its Appendix A quote
- Cites to the PSI-25 dataset and the report's appendix table

**"Checked against NASA" panel:** our numbers recomputed from the raw CSV, beside the report's.

| Recomputed from the CSV | NASA's report | Cite |
|---|---|---|
| Opposed slabs: median 367 ppm CO per 1% CO2 (18 tests) | about 370 | `bass2.co.370` |
| Concurrent and stagnation rods together: median 539 (18 tests) | concurrent rods about 550. The report doesn't say how it grouped stagnation tests; say so on screen. | `bass2.co.550` |
| Opposed rods: median 118, ranging 23 to 389 (18 tests) | "very nonlinear" | `bass2.co.opposed-rods` |
| Lowest final O2 with confirmed burning: 13.6% (O4) | flames survived to 13.6% | `bass2.ign.survive-13.6`, `bass2.note.o4` |
| Lowest usable final O2: 13.5% (O12) | O12 had no sustained flame at any flow | `bass2.note.o12` |

**F2b. AI test-outcome reader (P1, built in M7):**
- Gemini reads NASA's test observations column (`bass2.table.observations`) on the Appendix A pages (PDF pp. 111–121).
- For each test it returns: sustained flame, brief ignition only, no ignition, or not stated, plus a verbatim quote.
- Quotes are verified on their page; failures become "not stated".
- Tiles then show the outcome, labeled "AI-read from NASA's notes, quote checked".
- This is a second, separate use of AI on real NASA records, and it fixes the SIBAL blind spot.

**As built (M7, 15 Nov):**
- `pipeline/scripts/outcomes.ts`, prompt `pipeline/prompts/read-outcomes.md` (version 5 after four revisions), checks in `src/lib/outcomes.ts`.
- Three calls, not one per page: the tests are grouped by principal investigator (46, 51 and 29 notes), because the free tiers allow few requests a day. The shipped file was read by `gemini-3.5-flash`; the prompt was developed on Groq's `openai/gpt-oss-120b`, one page per call, and those replies are kept in `pipeline/out/raw/superseded/`.
- Each page is first split into one row per test (a test id followed by its sample number opens a row), and the model is given only each row's notes, under its test id: what follows the row's last run of eight sensor readings. It can't give one test's note to its neighbour, and the input is under half the size. A quote is kept only if it is in that test's own row, which is stricter than "after its id on the page". Rows whose answer fails the check are asked once more, together.
- Result (15 Nov): 102 sustained, 13 brief, 5 no ignition, 9 not stated (3 not in Appendix A, 6 whose note doesn't describe the flame). No quote failed the check. O4 is sustained, O12 no ignition, F2, F3 and T28a brief; tests hold all five.
- What the outcomes mean, as the prompt defines them. No ignition: the note says so, or a flame existed only with the igniter on. Brief: the note calls it brief or a flash, or it "would not sustain", or it went out by itself before the crew changed anything. Sustained: a flame that was burning on its own, including one that went out when the crew changed the flow ("extinguished at 0.36" after "decreased flow" is a quenched flame, not a brief one). The test's own note decides, never the report's summary of that sample type.
- Not stated has two reasons, shown wherever the outcome is: "Not in Appendix A" (O20, O21, O22, run in 2016) and "NASA's note doesn't describe the flame". The file keeps the §6 shape; which reason applies comes from the flow evidence in `bass2.json`, which already records each test's Appendix A page (or none). A test checks that no "not stated" outcome is a failed quote check in disguise.
- On screen: a mark at each tile's bottom right (filled flame, flame outline, bar, three dots) with a key under the wall; an outcome line in the brief under the wall; and in the record a section "What NASA's notes say", apart from "Burn check", so a SIBAL test can read "Fire too small for the sensors" and "Outcome: Sustained flame".
- What the reader found is said in three places, every number counted by `outcomeFindings()` from `bass2.json` and `test-outcomes.json`: a sentence under the SUMMARIZE headline ("Sensors confirm 65 burns. NASA's notes … describe a sustained flame in 102 tests, including 19 of the 25 SIBAL tests too small for the sensors": 25, not 27, because two SIBAL tests are quarantined and so "not checked"); a row in "Checked against NASA", "Sensors and NASA's notes disagree", with the count and the test ids in both directions (an empty direction reads "none"); and an "Outcome (AI-read)" filter beside "Burn confirmed by sensors" (`?outcome=` in the URL).

**AI dataset briefing** (collapsible, top of the view):
- 4–6 sentences written by the pipeline (§7.2) from the computed stats JSON only.
- A script fails the build if any number in the text isn't in the stats JSON.
- Label: "AI-written, numbers checked"
- As built (M7): `pipeline/scripts/briefing.ts` with `pipeline/prompts/briefing.md`; the stats are `briefingStats()` in `src/lib/briefing.ts` (the audit's counts and the "Checked against NASA" statistics, rounded as on screen). `checkBriefing()` keeps a sentence only if every number in it is in the stats (as written or rounded to fewer decimals), it has no number in words, and it doesn't say "safe", "in space" or "NASA's errors"; with fewer than 4 sentences left nothing is written. `npm test` runs the same check on `public/data/briefing.json`..

**Distribution strip:** small-multiple bar charts of initial O2, ΔO2 and CO-per-CO2.

**Wording:** "Spreadsheet anomalies we flagged". Never "NASA's bugs". A cause like an "MCA offset" is a guess unless a source says so.

**Acceptance:**
- Counts and per-test values match `audit-expected.json` and `per-test-expected.json`.
- The "Checked against NASA" values match within 1 ppm.
- Every tile is reachable by keyboard.
- The quarantine animation is instant under reduced motion.
- The briefing's number check runs in `npm test`.

### F3. RANK: hidden orbital risk (P0)

#### F3a. Orbital Risk Index leaderboard

**What it ranks:** BASS-II sample types with at least 3 burn-confirmed tests. In the real data that's 8: PMMA rods of 6.35, 9.525 and 12.7 mm, and PMMA slabs of 1 to 5 mm (`docs/fixtures/risk-components.json`).

**"Hidden" risk** means how much more dangerous a sample type looks in BASS-II than Earth screening would suggest, built only from measured or cited quantities.

**Components.** Two, each measured in BASS-II's orbit tests and scored 0–1 by min–max across the 8 ranked sample types:
1. **Low-oxygen burning:** the lowest final O2 among burn-confirmed tests. Lower means riskier. Min–max across the 8 ranked sample types.
   - Label it honestly, under its slider caption, computed from bass2.json: "Also reflects what was tested: slab tests never started below 17.9% O2; rod tests started as low as 13.6%. And how often: rods had 8 to 25 burn-confirmed tests each, slabs 3 to 4, and a lowest value only drops as tests are added." The first two are the lowest starting O2 of usable slab and rod tests (`risk.lowestInitialO2`); not 16.8%, which is the lowest final O2 a slab reached. The counts are `risk.burnCountRange`.
2. **CO yield:** the median ppm of CO per 1% CO2 over burn-confirmed tests, kept to 0.1 as shown (so the index can be redone from the screen). Min–max across the 8 ranked sample types.
   - Its hover, and its slider caption, add: "Also reflects flow direction: slabs were only tested in opposed flow; rods mix flow directions." This is disclosed, not corrected: comparing within opposed flow only was checked on 14 Nov and rejected. Opposed rods scatter from 23 to 389 ppm per % within one rod size (the report calls them "very nonlinear", `bass2.co.opposed-rods`), so medians of 4 to 9 such tests would rank noise.
Each is a computed claim with its formula in the drawer: `rank.low-o2`, `rank.co-yield`, and the index itself `rank.index`.

**The ignition gap is not a component** (changed 14 Nov). It was t_s ÷ 25 s, scored 1 − 25/t_s. But t_s = 0.7r²/α_s depends only on the rod's diameter: there is no gravity in it, so it would be the same number on Earth and says nothing about orbital risk. In the index it put the 12.7 mm rod first purely for being the thickest. It is still measured on each rod (`docs/fixtures/risk-components.json` keeps it) and the ignition race (F3c) shows it. Under the formula, the view says: "Ignition time isn't in the index: a rod's t_s comes from its diameter alone, the same on Earth as in orbit. The ignition race below shows it." (`rank.solid-time`).

**Heat release is not a component.** The CSV has no burn times, and heat is calculated from O2 use anyway, so it would double-count.

**Measured values** (the test fixture; the ignition gap column is measured but not in the index):

| Sample type | Tests | Burn confirmed | Low-O2 burning | CO yield (ppm per %) | Ignition gap |
|---|---|---|---|---|---|
| PMMA rod 6.35 mm | 31 | 25 | 14.3% | 310.7 | 2.352 |
| PMMA rod 9.525 mm | 14 | 9 | 13.6% (O4) | 291.4 | 5.292 |
| PMMA rod 12.7 mm | 9 | 8 | 14.2% | 334.1 | 9.409 |
| PMMA slab 1 mm | 4 | 3 | 18.4% | 386.5 | none |
| PMMA slab 2 mm | 4 | 4 | 17.1% | 400.8 | none |
| PMMA slab 3 mm | 4 | 4 | 16.8% | 359.8 | none |
| PMMA slab 4 mm | 4 | 4 | 17.4% | 325.2 | none |
| PMMA slab 5 mm | 4 | 4 | 17.4% | 344.4 | none |

**Not ranked, with the reason shown on screen:**
- SIBAL fabric (27 tests): no fire moved the sensors past their resolution.
- PMMA thin films (22 tests): only 2 burn-confirmed.
- PMMA sphere section (2 tests): too few.
- Nomex (3 tests): didn't ignite (`bass2.nomex`). Shown as a finding card that says "none of the three sustained a flame (`bass2.nomex`); F3 had only a brief ignition flash (`bass2.note.f3`)", each clause with its own footnote, because NASA's Appendix A note on F3 reads "Brief ignition flash, no sustained flame".
- Wax candle (1 test): shot a burning droplet upstream (`bass2.wax-droplet`). Shown as a finding card. The card quotes `bass2.wax-droplet`; "upstream" is only in the Fig. 3.1 caption (PDF p. 54), which has no verified claim yet, so the card doesn't say it.
- A ranked type whose weights sum to 0 over its own components: "Not scored at these weights".

**Formula:**

```
index = 100 × Σ(wᵢ · cᵢ) / Σ(wᵢ)    over its two components, low-O2 burning and CO yield
```

- Default weights are equal. Weights run 0 to 1 in 0.05 steps, and at least one slider always stays above 0.
- Each row shows its tests and burn-confirmed tests, e.g. "4 tests, 4 burn confirmed". (Every ranked type has both components, so a coverage count would always read "2 of 2".)
- If a sample type's weights over its own components sum to 0, it shows "Not scored at these weights" and moves to the unranked list. Never divide by zero. With the real data this can't happen (every ranked type has both components and one weight always stays above 0), but the code keeps the guard.
- Ties sort by sample type id.
- With equal weights the index is: slab 2 mm 63.5, rod 12.7 mm 63.3, rod 6.35 mm 51.5, rod 9.525 mm 50.0, slab 3 mm 47.9, slab 1 mm 43.5, slab 5 mm 34.6, slab 4 mm 25.9. The top two are 0.2 apart: don't present the leader as a finding.

**Layout** (pure black stage, in the Overview's language: no cards, borders or shadows; rows separated by space, not lines):
- A headline above the leaderboard, Archivo about 20px, computed by `risk.leaderHeadline` and updating live with the weights: "{leader} tops the index at these weights, {margin} points ahead of {second}. Its biggest factor: {phrase}." The margin comes from the two indexes as shown (to 0.1), so it matches the screen; if they show the same index it reads "{leader} and {second} share the top of the index at these weights." The biggest factor is the component with the largest weighted share. Phrases: low-O2 "it burned down to {v}% oxygen ({test})"; CO yield "it made a median {v} ppm CO per 1% CO2". No hardcoded numbers.
- Rows with large rank numerals in JetBrains Mono (muted, the leader's in ink), the name, the index value large in JetBrains Mono beside it, and a "risk fingerprint": one wide horizontal bar filling the rest of the row. Its length is the index on a 0–100 scale shared by every row, split into one segment per component; each segment's length is that component's weighted share, wᵢcᵢ ÷ Σwᵢ × 100 (`risk.componentShares`), so the segments add up exactly to the index. Two cyan intensities with 2px gaps (cut from the segment's fill, so lengths stay exact), the component name inside each segment when it fits, and a matching swatch beside each slider label. A missing component is a short dashed slot labelled "Not measured".
- Weight sliders above the list. At 1440×900 the leaderboard and its sliders fit in the first screen; the map and the race sit below.
- Hovering or focusing a segment shows the measured value, the n tests, its 0–1 score and its footnote number and source; clicking the segment opens the citation drawer. (A hover preview holds no buttons, CLAUDE.md interaction 10, so the segment itself is the citation.) Arrow keys move between segments and rows.
- Under the title, muted: "ZERO-DRAFT Orbital Risk Index: our composite of measured BASS-II indicators. Not a NASA rating."

**Signature motion:** moving a weight slider reorders the rows live (motion `layout`, 350 ms, the strong ease-in-out `cubic-bezier(0.77, 0, 0.175, 1)`), and each bar's segments resize in the same 350 ms. Nothing else moves while it plays.

**Acceptance:** `risk.test.ts` covers:
- the measured values in `risk-components.json`, recomputed from the real CSV
- normalization (min–max for low-O2 burning and CO yield), and the ignition gap measured but left out of the scores
- missing components, and "Not scored at these weights" without dividing by zero
- the rule: fewer than 3 burn-confirmed tests, or fewer than 2 components, means not ranked
- the equal-weight index values above
- reordering when weights change, and ties by sample type id
- identical output on repeat runs

#### F3b. Flammability map (Olson's U-curve)

- x is forced flow U (cm/s, log, 0.2–40); y is O2 % (12–23).
- **Curve:** Eq. 6.1 for the selected rod.
  - Above it, "Flame sustained (model)", lightly tinted red.
  - Below it, "Extinguishes (model)".
- **Reference lines:**
  - 15.4%, amber dashed: "1g limit, PMMA rods, 4 cm/s forced flow" (`bass2.flam.vs-1g`).
  - 13.4%, cyan dotted: "Blowoff branch extrapolated to zero stretch: the report's conservative space limit" (`bass2.flam.derate`).
- **Hatched band** below 1 cm/s: "Flow uncertain" (`bass2.flam.low-flow-uncertain`).
- **BASS-II rod tests** as a rug of short ticks on the O2 axis: the final O2 of each of the 42 burn-confirmed rod tests. They aren't plotted against flow, because the CSV's airflow cells are sequences of settings (e.g. "5 down to ext"), not one value. Caption: "Final O2 of burn-confirmed BASS-II rod tests".
- It shares state with F1, so moving a control in one moves the other: dragging its (flow, O2) point (or arrow keys on it) and its rod-size control move the Overview, and back.
- U-curve in cyan, the sustained region a faint red wash, 15.4% amber dashed and 13.4% cyan dotted. Labels are written directly on the lines; there is no legend box.

#### F3c. Ignition race

- A horizontal timeline from 0 to 250 s.
- The "NASA Test 1 igniter" bar stops at 25 s.
- Markers for t_s: 6.35 mm at 58.8 s, 9.525 mm at 132.3 s, 12.7 mm at 235.2 s.
- A marker at 230 s: "Longest successful BASS-II ignition".
- **Signature motion:** a Play button sweeps a cursor across, the Test 1 bar is stamped "Earth test ends", and each rod marker lights as the cursor passes.
  - The cursor is a thin cyan streak with a short fading tail. When it reaches a rod's t_s, a small flame lights on that rod's marker. One "Illustration" tag covers all three flames. The Test 1 bar is stamped "Earth test ends" at 25 s.
  - The race time is labelled "Play clock", top left.
- Cites: `bass2.ign.ts-def`, `bass2.ign.alpha-pmma`, `bass2.ign.test1-25s`, `bass2.ign.230s`, `bass2.ign.test1-too-short`.

#### F3d. Investigation relevance (P1)

Relevance of each indexed investigation to the ISS and lunar atmospheres, from F7.

**As built (14 Nov):** a section at the bottom of RANK (`components/rank/InvestigationRelevance.tsx`, `RelevanceTable.tsx`; logic in `lib/investigations.ts` and `lib/relevance.ts`). The targets are Zayac's two lunar lander and rover atmospheres (`zayac.atmospheres`); no source in our set states the ISS cabin atmosphere. Every fact is a verified claim (PSI record lines, the BASS-II report, the CSV for BASS-II's O2 range) or null. Scoring as F7 Output 2: atmosphere is half for O2 within 0.5 point of the tested range and half for pressure within 0.3 psi; gravity is 0.5 for microgravity (nothing ran in lunar gravity) and 0 for a ground study; phenomena is the share of the five the record names; materials counts only where NASA calls what was burned spacecraft materials (Saffire-III's sentence is copied from Saffire-I's, so it isn't counted). Results: for 21%/14.7 psia, BASS-II 73.5, BASS 59.5, Saffire-I 58, FLEX 38, Saffire-II 30.5, SAME 26.5, Saffire-III 20.5, PSI-62 4; for 34%/8.2 psia nothing matches both, FLEX's pressure range is the closest.

### F4. INTERPRET: cabin fire, toxicity and suppression simulator (P0)

**Purpose:** a real-time "what if" for a fire in a sealed volume, built from NASA's own validated relations, with alarms only when the model earns them.

**Model:** `src/lib/cabin.ts`, pure and tested. Equations and test values are in §8.2.

**Inputs:**
- volume V (m³)
- total pressure; the model runs only at 1 atm
- initial O2 %, CO2 % and CO ppm
- fire power P (W)
- burn geometry: opposed slab, 370 ppm CO per 1% CO2 (`bass2.co.370`), or concurrent rod, 550 (`bass2.co.550`)
- for rods: rod size and airflow U, used for extinction by Eq. 6.1
- N2 flow r (cm³/min) and its start time
- duration

**Each simulated second:**
1. **N2 dilution of every species** (Eq. B.2 applied stepwise): multiply O2, CO2 and CO by `exp(−r·dt/V)`. N2 enters, and well-mixed gas leaks out.
2. **If the flame is burning:**
   - O2 consumed (mol) = P·dt ÷ 13,100 J/g ÷ 32 g/mol
   - ΔO2 % = consumed ÷ n_total × 100, where n_total = P·V/(R·T) per Eq. 1.3
   - CO2 rises by (5/6)·ΔO2 % (Eq. 1.1)
   - CO rises by ratio × (5/6)·ΔO2 %
3. **Extinction:**
   - Rods: the flame goes out when O2 drops below the Eq. 6.1 limit for U and rod size.
   - Slabs: there's no boundary equation, so the flame burns for the set duration. The UI says "Burn length set by you: no extinction model for slabs".
4. **Alarms**, appended to an alarm log with sim time:
   - CO ≥ 10 ppm: amber, "Above the long-term SMAC (10 ppm)".
   - CO ≥ 55 ppm: red, "Above the 1-hour SMAC (55 ppm)" (`bass2.co.smac`).
   - For the MSG preset, CO ≥ 1,000 ppm: "At the CSA-CP sensor's ceiling" (`bass2.co.sensor-range`).
   - Note on screen: "Shows concentration crossing a limit value; exposure time isn't modeled."

**Presets:**

| Preset | Setup | What it shows |
|---|---|---|
| **Replay Test M5** | V 0.25 m³, O2 22.2%, CO2 0.44% and CO 9 ppm (what the MSG held before M5: its Table A.4 row, `bass2.table.a4-m5`, and its CSV cells), P 83.48 W (derived from Table 5.1: 3.2 points of O2 in 27.2 min), opposed slab, 27.2 min, no N2. The other fire presets start from clean air. | O2 22.2 to 19.0 (a replay: by construction). The fire adds 2.67% CO2 from stoichiometry vs 2.78% measured (CSV: 0.44 to 3.22), so the replay ends at 3.11% against the CSV's 3.22%. CO ends at 996 ppm: the 9 ppm it started with plus 987 ppm from the stoichiometric CO2, or 1,038 ppm with the measured CO2 (9 + 1,029). The sensor read ">500" in the CSV and Table A.4; the report text says it over-ranged at ">1,000 ppm full scale" (`bass2.co.over-range`). Both fit about 1,000 ppm. Then the incident card: Rick ignited it during loss of signal with the ground (`bass2.note.m5-los`), the window damage, the leak repaired, and Mastracchio's door repair (`bass2.m5.window`, `bass2.m5.leak-repaired`, `bass2.m5.door-repair`). Caption: "A consistency check, not proof: the 370 ppm average has large scatter" (`bass2.co.scatter`). |
| **Move that fire into the US Lab** | Same fire, V 106 m³ (`bass2.us-lab-volume`) | CO about 2.3 ppm, below both limits. The report says about 1.5 ppm for a BASS-II-scale fire (`bass2.co.smac`, `bass2.cabin-dilution`). |
| **Same fire, small sealed cabin** | Same fire; a volume slider from 1 to 40 m³ | The 1-hour limit (55 ppm) is crossed below about 4.5 m³ for opposed slabs and 6.7 m³ for concurrent rods. The long-term limit (10 ppm) below about 24.7 and 36.7 m³. Assumptions shown: sealed, well mixed, no scrubbing, 1 atm, same fire. |
| **Nitrogen dilution in the glovebox** | V 0.25 m³, 6.35 mm rod, U 2 cm/s, O2 20.9%, small fire (5 W), r 493 cm³/min (`bass2.cstr.n2-flow`) | The flame goes out when O2 falls below 13.61%. N2 alone would take about 3.6 h; the fire's own O2 use shortens that, and the simulator shows the real time. With N2 alone at U = 20 cm/s: about 2.8 h. The report says dilution "typically took 1 to 3 h" (`bass2.cstr.hours`). Caption: "BASS-II used N2 dilution to set test oxygen levels, not to fight fires." When the flame goes out, a card: "Keep suppressing until it cools" (`bass2.vapor-jet`, `bass2.suppress-until-cool`). |
| **Lunar habitat: 34% O2 at 8.2 psia** | Atmosphere from Zayac 2024 | A banner, and no prediction: "BASS-II's solid-material tests ran at 1 atm (`bass2.pressure-1atm`). FLEX tested 0.5 to 1.5 atm, which includes 8.2 psia (0.56 atm), but it burned liquid droplets, not solids (`psi69.pressure`, `psi69.droplets`). No investigation we indexed covers solid cabin materials at this pressure, so ZERO-DRAFT won't predict here." |

**Layout:**
- **Left:** the orbit chamber component from F1, live. It is used only when the geometry is a rod; slabs get a flat slab illustration.
- **Center:** three stacked strip charts sharing a time axis: O2 % (with the Eq. 6.1 limit line), CO2 %, and CO ppm (with 10 and 55 ppm lines, plus the 1,000 ppm line for the MSG).
- **Right:** big mono readouts, the alarm log ("T+14:32 CO passed 55 ppm"), and the inputs.
- **Bottom:** play/pause, speed (1×, 60×, 600×) and a scrubber.

**Signature motion:** the strip charts draw live. When a line crosses a threshold, that threshold band fills with its color, the readout flashes once, and an entry slides into the alarm log.

**"Checked against NASA" panel:**

| Check | Model | NASA | Cite |
|---|---|---|---|
| Dilution time with N2 only (no fire), 20.9% to the blowoff limit at 20 cm/s | 169 min (2.8 h) | "typically took 1 to 3 h" | `bass2.cstr.hours` |
| M5 O2, 22.2% to 19.0% | 19.0% | Table 5.1 row M5 | `bass2.m5.row` (labeled "replay, by construction") |
| M5 CO | 996 ppm: 9 at the start plus 987 from the stoichiometric CO2, or 1,038 ppm with the measured CO2 (9 + 1,029) | ">500" in the CSV and Table A.4; ">1,000 ppm full scale" in the report text | `bass2.co.over-range` |
| Biggest test diluted into the US Lab | ≈ 2.3 ppm | "~1.5 ppm" for a BASS-II-scale fire | `bass2.co.smac` |

**Acceptance:**
- `cabin.test.ts` reproduces every §8.2 value.
- 600× speed runs without jank: the model steps in a worker or batched loop, and the charts update at most 30 times per second.
- Pressure other than 1 atm disables prediction.
- Alarms come only from model state.

### F5. Lab Partner AI (P0): the "SI" in the challenge

**Name:** the report thanks "our lab partner Astronauts" (`bass2.lab-partner`).

**Dock:**
- A collapsible panel, full height on the right of every view. It is a 48px rail by default and 384px wide when open (§4).
- The transcript is mission-control style, with mono timestamps ("T+00:12").
- Answers stream in.
- After each sentence come citation chips, and clicking a chip opens F6.

**How it works** (`api/lab-partner.ts`, §7.1):
- Retrieval over the report and other source chunks, plus tool calls into the same `src/lib/` functions the UI uses.
- The LLM picks tools and writes the explanation.
- Numbers come only from tool results or verified quotes.

**Tools:**
- `set_burn_twin({ o2Pct?, flowCmS?, rodMm?, action?: 'ignite' | 'drain' | 'reset' })`
- `run_cabin_preset({ preset: 'm5' | 'us-lab' | 'small-cabin' | 'n2-dilution' | 'lunar' })`
- `set_cabin({ volumeM3?, powerW?, geometry?, rodMm?, flowCmS?, n2FlowCcMin?, n2StartMin?, durationMin? })`
- `navigate({ view: 'overview' | 'summarize' | 'rank' | 'interpret', params? })`: goes to the view's route with the same query parameters as the deep links in §4, e.g. `{ view: 'interpret', params: { preset: 'm5' } }`
- `filter_tests({ pi?, geometry?, quarantine?: boolean })`
- `highlight_risk_entity({ id })`
- `open_citation({ claimId })`

Each module belongs to one view: `set_burn_twin` to Overview, `filter_tests` to Summarize, `highlight_risk_entity` to Rank, `run_cabin_preset` and `set_cabin` to Interpret. When the module's view isn't showing, the server runs `navigate` to that view first, and the transcript line says so.

**Signature motion:** when Lab Partner calls a tool, a line appears in the transcript ("Lab Partner → Interpret: ran Replay Test M5") with an Undo. The changed controls pulse cyan once, and the view scrolls to them.

**Answer rules** (enforced by the server):
- Use only the excerpts and tool results.
- Every factual sentence carries a quote from a chunk or a tool result id.
- Any sentence with a number not found in a tool result or a verified quote is dropped.
- If the question can't be answered, reply exactly "The indexed sources don't answer this."
- No orders to crews. Say "the report suggests…", never "you should…".

**Suggested questions.** They're cached, answer instantly, and are labeled "Cached answer":
1. "Why are gentle cabin breezes dangerous?" Sets the burn twin to 2 cm/s and drains.
2. "What happened in Test M5?" Runs Replay Test M5.
3. "Would a Test M5 fire be dangerous in a small cabin?" Runs the small-cabin preset.
4. "How long should suppression continue after a fire goes out?" Cites p. 52.
5. "Does NASA have fire data for a 34% oxygen lunar habitat?" Runs the lunar preset; cites BASS-II's 1 atm and FLEX's 0.5–1.5 atm droplet tests.
6. "Why did some oxygen readings say 39%?" Navigates to `#/summarize?test=P22b`, opens the quarantine bay on P22b and shows the math.

**Limits:**
- 400 output tokens.
- 10 requests per minute per IP.
- The key comes from an environment variable.

**Acceptance:**
- An out-of-scope question gets the refusal.
- Mocked-LLM unit tests strip a fake quote and an untraceable number.
- Cached questions work with the network off.
- Every tool call changes the UI visibly and can be undone.

**As built (M6):**
- Six suggested questions: the five in M6's prompt plus "Why did some oxygen readings say 39%?" from the list above. A cached answer says "Cached answer" and has "Ask live", which asks the server the same question.
- Answers stream as events: the stages ("Searching NASA's sources…", "Checking every quote and number…"), each tool as it runs, then each sentence once it has passed the checks. Sentences can't stream before they are checked, so the checked sentences arrive one by one.
- On top of §7.1's checks, the server also drops a sentence that credits "the report" or "BASS-II" without citing them (a Zayac or FLEX quote is not BASS-II), and one with JSON braces in its text. The dock says how many sentences were dropped and why, never what they said.
- Undo restores every store and the address as they were before that tool ran, so undoing a line also undoes the lines after it.
- The checks prove every quote and number is real; they can't prove a sentence uses them correctly. During M6 a weaker model put the US Lab's 1.5 ppm into a small-cabin answer as if it applied there. The answer prompt now lists such traps, and every cached answer must be read before it is committed.

### F6. Citation drawer (P0, global)

**`<Cite id>`** renders a scientific footnote: a small cyan superscript number, ¹ ² ³ in order of appearance on the current view (the header counts as part of every view; a claim cited twice keeps its number), in Archivo with no brackets. Hover or keyboard focus shows a one-line preview: the source's `short` name plus page, line or row ("BASS-II report, p. 76", "PSI-26, line 69", "PSI-25, row 129"); computed values say "Calculated from cited inputs". A click opens the drawer.

**The drawer shows:**
- the claim text
- the verbatim quote in Source Serif 4 at 18px, with a 2px cyan rule on the left and no fill; if the claim has an `emphasis`, only that phrase gets a thin underline
- directly under the quote, the status line with its icon: emerald "Quote checked" or red "Not verified"
- the source title, report page and PDF page (or file and line) as a compact two-column list, and "Open the source"
- for computed values, the formula, then every source in words, each with its own Cite
- for data rows, the raw CSV cells

Unverified claims never appear outside the drawer.

**Signature motion:** slides in over 220 ms, then the underline draws under the emphasis phrase, left to right across line breaks.

**Accessibility:** focus moves into the drawer and is trapped; Esc closes it and returns focus.

**Acceptance:** `check:claims` fails if a Cite id used in `src/` is missing, or a quote isn't on its stated page.

### F7. Investigation index (P1)

**Sources we have** (in `pipeline/sources/`; quotes in `docs/claims.psi-seed.json`):

| PSI id | Investigation | What it is |
|---|---|---|
| PSI-25 | BASS-II | Our core: report, CSV and bibliography |
| PSI-26 | BASS | BASS-II's predecessor. Its objective is to "bridge the gap" with NASA-STD-6001 Test 1 (`psi26.objective-test1`). |
| PSI-62 | Concurrent flame spread modeling | Computer models checked against BASS data (`psi62.modeling`) |
| PSI-69 | FLEX | Liquid fuel droplets in the Combustion Integrated Rack; limiting oxygen at 0.5–1.5 atm; CO2, He and SF6 suppressants (`psi69.*`) |
| PSI-98 | Saffire-I | A 0.94 m × 0.4 m SIBAL sheet burned in a Cygnus cargo ship at 20 cm/s, plus a 2-row data table (`psi98.*`) |
| PSI-99 | Saffire-II | 9 samples, 5 × 29 cm: SIBAL, silicone, PMMA, PMMA with Nomex. Compares low-g limits with NASA's screening test (`psi99.*`). |
| PSI-100 | Saffire-III | SIBAL again, in a Cygnus, at 30 cm/s instead of Saffire-I's 20 cm/s, concurrent or opposed. Same goal of comparing with NASA's screening test (`psi100.*`). |
| PSI-102 | SAME | Smoke from overheated spacecraft materials, for future fire detectors (`psi102.*`) |

**Catalog problems the extraction should surface.** Show these in the Library as "Record inconsistencies":
- Saffire-I's PSI record lists dates 03-02-2001 to 02-28-2008, identical to SAME's record (`psi98.start`, `psi98.end`, `psi102.start`, `psi102.end`). Its follow-on, Saffire-II, lists 2016–2017.
- Saffire-I's and Saffire-III's Flight Platform fields say "International Space Station (ISS)", while their own text says they ran on a Cygnus after it left the ISS (`psi98.platform-field`, `psi98.cygnus`, `psi100.platform-field`, `psi100.cygnus`).
- Saffire-III's Research Impacts paragraph is word-for-word Saffire-I's, starting "The Saffire-I experiment provides…" (`psi100.impacts-copied`). Its end date is blank.
- Saffire-I's data table gives length 40.6 cm and width 94 cm. Its metadata says "0.94 meters long and 0.4 meters wide": length and width are swapped (`psi98.table-s1`, `psi98.size`).

**The cross-investigation story:** one fabric, three experiments. SIBAL appears in BASS-II (1–2 cm strips, too small for the cabin sensors), in Saffire-I (a 94 cm sheet at 20 cm/s that burned for 420 s concurrent and 70 s opposed) and in Saffire-III (at 30 cm/s). Lab Partner can tell it with cites.

- The AI pipeline (§7.2) extracts verified fields for each investigation using `pipeline/prompts/extract-investigation.md`.
- **Output 1:** a "Why BASS-II" strip at the top of SUMMARIZE. Cards for each indexed investigation, each with an AI summary (quotes checked), its platform, its tested conditions, or "Not stated".
- **Output 2:** F3d relevance, scored like this:
  - 0.35 × atmosphere match
  - 0.25 × gravity match
  - 0.20 × phenomena covered (of ignition, flame spread, extinction, suppression, detection)
  - 0.10 × real cabin materials
  - 0.10 × test-level data available
  - Unknown inputs score 0 and are flagged. The weights are shown as "our judgment call".

**As built (14 Nov):** the index is built from verified quotes, without the LLM extraction (the pipeline scripts were built the next day: see the M7 notes below and under F2b). Output 1 is the investigation column of the F3d table on RANK rather than a separate strip; the "Record inconsistencies" list is at the bottom of SUMMARIZE, with a fifth item found while indexing: Saffire-I's Proposal Title field is about smoke for fire detection (`psi98.proposal-title`), SAME's subject, while its objectives are fire growth and flammability limits.

**As built (M7, 15 Nov), the AI summaries:** `extract.ts` makes two calls of four investigations each with `pipeline/prompts/extract-investigation.md` version 3, and `verify.ts` (no LLM; checks in `src/lib/investigationVerify.ts`) writes `public/data/investigations.json` and `pipeline/out/review.md`.
- Input: the investigation's `i_Investigation.txt` without blank fields and people's details. The `s_*.txt` files in our sources are empty stubs ("Do not use this"). PSI-25 has no metadata file, so it reads the BASS-II report's summary page (PDF p. 9) and nothing else of the report.
- Version 2 of the prompt asks only for what the section shows (acronym, title, platform, tested O2, pressure, flow, and a 2 to 3 sentence summary), with a quote per sentence. Version 1 pooled one set of quotes for the whole summary, which can't give each sentence its own footnote. Gravity, phenomena and materials stay with the checked-quote index on RANK. Version 3 takes several investigations in one call, each in its own section, and `verify.ts` checks each investigation's quotes against its own text only.
- Result (15 Nov, `gemini-3.5-flash`): 48 fields and 16 sentences checked, 2 failed (the flow ranges of PSI-26 and PSI-98, each backed by a two-word quote, too short to prove a number); every investigation has two checked sentences. Saffire-III's platform is its record's Flight Platform field, which says ISS; the section says so beside it and points to the record inconsistencies (`platformConflict()`).
- Checks: every quote must be in the investigation's text; a text value must be inside one of its quotes; every number of a range or a sentence must be in its quotes. What fails is null ("Not stated") or left out, and listed in `review.md`. Units are converted only afterwards.
- SUMMARIZE shows them in a frameless "Investigations" section above "Record inconsistencies", labeled "AI-written, checked"; every value and sentence carries a footnote to its quote.

### F8. NASA photo reveal (P1)

- Extract Fig. 6.3 (near-quench and blowoff limit flames for three rod sizes) from the PDF into `public/img/` with the credit "NASA/TM-20210011385, Fig. 6.3".
- Check the figure's own credit line first.
- It is shown from F1's "Show NASA's photo" button and in Lab Partner answers about flame shape.

---

## 6. Data contracts

```ts
export type GravityClass = 'micro' | 'partial' | 'normal' | 'mixed'

export interface Source { id: string; title: string; short?: string; publisher: string; year: number | null; doi: string | null; url: string | null; kind: 'report' | 'dataset' | 'paper' | 'poster' | 'web'; credit?: string }

export interface Locator { pdfPage?: number; reportPage?: number | null; spansNextPage?: boolean; table?: string; row?: string; file?: string; line?: number }
// Source.short: the name in footnote previews ("BASS-II report", "PSI-26", "Olson & Ferkul 2017").
// file and line: PSI metadata quotes. file is inside pipeline/sources/<SOURCE-ID>/ (sourceId "psi-98" is folder "PSI-98"); line is 1-based.

export interface Claim {
  id: string; topic: string; text: string
  value?: number; unit?: string
  kind: 'quoted' | 'computed'
  sourceId?: string; locator?: Locator | null; quote?: string   // quoted
  emphasis?: string                                             // quoted: an exact phrase of quote, underlined in the drawer
  formula?: string; inputs?: string[]                           // computed
  verified: boolean
}

// Real CSV: UTF-8 with BOM, CRLF line ends, 17 columns, 129 data rows. Header cells, after trimming:
// PI | Test # | Date | GMT | Sample # | Fuel Sample Material | Flow restrictor | Fan display | Air display |
// Radiometer gain   (1000   250   50   10) | Total Frames Shot | Calibrated  initial O2 % by vol (two spaces) |
// Calibrated final O2 % by vol | Initial CO2 % by vol | Final CO2 % by vol | Initial CO (ppm) | Final CO (ppm)
export type Flag =
  | 'o2-missing' | 'o2-impossible' | 'o2-rise-within-resolution'
  | 'co-over-range' | 'co-initial-over-range' | 'co-missing' | 'co-negative'
  | 'co2-missing' | 'co2-initial-zero'
  | 'date-gmt-mismatch' | 'date-year-2018'
  | 'note-no-ignition' | 'note-would-not-stay-lit'
export type SampleType =
  | 'pmma-rod-6.35' | 'pmma-rod-9.525' | 'pmma-rod-12.7'
  | 'pmma-slab-1' | 'pmma-slab-2' | 'pmma-slab-3' | 'pmma-slab-4' | 'pmma-slab-5'
  | 'pmma-film-0.1' | 'pmma-film-0.2' | 'pmma-film-0.3' | 'pmma-film-0.4'
  | 'pmma-sphere' | 'sibal-1cm' | 'sibal-2cm' | 'nomex' | 'wax-candle'

export interface Bass2Row {
  rowIndex: number; pi: string; testId: string; sampleId: string
  date: string; gmtDay: number | null
  material: string                   // verbatim, typos kept ("1/4 blac rod", "2 cm 2ide")
  sampleType: SampleType             // parsed; must match per-test-expected.json
  flowConfig: 'Opposed' | 'Concurrent' | 'Stagnation' | null   // from flow-by-test.json, not the CSV
  fanDisplayRaw: string; airDisplayRaw: string                 // sequences of settings, never parsed to one number
  o2InitPct: number | null; o2FinalPct: number | null; o2Usable: boolean
  co2InitPct: number | null; co2FinalPct: number | null; dCo2Pct: number | null
  coInitPpm: number | null; coFinalPpm: number | null
  burnConfirmed: boolean             // o2Usable && dCo2Pct >= 0.2
  coPerCo2: number | null            // (ΔCO ppm / ΔCO2 %) when burnConfirmed and both CO cells are numbers
  flags: Flag[]
  raw: Record<string, string>        // verbatim CSV cells, keyed by trimmed header
}

export interface AuditSummary {
  generatedBy: string; generatedAt: string
  counts: Record<'total' | 'o2Usable' | 'burnConfirmed' | Flag, number>
  byPi: Record<string, number>
  testIds: Partial<Record<Flag, string[]>>
}

// Generated files (npm run data:bass2). No LLM is involved, so model and promptVersion are null
// (CLAUDE.md rule 11); source is the CSV's path under pipeline/sources/.
export interface FlowEvidence {             // one entry of docs/fixtures/flow-by-test.json
  flow: 'Opposed' | 'Concurrent' | 'Stagnation' | null
  quote: string | null                      // the Appendix A row text; null if the test isn't in the appendix
  pdfPage: number | null; reportPage: number | null; note?: string
}
export interface CheckedFlowEvidence extends FlowEvidence {
  quoteChecked: boolean                     // quote found on its pdfPage after normalize(); unchecked quotes are hidden
}
export interface Bass2File {                // public/data/bass2.json
  generatedBy: string; generatedAt: string; model: null; promptVersion: null; source: string
  rows: Bass2Row[]
  flowEvidence: Record<string, CheckedFlowEvidence>   // keyed by testId
}
export interface AuditFile extends AuditSummary {      // public/data/audit.json
  model: null; promptVersion: null; source: string
  lowestBurningO2: { value: number; testId: string } | null   // lowest final O2 among burn-confirmed tests (O4, 13.6)
}

// AI pipeline outputs (M7). Until a file exists, everything that shows it renders nothing:
// vite.config.ts records which ones exist at build time, so the app never requests a missing file.
export interface BriefingFile {             // public/data/briefing.json (F2 AI dataset briefing)
  generatedBy: string; generatedAt: string; model: string; promptVersion: string
  sentences: string[]                       // 4–6 sentences; every number must be in the stats JSON
}
export type Outcome = 'sustained' | 'brief' | 'no-ignition' | 'not-stated'
export interface TestOutcomesFile {         // public/data/test-outcomes.json (F2b outcome reader)
  generatedBy: string; generatedAt: string; model: string; promptVersion: string
  outcomes: Array<{ testId: string; outcome: Outcome; quote: string | null }>   // quote checked on its page (§7.2)
}

// Orbital Risk Index (F3a), computed at runtime by lib/risk.ts from bass2.json; not stored in a file.
// Three components; heat release is not one (F3a says why).
export type ComponentKey = 'lowO2' | 'coYield' | 'ignitionGap'   // what is measured
export type IndexKey = 'lowO2' | 'coYield'                        // what the index is built from (F3a says why)
export interface Measured {
  value: number; unit: string
  n: number | null                   // tests it was measured over; null for ignitionGap, which comes from the rod's diameter
  claimIds: string[]                 // the computed claim that explains it: rank.low-o2, rank.co-yield, rank.ignition-gap
  testId?: string                    // lowO2 only: the test with that final O2 (O4 for the 9.525 mm rod)
}
export interface RiskEntity {
  id: SampleType; label: string; family: SampleFamily
  tests: number; burnConfirmed: number
  components: Partial<Record<ComponentKey, Measured>>
  findingClaimIds: string[]          // Nomex: bass2.nomex; wax candle: bass2.wax-droplet
  ranked: boolean                    // >= 3 burn-confirmed tests and both index components; doesn't depend on the weights
  flows: Partial<Record<'Opposed' | 'Concurrent' | 'Stagnation' | 'None', number>>   // flow direction counts, from Appendix A
}
// SampleFamily: 'rod' | 'slab' | 'film' | 'sphere' | 'sibal' | 'nomex' | 'wax'

export type Geometry = 'opposed-slab' | 'concurrent-rod'
export interface CabinInputs {
  volumeM3: number; pressureAtm: number
  o2InitPct: number; co2InitPct: number; coInitPpm: number
  powerW: number; geometry: Geometry
  rodMm?: 6.35 | 9.525 | 12.7; flowCmS?: number
  n2FlowCcMin: number; n2StartMin: number; durationMin: number
}
export interface CabinState {
  tSec: number; o2Pct: number; co2Pct: number; coPpm: number; heatKJ: number
  flame: 'burning' | 'out-limit' | 'out-duration' | 'not-ignited'
  alarms: Array<{ tSec: number; kind: 'smac-10' | 'smac-55' | 'sensor-1000' | 'extinguished' }>
  valid: boolean; invalidReason?: string     // e.g. 'pressure ≠ 1 atm'
}
```

Pressure is stored in atm in the cabin model. The UI shows psia with kPa in brackets: 1 atm = 14.696 psia = 101.325 kPa.

---

## 7. AI

### 7.1 Lab Partner runtime (`api/lab-partner.ts`)

1. **Retrieve:** MiniSearch over `api/_data/chunks.json`. Chunks are about 800 characters, overlap 150, and each records its sourceId and page. Take the top 6.
2. **First LLM call:** the system prompt holds the rules from F5 plus the tool definitions. The user message holds the question and the chunks.
3. **Run tools on the server** by importing the pure functions from `src/lib/`. Return results with ids (e.g. `tool#1.coPeakPpm = 995.7`).
4. **Second LLM call:** write the answer. Output JSON: `{ sentences: [{ text, support: [{ chunkId, quote } | { toolResultId }] }], uiActions: [...] }`.
5. **Verify:**
   - each quote is a substring of its chunk after `normalize()`
   - each number in a sentence appears in its supports
   - drop failing sentences, and refuse if none remain
6. Return the verified sentences and the `uiActions`. The client applies them with undo.

**As built (M6):**
- `api/_src/lab-partner.ts` is the source; `npm run build:api` bundles it with everything it imports into `api/lab-partner.js`, which Vercel runs. Node's ES modules can't load `src/lib`'s extensionless imports on their own, so an unbundled function would fail on Vercel.
- Prompts: `pipeline/prompts/lab-partner-tools.md` (call 1) and `lab-partner-answer.md` (call 2). Every answer records both versions.
- Call 1 runs at the lowest thinking level. Call 2 does too: Gemini counts thinking against `maxOutputTokens`, and at a higher level it spent all 400 tokens thinking and returned nothing.
- `llm.ts` retries a busy reply (503, 429) twice, after 0.8 s and 2 s, within the call's time limit.
- The tools return their values rounded as the screen shows them, each with the claim behind it, and labelled "(model)", "NASA's words" or "ZERO-DRAFT's audit", so the answer credits each one correctly.

### 7.2 Pipeline (offline)

```
pipeline/sources/<ID>/*  -- text.ts -->  text/<ID>.pages.json
   -- extract.ts (LLM + prompts/extract-investigation.md) --> out/raw/<ID>.json
   -- verify.ts (no LLM) --> public/data/investigations.json + out/review.md          (F7)
public/data/audit.json + stats -- briefing.ts (LLM) -- number check --> public/data/briefing.json   (F2)
report PDF pp. 111–121 -- outcomes.ts (LLM) -- quote check --> public/data/test-outcomes.json        (F2b)
all source text -- chunks.ts --> api/_data/chunks.json                                (F5)
```

**`outcomes.ts`** (F2b):
- One Gemini call per Appendix A page, temperature 0.
- Output per test: `{ testId, outcome: 'sustained' | 'brief' | 'no-ignition' | 'not-stated', quote }`.
- The quote must be at most 15 words, copied from that test's observation text.
- Verify each quote is on its page after `normalize()`, and that the test id appears before it on the page. Failures become `not-stated`.
- Spot-checks to put in a test: O12 is `no-ignition` ("No sustained flame at any flow…"), F3 is `brief` ("Brief ignition flash, no sustained flame…"), T28a is `brief`.

**As built (M7):** the scripts share `pipeline/scripts/pipelineIo.ts`: it reads a prompt with its version line, asks at temperature 0 with `llm.ts`'s `rateLimitRetries` (a pipeline-only option: on a 429 it waits what the provider asks, 60 s at most, and asks again; Lab Partner's endpoint never sets it), and keeps every raw reply in `pipeline/out/raw/` with the model, prompt version and the exact input. A kept reply for the same prompt version and input is reused, so a script can be re-run without asking again; `--fresh` asks again. Calls are spaced 20 s apart (`PIPELINE_SPACING_MS`), and a spent daily allowance stops a script at once. One full pass is 6 calls: 3 for the outcomes (plus 1 if any row is asked again), 2 for the extraction, 1 for the briefing. Groq's free tier allows 200,000 tokens a day for `openai/gpt-oss-120b`, which the prompt's development exhausted; the shipped files were made with Gemini by running the scripts with an empty `GROQ_API_KEY`.

**`text.ts`:**
- `.txt`/`.tsv` files are one page each, with lines kept.
- `.pdf` uses unpdf `extractText(pdf, { mergePages: false })`, taking the report page label from the footer `NASA/TM-… <n>`.
- Ask before adding a CSV or XLSX parser library; the BASS-II CSV is read by `compile-bass2.ts`.

**`normalize()`** in `src/lib/normalize.ts`:
- Unicode NFKC
- `‘ ’` become `'`; `“ ”` become `"`
- U+2010 to U+2015 and U+2212 become `-`
- whitespace runs collapse to one space; trim the ends

**`extract.ts`:**
- One call per investigation, temperature 0.
- The raw output keeps source units.
- Save it untouched.

**`verify.ts`:**
1. Find each quote in the normalized text and record its page.
2. Check that every number in a value appears in a verified quote.
3. Set failing fields to `value: null` and list them in `review.md`.
4. Convert units only after verifying: atm × 14.696 = psia; kPa ÷ 6.895 = psia; mm/s ÷ 10 = cm/s.

**Human review:** read `review.md`, spot-check 3 fields per investigation against the PDFs, and record who checked and when in `REVIEWED.md`.

### 7.3 Provider: Groq, with Gemini as the fallback

- Groq when `GROQ_API_KEY` is set: `GROQ_API_KEY` and `GROQ_MODEL` (`openai/gpt-oss-120b`), through Groq's OpenAI-style chat completions API with plain `fetch` (no SDK). Function calling for the tools, `json_schema` output for answers, `reasoning_effort: low`.
- Otherwise Gemini, as below.
- SDK: `@google/genai` (3.0 at the time of writing; needs Node 22 or newer).
- One module, `pipeline/scripts/llm.ts`, used by the scripts and `api/`, exports `complete({ system, user, tools?, json })`. Nothing else imports the SDK.
- Env vars: `GEMINI_API_KEY` and `GEMINI_MODEL`, in `.env.local` locally and in Vercel environment variables when deployed. Don't hardcode a model name. Pick the current model in Google AI Studio that supports function calling and JSON output, and record it.
- Use Gemini's function calling for Lab Partner's tools and its JSON output mode for the pipeline.
- Every output records `model` and `promptVersion`.
- Smoke-test the key in M1 so it isn't first tried on Saturday. Check the free tier's rate limits then too; if they're tight, the cached answers carry the demo.

---

## 8. Science reference (source of truth)

All constants are quoted in `docs/claims.seed.json`. Report pages are given as "p."; PDF pages are in the seed.

### 8.1 Flammability and ignition (PMMA rods, 1 atm)

- **Stretch rate:** a = (3/2)(U/r)(r/r₀)^½, with U in cm/s, r = d/2 in cm, r₀ = 0.318 cm (`bass2.flam.stretch-def`, `bass2.flam.r0`, p. 75).
- **Eq. 6.1:** X_O2 = 6·exp(−0.5a) + 0.0167a + 13.4, in % O2 (p. 75).
  - Quenching branch: 6·exp(−0.5a) + 13.4. Blowoff branch: 0.0167a + 13.4 (`bass2.flam.eq61-branches`).
  - Blowoff branch at a = 0: 13.4%, the report's conservative space limit (`bass2.flam.derate`).
- **Flame shape at quenching:** length ÷ width falls to 0.5 at extinction, a hemisphere (`bass2.aspect-0.5`, p. 70). Only the Burn Twin's drawing uses it.
- **Solid response time:** t_s = 0.7r²/α_s, with α_s = 1.2×10⁻³ cm²/s (p. 65, p. 68). τ = delay ÷ t_s. The 0.7 is NASA's "empirical factor … selected so that τ = 1 at the ignition limit" (`bass2.ign.ts-factor`, p. 68).

| Quantity | Input | Expected (±0.01 unless noted) |
|---|---|---|
| Eq. 6.1 minimum | a = 10.382 | 13.607 % |
| a | U = 2, d = 6.35 | 9.441 |
| X_O2 | U = 2, d = 6.35 | 13.611 % |
| X_O2 | U = 20, d = 6.35 | 14.977 % |
| X_O2 | U = 1, d = 6.35 | 14.045 % |
| X_O2 | U = 0.5, d = 6.35 | 15.283 % |
| X_O2 | U = 2, d = 9.525 | 13.656 % |
| X_O2 | U = 20, d = 9.525 | 14.687 % |
| X_O2 | U = 2, d = 12.7 | 13.725 % |
| X_O2 | U = 20, d = 12.7 | 14.515 % |
| Burn Twin gap | 15.4 − X_O2(U = 2, d = 6.35) | 1.789 points |
| t_s | d = 6.35 / 9.525 / 12.7 mm | 58.804 / 132.308 / 235.215 s |
| t_s ÷ 25 s | d = 12.7 | 9.409 |

The fitted curve's minimum is 13.61%. The report's "approximately 13.5%" describes the data. Show the curve value as "model" and 13.5% as the report's figure; never mix them.

### 8.2 Cabin fire, toxicity and dilution (sealed volume, 1 atm)

- **Gas amount** (Eq. 1.3, `bass2.calorimetry-inputs`, p. 11): n_total = P·V/(R·T), with R = 82.05 cm³·atm/(mol·K), T = 300 K, P = 1 atm, V in cm³.
- **Heat:** Huggett's 13.1 kJ per gram of O2 (`bass2.hrr.huggett`, p. 8).
- **Stoichiometry** (Eq. 1.1, `bass2.stoich`, p. 6): C5H8O2 + 6 O2 → 5 CO2 + 4 H2O, so ΔCO2 = (5/6)·ΔO2. The data "agrees very well" with this (`bass2.co.stoich`, p. 7).
- **CO per CO2:** opposed thick slabs about 370 ppm per 1% CO2 (`bass2.co.370`); concurrent rods about 550 (`bass2.co.550`). Opposed rods were nonlinear, so there's no preset (`bass2.co.opposed-rods`).
- **N2 dilution** (Eq. B.2, `bass2.cstr.model`, p. 115): c(t) = C₀·exp(−r·t/V).
  - V = 0.25 m³ (`bass2.cstr.volume`).
  - r = 493 cm³/min in the calibration (`bass2.cstr.n2-flow`), 0.0005 m³/min maximum (`bass2.cstr.n2-max`).
  - Validated on orbit (`bass2.cstr.validated`).
- **Limits:** SMAC 10 ppm long-term and 55 ppm 1-hour (`bass2.co.smac`, p. 8). CSA-CP CO range 0–1,000 ppm (`bass2.co.sensor-range`, p. 6). US Lab volume 106 m³ (`bass2.us-lab-volume`).

| Quantity | Input | Expected |
|---|---|---|
| V/r | 0.25 m³, 493 cm³/min | 507.10 min |
| Dilution time, 20.9% to 13.611% | as above, no fire | 217.5 min |
| Dilution time, 20.9% to 14.977% | as above, no fire | 169.0 min |
| n_total, MSG | 250,000 cm³, 1 atm, 300 K | 10.156 mol |
| M5 O2 consumed | ΔO2 3.2 points | 0.3250 mol = 10.400 g |
| M5 heat | | 136.24 kJ; 83.48 W over 27.2 min |
| Fire O2 draw | 83.48 W in the MSG | 0.001961 %/s (3.200 points over 27.2 min) |
| M5 CO2 (stoichiometric) | | 2.667% (measured outlier: 2.8%) |
| M5 CO, opposed slab | 370 ppm per % × stoichiometric 2.667% | 986.7 ppm |
| M5 CO, opposed slab | 370 ppm per % × measured 2.78% (CSV) | 1,028.6 ppm |
| Same CO into the US Lab | × 0.25/106 | 2.327 ppm |
| Volume where CO reaches 55 ppm | 370 / 550 | 4.485 / 6.667 m³ |
| Volume where CO reaches 10 ppm | 370 / 550 | 24.67 / 36.67 m³ |

Tests must hit these within 0.5%. Run the dilution rows with the fire off. Run the M5, CO and volume rows with dilution off and constant power.

### 8.3 Verified claims

`docs/claims.seed.json` holds 81 claims from the report, all verified against the PDF and each pinned to a report page and PDF page (80 from M1, plus `bass2.aspect-0.5` added in M2.1). `docs/claims.psi-seed.json` holds 36 claims from the PSI metadata files, each pinned to a file and line. In M1, merge both into `src/data/claims.json`. `src/data/claims.json` also holds 3 computed claims for the Burn Twin (`twin.stretch-rate`, `twin.orbit-limit`, `twin.gap`): each has a formula and lists the quoted claims it is calculated from.

Sensor resolutions used by the audit rules: O2 ±0.1% (`bass2.sensor.o2-res`), CO2 0.1% (`bass2.sensor.co2-res`), CO 1 ppm (`bass2.co.sensor-range`).

Report topics:
- flammability and equations
- ignition and Test 1
- combustion products and SMAC
- heat release
- N2 dilution
- hardware
- the Test M5 incident
- controls (vapor jets, keep suppressing until cool)
- materials (Nomex, wax droplets)
- the "lab partner" name
- sensors and the MCA offset correction
- Appendix A: the column headers, NASA's test notes (B2, F3, O4, O12, P22a, T28a, M5) and the five forensic O2 rows

### 8.4 Atmospheres [PENDING sources]

| id | Name | O2 % | Pressure | Source |
|---|---|---|---|---|
| `iss` | ISS | 21 | 14.7 psia (1 atm) | [PENDING] NASA source for the ISS cabin atmosphere |
| `lunar-21` | Lunar lander / rover, 21% | 21 | 14.7 psia | Zayac 2024, NASA Glenn poster: "21% oxygen at 14.7 psia" |
| `lunar-34` | Lunar lander / rover, 34% | 34 | 8.2 psia | Zayac 2024: "34% oxygen at 8.2 psia" |

- The Zayac poster names both as atmospheres of interest to the Human Landing System and the Lunar Rover.
- Put the poster PDF (NTRS 20240015307) in `pipeline/sources/zayac-2024/` so `check:claims` can verify the quotes.
- Lunar gravity needs a NASA fact-sheet source.

### 8.5 Sources so far

| id | Title | Identifier |
|---|---|---|
| `nasa-tm-20210011385` | Burning and Suppression of Solids–II (BASS–II) Summary Report, Olson et al., 2021 | NASA/TM-20210011385 |
| `psi-25` | Burning and Suppression of Solids – II (BASS-II), NASA PSI Data Repository, 2022 | DOI 10.60555/4qc4-de67 |
| `psi-26` | Burning and Suppression of Solids (BASS), NASA PSI | DOI 10.60555/58h4-dy80 |
| `psi-62` | Concurrent Flame Spread Modeling using Flamelet Generated Manifolds in Microgravity with Comparison to BASS Experiments using Two-Color Tomography | DOI 10.60555/e9xp-ex83 |
| `psi-69` | Flame Extinguishment Experiment (FLEX), NASA PSI | DOI 10.60555/mbq8-0451 |
| `psi-98` | Spacecraft Fire Safety Experiment-I (Saffire-I), NASA PSI, plus its experimental table CSV | DOI 10.60555/0t15-1z43 |
| `psi-99` | Spacecraft Fire Experiment-II (Saffire-II), NASA PSI | DOI 10.60555/2chp-m469 |
| `psi-100` | Spacecraft Fire Experiment-III (Saffire-III), NASA PSI | DOI 10.60555/040q-4h36 |
| `psi-102` | Smoke and Aerosol Measurement Experiment (SAME), NASA PSI | DOI 10.60555/gd4k-8h62 |
| `zayac-2024` | Zayac, NASA Glenn poster, 2024 (confirm the full author list from the PDF) | NTRS 20240015307 |
| `olson-ferkul-2017` | Olson & Ferkul, "Microgravity Flammability Boundary for PMMA Rods in Axial Stagnation Flow", Combust. Flame 180 (2017) 217–229 | cited via the report, Ref. 23 |

---

## 9. Milestones

Paste each prompt into Claude Code as written. One milestone per session; run `/clear` between them.

**Schedule:**

| Day | Milestones | Hours |
|---|---|---|
| Mon 9 | M0 | 1.5 |
| Tue 10 | M1, M2 | 7 |
| Wed 11 | M3 | 5 |
| Thu 12 | M4 | 5 |
| Fri 13 | M5; read the 2026 guides | 6 |
| Sat 14 | M6, then M7 if there's time | 5–8 |
| Sun 15 | M8 | 5 |

That's about 35–38 hours: 6–7 hours a day, every day. There is no slack.

**Cut order if behind:**
1. M7
2. F8 photo reveal
3. Lab Partner tool calls (keep cited Q&A)
4. Risk weight sliders (keep fixed weights)
5. SUMMARIZE filters beyond PI and quarantine

**Never cut:** the audit bar, the Burn Twin, the simulator core, citations.

### M0. Scaffold and deploy (Mon)

> Read CLAUDE.md and docs/SPEC.md §0 and §9 M0. First run node -v; if it's below 22, stop and walk me through installing Node 22 LTS. This folder already has CLAUDE.md, docs/ and pipeline/; keep them. Scaffold a Vite react-ts app here (scaffold into a temp folder and move files in if the folder isn't empty). Install recharts, motion, lucide-react, minisearch, @google/genai, @fontsource-variable/archivo and @fontsource-variable/jetbrains-mono; dev dependencies tailwindcss, @tailwindcss/vite, vitest, tsx and unpdf. Set up Tailwind v4 with the Vite plugin and put the design tokens from CLAUDE.md into @theme in src/index.css. Create the folder layout from CLAUDE.md. Add the npm scripts listed in CLAUDE.md; unimplemented ones print "not implemented yet". Build the app shell from SPEC §4: header, empty audit bar, empty Burn Twin area, three tabs and a collapsible Lab Partner dock. Add .env.local to .gitignore. Initialize git and commit. Then walk me step by step through pushing to GitHub and deploying on Vercel.

**Done when:** `npm test` and `npm run build` pass, and the Vercel URL shows the shell.

### M1. Foundations: physics, cabin model, claims, citation drawer (Tue)

**Before:** put the source files in place, unchanged:
- `pipeline/sources/PSI-25/`: `BASS-II_Summary_Report.pdf`, `PSI-25_Experimental table_BASS-II.csv`, `PSI-25.bib`
- `pipeline/sources/PSI-26/`, `PSI-62/`, `PSI-69/`, `PSI-98/`, `PSI-99/`, `PSI-100/`, `PSI-102/`: the unzipped `i_Investigation.txt` and `s_*.txt` for each
- `pipeline/sources/PSI-98/`: also `PSI-98_Experimental_table_SAFFIRE-1.csv`
- `.env.local`: `GEMINI_API_KEY=...` and `GEMINI_MODEL=...`

> Read CLAUDE.md and docs/SPEC.md §6, §7.2 (normalize), §7.3, §8 and F6. Implement src/lib/normalize.ts, src/lib/physics.ts and src/lib/cabin.ts with tests reproducing every value in the §8.1 and §8.2 tables. Merge docs/claims.seed.json and docs/claims.psi-seed.json into src/data/claims.json and create src/data/sources.json from §8.5. Build the Cite component and the citation drawer (F6). Implement scripts/check-claims.ts: for claims with a pdfPage, extract the PDF per page with unpdf, normalize, and confirm the quote is on its stated pdfPage (or across that page and the next when spansNextPage is true); for claims with locator.file, confirm the quote is on that line of the matching file under pipeline/sources/; fail if any Cite id used in src/ is missing. Finally write pipeline/scripts/llm.ts and a short smoke test that sends "say ok" to Gemini using GEMINI_API_KEY and GEMINI_MODEL from .env.local.

**Done when:** `check:claims` reports 116/116, every §8 value passes, the drawer works by mouse and keyboard, and the Gemini smoke test prints ok.

### M2. Burn Twin (Tue)

> Read CLAUDE.md and docs/SPEC.md F1 and F3b. Build views/BurnTwin: the black stage on one canvas with the Earth and orbit flames, the oxygen gauge on the seam, the HTML annotations, the controls strip, the Eq. 6.1 inset and the Drain oxygen sequence exactly as F1 specifies. Drive the canvas and every per-frame value with requestAnimationFrame and refs, not React state per frame. Put the state in a small store shared with the future flammability map.

**Done when:**
- At U = 2 and 6.35 mm, the drain kills the Earth flame at 15.40 and the orbit flame at 13.61.
- The banner says 1.79 points.
- The pulse appears only near the quenching limit.
- It holds 60 fps.
- Reduced motion works.

### M3. Data: CSV, audit bar, SUMMARIZE (Wed)

> Read CLAUDE.md and docs/SPEC.md F0, F2, F3a and §6, and the files in docs/fixtures/. Write scripts/compile-bass2.ts to replace the old compile_bass2.py. Read pipeline/sources/PSI-25/PSI-25_Experimental table_BASS-II.csv as UTF-8, strip the byte-order mark, handle CRLF and quoted cells (e.g. "1/4"" clear rod"), trim header names, and keep every raw cell exactly. Implement src/lib/audit.ts with every rule in docs/fixtures/audit-expected.json (match whole cells, never substrings), parse each material into the SampleType from §6, take flowConfig from docs/fixtures/flow-by-test.json, and compute burnConfirmed and coPerCo2. Write audit.test.ts that reproduces every count and test-id list in audit-expected.json, every row of per-test-expected.json, and every row of o2-forensics.json. Output public/data/bass2.json and audit.json. Then build the F0 audit bar and the F2 SUMMARIZE view: test wall, quarantine animation with "Show the math", filters, record drawer, distribution strip and the "Checked against NASA" panel. Leave the AI briefing box and the outcome glyphs showing "Not generated yet".

**Known bugs in the old compile_bass2.py** (don't port them):
1. It gives five tests negative heat (T5, T10, T12, T13, T23).
2. It reports heat for the 45 tests whose O2 change is within sensor resolution, without a warning.
3. It matches CO "over range" by substring (`'OR' in text`). That works today by luck; use whole-cell matches.
4. It writes the text "nan" as the raw value of empty cells.
5. It assigns geometry and flow direction per PI. That's wrong for T3 and T7 (PMMA sphere sections, not SIBAL), for Ferkul (Nomex vs wax) and for every PI whose tests mix flow directions.
6. It doesn't flag missing CO, missing CO2, negative CO or date errors.

### M4. RANK (Thu)

> Read CLAUDE.md and docs/SPEC.md F3. Implement src/lib/risk.ts with the tests in F3a, then the Orbital Risk leaderboard with fingerprints, weight sliders and layout reordering; the flammability map (F3b) sharing state with the Burn Twin; and the ignition race (F3c). Add finding cards for Nomex and the wax droplet.

### M5. INTERPRET simulator (Fri)

> Read CLAUDE.md and docs/SPEC.md F4 and §8.2. Build views/Interpret on top of src/lib/cabin.ts: the chamber (reuse the F1 orbit chamber), three strip charts with threshold lines, readouts, the alarm log, time controls, all five presets, the incident card for M5, the "keep suppressing" card, and the "Checked against NASA" panel. Run the model in a batched loop so 600× speed stays smooth.

**Done when:**
- Every preset produces the §8.2 values.
- The lunar preset refuses to predict.
- Alarms appear only from model state.

### M6. Lab Partner (Sat)

> Read CLAUDE.md and docs/SPEC.md F5 and §7.1 and §7.3. Implement scripts/chunks.ts, api/lab-partner.ts with retrieval, the tool definitions, server-side tool execution using src/lib, the two-call flow and verification, and the LabPartnerDock with streaming, citation chips, tool-action lines with undo, and the five cached suggested questions. Add the mocked-LLM tests.

### M7. Investigation index and AI briefing (Sat, if there's time)

> Read CLAUDE.md, docs/SPEC.md F2 (briefing), F2b, F7 and §7.2, and pipeline/prompts/extract-investigation.md. Implement outcomes.ts first (F2b) with its quote check and the three spot-check tests, and show the outcome glyphs on the test wall. Then implement text.ts, extract.ts, verify.ts and briefing.ts with the number check; run them on PSI-25, 26, 62, 69, 98, 99, 100 and 102; render the "Why BASS-II" strip, the "Record inconsistencies" list from F7, and F3d.

### M8. Polish, video, submit (Sun)

- Rehearse the §3 script five times; fix anything that stutters.
- Record at 1440×900. Keep it 30 s or under, with English captions burned in. Upload publicly.
- Write the README with §10, including the AI disclosure.
- Submit well before the deadline (the 2025 deadline was Sunday 23:59 local event time; confirm for 2026).

---

## 10. Submission checklist

These are the 2025 form fields; re-check against the 2026 guide on 13 Nov.

- [ ] **Project name:** ZERO-DRAFT
- [ ] **High-level summary:** the pitch and thesis from §1
- [ ] **Demo link:** the 30-second video, public, English subtitles
- [ ] **Final project link:** the Vercel URL and the GitHub repo
- [ ] **Detailed description:**
  - the modules
  - how the models were checked against NASA
  - the Orbital Risk formula
  - how Lab Partner works
- [ ] **NASA data:**
  - BASS-II report NASA/TM-20210011385
  - PSI-25 raw CSV and the report's Appendix A tables
  - PSI-26 (BASS), PSI-62, PSI-69 (FLEX), PSI-98 (Saffire-I, with its CSV), PSI-99 (Saffire-II), PSI-100 (Saffire-III), PSI-102 (SAME)
  - any dataset added to the challenge's Resources tab on 13 Nov
  - the Zayac 2024 poster
- [ ] **Other resources:** every npm package, both fonts (SIL Open Font License) and NASA figures with credits
- [ ] **Use of AI: yes.** List:
  - Claude Code wrote the application code
  - the named LLM powers Lab Partner, the dataset briefing and the investigation extraction
  - where AI output appears in the app
  - how it is checked: quote check, number check, human review
- [ ] **Metadata:** `generatedBy`, `model` and `promptVersion` are present in every generated JSON file
- [ ] No NASA logos. The video is a pure screen recording.
- [ ] "All work is original" checkbox, with all references listed

---

## 11. Risks and fallbacks

| Risk | Fallback |
|---|---|
| LLM API down on demo day | Cached suggested questions; the video is pre-recorded |
| Gemini free-tier rate limits during the demo | Cached answers and briefs; the video is pre-recorded |
| A judge says the risk index rests on few tests | Every row shows its test count and coverage; unranked types show why |
| A judge asks "is the toxicity real?" | The "Checked against NASA" panel, with the report's own 1.5 ppm figure beside ours |
| A judge asks "how do you rank risk?" | Formula on screen, fingerprint per row, weights adjustable |
| A judge asks "is this AI or just rules?" | Live Lab Partner with tool calls, and `review.md` from the pipeline |
| Behind schedule | The cut order in §9 |
| Claude Code drifts or over-builds | One milestone per session, acceptance criteria, tests, `/clear` between milestones |

---

## 12. Corrections to the old spec (don't reintroduce)

| Old claim | Correct version | Cite |
|---|---|---|
| "1.9% O2 False-Safe Gap where materials certified safe on Earth burn in orbit" | Same PMMA rods: about 13.5% O2 in BASS-II vs 15.4% in 1g with 4 cm/s forced flow. PMMA isn't "certified safe". The Burn Twin model gap is 1.79 points. | `bass2.flam.vs-1g` |
| CO/CO2 "an order of magnitude higher than 1g combustion" | An order of magnitude higher than efficient flue gases | `bass2.co.order-of-magnitude` |
| "550 to 600 ppm CO per 1% CO2" for all low-flow flames | About 550 for concurrent rods and about 370 for opposed thick slabs; opposed rods were nonlinear | `bass2.co.550`, `bass2.co.370`, `bass2.co.opposed-rods` |
| SMAC violations for a BASS-II fire in the ISS | 1.5 ppm in the US Lab, below the 10 and 55 ppm SMACs. Alarms only in small volumes or for bigger fires. | `bass2.co.smac` |
| Buoyant draft "20 to 50 cm/s" | 20 cm/s | `bass2.flam.buoyant-20` |
| M5 "~83.5 W average, peaking near 100 W" | The report says "close to 100 W". 83.48 W is our calculation over 27.2 min. There is no peak data. | `bass2.hrr.damage`, `bass2.m5.row` |
| Window "repaired by Rick Mastracchio" | The report says the leak was repaired on orbit, and separately that Mastracchio repaired the door. Keep them as two facts. | `bass2.m5.leak-repaired`, `bass2.m5.door-repair` |
| A 14.5% preset where the microgravity flame ignites and survives | 14.5% is the rod ignition limit. Flames lit at higher O2 survived down to 13.6%. | `bass2.ign.limit-14.5`, `bass2.ign.survive-13.6` |
| Eq. 6.1 minimum stated as 13.5% | The fitted curve's minimum is 13.61% at a ≈ 10.4; 13.5% is the report's figure from the data | §8.1 |
| HUD channels CH1–CH4 with live readings | The radiometer was not calibrated. Show model values labeled "Model". | `bass2.radiometer` |
| Lab Partner tells astronauts what to do | It reports what the research says, with pages. For example: "suppression efforts should be maintained until the burning material has cooled". | `bass2.suppress-until-cool` |
| React 18, Tailwind v3 | React 19, Tailwind v4: what a fresh scaffold installs today | §0 |
| (My earlier claim) "A ± was lost from the CSV's air display" | Wrong. The CSV is plain ASCII. "5   2(?)" is a sequence of flow settings: 5, then 2 (uncertain). | `docs/fixtures/audit-expected.json` |
| "Corrupted formula rows: raw MCA offset or sum glitches" (a guess) | Proven: calibrated = uncalibrated + offset, and a blank uncalibrated reading reproduces all five values exactly | `docs/fixtures/o2-forensics.json` |
| "Min final O2 13.5%" as evidence of burning | 13.5% is O12, which had no sustained flame. The lowest with confirmed burning is 13.6% (O4). | `bass2.note.o12`, `bass2.note.o4` |
| Flow direction and geometry assigned per PI | Per test, from Appendix A. T3 and T7 are PMMA sphere sections, not SIBAL. | `docs/fixtures/flow-by-test.json` |
| Heat release (kJ, W) as a material risk score | The CSV has no burn times, heat is calculated from O2, and 45 tests are within sensor resolution. Not a risk component. | §5 F3a |
| "Use Claude Pro for the API" | Pro includes no API access; use Gemini | §7.3 |
