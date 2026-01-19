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
