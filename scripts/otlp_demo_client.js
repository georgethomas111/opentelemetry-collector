const collectorUrl = process.env.COLLECTOR_URL || "http://localhost:4318/v1/metrics";
const serviceName = process.env.SERVICE_NAME || "transient-node";
const instanceId = process.env.INSTANCE_ID || "node-1";
const followUpCount = Number(process.env.FOLLOW_UP_COUNT || 20);
const followUpDelayMs = Number(process.env.FOLLOW_UP_DELAY_MS || 500);
const nodeCount = Number(process.env.NODE_COUNT || 10);
const historyMinutes = Number(process.env.HISTORY_MINUTES || 5);

function nowNano() {
  return String(Date.now() * 1e6);
}

function buildPayload({ points }) {
  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: serviceName } },
            { key: "service.instance.id", value: { stringValue: instanceId } }
          ]
        },
        scopeMetrics: [
          {
            metrics: [
              {
                name: "gossip_delay_ms",
                histogram: {
                  dataPoints: points
                }
              }
            ]
          }
        ]
      }
    ]
  };
}

async function postPayload(payload) {
  const response = await fetch(collectorUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Collector error: ${response.status} ${text}`);
  }
}

const delayBounds = [10, 20, 30, 40, 50, 60, 80, 100, 150, 200];

function buildDelayPoint({ value, node, timeUnixNano }) {
  const buckets = Array.from({ length: delayBounds.length + 1 }, () => 0);
  const bucketIndex = delayBounds.findIndex((bound) => value <= bound);
  const index = bucketIndex === -1 ? delayBounds.length : bucketIndex;
  buckets[index] = 1;

  return {
    timeUnixNano: timeUnixNano || nowNano(),
    count: 1,
    sum: value,
    bucketCounts: buckets,
    explicitBounds: delayBounds,
    attributes: [
      { key: "node", value: { stringValue: String(node) } }
    ]
  };
}

function randomNode(maxNodes) {
  return Math.floor(Math.random() * maxNodes) + 1;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const historyPoints = [];
  const totalHistoryPoints = nodeCount * 6;
  const now = Date.now();
  const historySpanMs = historyMinutes * 60 * 1000;

  for (let i = 0; i < totalHistoryPoints; i += 1) {
    const node = randomNode(nodeCount);
    const value = 30 + Math.random() * 40;
    const offsetMs = Math.floor(Math.random() * historySpanMs);
    const timeUnixNano = String((now - offsetMs) * 1e6);
    historyPoints.push(buildDelayPoint({ value, node, timeUnixNano }));
  }

  await postPayload(buildPayload({ points: historyPoints }));

  for (let i = 0; i < followUpCount; i += 1) {
    const node = randomNode(nodeCount);
    const value = 35 + Math.random() * 25;
    const point = buildDelayPoint({ value, node });
    await postPayload(buildPayload({ points: [point] }));
    await sleep(followUpDelayMs);
  }

  console.log("demo metrics sent");
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
