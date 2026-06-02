import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const workflowsDir = path.join(rootDir, '.github', 'workflows');

const sensitiveNames = [
  'AWS_ROLE_TO_ASSUME',
  'EKS_PREVIEW_AWS_ROLE_TO_ASSUME',
  'ECR_AWS_ROLE_TO_ASSUME',
  'STATIC_SITE_BUCKET',
  'CLOUDFRONT_DISTRIBUTION_ID',
  'EKS_CLUSTER_NAME',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_PAGES_PROJECT',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const workflowFiles = fs
  .readdirSync(workflowsDir)
  .filter((fileName) => /\.ya?ml$/i.test(fileName))
  .map((fileName) => path.join(workflowsDir, fileName));

const violations = [];

for (const filePath of workflowFiles) {
  const source = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(rootDir, filePath);

  for (const name of sensitiveNames) {
    if (source.includes(`vars.${name}`)) {
      violations.push(`${relativePath}: ${name} must use secrets.${name}, not vars.${name}`);
    }

    if (source.includes(`Set repository variable ${name}`)) {
      violations.push(`${relativePath}: ${name} setup copy should say Actions secret, not repository variable`);
    }
  }
}

assert(violations.length === 0, `Sensitive deployment identifiers must stay in Actions secrets:\n${violations.join('\n')}`);

console.log(`Actions secret validation passed for ${workflowFiles.length} workflow files.`);
