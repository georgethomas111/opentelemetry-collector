import { config } from "./config.js";
import { InMemoryMetricsStore } from "./store/in-memory-store.js";
import { createServer } from "./server.js";

const store = new InMemoryMetricsStore({
  windowMs: config.windowMs,
  bucketSizeMs: config.bucketSizeMs
});

const app = createServer({ store });

app.listen(config.port, () => {
  console.log(`collector listening on ${config.port}`);
});
