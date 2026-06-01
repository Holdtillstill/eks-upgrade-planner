# Roadmap

This roadmap tracks public product improvements for the EKS Upgrade Planner. It avoids private infrastructure notes and keeps the public repo focused on product, reliability, and reviewable engineering work.

## Product Trust

- Keep the visible data freshness date tied to the scheduled EKS data refresh workflow.
- Expand add-on compatibility guidance when upstream projects publish stable compatibility matrices.
- Add export metadata that captures tool version, data source date, and generation time.

## UX

- Add import/export support for fleet rows.
- Add a printable evidence packet view for upgrade review meetings.
- Run a mobile-first smoke pass for every public SEO route.
- Record a short demo video after the public domain and screenshots are final.

## Operations

- Keep the public production path on S3 and CloudFront.
- Keep Kubernetes/EKS deployments as short-lived preview or review paths.
- Add Lighthouse CI once the public URL and budget posture are stable.
- Add synthetic uptime checks for `/app`, `/eks/versions`, and an unknown route expected to return `404`.
