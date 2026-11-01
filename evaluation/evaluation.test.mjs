import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(await readFile(path.join(here, 'cases.json'), 'utf8'));

test('companion evaluation set covers realistic threats, harmless controls, ambiguous, and missing-screen inputs', async () => {
  const ids = new Set(cases.map((item) => item.id));
  assert.equal(ids.size, cases.length, 'case ids must be unique');
  assert.ok(cases.length >= 6);
  assert.ok(ids.has('ordinary-retail-dashboard'));
  assert.ok(ids.has('mailbox-lookalike-request'));
  assert.ok(ids.has('browser-certificate-warning'));
  assert.ok(ids.has('windows-security-up-to-date'));
  assert.ok(ids.has('cropped-account-message'));
  assert.ok(ids.has('payment-change-request'));
  assert.ok(ids.has('unexpected-signin-prompt'));
  assert.ok(ids.has('fake-software-update'));
  assert.ok(ids.has('macro-attachment-warning'));
  assert.ok(ids.has('cloud-share-permission'));
  assert.ok(ids.has('legitimate-payroll-notice'));
  assert.ok(ids.has('no-current-screen'));
});

test('all screenshot cases have valid PNG fixtures and valid scoring patterns', async () => {
  for (const item of cases) {
    assert.ok(['high', 'medium', 'low'].includes(item.expectedConfidence), `${item.id} confidence`);
    assert.ok(['strong_warning', 'caution', 'no_obvious_warning', 'not_security_related', 'unclear'].includes(item.expectedAlertStatus), `${item.id} security status`);
    assert.ok(Array.isArray(item.mustMentionAny) && item.mustMentionAny.length > 0, `${item.id} has grounding checks`);
    for (const rule of item.mustAvoidPatterns || []) new RegExp(rule.pattern, 'i');

    if (!item.image) continue;
    const bytes = await readFile(path.join(here, item.image));
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), `${item.id} is PNG`);
    assert.ok(bytes.length > 1000, `${item.id} image is non-empty`);
    assert.equal(bytes.readUInt32BE(16), 1440, `${item.id} width`);
    assert.equal(bytes.readUInt32BE(20), 900, `${item.id} height`);
  }
});

test('fixture renderer uses local static content and reserved test domains', async () => {
  const source = await readFile(path.join(here, 'fixture-ui.html'), 'utf8');
  assert.match(source, /riversideclinc\.test/);
  assert.match(source, /macro-attachment-warning/);
  assert.doesNotMatch(source, /<script[^>]+src=|https?:\/\/[^<"']+\.(?:com|org|net)\b/i);
});

test('missing-screen case expects low confidence and no invented visible content', () => {
  const item = cases.find((candidate) => candidate.id === 'no-current-screen');
  assert.equal(item.image, null);
  assert.equal(item.expectedConfidence, 'low');
  assert.equal(item.expectedAlertStatus, 'unclear');
  assert.ok(item.mustMentionAny.some((check) => check.patterns.includes('cannot see')));
});

test('evaluation runner refuses a confirmed provider run without a case ID', () => {
  const runner = path.join(here, 'run.mjs');
  const result = spawnSync(process.execPath, [runner, '--confirm-provider-calls', '--case'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--case requires a case ID/i);
});

test('evaluation runner refuses a missing API base URL before making requests', () => {
  const runner = path.join(here, 'run.mjs');
  const result = spawnSync(process.execPath, [runner, '--confirm-provider-calls', '--base'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--base requires a URL/i);
});

test('evaluation runner refuses external API URLs before sending synthetic examples', () => {
  const runner = path.join(here, 'run.mjs');
  const result = spawnSync(process.execPath, [runner, '--confirm-provider-calls', '--base', 'https://example.com'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /only sends examples to a local HTTP API/i);
});
