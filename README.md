#goal

A data-driven ring visualization + generative poem, built from an ecosystem's
daily carbon flux and water-stress record. No audio in this build.

## Data

`data/ecosystem_data.csv` has columns `date,gpp,nee,stress`
(GPP/NEE in gC/m²/day, stress 0–1). **This CSV is placeholder data** —
formula-generated to have the shape and messiness real RangeSTAR/RCTM output
will have (multi-year, ~7% missing days from simulated cloud cover, a
drought year and a normal year with visibly different ranges) — so the
pipeline below could be built and tested before real data was available.

To wire in the real export: replace `data/ecosystem_data.csv` with a file
using the same three columns. `js/data.js` does not need to change —
normalization is recalibrated from whatever min/max/percentiles are actually
in the file, not hardcoded.

## Running

Needs a static file server (fetch() of a local CSV is blocked under
`file://`), no internet or build step required:

```
python3 -m http.server 8000
```

then open `http://localhost:8000/`.

## How it works

- **`js/data.js`** — loads the CSV, reindexes each year to its full
  calendar (handling missing rows and different year lengths), linearly
  interpolates gaps, and computes a `rescale(var, value) -> 0..1` per
  variable clipped at the real data's 2nd/98th percentile.
- **`js/ring.js`** — day-of-year -> angle, NEE -> radius (sink days bulge
  out, source days pull in), stress -> color, GPP -> inner productivity
  ring.
- **`js/poem.js`** — samples every 14 days, classifies each sample into a
  state from NEE sign/magnitude + stress level, breaks a new stanza on
  every state change, picks lines from state-specific vocabulary banks.
  A drought year and a normal year produce structurally different poems
  (stanza count, line rhythm) from the same unchanged logic.
- **`js/main.js`** — wires it together. Autoplays by default; the slider
  and year-picker work at any time (dragging the slider pauses autoplay).

## Mode

Both at once: autoplays on load, fully scrubbable, with a year-picker to
compare a drought year vs. a normal year.
