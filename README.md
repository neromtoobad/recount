# Recount

Every Nigerian result sheet, read and checked by Muse Spark.

**Live:** https://recount.nerom.site · **Write-up:** [submission/WRITEUP.md](submission/WRITEUP.md) · Meta Global AI Developer Hackathon, Indie track

Nigeria posts a photo of every polling-unit result sheet (Form EC8A) to INEC's Result Viewing portal (IReV), but nothing there is machine-readable and nobody reads all 176,846 of them. Recount does:

- **Muse Spark 1.3** copies each sheet into strict JSON: the header codes, voters, ballot accounting, every party's score in figures *and* in words, the stamp and signature, and every overwritten entry, with a box around each alteration.
- **SAM 3.1** finds the official stamp and any correction fluid from a text prompt.
- **Plain code** checks the sheet against itself (do the votes add up, more votes than voters, figures against words, a missing stamp), then adds every unit up and compares the total with INEC's declaration.
- **Second look:** for every arithmetic or code flag, Muse Spark goes back to the image with reasoning on, re-reads only the entries that flag depends on, and says whether the problem is on the paper or was a misreading, with an explanation and a box.
- **Fact-check:** drop in a sheet someone forwarded you. Recount finds the polling unit, pulls the original from IReV, and Muse Spark compares the two like a document examiner.
- **Collation:** photograph a ward collation sheet (EC8B). Every row is checked against the polling-unit sheets beneath it.
- **Evidence packs:** a SHA-256 fingerprint of every sheet as it was published, so it can be proven later.

Read so far: Osun 2026 (3,752 sheets, total within 0.11% of the declared result), Ekiti 2026 (2,390) and Anambra 2025 (5,634).

Recount doesn't declare winners. A flag means "look at this sheet again", not fraud.

## Layout

| Path | What |
|---|---|
| `server/` | Hono API. `lib/reader.ts` (Muse Spark sheet reader), `lib/sam.ts` (SAM 3.1), `lib/checks.ts` (the sheet checks), `lib/compare.ts` (two-image forensic comparison), `lib/collation-sheet.ts`, `lib/pack.ts` (evidence packs), `lib/whatsapp.ts` |
| `web/` | Vite + React front end |
| `scripts/` | `index-irev.mjs` (index an election), `analyze.ts` (read sheets), `copies.ts` (watch queue for user uploads), `push.ts` (send results to the hosted site) |
| `video/` | the demo video, built as an HTML composition and rendered with headless Chrome and ffmpeg |

## Run

```bash
npm install
echo "MODEL_API_KEY=..." > .env    # Meta Model API key
npm run index -- osun              # index the polling units and sheet URLs
npm run analyze -- osun --limit 50 # read 50 sheets with Muse Spark + SAM 3.1
npm run dev                        # API on :8791, web on :5181
```

The Meta Model API is called from the machine running the scripts. The hosted site only serves the results it is sent.

## Data and credits

The sheet images are public records published by INEC on IReV. The demo video uses Voice of America footage (public domain) and Wikimedia Commons photos (CC BY-SA 4.0); see the write-up for the full credits.
