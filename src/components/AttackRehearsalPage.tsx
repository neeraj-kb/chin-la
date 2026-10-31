import { useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Building2, Check, CircleAlert, GraduationCap,
  LockKeyhole, RotateCcw, ShieldCheck, Store,
  type LucideIcon,
} from 'lucide-react';
import { attackQuestionBank, type PracticeCategory, type PracticeQuestion } from '../data/attackQuestions';
import { drawRandomQuestions } from '../lib/attackRehearsal.mjs';

type Setting = 'clinic' | 'school' | 'shop';
type RoleOption = { id: Setting; label: string; icon: LucideIcon };

const QUESTION_COUNT = 5;
const LAST_QUESTION_IDS_KEY = 'screenwise.practice.lastQuestionIds';
const ROLE_KEY = 'screenwise.practice.role';

const roles: RoleOption[] = [
  { id: 'clinic', label: 'Community clinic', icon: Building2 },
  { id: 'school', label: 'School', icon: GraduationCap },
  { id: 'shop', label: 'Retail shop', icon: Store },
];

const settingDetails: Record<Setting, { label: string; org: string; records: string }> = {
  clinic: { label: 'Community clinic', org: 'community clinic', records: 'patient records' },
  school: { label: 'School', org: 'school', records: 'student records' },
  shop: { label: 'Retail shop', org: 'retail shop', records: 'customer or payment records' },
};

const recoveryAdvice: Record<PracticeCategory, string> = {
  'Email & links': 'If you clicked, downloaded a file, or entered a password, tell your trusted IT contact or manager promptly and explain exactly what happened. Do not enter more information on that page.',
  'Money & invoices': 'If payment details changed or money was sent, contact your bank or payment provider and notify the responsible manager immediately, using contact details you already trust.',
  'Accounts & sign-ins': 'If you approved a request or shared a password or code, contact your trusted IT or account-support route immediately. Tell them what happened and when.',
  'Fake support': 'If you installed a tool or allowed remote access, contact trusted IT immediately and follow their instructions before using the device for sensitive work.',
  'Files & downloads': 'If you opened or installed something unexpected, stop interacting with it and contact trusted IT or your manager. Describe what you opened and when.',
  'Data & privacy': 'If information was shared or sent to the wrong person, tell your manager or privacy contact promptly and follow your organization’s response process.',
  'Devices & networks': 'If a device or account may be exposed, tell your manager or IT promptly using a trusted phone or device, then follow their recovery instructions.',
  'Workplace security': 'Tell reception, your manager, or the person responsible for site security. Describe what happened and follow the normal visitor or incident process.',
};

