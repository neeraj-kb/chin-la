import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle, ArrowRight, CircleAlert, ExternalLink, Info, LoaderCircle,
  LockKeyhole, ShieldCheck,
} from 'lucide-react';
import { analyzeTextLocally, type PreflightLocalResult, type PreflightRiskLevel } from '../lib/preflight.mjs';
import { sendReputationScan } from '../lib/api';
import type { WebRiskScanResponse } from '../types';

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

function threatLabel(type: string) {
  if (type === 'SOCIAL_ENGINEERING') return 'Phishing or deceptive page';
  if (type === 'MALWARE') return 'Malware';
  if (type === 'UNWANTED_SOFTWARE') return 'Unwanted software';
  return type;
}

function ReputationResults({ scan }: { scan: WebRiskScanResponse }) {
  const matches = scan.results.filter((result) => result.status === 'match');
  const noMatches = scan.results.filter((result) => result.status === 'no_match');
  const incomplete = scan.results.filter((result) => result.status === 'unavailable' || result.status === 'not_scanned');
  const level: PreflightRiskLevel = matches.length ? 'high' : incomplete.length ? 'caution' : 'none';
  const heading = matches.length
    ? 'Known threat match found'
    : incomplete.length
      ? 'Some lookups did not complete'
      : 'No known threat match found';

  return (
    <section className={`preflight-result preflight-result-${level}`} aria-live="polite">
      <div className={`preflight-risk preflight-risk-${level}`}>
        <RiskIcon level={level} />
        <div><span>{scan.provider.toUpperCase()} · LIVE LOOKUP</span><strong>{heading}</strong></div>
      </div>
      {matches.length > 0 && <p className="preflight-summary">A URL matched a known unsafe-site list. Do not open it. Verify the message through a contact route you already trust.</p>}
      {matches.map((result, index) => <div className="reputation-row reputation-match" key={`match-${index}-${result.host}`}>
        <strong>{result.host}</strong>
        <span>{result.threatTypes.map(threatLabel).join(', ')}</span>
      </div>)}
      {noMatches.map((result, index) => <div className="reputation-row reputation-no-match" key={`clear-${index}-${result.host}`}>
        <strong>{result.host}</strong>
        <span>No match in the checked threat lists</span>
      </div>)}
      {scan.results.filter((result) => result.status === 'unavailable').map((result, index) => <div className="reputation-row reputation-incomplete" key={`error-${index}-${result.host}`}>
        <strong>{result.host}</strong>
        <span>{result.detail || 'Lookup failed; there is no reputation verdict for this address.'}</span>
      </div>)}
      {scan.results.filter((result) => result.status === 'not_scanned').map((result, index) => <div className="reputation-row reputation-incomplete" key={`skip-${index}`}>
        <strong>{result.host}</strong>
        <span>Not sent to the service because it is not a public web address.</span>
      </div>)}
      {noMatches.length > 0 && <p className="preflight-limit"><Info size={14} />No match means the checked lists did not identify this URL at lookup time. It does not mean the site is safe.</p>}
      <p className="preflight-limit"><Info size={14} />The app checks threat-list data; it does not open, crawl, or interact with the website.</p>
    </section>
  );
}

export function PreflightPage({ reputationAvailable }: { reputationAvailable: boolean }) {
  const [content, setContent] = useState('');
  const [localResult, setLocalResult] = useState<PreflightLocalResult | null>(null);
  const [reputationResult, setReputationResult] = useState<WebRiskScanResponse | null>(null);
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
    if (!localResult?.links.length || !reputationConsent || !reputationAvailable || scanBusy) return;
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
          <div className="preflight-external-heading"><span><ShieldCheck size={16} /> Live threat-list lookup</span><span>THREAT LIST · NO SITE VISIT</span></div>
          <p>With your permission, up to {MAX_REPUTATION_URLS} URLs are checked against Google Web Risk lists for phishing, malware, and unwanted software. The URL path is sent; query strings and fragments are removed. Remove private or password-reset links first.</p>
          <label className="preflight-consent"><input type="checkbox" checked={reputationConsent} onChange={(event) => setReputationConsent(event.target.checked)} /> <span>I agree to send these URLs to Google Web Risk for a reputation lookup.</span></label>
          {!reputationAvailable && <div className="preflight-service-unavailable"><Info size={14} />Live lookup needs a Google Web Risk API key in the local .env file. On-device checks are available without it.</div>}
          {error && <div className="preflight-error" role="alert">{error}</div>}
          <button className="preflight-external-button" type="button" onClick={() => void handleReputationCheck()} disabled={!reputationConsent || !reputationAvailable || scanBusy}>
            {scanBusy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={16} />}{scanBusy ? 'Checking threat lists…' : 'Check live threat lists'}
          </button>
        </section>}
        {reputationResult && <ReputationResults scan={reputationResult} />}
      </>}
    </main>
  );
}
