import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle, ArrowRight, CircleAlert, ExternalLink, Info, LoaderCircle,
  LockKeyhole, ShieldCheck,
} from 'lucide-react';
import { analyzeTextLocally, type PreflightLocalResult, type PreflightRiskLevel } from '../lib/preflight.mjs';
import { sendReputationScan } from '../lib/api';
import type { CommunityThreatCheck, ReputationScanResponse } from '../types';

const MAX_REPUTATION_URLS = 5;

function riskLabel(level: PreflightRiskLevel) {
  if (level === 'high') return 'Warning signs found';
  if (level === 'caution') return 'Pause and verify';
  return 'No common warning pattern matched';
}

function RiskIcon({ level }: { level: PreflightRiskLevel }) {
  if (level === 'high') return <AlertTriangle size={17} />;
  return <CircleAlert size={17} />;
}

function LocalAnalysisCard({ result }: { result: PreflightLocalResult }) {
  return (
    <section className={`preflight-result preflight-result-${result.riskLevel}`} aria-live="polite">
      <div className={`preflight-risk preflight-risk-${result.riskLevel}`}>
        <RiskIcon level={result.riskLevel} />
        <div><span>ON-DEVICE PATTERN CHECKS</span><strong>{riskLabel(result.riskLevel)}</strong></div>
      </div>
      <p className="preflight-summary">{result.summary}</p>
      {result.findings.length > 0 && <div className="preflight-findings">
        <h3>Checks that matched</h3>
        <ul>{result.findings.map((finding, index) => <li key={`${index}-${finding.id}`}><strong>{finding.title}:</strong> {finding.detail}</li>)}</ul>
      </div>}
      <div className="preflight-next-step">
        <div><span>SAFER NEXT STEP</span><p>{result.nextStep}</p></div>
        <ArrowRight size={17} />
      </div>
      <p className="preflight-limit"><Info size={14} />These are pattern checks. No match is not proof that a message or link is safe.</p>
    </section>
  );
}

function sourceStatus(check: CommunityThreatCheck) {
  if (check.status === 'match') return check.source === 'PhishTank' ? 'Listed as a phishing site' : 'Listed for malware distribution';
  if (check.status === 'no_match') return 'No match in this feed';
  if (check.status === 'unverified') return 'Reported, but not verified; treat as suspicious';
  if (check.status === 'not_configured') return check.detail || 'This feed is not configured.';
  if (check.status === 'not_scanned') return 'Not sent because this is not a public web address.';
  return check.detail || 'This feed did not return a result.';
}

function ReputationResults({ scan }: { scan: ReputationScanResponse }) {
  const checks = scan.results.flatMap((result) => result.sources.map((source) => ({ host: result.host, source })));
  const matches = checks.filter(({ source }) => source.status === 'match');
  const uncertain = checks.filter(({ source }) => ['unverified', 'unavailable', 'not_configured', 'not_scanned'].includes(source.status));
  const noMatches = checks.filter(({ source }) => source.status === 'no_match');
  const level: PreflightRiskLevel = matches.length ? 'high' : uncertain.length ? 'caution' : 'none';
  const heading = matches.length
    ? 'Known threat match found'
    : uncertain.length
      ? 'Partial or uncertain results'
      : 'No known threat match found';

  return (
    <section className={`preflight-result preflight-result-${level}`} aria-live="polite">
      <div className={`preflight-risk preflight-risk-${level}`}>
        <RiskIcon level={level} />
        <div><span>{scan.provider.toUpperCase()} · LIVE LOOKUP</span><strong>{heading}</strong></div>
      </div>
      {matches.length > 0 && <p className="preflight-summary">A community feed lists this address. Do not open it. Verify the message through a contact route you already trust.</p>}
      {checks.map(({ host, source }, index) => <div className={`reputation-row ${source.status === 'match' ? 'reputation-match' : source.status === 'no_match' ? 'reputation-no-match' : 'reputation-incomplete'}`} key={`${index}-${host}-${source.source}`}>
        <strong>{host} · {source.source}</strong>
        <span>{sourceStatus(source)}</span>
      </div>)}
      {noMatches.length > 0 && <p className="preflight-limit"><Info size={14} />A no-match result means that feed did not list the address at lookup time. It does not prove the site is safe.</p>}
      <p className="preflight-limit"><Info size={14} />PhishTank checks reported phishing URLs; URLhaus checks known malware distribution URLs. The app does not visit or crawl the website.</p>
    </section>
  );
}