function readLastQuestionIds(): string[] {
  try {
    const value = localStorage.getItem(LAST_QUESTION_IDS_KEY) ?? sessionStorage.getItem(LAST_QUESTION_IDS_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    try {
      const fallback = sessionStorage.getItem(LAST_QUESTION_IDS_KEY);
      const parsed: unknown = fallback ? JSON.parse(fallback) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }
}

function createQuestionSet(): PracticeQuestion[] {
  return drawRandomQuestions(attackQuestionBank, readLastQuestionIds(), QUESTION_COUNT);
}

function readSavedRole(): Setting {
  try {
    const saved = sessionStorage.getItem(ROLE_KEY);
    return roles.some((role) => role.id === saved) ? saved as Setting : 'clinic';
  } catch {
    return 'clinic';
  }
}

function promptFor(question: PracticeQuestion, setting: Setting) {
  return question.prompt
    .replaceAll('{org}', settingDetails[setting].org)
    .replaceAll('{records}', settingDetails[setting].records);
}

export function AttackRehearsalPage({ autoStart = false }: { autoStart?: boolean }) {
  const [setting, setSetting] = useState<Setting>(readSavedRole);
  const [started, setStarted] = useState(autoStart);
  const [step, setStep] = useState(0);
  const [questions, setQuestions] = useState<PracticeQuestion[]>(createQuestionSet);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const complete = started && step >= questions.length;
  const question = questions[step];
  const selectedOption = question ? answers[question.id] : undefined;
  const answeredCount = Object.keys(answers).length;
  const safeCount = Object.entries(answers).filter(([id, option]) => {
    const answeredQuestion = questions.find((item) => item.id === id);
    return answeredQuestion?.safeOption === option;
  }).length;

  useEffect(() => {
    try {
      localStorage.setItem(LAST_QUESTION_IDS_KEY, JSON.stringify(questions.map(({ id }) => id)));
    } catch {
      try { sessionStorage.setItem(LAST_QUESTION_IDS_KEY, JSON.stringify(questions.map(({ id }) => id))); } catch { /* The practice still works when browser storage is unavailable. */ }
    }
  }, [questions]);

  useEffect(() => {
    try {
      sessionStorage.setItem(ROLE_KEY, setting);
    } catch {
      // Remembering the selected setting is optional.
    }
  }, [setting]);

  const startPractice = () => {
    setAnswers({});
    setStep(0);
    setStarted(true);
  };

  const startFreshRound = () => {
    setQuestions(createQuestionSet());
    setAnswers({});
    setStep(0);
    setStarted(true);
  };

  const finishQuestion = () => setStep((current) => Math.min(current + 1, questions.length));

  return (
    <main className="rehearsal-page" aria-label="Cybersecurity attack rehearsal">
      <div className="rehearsal-heading">
        <div className="rehearsal-heading-icon"><ShieldCheck size={22} /></div>
        <div><span>SAFE PRACTICE · NO LIVE EMAILS</span><h1>Attack rehearsal</h1></div>
      </div>
      <p className="rehearsal-intro">Practise the pause, check, and verify decisions that can stop common scams before they cause harm.</p>

      {!started && <section className="rehearsal-start-card">
        <div className="rehearsal-start-symbol"><ShieldCheck size={22} /></div>
        <div>
          <span className="rehearsal-eyebrow">100 OFFLINE QUESTIONS · 5 PER ROUND</span>
          <h2>Practise before the pressure is real.</h2>
          <p>Each round draws five random situations from the local question bank. Refreshing or starting again gives you a different set, with no repeats from the previous round.</p>
        </div>
        <fieldset className="rehearsal-role-picker">
          <legend>Choose the setting closest to yours</legend>
          <div className="rehearsal-role-options">
            {roles.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={setting === id ? 'rehearsal-role rehearsal-role-active' : 'rehearsal-role'} aria-pressed={setting === id} onClick={() => setSetting(id)}>
              <Icon size={17} /><span>{label}</span>{setting === id && <Check size={14} className="rehearsal-role-check" />}
            </button>)}
          </div>
        </fieldset>
        <button className="rehearsal-primary" type="button" onClick={startPractice}>Start random practice <ArrowRight size={17} /></button>
      </section>}

      {started && !complete && question && <>
        <div className="rehearsal-progress" aria-label={`Question ${step + 1} of ${questions.length}`}>
          <div className="rehearsal-progress-top"><span>QUESTION {step + 1} OF {questions.length}</span><span>{settingDetails[setting].label}</span></div>
          <div className="rehearsal-progress-track"><span style={{ width: `${((step + 1) / questions.length) * 100}%` }} /></div>
        </div>
        <section className="rehearsal-scenario-card">
          <div className="rehearsal-scenario-top"><span className="rehearsal-category"><CircleAlert size={14} />{question.category}</span><span className="rehearsal-simulated">SIMULATED</span></div>
          <h2>What would you do?</h2>
          <p className="rehearsal-context">{promptFor(question, setting)}</p>
          <div className="rehearsal-question">Choose the safest next step</div>
          <div className="rehearsal-choices" role="group" aria-label="Choose a response">
            {question.options.map((option, index) => <button key={`${question.id}-${index}`} type="button" className={selectedOption === index ? 'rehearsal-choice rehearsal-choice-selected' : 'rehearsal-choice'} aria-pressed={selectedOption === index} onClick={() => setAnswers((current) => ({ ...current, [question.id]: index }))}>
              <span className="rehearsal-choice-index">{String.fromCharCode(65 + index)}</span><span>{option}</span>
            </button>)}
          </div>
          {selectedOption !== undefined && <div className={selectedOption === question.safeOption ? 'rehearsal-feedback rehearsal-feedback-safe' : 'rehearsal-feedback rehearsal-feedback-caution'} aria-live="polite">
            <div className="rehearsal-feedback-title">{selectedOption === question.safeOption ? <ShieldCheck size={18} /> : <CircleAlert size={18} />}{selectedOption === question.safeOption ? 'Good call — that is the safest choice' : 'Pause and verify before acting'}</div>
            <p>{selectedOption === question.safeOption ? 'Your response follows a safe step. Here is why it helps.' : 'That choice could expose an account, device, money, or information. Use the safer response below.'}</p>
            <div className="rehearsal-safe-response"><strong>SAFER RESPONSE</strong><p>{question.options[question.safeOption]}</p></div>
            <div className="rehearsal-why"><strong>WHY IT HELPS</strong><p>{question.lesson}</p></div>
            <div className="rehearsal-if-acted"><strong>If this already happened</strong><p>{recoveryAdvice[question.category]}</p></div>
            <div className="rehearsal-warning-signs"><strong>WARNING SIGNS</strong><div>{question.warningSigns.map((sign) => <span key={sign}>{sign}</span>)}</div></div>
          </div>}
          <div className="rehearsal-navigation">
            {step > 0 ? <button type="button" className="rehearsal-back" onClick={() => setStep((current) => Math.max(current - 1, 0))}><ArrowLeft size={16} />Previous</button> : <span />}
            <button type="button" className="rehearsal-primary" disabled={selectedOption === undefined} onClick={finishQuestion}>{step === questions.length - 1 ? 'Finish round' : 'Next question'}<ArrowRight size={16} /></button>
          </div>
        </section>
      </>}

      {complete && <section className="rehearsal-complete" aria-live="polite">
        <div className="rehearsal-complete-icon"><Check size={23} /></div>
        <span className="rehearsal-eyebrow">ROUND COMPLETE</span>
        <h2>You practised {answeredCount} security decisions.</h2>
        <p>You chose the safest response in {safeCount} of {answeredCount} situations. Every answer included a plain-language explanation and a practical next step.</p>
        <div className="rehearsal-round-topics"><strong>Topics in this round</strong><div>{[...new Set(questions.map(({ category }) => category))].map((category) => <span key={category}>{category}</span>)}</div></div>
        <button className="rehearsal-primary" type="button" onClick={startFreshRound}><RotateCcw size={16} />New random round <ArrowRight size={16} /></button>
      </section>}

      <div className="rehearsal-privacy"><LockKeyhole size={14} /><span>This is a simulation. Nothing is sent, no account is accessed, and no real email is used. Only the last five question IDs are saved locally to avoid immediate repeats.</span></div>
    </main>
  );
}
