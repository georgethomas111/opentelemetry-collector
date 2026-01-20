import { MetricsStore } from "./metrics-store.js";

function canonicalizeLabels(labels) {
  const keys = Object.keys(labels).sort();
  const normalized = {};
  for (const key of keys) {
    normalized[key] = String(labels[key]);
  }
  return normalized;
}

function labelKey(labels) {
  const keys = Object.keys(labels).sort();
  return keys.map((key) => `${key}=${labels[key]}`).join("|");
}

function toDate(input, fallback) {
  if (input === undefined || input === null) {
    return fallback;
  }
  if (input instanceof Date) {
    return input;
  }
  if (typeof input === "number") {
    return new Date(input);
  }
  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return new Date(parsed);
}

export class InMemoryMetricsStore extends MetricsStore {
  constructor({ windowMs, bucketSizeMs } = {}) {
    super();
    this.windowMs = windowMs;
    this.bucketSizeMs = bucketSizeMs;
    this.series = new Map();
    this.metricNames = new Map();
  }

  ingest(records, nowMs = Date.now()) {
    if (!Array.isArray(records)) {
      return;
    }

    for (const record of records) {
      const timestampMs = record.timestampMs ?? nowMs;
      const bucketStart = Math.floor(timestampMs / this.bucketSizeMs) * this.bucketSizeMs;
      const labels = canonicalizeLabels(record.attributes || {});
      const seriesKey = `${record.metricName}::${labelKey(labels)}`;

      let metricMeta = this.metricNames.get(record.metricName);
      if (!metricMeta) {
        metricMeta = new Set();
        this.metricNames.set(record.metricName, metricMeta);
      }
      for (const key of Object.keys(labels)) {
        metricMeta.add(key);
      }

      let metricSeries = this.series.get(seriesKey);
      if (!metricSeries) {
        metricSeries = {
          metricName: record.metricName,
          labels,
          buckets: new Map()
        };
        this.series.set(seriesKey, metricSeries);
      }

      let bucket = metricSeries.buckets.get(bucketStart);
      if (!bucket) {
        bucket = {
          ts: bucketStart,
          count: 0,
          sum: 0,
          min: null,
          max: null,
          last: null,
          histogram: null
        };
        metricSeries.buckets.set(bucketStart, bucket);
      }

      if (record.type === "histogram" && record.histogram) {
        const incoming = record.histogram;
        if (!bucket.histogram) {
          bucket.histogram = {
            count: 0,
            sum: 0,
            bucketCounts: Array.from(incoming.bucketCounts),
            explicitBounds: Array.from(incoming.explicitBounds)
          };
        }

        const boundsMatch =
          bucket.histogram.explicitBounds.length === incoming.explicitBounds.length &&
          bucket.histogram.explicitBounds.every((value, index) => value === incoming.explicitBounds[index]);

        if (boundsMatch) {
          bucket.histogram.count += incoming.count;
          bucket.histogram.sum += incoming.sum;
          bucket.histogram.bucketCounts = bucket.histogram.bucketCounts.map(
            (value, index) => value + (incoming.bucketCounts[index] || 0)
          );
          bucket.count += incoming.count;
          bucket.sum += incoming.sum;
          const avg = incoming.sum / incoming.count;
          bucket.min = bucket.min === null ? avg : Math.min(bucket.min, avg);
          bucket.max = bucket.max === null ? avg : Math.max(bucket.max, avg);
          bucket.last = avg;
        }
        continue;
      }

      const value = Number(record.value);
      if (!Number.isNaN(value)) {
        bucket.count += 1;
        bucket.sum += value;
        bucket.min = bucket.min === null ? value : Math.min(bucket.min, value);
        bucket.max = bucket.max === null ? value : Math.max(bucket.max, value);
        bucket.last = value;
      }
    }

    this.prune(nowMs);
  }

  prune(nowMs) {
    const cutoff = nowMs - this.windowMs;
    for (const metricSeries of this.series.values()) {
      for (const bucketStart of metricSeries.buckets.keys()) {
        if (bucketStart < cutoff) {
          metricSeries.buckets.delete(bucketStart);
        }
      }
    }
  }

