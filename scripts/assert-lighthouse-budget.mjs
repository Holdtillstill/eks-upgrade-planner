import { readFile } from "node:fs/promises"

const reportPath = process.argv[2]
if (!reportPath) {
  throw new Error("Usage: node scripts/assert-lighthouse-budget.mjs /path/to/lighthouse.json")
}

const report = JSON.parse(await readFile(reportPath, "utf8"))
const thresholds = {
  performance: 0.9,
  accessibility: 0.95,
  "best-practices": 0.95,
  seo: 0.95,
}

const failures = []
for (const [category, minimum] of Object.entries(thresholds)) {
  const score = report.categories?.[category]?.score
  if (typeof score !== "number") {
    failures.push(`${category} score missing`)
    continue
  }

  const scoreText = Math.round(score * 100)
  const minimumText = Math.round(minimum * 100)
  console.log(`${category}: ${scoreText} (minimum ${minimumText})`)
  if (score < minimum) {
    failures.push(`${category} scored ${scoreText}; expected at least ${minimumText}`)
  }
}

if (failures.length > 0) {
  throw new Error(`Lighthouse budget failed:\n${failures.join("\n")}`)
}
