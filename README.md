# VRINGON Jewelry Agent

An agent for jewellery design. It takes a brief, researches the season, forecasts the next one, and
carries the result through to campaign photography and a 3D model — with every claim traceable back
to the page it came from.

**Live demo →** https://jhkim1543.github.io/vringon-jewelry-agent/

The hosted page is read-only. Research and image generation run on a local Node server that is not
part of a static build, so nothing is called from there. Everything a full run produced is saved:
open **분석 내역** in the left rail to walk through a finished run, its board, the forecast and the
PDF exports.

> Footwear is a separate product: **vringon-shoe-agent**. The two share a lineage but diverge where
> it matters — rules, signal axes, view sets, wear placement and QA are all jewellery-specific here.

---

## What a run does

| Stage | What comes out |
|---|---|
| **Research** | Competitor pieces with prices and evidence, trend signals with sources, and a next-season forecast |
| **Sketches** | Specs per tier, casting and setting rule checks, then black-ink technical sketches |
| **Designs** | Each sketch becomes several designs, each from its own trend-based prompt, plus extra views and colourways |
| **Campaign shots** | Final picks worn on a virtual model and staged in studio and on location |
| **3D showroom** | Multiview renders go to Tripo; you get a GLB you can turn on the board |

Each stage is optional. The scope selector says what you get and what it costs before you start, and
recalculates as you change the brief. The number of designs per sketch dominates cost, so it sits in
the main quantity section rather than buried in advanced settings.

Rule-rejected specs never reach image generation, identical prompts are served from disk cache, and a
per-run image cap sends anything past it to a diagram. A failed image is isolated to that one cut.

---

## What makes it jewellery-specific

**Manufacturing rules** run on every spec before anything is rendered.

| Rule | Catches |
|---|---|
| J-01 | Wall thickness under 0.8mm — cannot be cast |
| J-02 | A new mould on a Core piece — Core has to reuse an existing mould |
| J-05 | Fewer than 4 prongs on a stone over 5mm — the stone can work loose |
| J-10 | An earring over 5g — past what an earlobe carries comfortably |

**Signal axes** the research is organised around: form, metal and colour, stones, setting, how it is
worn, scale, layering, price band.

**View set**: front (reference), 45 degrees, detail close-up, worn angle.

**Wear placement** is per item type, not per category. A ring is fitted to a ring finger, a stud to
an earlobe, a pendant to the collarbone, a bangle to a wrist, an anklet to an ankle. This was a real
bug once: rings were being fitted to wrists because the prompt only knew "jewellery".

**QA** checks stone count, setting readability, prong count, cross-view object identity, and that a
pair matches left to right.

---

## The research

Three separate passes, each with its own cache and schema. One failing does not stop the others.

**Competitors** are researched one brand at a time — asking for all of them at once makes the answers
shallow. Each brand yields two or three pieces with observed design traits, market signals
(best-seller badges, sold-out markers), price, and the pages they came from. No sales score is
invented: a single collection pass cannot establish a time series.

**Trend signals** come from a four-step pass — plan sub-questions, search each, synthesise, then
structure. Only observed design attributes count as signals; "data not available" is a note, never a
signal.

**The season forecast** is built in three steps: map four macrotrends, research each in depth, then
trace how the last few seasons moved. The observed season is evidence; the subject is the season
after it. FW26 evidence produces an SS27 forecast, each macrotrend carrying its own call and a
confidence.

---

## Language

The report language is chosen when the run starts, not taken from the UI language. Research, signals
and both PDFs come out in that language — Korean, Japanese or English. A Korean screen producing an
English report is a normal thing to want, so the two are independent.

Machine keys (`attribute`) stay English snake_case; translating them would break the logic that
groups signals.

---

## Running it for real

```bash
git clone https://github.com/jhkim1543/vringon-jewelry-agent
cd vringon-jewelry-agent
npm install
cp .env.example .env      # add your keys
npm run dev
```

Keys live only in `.env`, which is gitignored and read by the Node side. They never get a `VITE_`
prefix, so they cannot reach the browser bundle.

| Key | Used for |
|---|---|
| `OPENAI_API_KEY` | Research (web search), sketches, renders, campaign shots |
| `GEMINI_API_KEY` | Optional. Structured planning |
| `TRIPO_API_KEY` | Multiview to 3D |
| `MIRO_ACCESS_TOKEN` | Optional. Without it, board export downloads a build plan instead |

Without `OPENAI_API_KEY` the app still runs and falls back to SVG diagrams, so the whole flow can be
walked through without spending anything.

```bash
npm run build          # dist/
BUILD_TARGET=pages npm run build   # docs/, for GitHub Pages
```

---

## Known limits

- **Sharing is per-browser.** Runs live in localStorage, so a shared link only opens a board the
  receiving browser already has. Live co-viewing needs a relay server; the hook is marked in
  `src/core/share.ts` rather than faked.
- **Miro export downloads a plan** unless `MIRO_ACCESS_TOKEN` is set. Creating a board in someone
  else's Miro account needs OAuth, which needs a server to hold the token.
- **Deep research** (`o3-deep-research`) returns 404 without organisation verification. The code
  path is ready behind `OPENAI_DEEP_RESEARCH=1`; until then the four-step pass runs instead.
