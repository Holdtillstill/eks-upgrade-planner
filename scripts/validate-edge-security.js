import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentSecurityPolicy } from '../server/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const terraformMainPath = path.join(rootDir, 'infra', 'terraform', 'static-hosting', 'main.tf');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const terraformMain = fs.readFileSync(terraformMainPath, 'utf8');
const match = terraformMain.match(/content_security_policy\s*=\s*"([^"]+)"/);

assert(match, 'Expected infra/terraform/static-hosting/main.tf to define local.content_security_policy');
assert(
  match[1] === contentSecurityPolicy,
  [
    'Terraform CloudFront CSP must match server/security.js.',
    `server/security.js: ${contentSecurityPolicy}`,
    `main.tf: ${match[1]}`,
  ].join('\n'),
);

console.log('Edge security validation passed: Terraform CloudFront CSP matches server/security.js.');
