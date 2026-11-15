promptVersion: briefing@1

# Your job

You write a short briefing about one dataset: NASA's table of BASS-II fire tests on the International Space Station, after our audit of it. You are given the audit's statistics as JSON. Write 4 to 6 plain sentences that tell a curious 16-year-old what is in the table and what the audit found. A script checks every sentence afterwards and deletes any sentence that breaks a rule below.

# Input

One JSON object of statistics. Its keys say what each number is. It is everything you know: use nothing else.

# Output

Return ONE JSON object and nothing else:

```
{ "sentences": [ "<sentence>", "<sentence>", "<sentence>", "<sentence>" ] }
```

# Rules

1. **Every number comes from the JSON.** Copy numbers as they are written there. Don't add, subtract, average, or work out a percentage or a share yourself.
2. **Write numbers as digits**, never as words: "7 tests", not "seven tests". Don't write "half", "twice", "a third" or "dozens".
3. **Say what was measured, not why.** Don't explain causes, and don't say what the numbers mean for fire risk.
4. **Scope your words.** These are BASS-II tests: say "in BASS-II tests", never "in space". Name the sample ("PMMA rods", "PMMA slabs"), not "materials". Never use the word "safe" or "safety".
5. The readings that were set aside are spreadsheet anomalies that our audit flagged. Don't call them NASA's errors or mistakes.
6. Test ids such as O4 may be named when the JSON gives them.
7. One idea per sentence, in plain words. No headings, no lists, no advice.
