promptVersion: read-outcomes@5

# Your job

You read NASA's notes on fire tests from the test matrices in Appendix A of the BASS-II report. Each note is about one test on the International Space Station. For each test, say what the flame did, and prove it with a short quote from that test's note. A script checks every quote against the page afterwards. A quote that isn't found exactly, in that test's own row, is thrown out.

# Input

Notes, each under a label like `### O12`. The label is the test id. The text under it is that test's "Test observations and anomalies" note. The date and time that open the next row of the table may trail at the end of a note (for example `7/8/14 GMT 189 -------- 67`); ignore them. A note that is only such a date, or only dashes, is an empty note. Once in a while the whole table row is given, with its settings and readings before the note; then read only the note at its end.

# Output

Return ONE JSON object and nothing else:

```
{ "outcomes": [ { "testId": "<the label>", "outcome": "sustained" | "brief" | "no-ignition" | "not-stated", "quote": "<words copied from that test's note>" } ] }
```

Return exactly one entry for every label, in the order given.

# Words these notes use

- **blowoff** (also "blew off", "blew out", "blowout"): the flame was put out by raising the airflow. A note that reports blowoff, at whatever fan or pot setting, is about a flame that was burning. "No blowoff attained" or "tried to blowoff, but did not" means the flame kept burning even at the highest airflow.
- **quenching**, **quenched**, **extinction**: the flame went out as the airflow or oxygen was lowered.
- **pot**: the fan's potentiometer setting. **LE**: the flame's leading edge.
- **HCl**, **HCN**, **CO**: gas readings. They say nothing about the flame.

# What each outcome means

Decide from the test's own note only: not from what the report says elsewhere about that kind of sample. Ask these questions in order and stop at the first "yes".

1. **Does the note say there was no ignition at all, or that a flame existed only with the igniter on (it died when the igniter was removed or switched off, or would not sustain without the igniter)?** Then the outcome is **no-ignition**. "Tried to ignite" does not by itself mean no ignition: go on.
2. **Does the note itself call the ignition or the flame brief, a flash, or say it "would not sustain" or "would not stay lit"?** Then the outcome is **brief**. So is a flame that went out by itself within moments of ignition, before the crew changed anything ("extinguished quickly", "went out right away", "extinguished before spreading beyond the igniter").
3. **Does the note show a flame that was burning on its own?** Then the outcome is **sustained**. Any one of these shows it:
   - the flame spread some distance, burned steadily or stably, or burned for a stated time;
   - the crew changed, stepped down, turned off or held the flow or oxygen after ignition, and the flame was there to respond. This still holds when the flame then went out, even quickly: a flame that is "extinguished at" a setting, goes "out when the pot was turned to" a setting, or is extinguished "when", "as" or "after" the flow was turned down was burning until then;
   - blowoff is reported, or the crew tried to blow the flame off (a flame must be burning to be blown off, whether or not it worked);
   - something is placed "in the burn" or "during the burn";
   - the flame self-extinguished after burning, or the fuel burned out;
   - the note describes how the flame looked while it burned (its colour, soot, shape or length).
4. **Otherwise** the outcome is **not-stated**: the note is empty, or it covers only cameras, hardware, procedure, sensor readings, or the condition of the sample.

If a note describes both a failed try and a later flame that burned, the outcome is "sustained".

# Rules

1. **Quotes are exact.** Copy consecutive words character for character from that test's note: same spelling, numbers and punctuation. Don't fix typos.
2. **Quotes are short: 15 words at most.** Count the words before you answer. If the passage that shows the outcome is longer, quote a shorter run of consecutive words from inside it. Never shorten with "..." and never join two separate passages.
3. **Quotes come from the same test's note.** Never quote another test, and never quote the trailing date.
4. For "not-stated", the quote is an empty string.
5. Don't guess. If you can't tell, the outcome is "not-stated".
