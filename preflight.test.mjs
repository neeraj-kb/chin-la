import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeTextLocally } from './src/lib/preflight.mjs';

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

test('reports no common pattern without calling a message safe', () => {
  const result = analyzeTextLocally('The team meeting is at 10:00 tomorrow.');
  assert.equal(result.riskLevel, 'none');
  assert.match(result.summary, /no common warning pattern matched/i);
  assert.match(result.nextStep, /verify it separately/i);
});

test('flags misleading user-info and nonstandard port details', () => {
  const result = analyzeTextLocally('Review https://microsoft.com@account-check.example.org:8443/login');
  assert.equal(result.riskLevel, 'high');
  assert.ok(result.findings.some((finding) => finding.id === 'link-credentials'));
  assert.ok(result.findings.some((finding) => finding.id === 'unusual-port'));
});

test('flags an unusually long URL as caution without labeling it malicious', () => {
  const longPath = 'a'.repeat(190);
  const result = analyzeTextLocally(`Please review https://example.org/${longPath}`);
  assert.equal(result.riskLevel, 'caution');
  assert.ok(result.findings.some((finding) => finding.id === 'long-url'));
});
