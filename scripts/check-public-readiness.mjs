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

if (findings.length) {
  console.error("Public-readiness check failed:")
  for (const finding of findings) console.error(`- ${finding}`)
  process.exit(1)
}

console.log("public readiness checks passed")
