import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, ExternalLink,
  Info, LoaderCircle, LockKeyhole, ShieldCheck, Sparkles,
} from 'lucide-react';
import { analyzeTextLocally, redactLinksForAI, type PreflightLocalResult, type PreflightRiskLevel } from '../lib/preflight.mjs';
import { sendPreflightAnalysis } from '../lib/api';
import type { PreflightAIResult } from '../types';

function riskLabel(level: PreflightRiskLevel) {
  if (level === 'high') return 'High-risk signs';
  if (level === 'caution') return 'Pause and verify';
  return 'No obvious warning signs';
}

function RiskIcon({ level }: { level: PreflightRiskLevel }) {
  if (level === 'high') return <AlertTriangle size={17} />;
  if (level === 'caution') return <CircleAlert size={17} />;
  return <CheckCircle2 size={17} />;
}

function AnalysisCard({ analysis, title }: { analysis: PreflightAIResult; title: string }) {
  return (
    <section className={`preflight-result preflight-result-${analysis.riskLevel}`} aria-live="polite">
      <div className={`preflight-risk preflight-risk-${analysis.riskLevel}`}>
        <RiskIcon level={analysis.riskLevel} />
        <div><span>{title}</span><strong>{riskLabel(analysis.riskLevel)}</strong></div>
      </div>
      <p className="preflight-summary">{analysis.explanation}</p>
      {analysis.evidence.length > 0 && <div className="preflight-findings">
        <h3>What we noticed</h3>
        <ul>{analysis.evidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
      </div>}
      <div className="preflight-next-step">
        <div><span>SAFER NEXT STEP</span><p>{analysis.nextStep}</p></div>
        <ArrowRight size={17} />
      </div>
      {analysis.steps.length > 0 && <ol className="preflight-steps">{analysis.steps.map((step, index) => <li key={`${index}-${step}`}><span>{index + 1}</span>{step}</li>)}</ol>}
      <p className="preflight-limit"><Info size={14} />This is a limited check, not proof that a message or link is safe.</p>
    </section>
  );
}

export function PreflightPage({ aiAvailable }: { aiAvailable: boolean }) {
  const [content, setContent] = useState('');
  const [localResult, setLocalResult] = useState<PreflightLocalResult | null>(null);
  const [aiResult, setAiResult] = useState<PreflightAIResult | null>(null);
  const [aiConsent, setAiConsent] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const handleLocalCheck = (event: FormEvent) => {
    event.preventDefault();
    requestRef.current?.abort();
    setAiBusy(false);
    setError('');
    setAiResult(null);
    setAiConsent(false);
    setLocalResult(analyzeTextLocally(content));
  };

  const handleContentChange = (value: string) => {
    requestRef.current?.abort();
    setContent(value);
    setLocalResult(null);
    setAiResult(null);
    setAiConsent(false);
    setError('');
    setAiBusy(false);
  };

  const handleAiCheck = async () => {
    if (!localResult || !aiConsent || !aiAvailable || aiBusy) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setAiBusy(true);
    setError('');
    try {
      const result = await sendPreflightAnalysis({
        content: redactLinksForAI(content, localResult.links),
        localSignals: localResult.findings.map((finding) => `${finding.title}: ${finding.detail}`),
      }, controller.signal);
      if (!controller.signal.aborted) {
        const order: Record<PreflightRiskLevel, number> = { none: 0, caution: 1, high: 2 };
        const localIsStronger = order[localResult.riskLevel] > order[result.riskLevel];
        const strongestLevel = localIsStronger ? localResult.riskLevel : result.riskLevel;
        const evidence = [...new Set([
          ...localResult.findings.map((finding) => `${finding.title}: ${finding.detail}`),
          ...result.evidence,
        ])].slice(0, 6);
        setAiResult({
          ...result,
          riskLevel: strongestLevel,
          explanation: localIsStronger
            ? `The on-device check found stronger warning signs than the AI review. ${localResult.summary}`
            : result.explanation,
          nextStep: localIsStronger ? localResult.nextStep : result.nextStep,
          steps: localIsStronger ? [] : result.steps,
          evidence,
        });
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The AI second look could not finish.');
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (!controller.signal.aborted) setAiBusy(false);
    }
  };

  return (
    <main className="preflight-page" aria-label="Check before you click">
      <div className="preflight-heading">
        <div className="preflight-heading-icon"><ShieldCheck size={21} /></div>
        <div><span>PRE-CLICK SHIELD</span><h1>Check before you click</h1></div>
      </div>
      <p className="preflight-intro">Paste a suspicious email, message, or link here. Start with a private check on this device before you respond.</p>

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
            <ShieldCheck size={17} /> Check locally
          </button>
          <button className="preflight-clear" type="button" disabled={!content} onClick={() => handleContentChange('')}>Clear</button>
        </div>
      </form>

      <div className="preflight-local-note"><LockKeyhole size={15} /><span>Local checks do not send your text anywhere or open links. No live reputation database is connected yet.</span></div>

      {localResult && <>
        <AnalysisCard
          title="ON-DEVICE CHECK"
          analysis={{
            riskLevel: localResult.riskLevel,
            explanation: localResult.summary,
            evidence: localResult.findings.map((finding) => `${finding.title}: ${finding.detail}`),
            nextStep: localResult.nextStep,
            steps: [],
          }}
        />
        {localResult.links.length > 0 && <div className="preflight-links">
          <span><ExternalLink size={14} /> Link domains found</span>
          <div>{[...new Set(localResult.links.map((link) => link.host))].map((host) => <code key={host}>{host}</code>)}</div>
        </div>}
        {aiResult && <AnalysisCard title="AI SECOND LOOK" analysis={aiResult} />}

        <section className="preflight-ai-panel">
          <div className="preflight-ai-heading"><span><Sparkles size={16} /> Optional AI second look</span><span>LINK PATHS REMOVED</span></div>
          <p>With your permission, the pasted text and detected link domains are sent to your configured AI provider. Link paths, query strings, and fragments are removed. Remove passwords, sign-in codes, and personal or medical details before sending.</p>
          <label className="preflight-consent"><input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} /> <span>I agree to send the remaining text and link domains for AI analysis.</span></label>
          {!aiAvailable && <div className="preflight-ai-unavailable"><Info size={14} />AI second look is unavailable right now; the local check above still works.</div>}
          {error && <div className="preflight-error" role="alert">{error}</div>}
          <button className="preflight-ai-button" type="button" onClick={() => void handleAiCheck()} disabled={!aiConsent || !aiAvailable || aiBusy}>
            {aiBusy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={16} />}{aiBusy ? 'Reviewing…' : 'Ask AI to explain the signs'}
          </button>
        </section>
      </>}
    </main>
  );
}
