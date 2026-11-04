# Recount: product and design direction (Oct 31)

## Where Recount stands

Research on Oct 31 found two groups that already read the Osun 2026 sheets:

- **Mundx Analytics** (mundx.com). Two models read each sheet and the arithmetic is checked. It has a polling-unit drill-down and a "my polling unit" lookup. It does not check stamps or signatures, has no visual alteration evidence, no viral-sheet verifier, and no open data. Its stated tally accuracy is 95.68%.
- **Dataphyte**. OCR plus people. The output is a long article ("900+ PUs show discrepancies"). It has no interactive audit.
- **Others**: IReV shows only images. Yiaga, KDI, CDD and BudgIT publish PDFs and press statements. CDD and Dubawa fact-check viral sheets by hand.

Recount's edge is that it shows the evidence on the sheet itself:

1. **Sheet X-ray.** Every flag is explained next to the real image. SAM 3.1 locates the stamp, and Muse Spark marks each overwritten figure.
2. **Viral sheet checker.** Upload a photo and get a verdict and a visual diff against the IReV original. Nobody automates this today.
3. **Accuracy you can check.** Our tally is within 0.2% of INEC's declared result for every major party.
4. **"Does it change the outcome?"** Votes on flagged sheets set against the winning margin, with no verdict.
5. **Evidence pack and open data.** A printable exhibit for each polling unit, and a CSV and JSON of every sheet. This answers the 2025 Edo tribunal complaint that evidence was "dumped" without being tied to individual polling units.

Every page says the output is unofficial and is not a declaration. INEC has said publishing a declaration would be an electoral offence.

## Identity: the carbon copy and the auditor's pencil

The EC8A is a carbon-copy form. Recount reads like an auditor's desk: white paper, carbon-blue ink, and red pencil only where something needs a second look.

- Paper `#ffffff` / panel `#f5f6f8` / rule `#e3e5ea`
- Ink `#0f1419` / secondary `#4a5160` / muted `#7a8190`
- Carbon (brand, links, stamp marks) `#1f3fbf`
- Red pencil (serious flags, edits) `#d03b3b`. Amber (needs a look) `#b7791f` text on `#fdf3dc`. Clear `#14804a`.
- Map: one-hue blue sequential ramp (dataviz reference ramp 100→650). Party colours are never used, so the site stays non-partisan.
- Type: Newsreader for headlines (newsroom voice; Mundx uses a bold grotesk), Geist for UI, Geist Mono for codes and figures.
- Marks: thin 2px boxes with corner ticks, like a reviewer's crop marks, never filled blobs.

## References

- BBC election results: the "enter a postcode" search comes first. Our version is "Find your polling unit".
- AP and NYT: the denominator and freshness are always visible ("3,752 of 3,752 sheets read").
- Kenya IEBC Form 34A portal and Mexico PREP: source image beside the extracted numbers.
- AP's "Why we called it": our "Why this sheet was flagged", including "what this does not prove".
- NYT and Economist maps: one-hue choropleth with honest gaps.

## Data credits

LGA boundaries are from geoBoundaries (wmgeolab, CC BY 4.0). Result sheets are from INEC IReV.
