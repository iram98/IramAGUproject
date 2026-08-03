/*
 * Ring drawing. Day-of-year maps to angle around the circle; NEE (rescaled,
 * recalibrated to the real data's range) maps to radius -- carbon-uptake
 * days bulge outward, carbon-release days pull inward, so the ring's shape
 * over a year traces the site's actual growing-season pulse. Stress maps to
 * color (green -> brittle brown -> cracked red). GPP draws a fainter inner
 * productivity ring. This file has no knowledge of where the numbers came
 * from -- it only ever consumes dataset.rescale()'d 0..1 values.
 */

const RingView = (() => {
  const R0 = 90; // base radius for the NEE ring
  const R_EXTRA = 70; // max outward bulge for a strong sink day
  const R0_INNER = 40; // base radius for the GPP ring
  const R_INNER_EXTRA = 35;

  function stressColor(t) {
    // green (healthy) -> tan -> brick red (severe), t in 0..1
    const stops = [
      [76, 175, 80],
      [189, 165, 74],
      [178, 58, 46],
    ];
    const seg = t <= 0.5 ? 0 : 1;
    const localT = t <= 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    const [r1, g1, b1] = stops[seg];
    const [r2, g2, b2] = stops[seg + 1];
    const r = Math.round(r1 + (r2 - r1) * localT);
    const g = Math.round(g1 + (g2 - g1) * localT);
    const b = Math.round(b1 + (b2 - b1) * localT);
    return `rgb(${r},${g},${b})`;
  }

  function computeYearGeometry(dataset, year) {
    const yd = dataset.byYear[year];
    const n = yd.dates.length;
    const points = [];
    for (let d = 0; d < n; d++) {
      const angle = (d / n) * Math.PI * 2 - Math.PI / 2;
      const neeR = dataset.rescale("nee", yd.nee[d]); // 0 = strongest sink, 1 = strongest source
      const gppR = dataset.rescale("gpp", yd.gpp[d]);
      const stressR = dataset.rescale("stress", yd.stress[d]);
      const radius = R0 + (1 - neeR) * R_EXTRA;
      const innerRadius = R0_INNER + gppR * R_INNER_EXTRA;
      points.push({
        angle,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        ix: Math.cos(angle) * innerRadius,
        iy: Math.sin(angle) * innerRadius,
        color: stressColor(stressR),
        raw: { gpp: yd.gpp[d], nee: yd.nee[d], stress: yd.stress[d] },
        date: yd.dates[d],
      });
    }
    return { points, n };
  }

  function draw(ctx, canvas, geometry, dayIndex) {
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);

    const { points } = geometry;

    // faint inner GPP productivity ring
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.ix, p.iy) : ctx.lineTo(p.ix, p.iy)));
    ctx.closePath();
    ctx.strokeStyle = "rgba(120, 200, 140, 0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // main NEE ring, colored per-segment by stress
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // faint reference circle at R0 (nee == 0 baseline isn't meaningful post-rescale,
    // this just gives the eye a fixed reference to judge bulge/pull against)
    ctx.beginPath();
    ctx.arc(0, 0, R0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // current-day marker
    const cur = points[dayIndex];
    if (cur) {
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, 6, 0, Math.PI * 2);
      ctx.strokeStyle = cur.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  return { computeYearGeometry, draw };
})();
