# Recount — submission write-up

Meta Global AI Developer Hackathon · Indie track · Theme: Build for Your World

Live: https://recount.nerom.site (also https://recount-production-bcaf.up.railway.app)
API docs: /data · OpenAPI: /api/openapi.json

---

## Short versions

**Tagline (≤ 60 chars)**
Every Nigerian result sheet, read and checked by Muse Spark

**One line (≤ 140 chars)**
Recount reads every polling-unit result sheet INEC publishes, flags the ones that need a second look, and lets anyone check a sheet they're sent.

**Elevator (≈ 280 chars)**
Nigeria posts a photo of every polling-unit result sheet online, but nobody can read 176,000 handwritten forms. Recount does: Muse Spark 1.3 copies every figure, SAM 3.1 finds the stamp and the correction fluid, and citizens can check viral sheets and collation sheets against the original.

**Summary (≈ 150 words)**
In Nigeria, each polling unit's result is written by hand on Form EC8A, and since 2020 a photo of it is uploaded to INEC's Result Viewing portal (IReV). That makes the count public in principle. In practice, nobody reads tens of thousands of images, so disputes are fought with forwarded WhatsApp photos and figures that change between the polling unit and the collation centre.

Recount reads every sheet. Muse Spark 1.3 copies the figures and checks the sheet's own arithmetic, and SAM 3.1 locates the stamp and any correction fluid. Recount then adds every unit up and compares the total with INEC's declaration. It has read all 3,752 Osun 2026 sheets and all 2,390 Ekiti 2026 sheets, and its Osun tally lands within 0.11% of the declared totals for both leading parties. Citizens can fact-check a sheet sent to them, photograph the ward collation sheet, report problems at their unit, and download a hashed evidence pack. All of it is available on the web and on WhatsApp, ahead of the 16 January 2027 general election.

---

## The problem

Nigeria's results travel on paper. At each of 176,846 polling units, the presiding officer writes the count on Form EC8A and pastes a copy (EC60E) on the wall. The result is then added up again at the ward (EC8B), the LGA (EC8C) and the state (EC8D) before anyone is declared.

Since 2020 a photo of the polling-unit sheet has gone up on IReV (taken by the BVAS device since 2021), INEC's public results portal. The Electoral Act 2026, signed on 18 February 2026, keeps electronic transmission and makes the paper EC8A the fallback when the network fails. That makes the raw count public, but only as images. Nothing in IReV is machine-readable, and nobody reads them all. What goes wrong in practice:

- **Uploads arrive late, and nobody checks them.** The 2023 presidential sheets were still being uploaded 87 days after the election (BusinessDay). Observers like Yiaga Africa check a statistical sample of units; the rest go unread.
- **Figures change between steps.** Tribunal cases often turn on a number that differs between a unit's sheet and the ward or LGA collation sheet. The BBC documented altered results in the 2023 polls (via BusinessDay).
- **Fakes spread faster than corrections.** On election night, edited photos of result sheets go round on WhatsApp, and there is no quick way to check one against the original.
- **Problems on the day go unrecorded.** Late officials, failed BVAS machines, vote buying, voters turned away and snatched boxes are reported by observer groups days later, if at all.

I'm Nigerian, and the next general election is on 16 January 2027. I wanted a tool that someone at their own polling unit could use on the day, not just a report for analysts to read afterwards.

## What Recount does

**1. Reads every sheet.** For each polling unit, Recount fetches the IReV image and Muse Spark 1.3 copies the sheet into structured JSON:
- the header: state, LGA, ward and unit codes
- registered and accredited voters
- the ballot-paper accounting
- every party's score in figures and in words
- whether it is signed and stamped
- every entry that has been overwritten

**2. Checks each sheet against itself.** Plain code, not the model, runs a fixed set of checks on what Muse Spark read:
- party votes that don't add up to the total
- more votes than accredited voters (over-voting)
- more accredited voters than registered voters
- figures and words that disagree
- ballot papers that aren't accounted for
- no stamp or signature
- visible alterations
- the same sheet uploaded under two different units
- an upload that isn't a result sheet at all

