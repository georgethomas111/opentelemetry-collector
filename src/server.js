import express from "express";
import { parseOtlpMetrics } from "./ingest/otlp.js";

export function createServer({ store }) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

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
