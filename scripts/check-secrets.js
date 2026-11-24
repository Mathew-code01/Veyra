import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const ignored = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'out', 'release', 'tests', 'test']);
const secretPatterns = [
  /\b(?:AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/,
];
const placeholderValues = /^(?:<[^>]+>|changeme|change[_-]?me|replace[_-]?me|your[_-].*|example|dummy|placeholder|test[-_]?only)$/i;
const assignmentPattern = /\b(?:SUPABASE_SERVICE_ROLE_KEY|PAYSTACK_SECRET_KEY|PAYSTACK_WEBHOOK_SECRET|UPDATE_SIGNING_KEY|GEMINI_API_KEY|GROQ_API_KEY|HF_TOKEN|MISTRAL_API_KEY|CEREBRAS_API_KEY|OPENROUTER_API_KEY)\s*[:=]\s*["']?([^"'\s#]+)/gi;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const findings = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.name === '.env' || entry.name.startsWith('.env.')) continue;
    if (entry.isDirectory()) {
      findings.push(...await walk(full));
      continue;
    }
    const info = await stat(full);
    if (info.size > 2_000_000) continue;
    const text = await readFile(full, 'utf8').catch(() => '');
    let matched = secretPatterns.some((pattern) => pattern.test(text));
    if (!matched) {
      for (const match of text.matchAll(assignmentPattern)) {
        const value = match[1];
        if (value && !placeholderValues.test(value) && value.length >= 12) {
          matched = true;
          break;
        }
      }
    }
    if (matched) findings.push(relative(root, full).replaceAll('\\', '/'));
  }
  return findings;
}

const findings = [...new Set(await walk(root))];
if (findings.length > 0) {
  console.error('Potential secret-bearing files found in the working tree:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}
console.log('Secret scan passed; no credential-shaped working-tree values detected.');
