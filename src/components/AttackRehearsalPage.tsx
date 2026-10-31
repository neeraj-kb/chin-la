import { useState } from 'react';
import {
  ArrowLeft, ArrowRight, Building2, Check, CircleAlert, GraduationCap,
  LockKeyhole, RotateCcw, ShieldCheck, Store, type LucideIcon,
} from 'lucide-react';

type Setting = 'clinic' | 'school' | 'shop';
type RoleOption = { id: Setting; label: string; icon: LucideIcon };
type Choice = { id: string; label: string; safe: boolean; feedback: string };
type Scenario = {
  id: string;
  category: string;
  title: string;
  context: Record<Setting, string>;
  warningSigns: string[];
  choices: Choice[];
  safestResponse: string;
  whyItWorks: string;
  ifAlreadyActed: string;
};

const roles: RoleOption[] = [
  { id: 'clinic', label: 'Community clinic', icon: Building2 },
  { id: 'school', label: 'School', icon: GraduationCap },
  { id: 'shop', label: 'Retail shop', icon: Store },
];

const scenarios: Scenario[] = [
  {
    id: 'payment-change',
    category: 'Payment redirection',
    title: 'A supplier changes bank details',
    context: {
      clinic: 'A regular medical-supplies supplier emails the office: “We changed our bank account. Please use these new details to pay today’s invoice. Keep this confidential.”',
      school: 'A regular school-supplies vendor emails the office: “We changed our bank account. Please use these new details to pay today’s invoice. Keep this confidential.”',
      shop: 'A regular stock supplier emails the shop: “We changed our bank account. Please use these new details to pay today’s invoice. Keep this confidential.”',
    },
    warningSigns: ['New payment details', 'Pressure to act today', 'A request to keep the change secret'],
    choices: [
      { id: 'pay', label: 'Update the bank details and pay before the deadline.', safe: false, feedback: 'Changing payment details from an email alone could send the money to an attacker. Pause the payment until the change is independently verified.' },
      { id: 'reply', label: 'Reply to the email and ask the sender to confirm.', safe: false, feedback: 'A reply goes back through the same conversation. If someone controls that mailbox, they can confirm their own false request. Verify through a contact route already on file.' },
      { id: 'verify', label: 'Pause payment and call the supplier using a number already in your records.', safe: true, feedback: 'Good call. An independently saved phone number gives you a separate way to verify the change before money moves.' },
    ],
    safestResponse: 'Do not change the saved bank details or release payment yet. Call the supplier using a number already in your records, follow your organization’s payment approval process, and report the unusual email to the person who handles security or finance.',
    whyItWorks: 'A genuine supplier account can be compromised, and a familiar name in an email does not prove who sent it. A separate trusted contact route breaks the attacker’s control of the email conversation.',
    ifAlreadyActed: 'If payment details were changed or money was sent, tell your manager and bank immediately using trusted contact details. Do not wait for another email reply.',
  },
  {
    id: 'unexpected-approval',
    category: 'Account takeover',
    title: 'A sign-in approval appears unexpectedly',
    context: {
      clinic: 'Your work email shows a sign-in approval request on your phone. You are not trying to sign in. A caller claiming to be IT says to approve it to restore your clinic account.',
      school: 'Your school email shows a sign-in approval request on your phone. You are not trying to sign in. A caller claiming to be IT says to approve it to restore your account.',
      shop: 'Your work email shows a sign-in approval request on your phone. You are not trying to sign in. A caller claiming to be IT says to approve it to restore your shop account.',
    },
    warningSigns: ['You did not start the sign-in', 'A caller asks you to approve it', 'Urgency around access to your account'],
    choices: [
      { id: 'approve', label: 'Approve it so the caller can finish fixing the account.', safe: false, feedback: 'Approving could let someone else into your account. Deny requests you did not start and contact your real IT or account support through a route you already trust.' },
      { id: 'deny-report', label: 'Deny the request and contact IT using your usual contact method.', safe: true, feedback: 'Good call. Denying the prompt blocks this sign-in attempt, and contacting IT through a known route helps them check whether your account needs attention.' },
      { id: 'ask-caller', label: 'Ask the caller for their staff number, then follow their instructions.', safe: false, feedback: 'A staff number can be copied or invented. End the unexpected call and contact IT using your organization’s saved number or helpdesk address.' },
    ],
    safestResponse: 'Deny the prompt. Do not share a code or approve another request. Contact IT through your usual helpdesk or a number you already have, and follow their advice about checking account activity.',
    whyItWorks: 'An unexpected approval request can mean someone already has your password and is trying to get past the second sign-in check. A caller’s identity should be verified independently.',
    ifAlreadyActed: 'If you approved a request or shared a code, contact IT immediately from a trusted channel. Tell them what happened and when; do not delete the alert.',
  },
  {
    id: 'fake-support',
    category: 'Remote access scam',
    title: 'A pop-up says your computer is infected',
    context: {
      clinic: 'A full-screen browser warning says patient records are at risk. It tells you to call a support number and install a remote-access app.',
      school: 'A full-screen browser warning says student records are at risk. It tells you to call a support number and install a remote-access app.',
      shop: 'A full-screen browser warning says payment details are at risk. It tells you to call a support number and install a remote-access app.',
    },
    warningSigns: ['A warning inside a browser page', 'A phone number supplied by the pop-up', 'A request to install remote-access software'],
    choices: [
      { id: 'call', label: 'Call the number on the warning and let support connect remotely.', safe: false, feedback: 'The pop-up controls the number it displays. Calling it could connect you to the scammer, who may ask to control the computer or see private information.' },
      { id: 'close-verify', label: 'Close the browser page and contact your usual IT support directly.', safe: true, feedback: 'Good call. You avoid the number and software supplied by the warning, then use a trusted route to check whether help is needed.' },
      { id: 'install', label: 'Install the app but do not share your password.', safe: false, feedback: 'Remote-access software can let another person see or control the computer even without your password. Do not install it from an unexpected warning.' },
    ],
    safestResponse: 'Do not call the number, install software, or share a code. Close the browser tab or window if you can, then contact your usual IT support using a saved number or helpdesk address.',
    whyItWorks: 'A web page can display a convincing warning and choose the support number it wants you to call. Your organization’s real support route is a safer way to check.',
    ifAlreadyActed: 'If you called, installed a tool, or allowed remote access, tell IT or your manager immediately. Follow their instructions before using the computer for sensitive work.',
  },
];

