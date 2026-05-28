# EKS Upgrade Planner

A client-side MVP for planning Amazon EKS upgrades before they become extended-support bills or risky change windows.

## What it includes

- EKS lifecycle table with cited static data.
- Extended support cost calculator using EKS control-plane support-tier rates.
- Multi-hop upgrade planner with copyable Markdown/Jira ticket output.
- Managed/platform addon checklist with source links and diagnostic commands.
- Local-only deprecated Kubernetes API scanner for pasted YAML/text.

## Local development

```bash
npm install --include=dev
npm run dev -- --host 127.0.0.1
```

Open: http://127.0.0.1:5173/

## Verification

```bash
npm test
npm run build
npm run lint
```

## Data and trust model

This MVP uses static source-linked data in `src/data/`. It does **not** call AWS APIs, store user data, or upload manifests. Scanner results are computed in the browser. Verify all lifecycle/pricing/addon guidance against AWS and upstream project docs before approving production upgrades.

## Known limitations

- The scanner is regex/text based, not a full Kubernetes schema validator.
- Addon compatibility is intentionally framed as a verification checklist, not an authoritative compatibility guarantee.
- Cost calculations cover EKS control-plane support-tier pricing only; worker nodes, Fargate, EBS, IPv4, data transfer, and workload costs are excluded.
