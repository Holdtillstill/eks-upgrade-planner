# Future Improvements

This app is now intentionally close to the limit of what a browser-local static
planner can do honestly. The remaining useful improvements require external
systems, credentials, or organization-specific workflow integration.

## AWS Inventory Integration

- Add an authenticated backend path for live `ListClusters` and
  `DescribeCluster` across selected accounts and regions.
- Model account, region, cluster ARN, node group, Fargate profile, and add-on
  inventory instead of only route-group rows.
- Use least-privilege read-only IAM and short-lived credentials through OIDC or
  a user-approved role assumption flow.

## Live Scanner Jobs

- Run `kubent`, Pluto, or equivalent cluster/repository scans as controlled
  jobs outside the browser.
- Store scanner output with timestamp, target version, tool version, rule
  snapshot, manifest hash, and source repository/cluster metadata.
- Keep browser imports as the offline fallback for environments that cannot
  grant live scanner access.

## Change Management Integration

- Create real Jira, ServiceNow, GitHub Issue, or GitHub PR records from the
  Evidence Pack instead of only copying/downloading templates.
- Round-trip approval state, ticket URL, approver, waiver acceptance, and
  maintenance-window status back into the workspace.
- Preserve an audit trail so packet status always matches the external change
  record.

## Persistent Workspaces

- Add an optional backend for saved workspaces, team sharing, and history.
- Keep local-only mode available for sensitive manifests and restricted
  environments.
- Add workspace ownership, last editor, and change history if persistence is
  introduced.

## Organization Policy Packs

- Allow teams to define internal rules for minimum add-on versions, forbidden
  Kubernetes APIs, required approvers, maintenance windows, and rollout order.
- Version policy packs so old evidence packets can be understood against the
  rules active at approval time.

## Cost And Deployment Guardrails

- Keep public production on S3 and CloudFront unless a backend becomes
  necessary.
- Treat EKS as an on-demand preview target only, with explicit TTL cleanup.
- Keep production deploys manual unless there is a clear release process that
  justifies automatic deploys from `main`.
