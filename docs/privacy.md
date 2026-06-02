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

## Server Logs

When served through the optional Node/Kubernetes runtime, operational logs may
include request path, normalized route, status code, duration, request ID, IP
address, and user agent. These logs are for operations, debugging, and abuse
prevention.
