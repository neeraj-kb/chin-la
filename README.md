# Screenwise Companion

A Windows desktop companion for nontechnical staff. It can watch a user-selected screen or window, explain relevant security issues in plain language, remember the current step, and answer follow-up questions.

## Run on Windows

1. Install Node.js 22.12 or newer.
2. In this folder, run `npm install`.
3. Run `npm run setup:electron` to download Electron’s official Windows runtime.
4. Copy `.env.example` to `.env` and add a **newly rotated** Groq key. Gemini is optional.
5. Run `npm run dev`.

This starts the Electron app, the Vite UI, and a local API proxy bound to `127.0.0.1`. The Electron window stays on top. Press **Start**, choose one screen or app window, and the capture indicator will show when monitoring is active. **Pause** stops capture; **Stop** ends the session.

The app sends a frame to the local proxy for analysis when monitoring starts, when a meaningful visual change is detected, or when the user asks a question while monitoring. The proxy tries Gemini for image analysis first and falls back to Groq vision if Gemini is unavailable; Groq also handles the chat and step explanations. Neither the app nor the proxy writes screen frames to disk or logs request bodies. Chat and compact session progress are saved in local browser storage and can be cleared from the app.

Frames are sent to the configured AI providers for processing. Review the providers’ current data handling terms before using the app with sensitive information. The companion never clicks or changes anything on the user’s behalf.

## Configure provider keys

Create a local `.env` file (excluded from Git) with a Groq key for chat and screen analysis. Add a Gemini key only if you want Gemini tried first for image analysis:

```env
GROQ_API_KEY=your-new-groq-key
# Optional: tried first for image analysis; Groq vision is the fallback.
GEMINI_API_KEY=your-new-gemini-key
```

Optional model overrides:

```env
GEMINI_MODEL=gemini-3.8-flash
GROQ_MODEL=qwen/qwen3.6-27b
```

Groq is required for chat and can analyze images when Gemini is not configured. The API keys are used only by the Node API process, never by the renderer. The local proxy listens on loopback by default. Do not expose it to a public network. For remote use, deploy the proxy behind authentication and TLS, then build the renderer with `VITE_COMPANION_API_URL` set to that service.

## Checks

```powershell
npm test
npm run typecheck
npm run build
```

The current build creates the UI bundle. Packaging and deployment of a remote authenticated proxy are not configured yet.
