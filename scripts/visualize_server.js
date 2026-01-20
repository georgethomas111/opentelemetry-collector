import express from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.VISUALIZE_PORT || 4320);
const collectorBaseUrl = process.env.COLLECTOR_BASE_URL || "http://localhost:4318";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const htmlPath = path.join(__dirname, "visualize.html");

app.get("/", async (req, res) => {
  const html = await readFile(htmlPath, "utf8");
  res.type("html").send(html);
});

app.get("/api/series", async (req, res) => {
  const url = new URL("/api/series", collectorBaseUrl);
  for (const [key, value] of Object.entries(req.query)) {
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item));
    } else if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url);
  const text = await response.text();
  res.status(response.status).type(response.headers.get("content-type") || "application/json").send(text);
});

app.get("/api/metrics", async (req, res) => {
  const response = await fetch(`${collectorBaseUrl}/api/metrics`);
  const text = await response.text();
  res.status(response.status).type(response.headers.get("content-type") || "application/json").send(text);
});

app.listen(port, () => {
  console.log(`visualization server listening on ${port}`);
});
