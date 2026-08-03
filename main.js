/*
 * Wires data.js + ring.js + poem.js together. Starts autoplaying (default
 * on) but the scrub slider and year-picker work at any time -- dragging the
 * slider pauses autoplay; resume with the play button.
 */

(async function main() {
  const canvas = document.getElementById("ring-canvas");
  const ctx = canvas.getContext("2d");
  const yearSelect = document.getElementById("year-select");
  const slider = document.getElementById("day-slider");
  const playBtn = document.getElementById("play-btn");
  const dateLabel = document.getElementById("date-label");
  const readout = document.getElementById("readout");
  const poemEl = document.getElementById("poem");
  const statusEl = document.getElementById("status");

  let dataset, geometry, year, dayIndex = 0, playing = true, lastTick = 0;
  const MS_PER_DAY = 90; // autoplay speed

  try {
    dataset = await EcosystemData.load("data/ecosystem_data.csv");
  } catch (err) {
    statusEl.textContent = `Failed to load data/ecosystem_data.csv: ${err.message}`;
    return;
  }
  statusEl.textContent = "";

  yearSelect.innerHTML = dataset.years.map((y) => `<option value="${y}">${y}</option>`).join("");
  year = dataset.years[0];
  yearSelect.value = year;

  function setYear(y) {
    year = Number(y);
    geometry = RingView.computeYearGeometry(dataset, year);
    slider.max = geometry.n - 1;
    dayIndex = Math.min(dayIndex, geometry.n - 1);
    renderPoem();
    renderFrame();
  }

  function renderPoem() {
    const yd = dataset.byYear[year];
    const poem = Poem.generate(yd, year, dataset);
    poemEl.innerHTML = poem.stanzas
      .map((stanza) => `<p>${stanza.join("<br>")}</p>`)
      .join("");
  }

  function renderFrame() {
    RingView.draw(ctx, canvas, geometry, dayIndex);
    slider.value = dayIndex;
    const p = geometry.points[dayIndex];
    dateLabel.textContent = `${year} · ${p.date} · day ${dayIndex + 1}/${geometry.n}`;
    readout.textContent =
      `GPP ${p.raw.gpp.toFixed(2)} gC/m²/day   ` +
      `NEE ${p.raw.nee.toFixed(2)} gC/m²/day   ` +
      `stress ${(p.raw.stress * 100).toFixed(0)}%`;
  }

  function setPlaying(next) {
    playing = next;
    playBtn.textContent = playing ? "⏸ pause" : "▶ play";
  }

  function tick(ts) {
    if (playing && ts - lastTick > MS_PER_DAY) {
      lastTick = ts;
      dayIndex = (dayIndex + 1) % geometry.n;
      renderFrame();
    }
    requestAnimationFrame(tick);
  }

  yearSelect.addEventListener("change", (e) => setYear(e.target.value));

  slider.addEventListener("input", (e) => {
    setPlaying(false);
    dayIndex = Number(e.target.value);
    renderFrame();
  });

  playBtn.addEventListener("click", () => setPlaying(!playing));

  setYear(year);
  setPlaying(true);
  requestAnimationFrame(tick);
})();
