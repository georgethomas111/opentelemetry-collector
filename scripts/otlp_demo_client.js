const collectorUrl = process.env.COLLECTOR_URL || "http://localhost:4318/v1/metrics";
const serviceName = process.env.SERVICE_NAME || "transient-node";
const instanceId = process.env.INSTANCE_ID || "node-1";
const followUpCount = Number(process.env.FOLLOW_UP_COUNT || 5);
const followUpDelayMs = Number(process.env.FOLLOW_UP_DELAY_MS || 500);

function nowNano() {
  return String(Date.now() * 1e6);
}

function buildPayload({ points, includeCounter }) {
  const metrics = [
    {
      name: "gossip_delay_ms",
      gauge: {
        dataPoints: points
      }
    }
  ];

  if (includeCounter) {
    metrics.push({
      name: "gossip_message_total",
      sum: {
        aggregationTemporality: "AGGREGATION_TEMPORALITY_DELTA",
        isMonotonic: true,
        dataPoints: [
          {
            timeUnixNano: nowNano(),
            asInt: "1",
            attributes: [
              { key: "from_node", value: { stringValue: "1" } },
              { key: "to_node", value: { stringValue: "2" } }
            ]
          }
        ]
      }
    });
  }

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
            metrics
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

function buildDelayPoint({ value, from, to }) {
  return {
    timeUnixNano: nowNano(),
    asDouble: value,
    attributes: [
      { key: "from_node", value: { stringValue: String(from) } },
      { key: "to_node", value: { stringValue: String(to) } }
    ]
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const batchPoints = [
    buildDelayPoint({ value: 45.2, from: 1, to: 2 }),
    buildDelayPoint({ value: 52.9, from: 1, to: 3 }),
    buildDelayPoint({ value: 38.4, from: 2, to: 3 })
  ];

  await postPayload(buildPayload({ points: batchPoints, includeCounter: true }));

  for (let i = 0; i < followUpCount; i += 1) {
    const value = 35 + Math.random() * 20;
    const point = buildDelayPoint({ value, from: 1, to: 2 });
    await postPayload(buildPayload({ points: [point], includeCounter: false }));
    await sleep(followUpDelayMs);
  }

  console.log("demo metrics sent");
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
