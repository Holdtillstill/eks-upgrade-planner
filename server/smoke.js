const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8080';
const metricsToken = process.env.SMOKE_METRICS_BEARER_TOKEN || process.env.METRICS_BEARER_TOKEN;

const checks = [
  { path: '/healthz', expect: 200, contains: '"status":"ok"' },
  { path: '/readyz', expect: 200, contains: '"status":"ready"' },
  { path: '/metrics', expect: 200, contains: 'http_requests_total', token: metricsToken },
  { path: '/eks/1-35-upgrade-guide', expect: 200, contains: 'data-prerendered-route="/eks/1-35-upgrade-guide"' },
];

let failures = 0;

for (const check of checks) {
  const url = new URL(check.path, baseUrl);
  const headers = check.token ? { authorization: `Bearer ${check.token}` } : undefined;
  const response = await fetch(url, { headers });
  const body = await response.text();
  const passed = response.status === check.expect && body.includes(check.contains);
  console.log(JSON.stringify({
    path: check.path,
    status: response.status,
    passed,
  }));
  if (!passed) failures += 1;
}

if (failures > 0) process.exit(1);
