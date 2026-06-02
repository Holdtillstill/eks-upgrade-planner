# Contributing

Thanks for taking a look at EKS Upgrade Planner. Issues and pull requests are welcome for product bugs, stale EKS data, documentation fixes, static-host behavior, Helm packaging, and security-safe operational improvements.

## Public Safety

Do not include secrets, AWS account IDs, ARNs, hosted zone IDs, private manifests, real cluster data, personal emails, visitor data, request records, or private preview URLs in issues, pull requests, screenshots, logs, or comments.

Use [SECURITY.md](SECURITY.md) for vulnerabilities or anything that may expose private infrastructure or sensitive data.

## Validation

Before opening a pull request, run the checks that match your change:

```bash
npm run check:public-readiness
npm run validate:workflows
npm run data:check
npm test
npm run build
```

For deployment, image, Helm, or static-host changes, also run the relevant smoke, lint, and scan commands described in the README.

Runtime preview resources must stay approved, temporary, and cleaned up after validation.
