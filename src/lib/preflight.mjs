const explicitUrlPattern = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const bareDomainPattern = /(?:^|[\s(<])([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[^\s<>"'`]*)?)/gi;
const shortenerHosts = new Set([
  'bit.ly', 'buff.ly', 'cutt.ly', 'goo.gl', 'is.gd', 'ow.ly', 'rb.gy',
  'shorturl.at', 't.co', 'tinyurl.com', 'trib.al', 'tiny.cc',
]);

function trimUrl(value) {
  return value.replace(/[.,!?;:)\]}]+$/g, '');
}

function parseUrl(value) {
  const candidate = trimUrl(value);
  const withScheme = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const parsed = new URL(withScheme);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return { parsed, raw: candidate, host: parsed.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

function extractLinks(text) {
  const matches = new Set();
  for (const match of text.matchAll(explicitUrlPattern)) matches.add(trimUrl(match[0]));
  for (const match of text.matchAll(bareDomainPattern)) {
    const candidate = trimUrl(match[1]);
    if (!candidate.includes('@')) matches.add(candidate);
  }

  const links = [];
  for (const raw of matches) {
    const link = parseUrl(raw);
    if (link) links.push(link);
    if (links.length >= 20) break;
  }
  return links;
}

function hostsRelated(left, right) {
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function getVisibleHost(label) {
  const link = extractLinks(label)[0];
  return link?.host || '';
}

function findLinkMismatches(text) {
  const mismatches = [];
  const patterns = [
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi,
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis,
  ];
  for (const [index, pattern] of patterns.entries()) {
    for (const match of text.matchAll(pattern)) {
      const label = index === 0 ? match[1] : match[2].replace(/<[^>]*>/g, ' ');
      const href = index === 0 ? match[2] : match[1];
      const target = parseUrl(href);
      const displayedHost = getVisibleHost(label);
      if (target && displayedHost && !hostsRelated(displayedHost, target.host)) {
        mismatches.push({ displayedHost, targetHost: target.host });
      }
    }
  }
  return mismatches;
}

export function analyzeTextLocally(value) {
  const text = typeof value === 'string' ? value.slice(0, 8000) : '';
  const links = extractLinks(text);
  const findings = [];
  const addFinding = (id, severity, title, detail) => {
    if (!findings.some((finding) => finding.id === id && finding.detail === detail)) {
      findings.push({ id, severity, title, detail });
    }
  };

  if (/\b(?:javascript|data|file):/i.test(text)) {
    addFinding('unsafe-scheme', 'high', 'Unusual link type', 'The text contains a link using a browser or local-file scheme instead of a normal web address.');
  }

  for (const link of links) {
    if (link.parsed.username || link.parsed.password) {
      addFinding('link-credentials', 'high', 'Link contains hidden sign-in details', `The address for ${link.host} includes text before the host that can disguise the real destination.`);
    }
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(link.host) || /^\[.*\]$/.test(link.host)) {
      addFinding('ip-address', 'high', 'Link uses a numeric address', `The link points to ${link.host} instead of a recognizable website name.`);
    }
    if (link.host.startsWith('xn--') || link.host.split('.').some((part) => part.startsWith('xn--'))) {
      addFinding('lookalike-domain', 'caution', 'Link uses an encoded domain name', `The domain ${link.host} contains an encoded label that can make look-alike names harder to spot.`);
    }
    if (shortenerHosts.has(link.host) || [...shortenerHosts].some((host) => link.host.endsWith(`.${host}`))) {
      addFinding('shortened-link', 'caution', 'Link destination is shortened', `The address ${link.host} hides the final destination until it is opened.`);
    }
    if (link.parsed.protocol === 'http:') {
      addFinding('unencrypted-link', 'info', 'Link does not use HTTPS', `The connection to ${link.host} may not be encrypted. This alone does not mean the link is malicious.`);
    }
  }

  for (const mismatch of findLinkMismatches(text)) {
    addFinding('link-mismatch', 'high', 'Displayed link and destination do not match', `The text shows ${mismatch.displayedHost}, but the link points to ${mismatch.targetHost}.`);
  }

  const credentialRequest = /\b(?:enter|share|send|reply with|provide|confirm|verify|update|reset)\b.{0,70}\b(?:password|passcode|one[-\s]?time code|verification code|MFA code|2FA code|authenticator code|sign[- ]?in code)\b|\b(?:password|passcode|one[-\s]?time code|verification code|MFA code|2FA code|authenticator code|sign[- ]?in code)\b.{0,70}\b(?:enter|share|send|reply|provide|confirm|verify)\b/i;
  const explicitlyWarning = /\b(?:never|do not|don't|avoid)\b.{0,65}\b(?:password|passcode|one[-\s]?time code|verification code|MFA|2FA)\b/i;
  if (credentialRequest.test(text) && !explicitlyWarning.test(text)) {
    addFinding('credential-request', 'high', 'Message asks for a password or sign-in code', 'Unexpected requests for passwords, one-time codes, or authentication codes are a serious warning sign.');
  }

  const paymentRequest = /\b(?:send|pay|transfer|wire|purchase|buy|pay with|provide)\b.{0,70}\b(?:gift cards?|wire transfer|cryptocurrency|bitcoin|payment|bank details|account number|refund fee)\b|\b(?:gift cards?|wire transfer|cryptocurrency|bitcoin|payment|bank details|account number|refund fee)\b.{0,70}\b(?:send|pay|transfer|wire|purchase|buy|provide)\b/i;
  if (paymentRequest.test(text)) {
    addFinding('payment-request', 'high', 'Message asks for money or payment details', 'Verify payment requests using a contact method you already trust, especially if the request is unexpected.');
  }

  const riskyAttachment = /\b[\w.-]+\.(?:exe|scr|bat|cmd|js|jse|vbs|vbe|ps1|msi|iso|lnk)\b/i.exec(text);
  if (riskyAttachment) {
    addFinding('risky-attachment', 'high', 'Message mentions an executable attachment', `The text mentions ${riskyAttachment[0]}, a file type that can run code on your device.`);
  }

  if (/\b(?:act now|immediately|within\s+\d+\s+(?:minutes?|hours?)|final warning|account (?:will be|is being) (?:closed|suspended|locked)|urgent action required|expires today)\b/i.test(text)) {
    addFinding('pressure-language', 'caution', 'Message creates urgency or pressure', 'Urgency can be used to push people into clicking before they verify a request.');
  }

  const riskLevel = findings.some((finding) => finding.severity === 'high')
    ? 'high'
    : findings.some((finding) => finding.severity === 'caution') ? 'caution' : 'none';
  const nextStep = riskLevel === 'high'
    ? 'Do not open the link, reply, or download the attachment. Verify through the organization’s official website or a contact you already trust.'
    : riskLevel === 'caution'
      ? 'Pause and verify the sender or destination using a contact route you already trust before responding.'
      : 'These quick checks found no obvious warning signs. If the message was unexpected, verify it separately before sharing information.';

  return {
    riskLevel,
    summary: riskLevel === 'high'
      ? 'Several strong warning signs need your attention.'
      : riskLevel === 'caution'
        ? 'Some details deserve a closer look before you respond.'
        : 'No obvious warning signs were found by these quick checks.',
    nextStep,
    findings,
    links: links.map(({ raw, host }) => ({ raw, host })),
  };
}

export function redactLinksForAI(text, links) {
  let redacted = String(text || '').slice(0, 8000);
  for (const link of links || []) {
    if (link.raw) redacted = redacted.split(link.raw).join(`[link to ${link.host}; path and query removed]`);
  }
  return redacted;
}
