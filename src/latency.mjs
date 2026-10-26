function stamp(value, name) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a nonnegative integer timestamp in milliseconds`);
  }
  return value;
}

function percentiles(values) {
  if (!values.length) return { p50: null, p95: null, p99: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.ceil(p / 100 * sorted.length) - 1];
  return { p50: at(50), p95: at(95), p99: at(99) };
}

export function latencyReport(rows) {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
  const stages = { eventToIngest: [], ingestToDecision: [], decisionToSubmission: [], submissionToConfirmation: [], eventToConfirmation: [] };
  let withTiming = 0, complete = 0;
  for (const row of rows) {
    if (!row.timing) continue;
    withTiming++;
    const t = row.timing;
    const fields = ['eventAvailableAtMs', 'ingestedAtMs', 'decisionAtMs', 'submittedAtMs', 'confirmedAtMs'];
    const values = fields.map((field) => t[field] == null ? null : stamp(t[field], field));
    for (let i = 1; i < values.length; i++) {
      if (values[i] != null && values[i - 1] == null) throw new TypeError(`timing ${fields[i]} requires ${fields[i - 1]}`);
      if (values[i] != null && values[i] < values[i - 1]) throw new TypeError('timing stages are out of order');
    }
    if (values[0] == null) throw new TypeError('timing requires eventAvailableAtMs');
    if (values[1] != null) stages.eventToIngest.push(values[1] - values[0]);
    if (values[2] != null) stages.ingestToDecision.push(values[2] - values[1]);
    if (values[3] != null) stages.decisionToSubmission.push(values[3] - values[2]);
    if (values[4] != null) {
      stages.submissionToConfirmation.push(values[4] - values[3]);
      stages.eventToConfirmation.push(values[4] - values[0]);
      complete++;
    }
  }
  return { schema: 'positano.sniper-latency.v1', totalRows: rows.length, withTiming, complete,
    stagesMs: Object.fromEntries(Object.entries(stages).map(([name, samples]) => [name, { samples: samples.length, ...percentiles(samples) }])),
    caveats: ['Timestamps are supplied by the caller, not independently verified.',
      'Comparable Photon timing needs the same event start, commitment level, geography, network and confirmation definition.',
      'This report cannot establish Photon parity without a measured Photon reference cohort.'] };
}