Every flag is worded as "look at this sheet", never as an accusation.

**3. Shows the evidence.** SAM 3.1 boxes the presiding officer's round stamp and any correction fluid. Muse Spark adds boxes around overwritten digits. On each unit's page, a loupe magnifies exactly the spot in question.

**4. Adds it all up.** Unit results roll up to wards, LGAs and the state. They are compared with INEC's declared totals, then run through a margin-of-lead test that asks whether the units with problems hold enough voters to change the outcome. There is also an upload-time replay of election night.

**5. Lets citizens check what they're sent.**
- **Fact-check:** upload or forward a result sheet you've been sent. Muse Spark compares it with the IReV original like a document examiner. It decides whether the photo shows the same physical sheet, lists every changed entry and where it is on the sheet, and says how it was changed: overwritten, added digit, pasted region or different handwriting.
- **Collation check:** photograph a ward (EC8B) or LGA (EC8C) collation sheet. Muse Spark copies every row, and Recount checks each row against that unit's IReV sheet. It also re-adds the sheet's own totals and lists any unit the sheet leaves out. IReV publishes no collation sheets at all, so this is the only way to check that step.
- **Citizen copies:** add a photo of the EC60E poster or a party agent's copy for your unit. Muse Spark compares it with the IReV upload, and any disagreement goes on a public list.

**6. Works on election day.**
- **Situation room (/report):** report one of ten fixed kinds of incident at your unit, such as officials late, BVAS down, vote buying, violence, box snatched, result not posted, or all calm. A live national board updates as reports arrive. Two different people reporting the same thing within three hours marks it confirmed.
- **Election-day guide (/guide):** what to do at each step, what to do if something goes wrong, and where the result goes after counting, from the Electoral Act 2026 and INEC's rules.
- **Cover your unit (/2027):** a pledge, a share kit and a printable QR flyer, so every polling unit has someone photographing its poster on 16 January.

**7. Speaks WhatsApp.** Most Nigerians won't open a website on election night, but they're already on WhatsApp. Through the WhatsApp Cloud API, people can:
- forward a sheet to check it
- send a unit code to get its result
- use `REPORT <code>` to log an incident
- send `GUIDE` for the election-day guide

**8. Builds a tribunal evidence pack.** For any polling unit, ward or LGA, a JSON record of every IReV sheet: its SHA-256 fingerprint, Recount's reading, the flags and the situation-room reports. It shows exactly what IReV served at the time, should the files later change or vanish.

**9. Covers the whole country.** All 176,846 polling units, 8,809 wards and 774 LGAs are indexed from the 2023 presidential IReV upload. Every unit has its own page at /unit/<code>, and each election has a JSON API, CSV export and an RSS feed of changes.

## How it uses Meta's models

| Job | Model | Why |
|---|---|---|
| Read all public IReV sheets | `muse-spark-1.3-contributor`, reasoning low | The images are already public, so contributor mode is fine and costs $0.10 / $0.20 per M tokens. That makes reading a whole state affordable. |
| Read user uploads and run the fact-check | `muse-spark-1.3` (standard), reasoning medium | Photos from citizens stay out of contributor mode. Medium reasoning for the two-image forensic comparison. |
| Read collation sheets | `muse-spark-1.3`, reasoning low | A wide table of 9–30 rows × 15 parties, returned against a strict JSON schema |
| Locate the stamp and the correction fluid | `sam-3.1` | Concept prompts `"round stamp"` and `"correction fluid"`. Boxes are parsed straight from the streamed output, so no masks need decoding. |

Every Muse Spark call uses a strict JSON schema, so code, not prose, decides each flag. When the model can't read a figure, the answer is null, never a guess. SAM calls back off on 429 responses because its rate limit is tighter than Spark's.

**Geo-gating.** The Meta Model API answers from Nigeria but not from the cloud regions Railway offers. I didn't try to get round that. Instead, the reader runs on my Mac in Lagos and pushes results to the hosted site with a bearer token. The hosted site serves the pages and an image proxy, and it queues any upload that needs Muse Spark. The Mac picks up the queue, which also answers WhatsApp checks. On election day the same setup runs on any machine in an allowed region.