export function AttackRehearsalPage() {
  const [setting, setSetting] = useState<Setting>('clinic');
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const complete = started && step >= scenarios.length;
  const scenario = scenarios[step];
  const selectedChoice = scenario?.choices.find((choice) => choice.id === answers[scenario.id]);

  const startPractice = () => {
    setAnswers({});
    setStep(0);
    setStarted(true);
  };

  const finishScenario = () => setStep((current) => Math.min(current + 1, scenarios.length));

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
          <span className="rehearsal-eyebrow">A SHORT TEAM EXERCISE</span>
          <h2>Practise before the pressure is real.</h2>
          <p>Work through three realistic situations. Choose what you would do, then see a safe response you can use at work.</p>
        </div>
        <fieldset className="rehearsal-role-picker">
          <legend>Choose the setting closest to yours</legend>
          <div className="rehearsal-role-options">
            {roles.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={setting === id ? 'rehearsal-role rehearsal-role-active' : 'rehearsal-role'} aria-pressed={setting === id} onClick={() => setSetting(id)}>
              <Icon size={17} /><span>{label}</span>{setting === id && <Check size={14} className="rehearsal-role-check" />}
            </button>)}
          </div>
        </fieldset>
        <button className="rehearsal-primary" type="button" onClick={startPractice}>Start the practice <ArrowRight size={17} /></button>
      </section>}

      {started && !complete && scenario && <>
        <div className="rehearsal-progress" aria-label={`Scenario ${step + 1} of ${scenarios.length}`}>
          <div className="rehearsal-progress-top"><span>SCENARIO {step + 1} OF {scenarios.length}</span><span>{roles.find((role) => role.id === setting)?.label}</span></div>
          <div className="rehearsal-progress-track"><span style={{ width: `${((step + 1) / scenarios.length) * 100}%` }} /></div>
        </div>
        <section className="rehearsal-scenario-card">
          <div className="rehearsal-scenario-top"><span className="rehearsal-category"><CircleAlert size={14} />{scenario.category}</span><span className="rehearsal-simulated">SIMULATED</span></div>
          <h2>{scenario.title}</h2>
          <p className="rehearsal-context">{scenario.context[setting]}</p>
          <div className="rehearsal-question">What would you do next?</div>
          <div className="rehearsal-choices" role="group" aria-label="Choose a response">
            {scenario.choices.map((choice, index) => <button key={choice.id} type="button" className={selectedChoice?.id === choice.id ? 'rehearsal-choice rehearsal-choice-selected' : 'rehearsal-choice'} aria-pressed={selectedChoice?.id === choice.id} onClick={() => setAnswers((current) => ({ ...current, [scenario.id]: choice.id }))}>
              <span className="rehearsal-choice-index">{String.fromCharCode(65 + index)}</span><span>{choice.label}</span>
            </button>)}
          </div>
          {selectedChoice && <div className={selectedChoice.safe ? 'rehearsal-feedback rehearsal-feedback-safe' : 'rehearsal-feedback rehearsal-feedback-caution'} aria-live="polite">
            <div className="rehearsal-feedback-title">{selectedChoice.safe ? <ShieldCheck size={18} /> : <CircleAlert size={18} />}{selectedChoice.safe ? 'That is a safer choice' : 'Pause before taking that step'}</div>
            <p>{selectedChoice.feedback}</p>
            <div className="rehearsal-safe-response"><strong>SAFER RESPONSE</strong><p>{scenario.safestResponse}</p></div>
            <div className="rehearsal-why"><strong>WHY IT HELPS</strong><p>{scenario.whyItWorks}</p></div>
            <div className="rehearsal-if-acted"><strong>If this already happened</strong><p>{scenario.ifAlreadyActed}</p></div>
            <div className="rehearsal-warning-signs"><strong>Warning signs in this situation</strong><div>{scenario.warningSigns.map((sign) => <span key={sign}>{sign}</span>)}</div></div>
          </div>}
          <div className="rehearsal-navigation">
            {step > 0 ? <button type="button" className="rehearsal-back" onClick={() => setStep((current) => Math.max(current - 1, 0))}><ArrowLeft size={16} />Previous</button> : <span />}
            <button type="button" className="rehearsal-primary" disabled={!selectedChoice} onClick={finishScenario}>{step === scenarios.length - 1 ? 'Finish practice' : 'Next situation'}<ArrowRight size={16} /></button>
          </div>
        </section>
      </>}

      {complete && <section className="rehearsal-complete" aria-live="polite">
        <div className="rehearsal-complete-icon"><Check size={23} /></div>
        <span className="rehearsal-eyebrow">PRACTICE COMPLETE</span>
        <h2>You practised three important decisions.</h2>
        <p>You worked through payment-change fraud, unexpected sign-in requests, and fake support warnings. Keep the trusted contact routes for your team easy to find.</p>
        <ul>{scenarios.map((item) => <li key={item.id}><ShieldCheck size={16} /><span>{item.title}</span></li>)}</ul>
        <button className="rehearsal-primary" type="button" onClick={startPractice}><RotateCcw size={16} />Practise again</button>
      </section>}

      <div className="rehearsal-privacy"><LockKeyhole size={14} /><span>This is a simulation. Nothing is sent, no account is accessed, and no real email is used.</span></div>
    </main>
  );
}
