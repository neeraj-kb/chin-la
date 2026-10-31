import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDown, ArrowUp, Check, ChevronDown, CircleHelp, Eye, EyeOff,
  LoaderCircle, LockKeyhole, Minimize2, Monitor, Pause, Play,
  ShieldAlert, ShieldCheck, Sparkles, Trash2, X,
} from 'lucide-react';
import robotMascot from './assets/robot-mascot.svg';
import robotAvatar from './assets/robot-avatar.svg';
import dragHandle from './assets/drag-handle.svg';
import { checkBackend, sendTurn } from './lib/api';
import { changeRatio, frameFingerprint } from './lib/screenChange';
import { clearSession, loadSession, saveSession } from './lib/session';
import { emptySessionState, type AssistantReply, type CaptureSource, type ChatMessage, type SessionState } from './types';
import { PreflightPage } from './components/PreflightPage';

type MonitorStatus = 'off' | 'active' | 'paused';
type AppPage = 'companion' | 'preflight';
const POLL_MS = 2600;
const CHANGE_THRESHOLD = 0.045;

function newMessage(role: ChatMessage['role'], text: string, reply?: AssistantReply): ChatMessage {
  return { id: crypto.randomUUID(), role, text, createdAt: Date.now(), reply };
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(value);
}

function AssistantCard({ reply }: { reply: AssistantReply }) {
  return (
    <div className="assistant-card">
      <div className="reply-heading">
        <span>Screenwise</span>
        <span className={`confidence confidence-${reply.confidence}`}>{reply.confidence} confidence</span>
      </div>
      <p className="reply-explanation">{reply.explanation}</p>
      {reply.background && <div className="background-note"><span>WHY IT MATTERS</span><p>{reply.background}</p></div>}
      {reply.nextStep && <div className="next-step"><div className="next-step-icon"><ArrowDown size={18} /></div><div><span>SAFEST NEXT STEP</span><p>{reply.nextStep}</p></div></div>}
      {reply.steps.length > 0 && <ol className="step-list">{reply.steps.map((step, index) => <li key={`${index}-${step}`}><span>{index + 1}</span>{step}</li>)}</ol>}
    </div>
  );
}