## Results

**Osun governorship, 15 Aug 2026:** 3,752 of 3,752 sheets read, 0 errors.

Recount's sum of the sheets compared with INEC's declaration:

| Party | Recount (sum of sheets) | INEC declared | |
|---|---:|---:|---:|
| A (Accord) | 510,520 | 511,067 | 99.89% |
| APC | 444,651 | 444,815 | 99.96% |
| ADC | 17,224 | 17,180 | 100.26% |

- 1,241 sheets flagged, 354 of them serious.
- 203 show more votes than accredited voters.
- 226 have party votes that don't add up to the total.
- 699 have visible alterations.
- 197 have no stamp.
- 3 pairs of units share the same sheet serial number.
- Uploads stopped for nearly three hours (2h 54m) on election night, at 3,292 of 3,763 units.

**Ekiti governorship, 20 Jun 2026:** 2,390 of 2,390 sheets read, 0 errors.
- 893 flagged, 303 serious.
- 194 show over-voting.

**Anambra governorship, 8 Nov 2025:** 5,634 of 5,711 sheets read (77 could not be read).
- 2,288 flagged, 849 serious.
- 428 show over-voting.
- Three test uploads were posted on two real polling units before polls opened.

**2023 presidential election:** all 176,846 polling units indexed, and 167,443 sheets were uploaded, the same as the final count in the press.
- Recount's upload-time replay reaches 82.7% by 2 March and 89.8% by 4 March. Press tallies at the time were about 84.5% and 90%.
- The first sheet appeared at 8:55 pm on election day, and only 19% were up 24 hours after polls closed.

**Lapsed domain:**
- 93,410 of the 167,443 2023 sheet links point to docs.inecelectionresults.net, a domain INEC let lapse. It was re-registered by a domain reseller on 25 April 2025.
- Those links no longer open INEC's files. The other 74,033 sheets are still on INEC's cache server.
- Recount's evidence packs keep SHA-256 fingerprints so copies of the files can be verified later.

**Collation check:** I made a demo replica of the Ejigbo II ward sheet (Osun) from its nine IReV unit sheets and changed two figures on purpose. Muse Spark read it in about 12 seconds, matched all 9 rows, and caught both changes: a unit's APC score raised from 108 to 180, and a ward total written 100 higher than its own rows add up to.

**Throughput:** about 20 sheets a minute at a concurrency of 8, which is a whole state in an afternoon.

## Safeguards

- **Non-partisan.** There are no party colours in the interface. A flag means "look at this sheet", not "fraud", and the margin test asks only whether the problem units could change the outcome. Recount never declares a winner and says on every page that it is independent of INEC.
- **No personal data.**
  - Uploads have EXIF data stripped. A photo goes public only after the model confirms it's a result sheet.
  - Situation-room reports keep a unit code, an incident kind and a time. The reporter is a keyed hash whose key lives only in memory.
  - WhatsApp numbers are never written to disk.
  - Pledges are counted, not listed.
- **Never photograph a ballot.** The guide and every upload prompt ask only for the result poster or collation sheet, never a marked ballot.
- **Honest limits.** Handwriting reading isn't perfect, and some flags are false alarms; that's why each one links to the sheet and the boxed spot. The Osun tally gap (0.04–0.26%) is the measured error rate.

## How it's built

- **Server:** Hono on Node, TypeScript. Results live in JSON files on a Railway volume, with no database to run.
- **Web:** Vite and React. The look is light and civic, with LGA maps and a page for every unit.
- **Reader:** a Node script on the Mac. It works through IReV with resume and retry, and pushes results with a bearer token.
- **Data:** the IReV public data API, a national registry built from the 2023 upload index, SHA-256 hashes of every file, and an OpenAPI 3 spec.
- **Messaging:** WhatsApp Cloud API webhook with signature verification.

## Challenges

