import express from "express";
import { parseOtlpMetrics } from "./ingest/otlp.js";

export function createServer({ store }) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/", (req, res) => {
    res.json({
      name: "opentelemetry-collector",
      endpoints: [
        {
          method: "GET",
          path: "/",
          description: "List available endpoints for this collector."
        },
        {
          method: "GET",
          path: "/health",
          description: "Health check for the collector."
        },
        {
          method: "POST",
          path: "/v1/metrics",
          description: "Ingest OTLP/HTTP JSON metrics payloads."
        },
        {
          method: "GET",
          path: "/api/series",
          description: "Query time-series data with aggregation and labels.",
          query: {
            metric: "Required metric name",
            start: "Start time (ISO or epoch ms)",
            end: "End time (ISO or epoch ms)",
            step: "Bucket size in ms",
            group_by: "Comma-separated label keys",
            agg: "avg | sum | min | max | count | last"
          },
          example: "/api/series?metric=gossip_delay_ms&start=2026-01-19T10:00:00Z&end=2026-01-19T10:05:00Z&step=5000&group_by=from_node,to_node&agg=avg"
        },
        {
          method: "GET",
          path: "/api/metrics",
          description: "List known metrics and their label keys."
        }
      ]
    });
  });

  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  app.post("/v1/metrics", (req, res) => {
    const records = parseOtlpMetrics(req.body);
    store.ingest(records);
    res.status(200).json({ ok: true, ingested: records.length });
  });

  app.get("/api/series", (req, res) => {
    const metric = req.query.metric;
    if (!metric) {
      res.status(400).json({ ok: false, error: "metric is required" });
      return;
    }

    const groupBy = req.query.group_by ? String(req.query.group_by).split(",") : [];
    const result = store.querySeries({
      metric,
      start: req.query.start,
      end: req.query.end,
      step: req.query.step,
      groupBy,
      agg: req.query.agg
    });

    res.json({ ok: true, ...result });
  });

  app.get("/api/metrics", (req, res) => {
    res.json({ ok: true, metrics: store.listMetrics() });
  });

  return app;
}
