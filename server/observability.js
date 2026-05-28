import crypto from 'node:crypto';

const LEVELS = {
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
};

function nowNano() {
  return String(BigInt(Date.now()) * 1_000_000n);
}

function cleanEndpoint(endpoint, signalPath) {
  if (!endpoint) return '';
  const trimmed = endpoint.replace(/\/+$/, '');
  if (trimmed.endsWith(signalPath)) return trimmed;
  return `${trimmed}${signalPath}`;
}

function parseHeaders(value = '') {
  return Object.fromEntries(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [key, ...rest] = item.split('=');
        return [key.trim(), decodeURIComponent(rest.join('=').trim())];
      })
      .filter(([key]) => key),
  );
}

function resourceAttributes({ serviceName, version } = {}) {
  const attributes = {
    'service.name': process.env.OTEL_SERVICE_NAME || serviceName || 'eks-upgrade-planner',
    'service.version': process.env.APP_VERSION || process.env.npm_package_version || version || '0.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  };

  for (const pair of (process.env.OTEL_RESOURCE_ATTRIBUTES || '').split(',')) {
    const [key, ...rest] = pair.split('=');
    if (key && rest.length) attributes[key.trim()] = rest.join('=').trim();
  }

  return attributes;
}

function toOtelValue(value) {
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'number' && Number.isInteger(value)) return { intValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  return { stringValue: String(value) };
}

function attributesFrom(record) {
  return Object.entries(record)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({ key, value: toOtelValue(value) }));
}

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function extractTraceContext(headers) {
  const traceparent = headers.traceparent;
  if (typeof traceparent !== 'string') return {};
  const match = traceparent.match(/^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/);
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return {};
  return {
    traceId: match[1],
    parentSpanId: match[2],
  };
}

async function postJson(endpoint, headers, payload, logger) {
  if (!endpoint) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok && logger) {
      logger('warn', 'otlp export failed', { endpoint, statusCode: response.status });
    }
  } catch (error) {
    if (logger) logger('debug', 'otlp export skipped', { endpoint, error: error.message });
  } finally {
    clearTimeout(timeout);
  }
}

export function createLogger({ serviceName, version }) {
  const minLevel = LEVELS[process.env.LOG_LEVEL || 'info'] ?? LEVELS.info;
  const headers = {
    ...parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
    ...parseHeaders(process.env.OTEL_EXPORTER_OTLP_LOGS_HEADERS),
  };
  const logsEndpoint = cleanEndpoint(
    process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ||
      (process.env.OTEL_LOGS_EXPORTER === 'otlp' ? process.env.OTEL_EXPORTER_OTLP_ENDPOINT : ''),
    '/v1/logs',
  );
  const resource = resourceAttributes({ serviceName, version });
  const emitOtlpLogs = Boolean(logsEndpoint);

  function write(level, msg, fields = {}) {
    if ((LEVELS[level] ?? LEVELS.info) < minLevel) return;
    const timestamp = new Date().toISOString();
    const record = {
      timestamp,
      level,
      msg,
      service: serviceName,
      version,
      ...fields,
    };
    const output = `${JSON.stringify(record)}\n`;
    if (level === 'error' || level === 'warn') process.stderr.write(output);
    else process.stdout.write(output);

    if (emitOtlpLogs) {
      const payload = {
        resourceLogs: [{
          resource: { attributes: attributesFrom(resource) },
          scopeLogs: [{
            scope: { name: 'eks-upgrade-planner-server', version },
            logRecords: [{
              timeUnixNano: nowNano(),
              observedTimeUnixNano: nowNano(),
              severityNumber: LEVELS[level] ?? LEVELS.info,
              severityText: level.toUpperCase(),
              body: { stringValue: msg },
              attributes: attributesFrom(record),
            }],
          }],
        }],
      };
      void postJson(logsEndpoint, headers, payload);
    }
  }

  return {
    debug: (msg, fields) => write('debug', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
    write,
  };
}

export function createTracer({ logger, serviceName, version }) {
  const endpoint = cleanEndpoint(
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    '/v1/traces',
  );
  const headers = {
    ...parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
    ...parseHeaders(process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS),
  };
  const resource = resourceAttributes({ serviceName, version });
  const enabled = Boolean(endpoint);

  function startSpan({ request, route, requestId }) {
    const parent = extractTraceContext(request.headers);
    const traceId = parent.traceId || randomHex(16);
    const spanId = randomHex(8);
    const startTimeUnixNano = nowNano();

    return {
      traceId,
      spanId,
      traceparent: `00-${traceId}-${spanId}-01`,
      finish({ statusCode, durationSeconds }) {
        if (!enabled) return;
        const attributes = {
          'http.request.method': request.method || 'GET',
          'http.route': route,
          'http.response.status_code': statusCode,
          'url.path': request.url?.split('?')[0] || '/',
          'user_agent.original': request.headers['user-agent'] || '',
          'client.address': request.socket.remoteAddress || '',
          'request.id': requestId,
          'server.duration_ms': Math.round(durationSeconds * 1000),
        };
        const span = {
          traceId,
          spanId,
          name: `${request.method || 'GET'} ${route}`,
          kind: 'SPAN_KIND_SERVER',
          startTimeUnixNano,
          endTimeUnixNano: nowNano(),
          attributes: attributesFrom(attributes),
          status: statusCode >= 500 ? { code: 'STATUS_CODE_ERROR' } : { code: 'STATUS_CODE_UNSET' },
        };
        if (parent.parentSpanId) span.parentSpanId = parent.parentSpanId;

        const payload = {
          resourceSpans: [{
            resource: { attributes: attributesFrom(resource) },
            scopeSpans: [{
              scope: { name: 'eks-upgrade-planner-server', version },
              spans: [span],
            }],
          }],
        };
        void postJson(endpoint, headers, payload, logger.write);
      },
    };
  }

  logger.info('tracing initialized', {
    enabled,
    endpoint: enabled ? endpoint : undefined,
    serviceName,
  });

  return { startSpan, enabled };
}
