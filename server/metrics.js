import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const ENABLED_FLAGS = new Set(['1', 'true', 'yes', 'on']);

function envFlagEnabled(value) {
  return ENABLED_FLAGS.has(String(value || '').trim().toLowerCase());
}

export function metricsAuthRequired(env = process.env) {
  if (env.METRICS_BEARER_TOKEN) return true;
  if (env.NODE_ENV !== 'production') return false;
  return !envFlagEnabled(env.METRICS_ALLOW_UNAUTHENTICATED);
}

export function validateMetricsAuthConfig(env = process.env) {
  if (!metricsAuthRequired(env) || env.METRICS_BEARER_TOKEN) return;
  throw new Error('METRICS_BEARER_TOKEN is required when NODE_ENV=production. Set METRICS_ALLOW_UNAUTHENTICATED=true only for local/demo deployments.');
}

function labelValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function labels(values) {
  return `{${Object.entries(values).map(([key, value]) => `${key}="${labelValue(value)}"`).join(',')}}`;
}

function metricLine(name, labelMap, value) {
  return `${name}${labels(labelMap)} ${value}`;
}

function mapKey(parts) {
  return JSON.stringify(parts);
}

function activeHandleCount() {
  const handles = process._getActiveHandles?.();
  return Array.isArray(handles) ? handles.length : 0;
}

export function createMetrics({ version, commit, buildTime }) {
  const requests = new Map();
  const durations = new Map();
  const inflight = new Map();
  const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
  eventLoopDelay.enable();
  const startTimeSeconds = Date.now() / 1000;

  function increment(map, key, amount = 1) {
    map.set(key, (map.get(key) ?? 0) + amount);
  }

  function startRequest(method, route) {
    const inflightKey = mapKey([method, route]);
    increment(inflight, inflightKey);
    const started = performance.now();

    return (statusCode) => {
      const durationSeconds = (performance.now() - started) / 1000;
      inflight.set(inflightKey, Math.max(0, (inflight.get(inflightKey) ?? 1) - 1));

      const requestKey = mapKey([method, route, String(statusCode)]);
      increment(requests, requestKey);

      const histogram = durations.get(requestKey) ?? {
        buckets: DEFAULT_BUCKETS.map(() => 0),
        count: 0,
        sum: 0,
      };
      histogram.count += 1;
      histogram.sum += durationSeconds;
      DEFAULT_BUCKETS.forEach((bucket, index) => {
        if (durationSeconds <= bucket) histogram.buckets[index] += 1;
      });
      durations.set(requestKey, histogram);

      return durationSeconds;
    };
  }

  function render() {
    const cpu = process.cpuUsage();
    const memory = process.memoryUsage();
    const lines = [
      '# HELP eks_upgrade_planner_build_info Build and runtime metadata for the EKS Upgrade Planner server.',
      '# TYPE eks_upgrade_planner_build_info gauge',
      metricLine('eks_upgrade_planner_build_info', {
        version,
        commit,
        build_time: buildTime,
        node_version: process.version,
      }, 1),
      '# HELP process_start_time_seconds Start time of the process since unix epoch in seconds.',
      '# TYPE process_start_time_seconds gauge',
      `process_start_time_seconds ${startTimeSeconds}`,
      '# HELP process_uptime_seconds Process uptime in seconds.',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${process.uptime()}`,
      '# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.',
      '# TYPE process_cpu_user_seconds_total counter',
      `process_cpu_user_seconds_total ${cpu.user / 1_000_000}`,
      '# HELP process_cpu_system_seconds_total Total system CPU time spent in seconds.',
      '# TYPE process_cpu_system_seconds_total counter',
      `process_cpu_system_seconds_total ${cpu.system / 1_000_000}`,
      '# HELP process_resident_memory_bytes Resident memory size in bytes.',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${memory.rss}`,
      '# HELP nodejs_heap_size_total_bytes Total heap size in bytes.',
      '# TYPE nodejs_heap_size_total_bytes gauge',
      `nodejs_heap_size_total_bytes ${memory.heapTotal}`,
      '# HELP nodejs_heap_size_used_bytes Used heap size in bytes.',
      '# TYPE nodejs_heap_size_used_bytes gauge',
      `nodejs_heap_size_used_bytes ${memory.heapUsed}`,
      '# HELP nodejs_external_memory_bytes External memory size in bytes.',
      '# TYPE nodejs_external_memory_bytes gauge',
      `nodejs_external_memory_bytes ${memory.external}`,
      '# HELP nodejs_eventloop_lag_seconds Mean event loop delay in seconds.',
      '# TYPE nodejs_eventloop_lag_seconds gauge',
      `nodejs_eventloop_lag_seconds ${Number.isFinite(eventLoopDelay.mean) ? eventLoopDelay.mean / 1e9 : 0}`,
      '# HELP nodejs_active_handles Active libuv handles.',
      '# TYPE nodejs_active_handles gauge',
      `nodejs_active_handles ${activeHandleCount()}`,
      '# HELP http_requests_in_flight Current in-flight HTTP requests.',
      '# TYPE http_requests_in_flight gauge',
    ];

    for (const [key, value] of inflight.entries()) {
      const [method, route] = JSON.parse(key);
      lines.push(metricLine('http_requests_in_flight', { method, route }, value));
    }

    lines.push(
      '# HELP http_requests_total Total HTTP requests by method, normalized route, and status code.',
      '# TYPE http_requests_total counter',
    );
    for (const [key, value] of requests.entries()) {
      const [method, route, statusCode] = JSON.parse(key);
      lines.push(metricLine('http_requests_total', { method, route, status_code: statusCode }, value));
    }

    lines.push(
      '# HELP http_request_duration_seconds HTTP request duration in seconds.',
      '# TYPE http_request_duration_seconds histogram',
    );
    for (const [key, histogram] of durations.entries()) {
      const [method, route, statusCode] = JSON.parse(key);
      for (const [index, bucket] of DEFAULT_BUCKETS.entries()) {
        lines.push(metricLine('http_request_duration_seconds_bucket', {
          method,
          route,
          status_code: statusCode,
          le: bucket,
        }, histogram.buckets[index]));
      }
      lines.push(metricLine('http_request_duration_seconds_bucket', {
        method,
        route,
        status_code: statusCode,
        le: '+Inf',
      }, histogram.count));
      lines.push(metricLine('http_request_duration_seconds_sum', { method, route, status_code: statusCode }, histogram.sum));
      lines.push(metricLine('http_request_duration_seconds_count', { method, route, status_code: statusCode }, histogram.count));
    }

    return `${lines.join('\n')}\n`;
  }

  return { startRequest, render };
}