function App() {
  const initial = useMemo(() => loadSession(), []);
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [sessionState, setSessionState] = useState<SessionState>(initial.state);
  const [status, setStatus] = useState<MonitorStatus>('off');
  const [page, setPage] = useState<AppPage>('companion');
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState<CaptureSource | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<'checking' | 'ready' | 'missing' | 'offline'>('checking');
  const [notice, setNotice] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSession, setShowSession] = useState(false);
  const statusRef = useRef<MonitorStatus>('off');
  const sourceRef = useRef<CaptureSource | null>(null);
  const fingerprintRef = useRef<Uint8Array | null>(null);
  const checkingRef = useRef(false);
  const pollingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  const stateRef = useRef(sessionState);
  const conversationRef = useRef<HTMLElement>(null);
  const stickToBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { messagesRef.current = messages; saveSession({ messages, state: sessionState }); }, [messages, sessionState]);
  useEffect(() => { stateRef.current = sessionState; }, [sessionState]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { sourceRef.current = selectedSource; }, [selectedSource]);
  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation && stickToBottomRef.current) {
      conversation.scrollTo({ top: conversation.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, busy]);

  useEffect(() => {
    let cancelled = false;
    checkBackend().then((result) => {
      if (cancelled) return;
      setServiceStatus(result.configured.groq || result.configured.openrouterChat ? 'ready' : 'missing');
    }).catch(() => { if (!cancelled) setServiceStatus('offline'); });
    return () => { cancelled = true; };
  }, []);

  const pushMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => [...current, message].slice(-60));
  }, []);

  const captureFrame = useCallback(async () => {
    if (!window.companionDesktop || !sourceRef.current) throw new Error('Choose a screen or window to monitor first.');
    return window.companionDesktop.captureFrame(sourceRef.current.id);
  }, []);

  const runAssistantTurn = useCallback(async (options: { message: string; eventOnly?: boolean; forceFrame?: boolean; showUserMessage?: boolean }) => {
    const { message, eventOnly = false, forceFrame = false, showUserMessage = true } = options;
    if (checkingRef.current || (eventOnly && statusRef.current !== 'active')) return;
    checkingRef.current = true;
    setBusy(true);
    setNotice('');
    const history = messagesRef.current.slice(-12).map(({ role, text, id, createdAt }) => ({ role, text, id, createdAt }));
    if (showUserMessage && message) {
      stickToBottomRef.current = true;
      pushMessage(newMessage('user', message));
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    let frameData = '';
    try {
      if (forceFrame && statusRef.current === 'active' && sourceRef.current) {
        frameData = await captureFrame();
        fingerprintRef.current = await frameFingerprint(frameData);
      }
      const contextualMessage = statusRef.current === 'paused' && !frameData
        ? `${message}\n[Screen capture is paused. Use the saved text context only and be clear if current visual details are unavailable.]`
        : message;
      const reply = await sendTurn({
        message: contextualMessage,
        ...(frameData ? { frameData } : {}),
        eventOnly,
        state: stateRef.current,
        history,
      }, controller.signal);
      if (controller.signal.aborted) return;
      const updated: SessionState = {
        goal: reply.goal || stateRef.current.goal,
        screenSummary: reply.screenSummary || stateRef.current.screenSummary,
        currentStep: reply.currentStep || stateRef.current.currentStep,
        nextStep: reply.nextStep || stateRef.current.nextStep,
        lastIssue: reply.lastIssue || stateRef.current.lastIssue,
        completedSteps: reply.completedSteps.length ? reply.completedSteps : stateRef.current.completedSteps,
      };
      setSessionState(updated);
      if (!eventOnly || reply.shouldInterrupt) {
        pushMessage(newMessage('assistant', reply.explanation, reply));
      } else {
        setNotice('Screen checked · no urgent action needed');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const text = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
        if (eventOnly) setNotice(text);
        else pushMessage(newMessage('assistant', text));
      }
    } finally {
      frameData = '';
      controllerRef.current = null;
      checkingRef.current = false;
      setBusy(false);
    }
  }, [captureFrame, pushMessage]);

  useEffect(() => {
    if (status !== 'active' || !selectedSource) return;
    const timer = window.setInterval(async () => {
      if (pollingRef.current || checkingRef.current || statusRef.current !== 'active') return;
      pollingRef.current = true;
      try {
        const frame = await captureFrame();
        if (statusRef.current !== 'active') return;
        const currentFingerprint = await frameFingerprint(frame);
        const changed = changeRatio(fingerprintRef.current, currentFingerprint);
        fingerprintRef.current = currentFingerprint;
        if (changed >= CHANGE_THRESHOLD) {
          void runAssistantTurn({ message: '', eventOnly: true, forceFrame: true, showUserMessage: false });
        }
      } catch (error) {
        statusRef.current = 'paused';
        setNotice(error instanceof Error ? error.message : 'Screen capture paused.');
        setStatus('paused');
      } finally {
        pollingRef.current = false;
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [status, selectedSource, captureFrame, runAssistantTurn]);

  const handleStart = async () => {
    if (!window.companionDesktop) {
      setNotice('Open this app with “npm run dev” to use Windows screen capture.');
      return;
    }
    setSourceLoading(true);
    try {
      const result = await window.companionDesktop.listCaptureSources();
      setSources(result);
      setShowSourcePicker(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not list screens and windows.');
    } finally {
      setSourceLoading(false);
    }
  };

  const selectSource = (source: CaptureSource) => {
    sourceRef.current = source;
    statusRef.current = 'active';
    setSelectedSource(source);
    setShowSourcePicker(false);
    setSources([]);
    fingerprintRef.current = null;
    setStatus('active');
    setNotice(`Monitoring ${source.name}`);
    window.setTimeout(() => void runAssistantTurn({
      message: 'Check the selected screen for a cybersecurity issue. Briefly explain it and suggest a safe next step if useful.',
      eventOnly: true,
      forceFrame: true,
      showUserMessage: false,
    }), 150);
  };

  const togglePause = () => {
    if (status === 'active') {
      controllerRef.current?.abort();
      statusRef.current = 'paused';
      setStatus('paused');
      setNotice('Monitoring paused · no new frames are sent');
    } else if (status === 'paused' && selectedSource) {
      statusRef.current = 'active';
      setStatus('active');
      setNotice('Monitoring resumed');
      void runAssistantTurn({ message: 'Recheck the current screen for a cybersecurity concern and tell me only if there is a useful next step.', eventOnly: true, forceFrame: true, showUserMessage: false });
    }
  };

  const stopMonitoring = () => {
    controllerRef.current?.abort();
    setStatus('off');
    statusRef.current = 'off';
    setSelectedSource(null);
    sourceRef.current = null;
    fingerprintRef.current = null;
    setNotice('Monitoring stopped · screen capture is off');
  };

  const submitMessage = (text = draft) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setDraft('');
    void runAssistantTurn({
      message: trimmed,
      forceFrame: statusRef.current === 'active',
      showUserMessage: true,
    });
    inputRef.current?.focus();
  };

  const handleClear = () => {
    clearSession();
    setMessages([]);
    setSessionState(emptySessionState);
    setShowClearConfirm(false);
    setNotice('Conversation and saved text context cleared');
  };

  const statusCopy = status === 'active' ? `Watching ${selectedSource?.name || 'screen'}` : status === 'paused' ? 'Monitoring paused' : 'Screen monitoring off';
  const statusTone = status === 'active' ? 'active' : status === 'paused' ? 'paused' : 'idle';

  return (
    <div className="app-shell">
      <header className="topbar drag-region">
        <div className="brand-block">
          <div className="brand-mark"><img src={robotMascot} alt="" /></div>
          <div><div className="brand-name">Screenwise</div><div className="brand-caption">SECURITY COMPANION</div></div>
        </div>
        <div className="drag-hint" aria-hidden="true"><img src={dragHandle} alt="" /><span>MOVE</span></div>
        <div className="window-actions no-drag">
          {page === 'companion' && <button className="icon-button" title="Session progress" aria-label="Session progress" onClick={() => setShowSession((value) => !value)}><Activity size={18} /></button>}
          {page === 'companion' && <button className="icon-button" title="Clear conversation" aria-label="Clear conversation" onClick={() => setShowClearConfirm(true)}><Trash2 size={18} /></button>}
          {window.companionDesktop && <button className="icon-button" title="Minimize" aria-label="Minimize" onClick={() => void window.companionDesktop?.minimize()}><Minimize2 size={18} /></button>}
          {window.companionDesktop && <button className="icon-button close-button" title="Close" aria-label="Close" onClick={() => void window.companionDesktop?.close()}><X size={18} /></button>}
        </div>
      </header>

      <nav className="page-tabs" aria-label="Screenwise pages">
        <button className={page === 'companion' ? 'page-tab page-tab-active' : 'page-tab'} aria-current={page === 'companion' ? 'page' : undefined} onClick={() => setPage('companion')}><Monitor size={16} />Companion</button>
        <button className={page === 'preflight' ? 'page-tab page-tab-active' : 'page-tab'} aria-current={page === 'preflight' ? 'page' : undefined} onClick={() => setPage('preflight')}><ShieldCheck size={16} />Before you click</button>
      </nav>

      <section className={`monitor-banner monitor-${statusTone}`}>
        <div className="monitor-state-icon">{status === 'active' ? <Eye size={16} /> : status === 'paused' ? <EyeOff size={16} /> : <Monitor size={16} />}</div>
        <div className="monitor-copy"><strong>{statusCopy}</strong><span>{status === 'active' ? 'Screen changes are checked privately' : status === 'paused' ? 'No screen frames are being captured' : 'Choose a window to get started'}</span></div>
        <div className={`monitor-status status-${statusTone}`}><span />{status === 'active' ? 'LIVE' : status === 'paused' ? 'PAUSED' : 'READY'}</div>
        <div className="monitor-controls">
          {status === 'off' && <button className="small-primary" onClick={handleStart} disabled={sourceLoading}>{sourceLoading ? <LoaderCircle className="spin" size={18} /> : <Play size={17} fill="currentColor" />}{sourceLoading ? 'Loading' : 'Start'}</button>}
          {status !== 'off' && <button className="small-control" onClick={togglePause}>{status === 'active' ? <><Pause size={17} />Pause</> : <><Play size={17} fill="currentColor" />Resume</>}</button>}
          {status !== 'off' && <button className="stop-control" onClick={stopMonitoring} title="Stop monitoring" aria-label="Stop monitoring"><span /><span>Stop</span></button>}
        </div>
      </section>

      {page === 'companion' && (serviceStatus !== 'ready' || notice) && <div className={`notice-bar ${serviceStatus === 'offline' || serviceStatus === 'missing' ? 'notice-warning' : ''}`}>
        {serviceStatus === 'checking' ? <LoaderCircle size={13} className="spin" /> : serviceStatus === 'ready' ? <Check size={13} /> : <CircleHelp size={13} />}
        <span>{notice || (serviceStatus === 'checking' ? 'Connecting to the companion service…' : serviceStatus === 'offline' ? 'Companion service unavailable. Start it with npm run dev.' : 'Add an OPENROUTER_CHAT_API_KEY or GROQ_API_KEY to .env to enable chat, then restart the app.')}</span>
        {notice && <button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={13} /></button>}
      </div>}

      {showSession && page === 'companion' && <section className="session-panel">
        <div className="session-panel-heading"><span><Activity size={14} /> Session memory</span><button onClick={() => setShowSession(false)} aria-label="Close session panel"><X size={14} /></button></div>
        <div className="session-grid">
          <div><span>WHAT YOU'RE WORKING ON</span><p>{sessionState.goal || 'Not set yet'}</p></div>
          <div><span>CURRENT STEP</span><p>{sessionState.currentStep || 'Waiting for guidance'}</p></div>
          {sessionState.nextStep && <div><span>UP NEXT</span><p>{sessionState.nextStep}</p></div>}
          {sessionState.lastIssue && <div><span>LAST ISSUE</span><p>{sessionState.lastIssue}</p></div>}
        </div>
          <div className="memory-foot"><LockKeyhole size={12} /> Text context is saved on this device. Images aren't saved by this app.</div>
      </section>}

      {page === 'preflight' ? <PreflightPage aiAvailable={serviceStatus === 'ready'} /> : <main className="conversation" ref={conversationRef} aria-label="Conversation" aria-live="polite" tabIndex={0} onScroll={(event) => {
        const element = event.currentTarget;
        stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      }}>
        {messages.length === 0 ? <div className="welcome">
          <div className="welcome-orbit" role="img" aria-label="Screenwise robot companion">
            <img className="welcome-robot" src={robotMascot} alt="Screenwise robot companion" />
            <span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" /><span className="orbit-dot dot-three" />
          </div>
          <div className="welcome-kicker"><span /> YOUR QUIET SECURITY COPILOT</div>
          <h1>Your screen,<br /><em>made clearer.</em></h1>
          <p>Start monitoring to get a plain-language read on what you’re seeing. Ask questions anytime; we’ll keep track of your next step.</p>
          <div className="privacy-chip"><LockKeyhole size={13} /> Images aren't saved by this app <span>·</span> You stay in control</div>
          <div className="quick-prompts">
            <button onClick={() => status === 'active' ? submitMessage('What is happening on my screen?') : setNotice('Start monitoring to ask about what is currently on screen.')}><ShieldAlert size={14} />What is this alert?</button>
            <button onClick={() => status === 'active' ? submitMessage('Does this look safe? Explain what you can tell from the screen.') : setNotice('Start monitoring to ask about what is currently on screen.')}><CircleHelp size={14} />Does this look safe?</button>
          </div>
        </div> : <div className="message-list">
          {messages.map((message) => <article className={`message-row ${message.role}`} key={message.id}>
            {message.role === 'assistant' && <img className="assistant-avatar" src={robotAvatar} alt="Screenwise assistant" />}
            <div className="message-content">
              {message.role === 'assistant' && message.reply ? <AssistantCard reply={message.reply} /> : <div className={`plain-bubble ${message.role}`}>{message.text}</div>}
              <time>{formatTime(message.createdAt)}</time>
            </div>
            {message.role === 'user' && <div className="user-avatar">YOU</div>}
          </article>)}
          {busy && <div className="thinking-row"><img className="assistant-avatar" src={robotAvatar} alt="" /><div className="thinking"><span className="thinking-dots"><i /><i /><i /></span><span>Making sense of it…</span></div></div>}
        </div>}
      </main>}

      {page === 'companion' && messages.length > 0 && !busy && status !== 'off' && <div className="conversation-nudge"><span className="nudge-line" />Ask a follow-up whenever you need<span className="nudge-line" /></div>}

      {page === 'companion' && <footer className="composer-wrap">
        {messages.length === 0 && <div className="composer-hint"><span className="hint-sparkle"><Sparkles size={12} /></span>Ask about a warning, a button, or what to do next</div>}
        <form className="composer" onSubmit={(event) => { event.preventDefault(); submitMessage(); }}>
          <textarea ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitMessage(); } }} placeholder="Ask about what you see…" rows={1} aria-label="Ask Screenwise a question" />
          <button type="submit" className="send-button" disabled={!draft.trim() || busy} aria-label="Send message">{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={17} />}</button>
        </form>
        <div className="composer-meta"><span><LockKeyhole size={11} /> Your screen stays under your control</span><span>ENTER TO SEND <kbd>↵</kbd></span></div>
      </footer>}

      {showSourcePicker && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowSourcePicker(false); setSources([]); } }}>
        <section className="modal source-modal" role="dialog" aria-modal="true" aria-labelledby="source-title">
          <div className="modal-top"><div className="modal-symbol"><Monitor size={18} /></div><button className="icon-button" onClick={() => { setShowSourcePicker(false); setSources([]); }} aria-label="Close screen picker"><X size={16} /></button></div>
          <h2 id="source-title">Choose what to watch</h2>
          <p className="modal-description">Select one screen or app window. Relevant frames may be sent to the configured AI providers while monitoring is active. This app and its local proxy discard them after analysis.</p>
          <div className="source-list">{sources.map((source) => <button className="source-item" key={source.id} onClick={() => selectSource(source)}>
            <div className="source-preview">{source.thumbnail ? <img src={source.thumbnail} alt="" /> : <Monitor size={21} />}</div>
            <div className="source-info"><span>{source.kind}</span><strong>{source.name}</strong></div><ChevronDown size={15} className="source-arrow" />
          </button>)}</div>
          {sources.length === 0 && <div className="empty-sources">No capturable screens or windows were found. Make sure your screen is awake and the app you want to monitor is visible, then try again.</div>}
          <div className="modal-privacy"><LockKeyhole size={13} /><span>Capture is visible and pausable. Images are not stored.</span></div>
        </section>
      </div>}

      {showClearConfirm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowClearConfirm(false); }}>
        <section className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="clear-title">
          <div className="modal-symbol subtle"><Trash2 size={17} /></div><h2 id="clear-title">Clear this conversation?</h2>
          <p className="modal-description">This removes the saved chat and session progress from this device. It does not change your screen monitoring setting.</p>
          <div className="modal-actions"><button className="secondary-button" onClick={() => setShowClearConfirm(false)}>Keep it</button><button className="danger-button" onClick={handleClear}>Clear history</button></div>
        </section>
      </div>}

      <div className="bottom-glow" />
    </div>
  );
}

export default App;
