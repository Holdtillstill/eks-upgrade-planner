# Privacy Notes

EKS Upgrade Planner is a static-heavy public planning tool. It does not require
sign-in, does not call AWS APIs from the browser, and does not store product
account data.

## Browser-Local Inputs

These inputs stay in the browser:

- pasted Kubernetes manifests
- deprecated API scan results
- fleet scope rows
- cost/planning scenario inputs
- copyable planner and evidence text

The app does not upload these values to a product backend.

## Pageview Telemetry

The public site loads a first-party visitor script from
`https://on-demand-demos.bozhi.dev/visitor.js`. It is used for basic pageview
and route-change telemetry so public portfolio traffic can be measured. The
script should not receive pasted manifests, planner inputs, AWS account data, or
cluster credentials.

Do Not Track and Global Privacy Control are respected by default. Visitor
notifications use masked IPs and coarse metadata such as page path, referrer
host, safe campaign tags, derived traffic source/channel, approximate location,
network label, browser/OS/device class, locale, viewport, and connection hints.
Raw IP address and user agent are retained briefly for daily digest, abuse, and
reliability analysis, then purged.

## Server Logs

When served through the optional Node/Kubernetes runtime, operational logs may
include request path, normalized route, status code, duration, request ID, IP
address, and user agent. These logs are for operations, debugging, and abuse
prevention.
