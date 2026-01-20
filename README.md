# opentelemetry-collector

Express-based OTLP/HTTP JSON metrics collector with an in-memory time-series store.

## Requirements

- Node.js 18+ (for built-in `fetch` and ESM support)

## Install

```bash
npm install
```

## Run

```bash
npm start
```

Collector listens on port `4318` by default.

## Test

```bash
npm test
```

The Jest test posts sample OTLP/HTTP JSON metrics to `/v1/metrics` and verifies `/api/series` results.

## Demo scripts

Send demo OTLP metrics:

```bash
node scripts/otlp_demo_client.js
```

Query the data written by the demo client:

```bash
scripts/query_series.sh
```

Start the visualization server:

```bash
node scripts/visualize_server.js
```

Open `http://localhost:4320` to see the dashboard.
