/**
 * Metrics Router
 *
 * Exposes Prometheus metrics endpoint for monitoring.
 */

import { Hono } from 'hono';
import { getMetrics } from '@pharmabroker/metrics';

const app = new Hono();

/**
 * GET /metrics
 * Returns Prometheus metrics in text format
 */
app.get('/metrics', async c => {
  const metrics = await getMetrics();
  return c.text(metrics, 200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
  });
});

export default app;