- **Geo-gated API.** The model API wouldn't answer from the cloud, so I split the system between a reader in Lagos and a host in the cloud, without circumventing the restriction.
- **Handwriting.** Figures, words, overwritten digits and faded carbon copies all appear on one form. Strict schemas, null-for-unreadable and code-side checks kept the reading honest.
- **Timestamps.** IReV filenames record Lagos wall-clock time as if it were UTC. That made every upload look an hour late until I corrected for it.
- **Collation is offline.** IReV publishes no EC8B or EC8C sheets, so the collation check had to come from citizens' photos.
- **Staying neutral.** It's easy to make a tool like this look like it's on one side. The wording, colours and the "look at this sheet" framing were all designed to avoid that.

## What's next

- Run the full pipeline live on 16 January 2027, with the reader on standby and WhatsApp numbers published per state.
- Read all 2023 presidential sheets that still open, for a national baseline before 2027.
- Partner with observer groups such as Yiaga Africa and with newsrooms, so flagged units reach people who can go and look.
- Add Yoruba, Hausa and Igbo replies on WhatsApp.

## Sources

- Electoral Act 2026, signed 18 Feb 2026 — https://statehouse.gov.ng/president-tinubu-signs-amended-electoral-act-commits-to-strengthening-democracy/
- INEC declares Osun 2026 result — https://www.icirnigeria.org/inec-declares-adeleke-winner-of-osun-governorship-election/
- INEC still uploading results 87 days after the 2023 presidential election — https://businessday.ng/news/article/inec-still-uploading-results-87-days-after-presidential-election/
- BBC on altered results in the 2023 polls — https://businessday.ng/news/article/nigeria-election-the-mystery-of-the-altered-results-in-disputed-poll-bbc/
- Yiaga Africa, 2023 presidential election preliminary statement — https://yiaga.org/wp-content/uploads/2023/05/Preliminary-Statement-2023-Presidential-Election.pdf
- Yiaga Africa on voter suppression and violence, March 2023 — https://www.thisdaylive.com/2023/03/20/yiaga-africa-guber-and-state-assembly-elections-marred-by-voter-suppression-electoral-violence-others/
- CDD West Africa on 5 million uncollected PVCs — https://nannews.ng/2027-elections-cdd-west-africa-decries-5m-uncollected-pvcs/
- IReV and Osun 2026 — https://www.premiumtimesng.com/opinion/904245-osun-2026-is-irev-reclaiming-its-title-as-nigerias-electoral-game-changer-by-samson-itodo.html
- VOA on the 2023 declaration and the opposition's court challenge — https://www.voanews.com/a/nigeria-s-labour-party-to-challenge-presidential-election-result-in-court-/6985500.html

### Demo video credits

- Archive footage: Voice of America (Timothy Obiezu, Abuja, March 2023). It's a US government work, so it's in the public domain. Only VOA's own shots are used; the clips carrying Reuters, AP or AFP material were left out.
- Photos from Wikimedia Commons, all CC BY-SA 4.0: "NYSC member counting votes during 2023 presidential election in Gombe" by Iyusuf615; "2023 Elections in Nigeria 20" by Yemi Festus; "OchejaCollationCenter" by Harryman4ever.
- Music: Mixkit (royalty-free licence).

## Try it (for judges)

1. **/osun:** the full Osun read, with the tally against INEC, the flags, the LGA map and the replay.
2. Open any flagged unit to see the sheet, the boxed stamp and edits, and the loupe.
3. **/check:** upload any Osun, Ekiti or Anambra result sheet and get a verdict in about a minute, or scroll to the worked example (a real sheet with APC changed from 233 to 283).
4. **/collation:** "Try the demo sheet" catches both planted changes.
5. **/report:** the situation-room board. **/guide:** the election-day guide.
6. **/unit/29-17-03-007:** a polling unit's page, with its reports and links to the sheet.
7. **/data:** the API and CSV. Every sheet page has an **Evidence pack** button (for example /osun/pack/pu/6a7f7928dcbc755a763f1999) with the SHA-256 of each IReV file as published.
