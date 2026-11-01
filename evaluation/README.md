# Companion accuracy checks

This folder contains realistic, locally rendered mock screens for checking whether prompt or model changes improve Screenwise without using personal or organization screenshots. The text and layout are hand-authored in `fixture-ui.html`; they are not AI-generated pictures, so wording, domains, and visible clues stay exact and repeatable.

## What the cases cover

- A normal business dashboard where the assistant should not invent a threat.
- A payroll email with a subtle one-letter sender-domain mismatch.
- A routine payroll email as a harmless lookalike control.
- A clear browser certificate warning.
- A normal security status page that says protection is up to date.
- A cropped message where the sender and full context are missing.
- A supplier email requesting changed payment details.
- An unexpected sign-in approval request.
- A document page asking for an installer from an unlisted publisher.
- An Office-style macro warning on an invoice attachment.
- A file-sharing permission prompt asking for access to all files.
- A question asked with no current screenshot.

The expected confidence describes how readable and complete the available visual evidence is. It is not a rating of threat severity. The separate expected security status checks visible warning signs; “no obvious warning” is not proof that content is safe.

The scenes use familiar browser and app layouts with restrained visual cues. They intentionally include ordinary and incomplete examples so the evaluation checks false alarms and uncertainty as well as threat recognition. Fixture links use the reserved `.test` domain, and all displayed buttons are inactive.

## Generate the mock screenshots

On Windows PowerShell, from the project directory:

```powershell
powershell -ExecutionPolicy Bypass -File .\evaluation\generate-fixtures.ps1
```

This opens the local fixture page in headless Microsoft Edge and captures the rendered screens as PNG files. It makes no internet requests and requires no API key or package install. Microsoft Edge must be installed.

## Run one or all cases

Start the local API with `npm run dev` in one terminal. In another, list the cases:

```powershell
npm run eval:companion -- --list
```

The runner makes no provider calls unless you explicitly add `--confirm-provider-calls`. Calls send only these mock images to the local API and then to your configured AI provider; they can use the provider's quota.

```powershell
npm run eval:companion -- --case ordinary-retail-dashboard --confirm-provider-calls
npm run eval:companion -- --confirm-provider-calls
```

The runner prints the answer and checks visible evidence, safe next-step concepts, reading confidence, security status, unsupported safety guarantees, and obvious false alarms. It does not save responses or screenshots. Keyword checks can miss a good paraphrase or accept a misleading sentence, so review the answer itself before changing the live prompt or model. Do not use one passing run as proof of accuracy.

## Safe improvement loop

1. Keep the current prompt/model as the baseline.
2. Run the same synthetic cases before and after a proposed change.
3. Compare failed checks and read the full responses. Never reward confidence or verbosity by itself.
4. Change one thing at a time and rerun the normal-screen and ambiguous-screen cases.
5. Keep the existing behavior if a change creates a false alarm, unsupported safety claim, or unsafe next step.

No real screenshots are included. Keep these fixtures synthetic or use explicitly sanitized examples; never commit private customer, patient, student, or staff information.
