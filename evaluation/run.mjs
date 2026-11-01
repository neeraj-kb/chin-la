import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(await fs.readFile(path.join(here, 'cases.json'), 'utf8'));
const args = process.argv.slice(2);
const confirmed = args.includes('--confirm-provider-calls');
const listOnly = args.includes('--list');
const caseFlag = args.indexOf('--case');
const selectedId = caseFlag >= 0 ? args[caseFlag + 1] : '';
const baseFlag = args.indexOf('--base');
const baseArgument = baseFlag >= 0 ? args[baseFlag + 1] : process.env.SCREENWISE_EVAL_BASE_URL;
const baseUrl = (baseArgument || 'http://127.0.0.1:8788').replace(/\/$/, '');

function usage() {
  console.log('Usage: npm run eval:companion -- [--list] [--case CASE_ID] [--base URL] [--confirm-provider-calls]');
  console.log('Provider calls are opt-in because they send synthetic images to your configured AI provider and may use your API quota.');
}

if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}

if (caseFlag >= 0 && (!selectedId || selectedId.startsWith('--'))) {
  console.error('--case requires a case ID.');
  usage();
  process.exit(2);
}
if (baseFlag >= 0 && (!baseArgument || baseArgument.startsWith('--'))) {
  console.error('--base requires a URL.');
  usage();
  process.exit(2);
}

let parsedBaseUrl;
try { parsedBaseUrl = new URL(baseUrl); } catch {
  console.error('--base must be a valid local URL.');
  process.exit(2);
}
if (parsedBaseUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsedBaseUrl.hostname) || parsedBaseUrl.username || parsedBaseUrl.password) {
  console.error('The evaluation runner only sends examples to a local HTTP API (localhost).');
  process.exit(2);
}

if (listOnly) {
  for (const item of cases) console.log(`${item.id}\t${item.title}`);
  process.exit(0);
}

if (selectedId && !cases.some((item) => item.id === selectedId)) {
  console.error(`Unknown case: ${selectedId}`);
  usage();
  process.exit(2);
}

if (!confirmed) {
  console.log('No provider calls made.');
  console.log(`Cases available: ${cases.length}. Add --confirm-provider-calls to send only these synthetic examples for evaluation.`);
  usage();
  process.exit(0);
}

const chosen = selectedId ? cases.filter((item) => item.id === selectedId) : cases;
const healthResponse = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(5000) }).catch((error) => {
  console.error(`Could not reach the local companion API at ${baseUrl}: ${error.message}`);
  process.exit(2);
});
if (!healthResponse.ok) {
  console.error(`Local companion API returned HTTP ${healthResponse.status}. Start it with npm run dev first.`);
  process.exit(2);
}
const health = await healthResponse.json();
if (!health.configured?.groq && !health.configured?.openrouterVision && !health.configured?.gemini) {
  console.error('No vision provider is configured in the local API.');
  process.exit(2);
}
if (!health.configured?.groq && !health.configured?.openrouterChat) {
  console.error('No chat provider is configured in the local API.');
  process.exit(2);
}

function outputText(reply) {
  return [reply.explanation, reply.background, reply.nextStep, ...(reply.steps || []), reply.confidenceNote]
    .filter((part) => typeof part === 'string')
    .join('\n');
}

function scoreCase(item, reply) {
  const text = outputText(reply);
  const checks = [];
  for (const concept of item.mustMentionAny || []) {
    const passed = concept.patterns.some((pattern) => text.toLowerCase().includes(pattern.toLowerCase()));
    checks.push({ label: concept.label, passed });
  }
  for (const rule of item.mustAvoidPatterns || []) {
    const passed = !new RegExp(rule.pattern, 'i').test(text);
    checks.push({ label: rule.label, passed });
  }
  checks.push({
    label: `confidence is ${item.expectedConfidence}`,
    passed: reply.confidence === item.expectedConfidence,
  });
  if (item.expectedAlertStatus) {
    checks.push({
      label: `security check is ${item.expectedAlertStatus}`,
      passed: reply.securityStatus === item.expectedAlertStatus,
    });
  }
  const passed = checks.filter((check) => check.passed).length;
  return { checks, passed, total: checks.length, percent: Math.round((passed / checks.length) * 100) };
}

let passedCases = 0;
for (const item of chosen) {
  let frameData;
  if (item.image) {
    const imagePath = path.join(here, item.image);
    const bytes = await fs.readFile(imagePath);
    frameData = `data:image/png;base64,${bytes.toString('base64')}`;
  }

  const response = await fetch(`${baseUrl}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: item.message,
      ...(frameData ? { frameData } : {}),
      state: {},
      history: [],
    }),
    signal: AbortSignal.timeout(80_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`\n[ERROR] ${item.id}: ${payload.error || `HTTP ${response.status}`}`);
    process.exitCode = 1;
    continue;
  }

  const reply = payload.reply;
  const score = scoreCase(item, reply);
  const casePassed = score.passed === score.total;
  if (casePassed) passedCases += 1;
  console.log(`\n[${casePassed ? 'PASS' : 'REVIEW'}] ${item.id} — ${score.percent}% (${score.passed}/${score.total})`);
  console.log(`Confidence: ${reply.confidence}${reply.confidenceNote ? ` — ${reply.confidenceNote}` : ''}`);
  console.log(`Security check: ${reply.securityStatus || 'missing'}`);
  for (const check of score.checks) console.log(`  ${check.passed ? '✓' : '✗'} ${check.label}`);
  console.log(`Answer: ${reply.explanation}`);
  if (reply.nextStep) console.log(`Next step: ${reply.nextStep}`);
}

console.log(`\nSynthetic evaluation: ${passedCases}/${chosen.length} cases passed every automatic check.`);
console.log('Review the full answers too: phrase matching is only a regression signal, not proof of model accuracy.');
if (passedCases !== chosen.length) process.exitCode = 1;
