/*
 * Poem generator. Logic is fixed: sample every 14 days, classify each
 * sample into a state from NEE sign/magnitude + stress level, break a new
 * stanza wherever the state changes, pick words from state-specific vocab
 * banks. Only the DATA changes the output -- a real year's actual number
 * and rhythm of stress spikes reshapes stanza count/length without
 * touching this file.
 */

const Poem = (() => {
  const SAMPLE_INTERVAL_DAYS = 14;

  // Priority-ordered rules: stress dominates the narrative once it's bad
  // enough, otherwise carbon exchange (nee) drives the state.
  function classifyState(neeCategory, stressLevel) {
    const sourceish = neeCategory === "source" || neeCategory === "strong_source";
    if (stressLevel === "severe") return sourceish ? "collapsing" : "straining";
    if (stressLevel === "moderate") return sourceish ? "faltering" : "laboring";
    if (neeCategory === "strong_sink") return "flourishing";
    if (neeCategory === "sink") return "growing";
    if (neeCategory === "neutral") return "steady";
    return "dormant"; // source/strong_source, but stress is low -- ordinary winter respiration
  }

  const SUBJECTS = ["the grass", "the roots", "the field", "the soil", "the plain", "the leaves", "the canopy", "the ground"];

  const VOCAB = {
    flourishing: {
      verbs: ["drink", "surge upward", "reach", "swell", "gather light", "breathe it in"],
      tail: ["without asking", "all at once", "toward the sun", "greedily", "and do not stop"],
      lines: [6, 9],
    },
    growing: {
      verbs: ["stretch", "gather", "hold on", "climb slow", "widen"],
      tail: ["day by day", "an inch at a time", "toward what light there is"],
      lines: [5, 8],
    },
    steady: {
      verbs: ["hold", "wait", "turn", "settle", "keep even"],
      tail: ["for now", "as before", "in balance"],
      lines: [4, 6],
    },
    dormant: {
      verbs: ["sleep", "rest", "fold inward", "go still", "thin"],
      tail: ["until spring", "beneath the frost", "without complaint"],
      lines: [4, 6],
    },
    laboring: {
      verbs: ["strain", "reach thin", "grip", "search deeper", "hold on"],
      tail: ["against the dry", "for what's left", "and just barely"],
      lines: [3, 5],
    },
    faltering: {
      verbs: ["falter", "waver", "thin out", "give back", "slip"],
      tail: ["a little more", "than it takes in", "day after day"],
      lines: [3, 5],
    },
    straining: {
      verbs: ["clench", "brace", "grasp", "resist", "hold the line"],
      tail: ["against the heat", "against the dry", "with what's left"],
      lines: [3, 4],
    },
    collapsing: {
      verbs: ["release", "surrender", "exhale", "crack", "let go"],
      tail: ["at last", "into the air", "all of it"],
      lines: [2, 4],
    },
  };

  const STRESS_ADJ = {
    none: "green",
    mild: "dry-edged",
    moderate: "brittle",
    severe: "cracked",
  };

  function pick(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
  }

  // Simple seeded RNG so a given year's poem is reproducible across runs
  // (not re-randomized every autoplay loop or scrub), while still varying
  // sample-to-sample.
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildLine(state, stressLevel, dayIndex, rng) {
    const bank = VOCAB[state];
    const subject = pick(SUBJECTS, rng);
    const verb = pick(bank.verbs, rng);
    const adj = STRESS_ADJ[stressLevel];
    const [minWords, maxWords] = bank.lines;
    const useAdj = rng() < 0.5;
    const useTail = rng() > 0.35 || maxWords - minWords <= 1;

    let line = useAdj ? `${subject}, ${adj}, ${verb}` : `${subject} ${verb}`;
    if (useTail) line += ` ${pick(bank.tail, rng)}`;
    return line;
  }

  /**
   * @param {object} yearData - dataset.byYear[year]
   * @param {number} year
   * @param {object} dataset - full dataset (for rescale/classify helpers)
   * @returns {{ stanzas: string[][], meta: {states: string[], sampleDays: number[]} }}
   */
  function generate(yearData, year, dataset) {
    const rng = mulberry32(year);
    const n = yearData.dates.length;
    const sampleDays = [];
    for (let d = 0; d < n; d += SAMPLE_INTERVAL_DAYS) sampleDays.push(d);

    const states = sampleDays.map((d) => {
      const neeCat = dataset.classifyNee(yearData.nee[d]);
      const stressLevel = dataset.classifyStress(dataset.rescale("stress", yearData.stress[d]));
      return { state: classifyState(neeCat, stressLevel), stressLevel, d };
    });

    const stanzas = [];
    let current = [];
    let prevState = null;
    for (const { state, stressLevel, d } of states) {
      if (prevState !== null && state !== prevState) {
        stanzas.push(current);
        current = [];
      }
      current.push(buildLine(state, stressLevel, d, rng));
      prevState = state;
    }
    if (current.length) stanzas.push(current);

    return {
      stanzas,
      meta: { states: states.map((s) => s.state), sampleDays, dates: sampleDays.map((d) => yearData.dates[d]) },
    };
  }

  return { generate, classifyState, SAMPLE_INTERVAL_DAYS };
})();
