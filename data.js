/*
 * Data layer: loads the real (or, for now, placeholder) CSV, repairs gaps,
 * groups by year, and recalibrates normalization against the actual data
 * range instead of an assumed one.
 *
 * Everything downstream (ring.js, poem.js) only ever touches:
 *   - dataset.years                -> [2012, 2015, ...]
 *   - dataset.byYear[year].gpp[]   -> raw gC/m2/day
 *   - dataset.byYear[year].nee[]   -> raw gC/m2/day
 *   - dataset.byYear[year].stress[]-> raw 0..1
 *   - dataset.byYear[year].dates[] -> ISO date strings, same length/order
 *   - dataset.rescale(varName, rawValue) -> 0..1, clipped at real data's
 *     2nd/98th percentile so one outlier day doesn't flatten the rest
 *   - dataset.classifyStress(rescaledStress) -> 'none'|'mild'|'moderate'|'severe'
 *
 * Swapping in a real RangeSTAR/RCTM export: replace data/ecosystem_data.csv
 * with a file using the same three columns (date,gpp,nee,stress) and this
 * file needs zero changes.
 */

const EcosystemData = (() => {
  const VARS = ["gpp", "nee", "stress"];

  function parseCSV(text) {
    const lines = text.trim().split("\n");
    const header = lines[0].split(",").map((h) => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(",");
      const row = { date: cells[header.indexOf("date")] };
      for (const v of VARS) {
        const raw = cells[header.indexOf(v)];
        row[v] = raw === undefined || raw === "" ? NaN : parseFloat(raw);
      }
      rows.push(row);
    }
    return rows;
  }

  // Some days may be entirely absent from the file (not just blank fields).
  // Rebuild a full Jan1->Dec31 calendar for the year and slot rows into it,
  // leaving NaN wherever a date never showed up at all.
  function reindexToFullYear(year, rowsForYear) {
    const byDate = new Map(rowsForYear.map((r) => [r.date, r]));
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const dayCount = isLeap ? 366 : 365;
    const dates = [];
    const cols = { gpp: [], nee: [], stress: [] };

    const d = new Date(Date.UTC(year, 0, 1));
    for (let i = 0; i < dayCount; i++) {
      const iso = d.toISOString().slice(0, 10);
      dates.push(iso);
      const row = byDate.get(iso);
      for (const v of VARS) cols[v].push(row ? row[v] : NaN);
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return { dates, ...cols };
  }

  // Linear interpolation across NaN runs. Leading/trailing NaN runs (can't
  // interpolate before the first real value or after the last) hold at the
  // nearest known value rather than inventing a trend.
  function interpolateGaps(arr) {
    const out = arr.slice();
    const n = out.length;

    let firstValid = out.findIndex((v) => !Number.isNaN(v));
    if (firstValid === -1) return out.fill(0); // no data at all for this column/year
    for (let i = 0; i < firstValid; i++) out[i] = out[firstValid];

    let lastValid = n - 1 - out.slice().reverse().findIndex((v) => !Number.isNaN(v));
    for (let i = lastValid + 1; i < n; i++) out[i] = out[lastValid];

    let i = firstValid;
    while (i < lastValid) {
      if (Number.isNaN(out[i + 1])) {
        const gapStart = i;
        let j = i + 1;
        while (Number.isNaN(out[j])) j++;
        const gapEnd = j; // known value
        const span = gapEnd - gapStart;
        for (let k = gapStart + 1; k < gapEnd; k++) {
          const t = (k - gapStart) / span;
          out[k] = out[gapStart] * (1 - t) + out[gapEnd] * t;
        }
        i = gapEnd;
      } else {
        i++;
      }
    }
    return out;
  }

  function percentile(sorted, p) {
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    const t = idx - lo;
    return sorted[lo] * (1 - t) + sorted[hi] * t;
  }

  function computeScale(allValues, loPct = 2, hiPct = 98) {
    const sorted = allValues.slice().sort((a, b) => a - b);
    return { min: percentile(sorted, loPct), max: percentile(sorted, hiPct) };
  }

  async function load(url = "data/ecosystem_data.csv") {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    const text = await res.text();
    return loadFromText(text);
  }

  // Used both by load() and by tests / the zero-dependency embedded-array path.
  function loadFromText(text) {
    const rows = parseCSV(text);
    const years = [...new Set(rows.map((r) => r.date.slice(0, 4)))]
      .map(Number)
      .sort((a, b) => a - b);

    const byYear = {};
    for (const year of years) {
      const rowsForYear = rows.filter((r) => Number(r.date.slice(0, 4)) === year);
      const full = reindexToFullYear(year, rowsForYear);
      byYear[year] = {
        dates: full.dates,
        gpp: interpolateGaps(full.gpp),
        nee: interpolateGaps(full.nee),
        stress: interpolateGaps(full.stress),
      };
    }

    // Global (cross-year) scale per variable, so switching years on the
    // year-picker doesn't rescale the ring under the viewer's feet.
    const scales = {};
    for (const v of VARS) {
      const all = years.flatMap((y) => byYear[y][v]);
      scales[v] = computeScale(all);
    }

    const clamp01 = (x) => Math.min(1, Math.max(0, x));
    function rescale(varName, raw) {
      const { min, max } = scales[varName];
      if (max === min) return 0.5;
      return clamp01((raw - min) / (max - min));
    }

    // Stress classification thresholds from the real distribution's own
    // quantiles (33rd/66th/90th), not hardcoded numbers tuned for synthetic data.
    const stressRescaled = years
      .flatMap((y) => byYear[y].stress)
      .map((v) => rescale("stress", v))
      .sort((a, b) => a - b);
    const cuts = {
      mild: percentile(stressRescaled, 33),
      moderate: percentile(stressRescaled, 66),
      severe: percentile(stressRescaled, 90),
    };
    function classifyStress(rescaledStress) {
      if (rescaledStress >= cuts.severe) return "severe";
      if (rescaledStress >= cuts.moderate) return "moderate";
      if (rescaledStress >= cuts.mild) return "mild";
      return "none";
    }

    // NEE sign/magnitude classification, in gC/m2/day RAW units (sign is
    // physically meaningful -- negative is a carbon sink -- so this is
    // classified on the real value, not the 0..1 rescale). Cut points come
    // from the real distribution's own percentiles rather than fixed
    // numbers tuned against synthetic data's -0.6..+0.4 range.
    const neeSorted = years.flatMap((y) => byYear[y].nee).sort((a, b) => a - b);
    const neeCuts = {
      strongSink: percentile(neeSorted, 10),
      sink: percentile(neeSorted, 40),
      source: percentile(neeSorted, 60),
      strongSource: percentile(neeSorted, 90),
    };
    function classifyNee(rawNee) {
      if (rawNee <= neeCuts.strongSink) return "strong_sink";
      if (rawNee <= neeCuts.sink) return "sink";
      if (rawNee < neeCuts.source) return "neutral";
      if (rawNee < neeCuts.strongSource) return "source";
      return "strong_source";
    }

    return { years, byYear, scales, rescale, classifyStress, classifyNee };
  }

  return { load, loadFromText, _internal: { parseCSV, interpolateGaps, computeScale } };
})();