export function PreflightPage() {
  const [content, setContent] = useState('');
  const [localResult, setLocalResult] = useState<PreflightLocalResult | null>(null);
  const [reputationResult, setReputationResult] = useState<ReputationScanResponse | null>(null);
  const [reputationConsent, setReputationConsent] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const handleLocalCheck = (event: FormEvent) => {
    event.preventDefault();
    requestRef.current?.abort();
    setScanBusy(false);
    setError('');
    setReputationResult(null);
    setReputationConsent(false);
    setLocalResult(analyzeTextLocally(content));
  };

  const handleContentChange = (value: string) => {
    requestRef.current?.abort();
    setContent(value);
    setLocalResult(null);
    setReputationResult(null);
    setReputationConsent(false);
    setError('');
    setScanBusy(false);
  };

  const handleReputationCheck = async () => {
    if (!localResult?.links.length || !reputationConsent || scanBusy) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setScanBusy(true);
    setError('');
    setReputationResult(null);
    try {
      const response = await sendReputationScan(
        localResult.links.slice(0, MAX_REPUTATION_URLS).map((link) => link.raw),
        controller.signal,
      );
      if (!controller.signal.aborted) setReputationResult(response);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The reputation lookup could not finish.');
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (!controller.signal.aborted) setScanBusy(false);
    }
  };

  return (
    <main className="preflight-page" aria-label="Website and message scan">
      <div className="preflight-heading">
        <div className="preflight-heading-icon"><ShieldCheck size={21} /></div>
        <div><span>PRE-CLICK SHIELD</span><h1>Website &amp; message scan</h1></div>
      </div>
      <p className="preflight-intro">Paste a suspicious message or link. Run private pattern checks first, then optionally check URLs against current threat lists.</p>

      <form className="preflight-input-card" onSubmit={handleLocalCheck}>
        <label htmlFor="preflight-content">What would you like to check?</label>
        <textarea
          id="preflight-content"
          value={content}
          onChange={(event) => handleContentChange(event.target.value)}
          placeholder="Paste the message or full link here…"
          maxLength={8000}
          rows={5}
        />
        <div className="preflight-input-meta"><span>{content.length}/8,000 characters</span><span>Paste the actual link address too, if available.</span></div>
        <div className="preflight-input-actions">
          <button className="preflight-primary" type="submit" disabled={content.trim().length < 3}>
            <ShieldCheck size={17} /> Run on-device checks
          </button>
          <button className="preflight-clear" type="button" disabled={!content} onClick={() => handleContentChange('')}>Clear</button>
        </div>
      </form>

      <div className="preflight-local-note"><LockKeyhole size={15} /><span>On-device checks examine link structure and message patterns. They do not send text or open links, and a clean result is not a safety verdict.</span></div>

      {localResult && <>
        <LocalAnalysisCard result={localResult} />
        {localResult.links.length > 0 && <div className="preflight-links">
          <span><ExternalLink size={14} /> Link domains found</span>
          <div>{[...new Set(localResult.links.map((link) => link.host))].map((host) => <code key={host}>{host}</code>)}</div>
          {localResult.links.length > MAX_REPUTATION_URLS && <small>Live lookup will check the first {MAX_REPUTATION_URLS} links.</small>}
        </div>}
        {localResult.links.length > 0 && <section className="preflight-external-panel reputation-panel">
          <div className="preflight-external-heading"><span><ShieldCheck size={16} /> Free community threat feeds</span><span>PHISHTANK + URLHAUS · NO SITE VISIT</span></div>
          <p>With your permission, up to {MAX_REPUTATION_URLS} URLs are checked against PhishTank’s phishing feed and URLhaus’s malware feed. Only the URL host and path are sent; query strings and fragments are removed. Remove private or password-reset links first.</p>
          <p>PhishTank can be used without a key, with stricter rate limits. URLhaus needs a free Auth-Key for malware checks; without it, those results will be marked not configured. URLhaus’s free community access follows fair-use limits; commercial use may have different terms.</p>
          <div className="feed-key-links"><a href="https://www.phishtank.org/api_info.php" target="_blank" rel="noreferrer">PhishTank API and free key info</a><a href="https://auth.abuse.ch/" target="_blank" rel="noreferrer">Get a free URLhaus Auth-Key</a></div>
          <label className="preflight-consent"><input type="checkbox" checked={reputationConsent} onChange={(event) => setReputationConsent(event.target.checked)} /> <span>I agree to send these URLs to PhishTank and, if configured, URLhaus for reputation checks.</span></label>
          {error && <div className="preflight-error" role="alert">{error}</div>}
          <button className="preflight-external-button" type="button" onClick={() => void handleReputationCheck()} disabled={!reputationConsent || scanBusy}>
            {scanBusy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={16} />}{scanBusy ? 'Checking community feeds…' : 'Check community threat feeds'}
          </button>
        </section>}
        {reputationResult && <ReputationResults scan={reputationResult} />}
      </>}
    </main>
  );
}
