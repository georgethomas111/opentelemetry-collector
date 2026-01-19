function readAttributeValue(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (value.stringValue !== undefined) {
    return value.stringValue;
  }
  if (value.intValue !== undefined) {
    return Number(value.intValue);
  }
  if (value.doubleValue !== undefined) {
    return Number(value.doubleValue);
  }
  if (value.boolValue !== undefined) {
    return Boolean(value.boolValue);
  }
  return null;
}

function parseAttributes(attributes = []) {
  const output = {};
  for (const attr of attributes) {
    if (!attr || !attr.key) {
      continue;
    }
    const value = readAttributeValue(attr.value);
    if (value !== null && value !== undefined) {
      output[attr.key] = value;
    }
  }
  return output;
}

function toTimestampMs(unixNano) {
  if (unixNano === undefined || unixNano === null) {
    return null;
  }
  const asNumber = Number(unixNano);
  if (Number.isNaN(asNumber)) {
    return null;
  }
  return Math.floor(asNumber / 1e6);
}

function normalizeDataPoint(metricName, type, dataPoint, resourceAttributes) {
  if (!dataPoint) {
    return null;
  }
  const timestampMs = toTimestampMs(dataPoint.timeUnixNano) || Date.now();
  const attributes = parseAttributes(dataPoint.attributes);

  let value = null;
  if (dataPoint.asDouble !== undefined) {
    value = dataPoint.asDouble;
  } else if (dataPoint.asInt !== undefined) {
    value = dataPoint.asInt;
  } else if (dataPoint.value !== undefined) {
    value = dataPoint.value;
  }

  if (value === null || value === undefined) {
    return null;
  }

  return {
    metricName,
    type,
    value,
    timestampMs,
    attributes,
    resourceAttributes
  };
}

export function parseOtlpMetrics(body) {
  const records = [];
  if (!body || !Array.isArray(body.resourceMetrics)) {
    return records;
  }

  for (const resourceMetric of body.resourceMetrics) {
    const resourceAttributes = parseAttributes(resourceMetric.resource?.attributes || []);
    const scopeMetrics = resourceMetric.scopeMetrics || [];

    for (const scopeMetric of scopeMetrics) {
      const metrics = scopeMetric.metrics || [];
      for (const metric of metrics) {
        if (!metric || !metric.name) {
          continue;
        }

        if (metric.gauge?.dataPoints) {
          for (const dataPoint of metric.gauge.dataPoints) {
            const record = normalizeDataPoint(metric.name, "gauge", dataPoint, resourceAttributes);
            if (record) {
              records.push(record);
            }
          }
        }

        if (metric.sum?.dataPoints) {
          for (const dataPoint of metric.sum.dataPoints) {
            const record = normalizeDataPoint(metric.name, "sum", dataPoint, resourceAttributes);
            if (record) {
              records.push(record);
            }
          }
        }

        if (metric.histogram?.dataPoints) {
          for (const dataPoint of metric.histogram.dataPoints) {
            if (!dataPoint || !Array.isArray(dataPoint.bucketCounts)) {
              continue;
            }

            const totalCount = dataPoint.count || 0;
            const totalSum = dataPoint.sum || 0;
            if (totalCount === 0) {
              continue;
            }

            const average = totalSum / totalCount;
            const record = normalizeDataPoint(metric.name, "histogram", dataPoint, resourceAttributes);
            if (record) {
              record.value = average;
              records.push(record);
            }
          }
        }
      }
    }
  }

  return records;
}
