import request from "supertest";
import { createServer } from "../src/server.js";
import { InMemoryMetricsStore } from "../src/store/in-memory-store.js";

function nowNano() {
  return String(Date.now() * 1e6);
}

function buildPayload() {
  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "demo" } }
          ]
        },
        scopeMetrics: [
          {
            metrics: [
              {
                name: "gossip_delay_ms",
                gauge: {
                  dataPoints: [
                    {
                      timeUnixNano: nowNano(),
                      asDouble: 50.5,
                      attributes: [
                        { key: "from_node", value: { stringValue: "1" } },
                        { key: "to_node", value: { stringValue: "2" } }
                      ]
                    },
                    {
                      timeUnixNano: nowNano(),
                      asDouble: 40.0,
                      attributes: [
                        { key: "from_node", value: { stringValue: "1" } },
                        { key: "to_node", value: { stringValue: "3" } }
                      ]
                    }
                  ]
                }
              },
              {
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
              }
            ]
          }
        ]
      }
    ]
  };
}

describe("collector", () => {
  test("ingests OTLP JSON and queries series", async () => {
    const store = new InMemoryMetricsStore({ windowMs: 60_000, bucketSizeMs: 5_000 });
    const app = createServer({ store });

    const payload = buildPayload();
    const ingest = await request(app).post("/v1/metrics").send(payload);
    expect(ingest.status).toBe(200);
    expect(ingest.body.ingested).toBe(3);

    const start = new Date(Date.now() - 10_000).toISOString();
    const end = new Date(Date.now() + 10_000).toISOString();

    const query = await request(app)
      .get("/api/series")
      .query({
        metric: "gossip_delay_ms",
        start,
        end,
        step: 5000,
        group_by: "from_node,to_node",
        agg: "avg"
      });

    expect(query.status).toBe(200);
    expect(query.body.ok).toBe(true);
    expect(query.body.series.length).toBeGreaterThanOrEqual(2);
    const labels = query.body.series.map((series) => series.labels);
    expect(labels).toEqual(
      expect.arrayContaining([
        { from_node: "1", to_node: "2" },
        { from_node: "1", to_node: "3" }
      ])
    );
  });
});
