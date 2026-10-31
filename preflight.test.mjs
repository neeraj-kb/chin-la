import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeTextLocally, redactLinksForAI } from './src/lib/preflight.mjs';

test('flags mismatched displayed links and pressure language without opening them', () => {
  const result = analyzeTextLocally('Act now: [microsoft.com](https://login-check.example.invalid/session)');
  assert.equal(result.riskLevel, 'high');
  assert.ok(result.findings.some((finding) => finding.id === 'link-mismatch'));
  assert.ok(result.findings.some((finding) => finding.id === 'pressure-language'));
  assert.equal(result.links[0].host, 'login-check.example.invalid');
});

test('flags requests for sign-in codes and shortened links', () => {
  const result = analyzeTextLocally('Verify your account: send your one-time code to support using https://bit.ly/reset-check');
  assert.equal(result.riskLevel, 'high');
  assert.ok(result.findings.some((finding) => finding.id === 'credential-request'));
  assert.ok(result.findings.some((finding) => finding.id === 'shortened-link'));
});

test('does not call a plain http URL malicious based on scheme alone', () => {
  const result = analyzeTextLocally('For documentation see http://example.org/help');
  assert.equal(result.riskLevel, 'none');
  assert.ok(result.findings.some((finding) => finding.id === 'unencrypted-link' && finding.severity === 'info'));
});

test('reports no obvious signs without calling a message safe', () => {
  const result = analyzeTextLocally('The team meeting is at 10:00 tomorrow.');
  assert.equal(result.riskLevel, 'none');
  assert.match(result.summary, /no obvious warning signs/i);
  assert.match(result.nextStep, /verify it separately/i);
});

test('removes URL paths and query strings before optional AI analysis', () => {
  const text = 'Please inspect https://example.org/reset/secret-token?email=private@example.org&code=1234';
  const result = analyzeTextLocally(text);
  const redacted = redactLinksForAI(text, result.links);
  assert.match(redacted, /link to example\.org; path and query removed/i);
  assert.doesNotMatch(redacted, /secret-token|private@example\.org|code=1234/);
});
