# Backlog

## Launch

- Add real production domain and set repository variable `SITE_URL`.
- Apply static-hosting Terraform after shared infra bootstrap exists.
- Configure GitHub OIDC deploy role and repository variables.
- Run the manual static deploy workflow against S3/CloudFront.
- Add branch protection after CI stays green on the protected branch.
- Decide whether to make the GitHub repo public after screenshots, license, and
  deployment URLs are final.

## Product Trust

- Add a visible "last validated against AWS docs" timestamp in the source rail.
- Add a data freshness status pill sourced from the scheduled refresh workflow.
- Expand add-on compatibility data with tested version ranges where upstream
  sources provide stable compatibility matrices.
- Add export metadata that captures tool version, data source date, and
  generation time.

## UX

- Add an import/export format for fleet rows.
- Add a printable evidence packet view.
- Add a mobile-first smoke pass for every public SEO route.
- Record a short demo GIF or video once the production domain is live.

## Infrastructure

- Add Cloudflare Pages mirror only after the CloudFront production path is
  working.
- Add shared-EKS preview cleanup in the infra repo.
- Add a Lighthouse CI workflow once the production URL exists.
- Add synthetic uptime checks for `/app`, `/eks/versions`, and one unknown
  route expected to return `404`.
