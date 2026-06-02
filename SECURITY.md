# Security Policy

This project is a public portfolio application. Do not commit AWS account IDs, ARNs, hosted zone IDs, personal emails, tokens, webhook URLs, or private deployment identifiers.

## Reporting

Use GitHub private vulnerability reporting or a direct owner channel. Do not open a public issue that contains secrets, cloud identifiers, visitor data, or deployment internals.

## Scope

- Static EKS lifecycle planner UI.
- Container image, Helm chart, and preview deployment path.
- Public CI/CD workflows, dependency audits, secret scans, and image scans.
- Documentation and generated planner data.

## Baseline Checks

CI runs dependency audit, Gitleaks secret scanning, Trivy filesystem scanning, Trivy image scanning on build/publish paths, and CodeQL source analysis. GitHub dependency review runs on public pull requests where the repository security features support it.
