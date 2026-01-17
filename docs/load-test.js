/**
 * Load Test Script for k6
 *
 * Tests API performance under load to ensure production readiness.
 *
 * Usage:
 *   k6 run docs/load-test.js
 *
 * Install k6:
 *   macOS: brew install k6
 *   Linux: https://k6.io/docs/getting-started/installation/
 *   Windows: choco install k6
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const listDuration = new Trend('list_duration');
const searchDuration = new Trend('search_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 }, // Warm up: ramp to 10 users
    { duration: '1m', target: 50 }, // Load: ramp to 50 users
    { duration: '2m', target: 50 }, // Sustain: stay at 50 users
    { duration: '1m', target: 100 }, // Stress: ramp to 100 users
    { duration: '1m', target: 100 }, // Sustain: stay at 100 users
    { duration: '30s', target: 0 }, // Cool down: ramp to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.01'], // Error rate should be below 1%
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

// Test scenarios
export default function () {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  };

  // Scenario 1: List messages (no filters)
  {
    const res = http.get(`${BASE_URL}/rpc/whatsapp/messages/list`, params);
    const success = check(res, {
      'list: status is 200': r => r.status === 200,
      'list: response time < 500ms': r => r.timings.duration < 500,
    });
    errorRate.add(!success);
    listDuration.add(res.timings.duration);
  }

  sleep(1);

  // Scenario 2: List messages with filters
  {
    const res = http.get(
      `${BASE_URL}/rpc/whatsapp/messages/list?messageType=text&aiStatus=pending`,
      params,
    );
    check(res, {
      'filtered list: status is 200': r => r.status === 200,
      'filtered list: response time < 500ms': r => r.timings.duration < 500,
    });
  }

  sleep(1);

  // Scenario 3: Search messages
  {
    const res = http.get(
      `${BASE_URL}/rpc/whatsapp/messages/list?search=medication`,
      params,
    );
    const success = check(res, {
      'search: status is 200': r => r.status === 200,
      'search: response time < 1000ms': r => r.timings.duration < 1000,
    });
    searchDuration.add(res.timings.duration);
  }

  sleep(1);

  // Scenario 4: Get message stats
  {
    const res = http.get(`${BASE_URL}/rpc/whatsapp/messages/stats`, params);
    check(res, {
      'stats: status is 200': r => r.status === 200,
      'stats: response time < 300ms': r => r.timings.duration < 300,
    });
  }

  sleep(2);
}

// Summary handler
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'load-test-results.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;

  let summary = '\n';
  summary += `${indent}Test Summary\n`;
  summary += `${indent}============\n\n`;

  // HTTP metrics
  const httpReqs = data.metrics.http_reqs;
  const httpReqDuration = data.metrics.http_req_duration;
  const httpReqFailed = data.metrics.http_req_failed;

  if (httpReqs) {
    summary += `${indent}Total Requests: ${httpReqs.values.count}\n`;
    summary += `${indent}Request Rate: ${httpReqs.values.rate.toFixed(2)} req/s\n\n`;
  }

  if (httpReqDuration) {
    summary += `${indent}Response Times:\n`;
    summary += `${indent}  Min: ${httpReqDuration.values.min.toFixed(2)}ms\n`;
    summary += `${indent}  Avg: ${httpReqDuration.values.avg.toFixed(2)}ms\n`;
    summary += `${indent}  Med: ${httpReqDuration.values.med.toFixed(2)}ms\n`;
    summary += `${indent}  p95: ${httpReqDuration.values['p(95)'].toFixed(2)}ms\n`;
    summary += `${indent}  p99: ${httpReqDuration.values['p(99)'].toFixed(2)}ms\n`;
    summary += `${indent}  Max: ${httpReqDuration.values.max.toFixed(2)}ms\n\n`;
  }

  if (httpReqFailed) {
    const failRate = (httpReqFailed.values.rate * 100).toFixed(2);
    summary += `${indent}Error Rate: ${failRate}%\n\n`;
  }

  // Custom metrics
  const listDur = data.metrics.list_duration;
  const searchDur = data.metrics.search_duration;

  if (listDur) {
    summary += `${indent}List Query Performance:\n`;
    summary += `${indent}  Avg: ${listDur.values.avg.toFixed(2)}ms\n`;
    summary += `${indent}  p95: ${listDur.values['p(95)'].toFixed(2)}ms\n\n`;
  }

  if (searchDur) {
    summary += `${indent}Search Query Performance:\n`;
    summary += `${indent}  Avg: ${searchDur.values.avg.toFixed(2)}ms\n`;
    summary += `${indent}  p95: ${searchDur.values['p(95)'].toFixed(2)}ms\n\n`;
  }

  // Thresholds
  summary += `${indent}Thresholds:\n`;
  for (const [name, threshold] of Object.entries(data.thresholds)) {
    const passed = threshold.ok ? '✓' : '✗';
    summary += `${indent}  ${passed} ${name}\n`;
  }

  return summary;
}
