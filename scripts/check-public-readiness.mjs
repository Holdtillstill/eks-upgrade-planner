import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

const skippedDirs = new Set([
  ".git",
  ".pytest_cache",
  ".terraform",
  ".vite",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
])

const skippedFiles = new Set([
  "scripts/check-public-readiness.mjs",
])

const scannedExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
])

const bannedText = [
  { label: "assistant/tooling name", pattern: /\b(Codex|Gemini|Claude|ChatGPT|LLM)\b/i },
  { label: "internal workspace artifact", pattern: /\b(antigravity|portfolio_review|ybz\.dev)\b/i },
  { label: "portfolio-meta phrasing", pattern: /\b(interviews?|hiring manager|case study|proof points?)\b/i },
  { label: "runtime status mislabel", pattern: /\bLive static demo\b/i },
  { label: "GitHub Actions badge URL", pattern: /actions\/workflows\/[^\s)]+\/badge\.svg|badge\.svg/i },
]

const sensitiveText = [
  { label: "Discord webhook", pattern: /discord\.com\/api\/webhooks\//i },
  { label: "account-specific AWS ARN", pattern: /arn:aws:[^\s"'`]+::[0-9]{12}/i },
  { label: "ECR registry account", pattern: /[0-9]{12}\.dkr\.ecr\.[^\s"'`]+/i },
  { label: "state bucket account suffix", pattern: /terraform-state-[0-9]{12}/i },
  { label: "hosted zone id assignment", pattern: /hosted_zone_id[^\n]*Z[A-Z0-9]{10,32}/i },
]

const allowedAccounts = new Set(["000000000000", "111122223333", "123456789012"])
const findings = []
const publicShellPath = path.join(root, "index.html")
const robotsPath = path.join(root, "public/robots.txt")
const sitemapPath = path.join(root, "public/sitemap.xml")
const socialPreviewPath = path.join(root, "public/social-preview.jpg")
const issueTemplateConfigPath = path.join(root, ".github/ISSUE_TEMPLATE/config.yml")

function relative(filePath) {
  return path.relative(root, filePath)
}

function shouldScan(filePath) {
  const rel = relative(filePath)
  if (skippedFiles.has(rel)) return false
  return scannedExtensions.has(path.extname(filePath))
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!skippedDirs.has(entry.name)) walk(fullPath)
      continue
    }
    if (!entry.isFile() || !shouldScan(fullPath)) continue
    scanFile(fullPath)
  }
}

function scanFile(filePath) {
  const rel = relative(filePath)
  const content = fs.readFileSync(filePath, "utf8")
  const lines = content.split(/\r?\n/)

  for (const [index, line] of lines.entries()) {
    for (const check of [...bannedText, ...sensitiveText]) {
      if (check.pattern.test(line)) {
        findings.push(`${rel}:${index + 1}: ${check.label}`)
      }
    }

    for (const match of line.matchAll(/(?<![-0-9])[0-9]{12}(?![-0-9])/g)) {
      if (!allowedAccounts.has(match[0])) {
        findings.push(`${rel}:${index + 1}: unapproved 12-digit account-like value`)
      }
    }
  }
}

walk(root)

if (fs.existsSync(publicShellPath)) {
  const shell = fs.readFileSync(publicShellPath, "utf8")
  const requiredShellMarkers = [
    ['canonical metadata', '<link rel="canonical"'],
    ['OpenGraph URL metadata', 'property="og:url"'],
    ['OpenGraph preview image', 'property="og:image" content="__SITE_URL__/social-preview.jpg"'],
    ['Twitter large preview card', 'name="twitter:card" content="summary_large_image"'],
    ['Twitter preview image', 'name="twitter:image" content="__SITE_URL__/social-preview.jpg"'],
    ['first-party visitor telemetry script', 'https://on-demand-demos.bozhi.dev/visitor.js'],
    ['visitor project id', 'data-project="eks-upgrade-planner"'],
  ]
  for (const [label, marker] of requiredShellMarkers) {
    if (!shell.includes(marker)) findings.push(`index.html: missing ${label}`)
  }
} else {
  findings.push("index.html: missing public web shell")
}

if (!fs.existsSync(socialPreviewPath)) {
  findings.push("public/social-preview.jpg: missing social preview image")
}

if (fs.existsSync(robotsPath)) {
  const robots = fs.readFileSync(robotsPath, "utf8")
  if (!robots.includes("Sitemap: https://eks-upgrade-planner.bozhi.dev/sitemap.xml")) {
    findings.push("public/robots.txt: missing production sitemap reference")
  }
} else {
  findings.push("public/robots.txt: missing")
}

if (!fs.existsSync(sitemapPath)) {
  findings.push("public/sitemap.xml: missing")
}

if (fs.existsSync(issueTemplateConfigPath)) {
  const issueConfig = fs.readFileSync(issueTemplateConfigPath, "utf8")
  if (!issueConfig.includes("blank_issues_enabled: false")) {
    findings.push(".github/ISSUE_TEMPLATE/config.yml: blank public issues should stay disabled")
  }
  if (!issueConfig.includes("SECURITY.md")) {
    findings.push(".github/ISSUE_TEMPLATE/config.yml: missing security policy contact link")
  }
} else {
  findings.push(".github/ISSUE_TEMPLATE/config.yml: missing")
}

if (findings.length) {
  console.error("Public-readiness check failed:")
  for (const finding of findings) console.error(`- ${finding}`)
  process.exit(1)
}

console.log("public readiness checks passed")