  querySeries({ metric, start, end, step, groupBy, agg, compact = true } = {}) {
    const now = Date.now();
    const startDate = toDate(start, new Date(now - this.windowMs));
    const endDate = toDate(end, new Date(now));
    const stepMs = step ? Number(step) : this.bucketSizeMs;
    const bucketStep = Number.isNaN(stepMs) || stepMs <= 0 ? this.bucketSizeMs : stepMs;
    const groupKeys = Array.isArray(groupBy) ? groupBy : [];
    const aggregation = agg || "avg";

    const results = [];
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    for (const metricSeries of this.series.values()) {
      if (metricSeries.metricName !== metric) {
        continue;
      }

      const labels = metricSeries.labels;
      const groupedLabels = {};
      for (const key of groupKeys) {
        if (labels[key] !== undefined) {
          groupedLabels[key] = labels[key];
        }
      }

      const points = [];
      for (let ts = Math.floor(startMs / bucketStep) * bucketStep; ts <= endMs; ts += bucketStep) {
        const windowStart = ts;
        const windowEnd = ts + bucketStep;

        let count = 0;
        let sum = 0;
        let min = null;
        let max = null;
        let last = null;
        let histogram = null;

        for (const bucket of metricSeries.buckets.values()) {
          if (bucket.ts >= windowStart && bucket.ts < windowEnd) {
            count += bucket.count;
            sum += bucket.sum;
            min = min === null ? bucket.min : Math.min(min, bucket.min);
            max = max === null ? bucket.max : Math.max(max, bucket.max);
            last = bucket.last;

            if (bucket.histogram) {
              if (!histogram) {
                histogram = {
                  count: 0,
                  sum: 0,
                  bucketCounts: Array.from(bucket.histogram.bucketCounts),
                  explicitBounds: Array.from(bucket.histogram.explicitBounds)
                };
              }

              const boundsMatch =
                histogram.explicitBounds.length === bucket.histogram.explicitBounds.length &&
                histogram.explicitBounds.every((value, index) => value === bucket.histogram.explicitBounds[index]);

              if (boundsMatch) {
                histogram.count += bucket.histogram.count;
                histogram.sum += bucket.histogram.sum;
                histogram.bucketCounts = histogram.bucketCounts.map(
                  (value, index) => value + (bucket.histogram.bucketCounts[index] || 0)
                );
              }
            }
          }
        }

        let value = null;
        if (count > 0) {
          switch (aggregation) {
            case "sum":
              value = sum;
              break;
            case "min":
              value = min;
              break;
            case "max":
              value = max;
              break;
            case "count":
              value = count;
              break;
            case "last":
              value = last;
              break;
            case "p50":
            case "p90":
            case "p99":
              if (histogram) {
                value = this.estimateQuantile(histogram, aggregation);
              }
              break;
            case "avg":
            default:
              value = sum / count;
              break;
          }
        }

        if (!compact || value !== null) {
          points.push({ ts: new Date(windowStart).toISOString(), value });
        }
      }

      results.push({ labels: groupedLabels, points });
    }

    return {
      metric,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      stepMs: bucketStep,
      series: results
    };
  }

  estimateQuantile(histogram, aggregation) {
    if (!histogram || histogram.count <= 0) {
      return null;
    }

    const quantileMap = { p25: 0.25, p50: 0.5, p90: 0.9, p99: 0.99 };
    const target = quantileMap[aggregation] ?? 0.5;
    const targetRank = histogram.count * target;
    let cumulative = 0;

    for (let i = 0; i < histogram.bucketCounts.length; i += 1) {
      cumulative += histogram.bucketCounts[i];
      if (cumulative >= targetRank) {
        if (i === 0) {
          return histogram.explicitBounds[0] ?? 0;
        }
        if (i > histogram.explicitBounds.length - 1) {
          return histogram.explicitBounds[histogram.explicitBounds.length - 1] ?? null;
        }
        const lower = histogram.explicitBounds[i - 1] ?? 0;
        const upper = histogram.explicitBounds[i] ?? lower;
        return (lower + upper) / 2;
      }
    }

    return histogram.explicitBounds[histogram.explicitBounds.length - 1] ?? null;
  }

  listMetrics() {
    const output = [];
    for (const [metricName, labelSet] of this.metricNames.entries()) {
      output.push({ metric: metricName, labels: Array.from(labelSet).sort() });
    }
    return output;
  }
}
