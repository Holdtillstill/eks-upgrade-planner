import { readFile, readdir } from "node:fs/promises"

const workflowsDir = new URL("../.github/workflows/", import.meta.url)

const expectedWorkflows = [
  "ci.yml",
  "cloudflare-pages.yml",
  "codeql.yml",
  "dependency-audit.yml",
  "docker-publish.yml",
  "ecr-publish.yml",
  "eks-data-refresh.yml",
  "eks-preview-cleanup.yml",
  "eks-preview.yml",
  "ghcr-preview-cleanup.yml",
  "secret-scan.yml",
  "security.yml",
  "static-deploy.yml",
  "static-smoke.yml",
]

function assertIncludes(text, needle, context) {
  if (!text.includes(needle)) {
    throw new Error(`${context} is missing: ${needle}`)
  }
}

function assertAll(text, needles, context) {
  for (const needle of needles) assertIncludes(text, needle, context)
}

function assertMatches(text, pattern, context) {
  if (!pattern.test(text)) {
    throw new Error(`${context} does not match ${pattern}`)
  }
}

async function readWorkflow(name) {
  return readFile(new URL(name, workflowsDir), "utf8")
}

const workflowFiles = (await readdir(workflowsDir)).filter((name) => name.endsWith(".yml")).sort()
if (JSON.stringify(workflowFiles) !== JSON.stringify(expectedWorkflows)) {
  throw new Error(`Workflow set changed. Expected ${expectedWorkflows.join(", ")}; got ${workflowFiles.join(", ")}`)
}

const ci = await readWorkflow("ci.yml")
assertAll(
  ci,
  [
    "permissions:\n  contents: read",
    "npm test",
    "npm run check:public-readiness",
    "npm run validate:workflows",
    "npm run data:check",
    "npm run lint",
    "npm run typecheck",
    "npm run validate:edge-security",
    "npm run validate:actions-secrets",
    "npm run build",
    "npm run validate:static-hosting",
    "docker/build-push-action@v6",
    "aquasecurity/trivy-action@v0.36.0",
    "scan-type: image",
  ],
  "ci.yml",
)

const staticDeploy = await readWorkflow("static-deploy.yml")
assertAll(
  staticDeploy,
  [
    "permissions:\n  contents: read\n  id-token: write",
    "AWS_ROLE_TO_ASSUME",
    "CLOUDFRONT_DISTRIBUTION_ID",
    "STATIC_SITE_BUCKET",
    "SITE_URL",
    "npm ci --include=optional",
    "require('lightningcss')",
    "npx playwright install --with-deps chromium",
    "npm test",
    "npm run lint",
    "npm run typecheck",
    "npm run validate:edge-security",
    "npm run build",
    "npm run validate:static-hosting",
    "aws-actions/configure-aws-credentials@v6",
    "mask-aws-account-id: true",
    "aws s3 sync dist/",
    "aws cloudfront create-invalidation",
    "aws cloudfront wait invalidation-completed",
    "--query 'Invalidation.Id'",
    "GetInvalidation is unavailable",
    "sleep 30",
    "WEB_BASE=\"${SITE_URL}\" npm run smoke:static-host",
    "WEB_BASE=\"${SITE_URL}\" npm run smoke:browser-host",
  ],
  "static-deploy.yml",
)

const staticSmoke = await readWorkflow("static-smoke.yml")
assertAll(
  staticSmoke,
  [
    "schedule:",
    "SITE_URL",
    "npx playwright install --with-deps chromium",
    "WEB_BASE=\"${SITE_URL}\" npm run smoke:static-host",
    "WEB_BASE=\"${SITE_URL}\" npm run smoke:browser-host",
  ],
  "static-smoke.yml",
)

