promptVersion: extract-investigation@3

# Your job

You extract facts about several NASA combustion investigations, one at a time, each from its own source text. Act like a careful archivist, not an analyst: report only what the text states, and prove each fact with a verbatim quote. A script will check every quote against that investigation's own source text afterwards. Any quote that isn't found exactly there gets the field thrown out.

# Input

Several sections. Each starts with a line like `===== Investigation: PSI-98 =====`, followed by that investigation's pages of source text. Each page starts with a label like `[i_Investigation.txt p.1]` or `[BASS-II Summary Report.pdf p.9]`. PSI metadata files are tab-separated "key, value" lines, for example `Comment[Flight Platform]	International Space Station (ISS)`. Lines with no value have been left out: a key you don't see is not stated.

Treat each section as if it were the only one. For an investigation, use and quote only the text inside its own section, even when another section says something similar.

# Output

Return ONE JSON object and nothing else: no prose, no markdown fences, no comments:

```
{ "investigations": [ <one object per section, in the order given> ] }
```

Every field uses this shape:

```
{ "value": <value or null>, "evidence": [ { "file": "<file name from the page label>", "page": <page number from the label>, "quote": "<verbatim text>" } ] }
```

One investigation's object:

```
{
  "id": "<the id from the section's first line, e.g. PSI-98>",
  "acronym": <Field: string>,                      // e.g. "BASS", "SAFFIRE-I"
  "title": <Field: string>,
  "platform": <Field: string>,                     // where it ran, e.g. "International Space Station (ISS)"
  "o2Range": <Field: { "min": number, "max": number, "unit": "% by volume" }>,
  "pressureRange": <Field: { "min": number, "max": number, "unit": "atm" | "psia" | "kPa" }>,
  "flowRange": <Field: { "min": number, "max": number, "unit": "cm/s" | "mm/s" }>,
  "summary": [ { "text": "<one plain sentence>", "evidence": [ ...quotes... ] } ]
}
```

# Rules

1. **Quotes are exact.** Copy them character for character: same words, numbers, symbols and punctuation. Don't fix typos, expand abbreviations or join text from two places. Aim for 6 to 40 words per quote. A quote of a metadata line is its value, without the key.
2. **Text values are copied.** `acronym`, `title` and `platform` must appear, word for word, inside one of that field's quotes.
3. **Every number needs a quote.** Each number in a value must appear, written the same way, inside one of that field's quotes. If the text says "1 atm", the value is `{ "min": 1, "max": 1, "unit": "atm" }`. Don't convert units; a script does that.
4. **Unknown means null.** If the text doesn't state something, return `{ "value": null, "evidence": [] }`. Don't infer from general knowledge, from the investigation's name, or from other investigations. "Not stated" is a correct and useful answer.
5. **Ranges.** Use the lowest and highest values the text states for the tests. A single stated value v becomes `{ "min": v, "max": v }`. Use planned or design limits only if the text gives no tested values.
   - `o2Range` is the oxygen concentration of the test atmosphere, in percent.
   - `pressureRange` is the pressure the tests ran at.
   - `flowRange` is the speed of the air or gas flow over the sample.
6. **Platform.** Prefer the text's own description of where the experiment ran over a bare field value, when the two differ.
7. **Summary.** 2 or 3 sentences a curious 16-year-old could follow: what was burned or studied, where, and why. Each sentence is its own entry with its own quote or quotes, and says only what its quotes say. Any number in a sentence must be in that sentence's quotes. No adjectives the text doesn't support ("groundbreaking", "critical").
8. **Stay in your lane.** Don't mention another investigation unless this investigation's own text does. Don't give safety advice. Describe what was planned or done, not results the text doesn't state.

# Example of one field

Page text contains `Comment[Flight Platform]	International Space Station (ISS)`:

```
"platform": { "value": "International Space Station (ISS)", "evidence": [ { "file": "i_Investigation.txt", "page": 1, "quote": "International Space Station (ISS)" } ] }
```

The text gives no test pressure:

```
"pressureRange": { "value": null, "evidence": [] }
```