const cloudflarePages = await readWorkflow("cloudflare-pages.yml")
assertAll(
  cloudflarePages,
  [
    "CLOUDFLARE_SITE_URL",
    "npm ci --include=optional",
    "require('lightningcss')",
    "npx playwright install --with-deps chromium",
    "npm run validate:edge-security",
    "npm run build",
    "npm run validate:static-hosting",
    "wrangler pages deploy",
    "WEB_BASE=\"${SITE_URL}\" npm run smoke:static-host",
    "WEB_BASE=\"${SITE_URL}\" npm run smoke:browser-host",
  ],
  "cloudflare-pages.yml",
)

const dataRefresh = await readWorkflow("eks-data-refresh.yml")
assertAll(
  dataRefresh,
  [
    "schedule:",
    "permissions:\n  contents: write\n  pull-requests: write",
    "npm run data:update",
    "npm ci --include=optional",
    "require('lightningcss')",
    "git diff --quiet -- src/data/versions.ts scripts/public-routes.js",
    "npm run check:public-readiness",
    "npm test",
    "npm run lint",
    "npm run build",
    "npm run validate:static-hosting",
    "peter-evans/create-pull-request@v7",
    "src/data/versions.ts",
    "scripts/public-routes.js",
  ],
  "eks-data-refresh.yml",
)

const eksPreview = await readWorkflow("eks-preview.yml")
assertAll(
  eksPreview,
  [
    "workflow_dispatch:",
    "options:\n          - provision\n          - destroy",
    "ttl_hours must be between 1 and 4",
    "docker/build-push-action@v6",
    "aquasecurity/trivy-action@v0.36.0",
    "aws-actions/configure-aws-credentials@v6",
    "mask-aws-account-id: true",
    "preview.eks-upgrade-planner.io/expires-at",
    "helm upgrade --install",
    "kubectl rollout status",
    "helm uninstall",
    "kubectl delete namespace",
  ],
  "eks-preview.yml",
)
assertMatches(eksPreview, /concurrency:\n\s+group: eks-preview-\$\{\{ inputs.namespace \}\}/, "eks-preview.yml concurrency")

const previewCleanup = await readWorkflow("eks-preview-cleanup.yml")
assertAll(
  previewCleanup,
  [
    "schedule:",
    "configured=false",
    "Preview cleanup is not configured; skipping scheduled cleanup.",
    "aws-actions/configure-aws-credentials@v6",
    "mask-aws-account-id: true",
    "preview.eks-upgrade-planner.io/enabled=true",
    "preview\\.eks-upgrade-planner\\.io/expires-at",
    "helm uninstall",
    "kubectl delete namespace",
  ],
  "eks-preview-cleanup.yml",
)

const secretScan = await readWorkflow("secret-scan.yml")
assertAll(secretScan, ["gitleaks detect", "--redact", "Block committed cloud identifiers"], "secret-scan.yml")

const security = await readWorkflow("security.yml")
assertAll(
  security,
  ["actions/dependency-review-action@v5", "aquasecurity/trivy-action@v0.36.0", "scan-type: fs", "scanners: vuln,secret,misconfig"],
  "security.yml",
)

const codeql = await readWorkflow("codeql.yml")
assertAll(
  codeql,
  [
    "permissions:\n  contents: read\n  security-events: write",
    "schedule:",
    "javascript-typescript",
    "github/codeql-action/init@v3",
    "build-mode: none",
    "github/codeql-action/analyze@v3",
  ],
  "codeql.yml",
)

const dependencyAudit = await readWorkflow("dependency-audit.yml")
assertAll(dependencyAudit, ["actions/setup-node@v6", "npm ci", "npm audit --audit-level=high"], "dependency-audit.yml")

for (const name of ["docker-publish.yml", "ecr-publish.yml"]) {
  const workflow = await readWorkflow(name)
  assertAll(
    workflow,
    ["docker/build-push-action@v6", "aquasecurity/trivy-action@v0.36.0", "scan-type: image"],
    name,
  )
}

const ecrPublish = await readWorkflow("ecr-publish.yml")
assertAll(
  ecrPublish,
  ["workflow_dispatch:", "aws-actions/configure-aws-credentials@v6", "mask-aws-account-id: true"],
  "ecr-publish.yml",
)

console.log("workflow contracts passed")
