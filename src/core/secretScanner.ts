const REDACTED = "[REDACTED]";

interface SecretRule {
  label: string;
  pattern: RegExp;
  /** Global-flagged regex used to mask matches; $1/$2 refer to its own groups. */
  redactPattern: RegExp;
  redactWith: string;
}

/**
 * Deliberately scoped to patterns that are actually detectable by regex:
 * keys, tokens, private key blocks, and password-shaped assignments/flags.
 * Real names and physical addresses have no reliable local pattern-based
 * signature and are NOT covered here — that would need an actual NER/AI
 * pass, which this project has consistently avoided in favor of local
 * rules (see commandRules.ts). This is advisory, not a hard filter: it
 * exists to prompt a second look before saving, not to guarantee nothing
 * sensitive ever gets through.
 *
 * Each rule carries both a detection pattern (non-global, used with
 * .test() in findSecrets) and a separate global redactPattern used only
 * by redactSecrets() to mask matches in place. They usually match the
 * same thing, but redactPattern sometimes captures a narrower group (e.g.
 * just the secret value after "password=", not the keyword too) so
 * redaction removes only the sensitive part, not surrounding context that
 * makes the saved command still useful/readable.
 */
const SECRET_RULES: SecretRule[] = [
  {
    label: "Private key block",
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
    redactPattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    redactWith: "[REDACTED PRIVATE KEY]"
  },
  {
    label: "AWS access key ID",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    redactPattern: /\bAKIA[0-9A-Z]{16}\b/g,
    redactWith: REDACTED
  },
  {
    label: "AWS secret access key",
    pattern: /aws_secret_access_key\s*[:=]\s*\S+/i,
    redactPattern: /(aws_secret_access_key\s*[:=]\s*)\S+/gi,
    redactWith: `$1${REDACTED}`
  },
  {
    label: "GitHub token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    redactPattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    redactWith: REDACTED
  },
  {
    label: "Google API key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
    redactPattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    redactWith: REDACTED
  },
  {
    label: "Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    redactPattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    redactWith: REDACTED
  },
  {
    label: "Stripe secret key",
    pattern: /\bsk_(live|test)_[A-Za-z0-9]{16,}\b/,
    redactPattern: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    redactWith: REDACTED
  },
  {
    label: "Generic API-style secret key",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/,
    redactPattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    redactWith: REDACTED
  },
  {
    label: "JSON Web Token",
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
    redactPattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    redactWith: REDACTED
  },
  {
    label: "Bearer token",
    pattern: /Authorization:\s*Bearer\s+\S+/i,
    redactPattern: /(Authorization:\s*Bearer\s+)\S+/gi,
    redactWith: `$1${REDACTED}`
  },
  // Username and/or password embedded in a URL — password is optional
  // (bare "scheme://username@host" leaks a real username just as much as // gitleaks:allow
  // "scheme://user:pass@host" does, e.g. an internal git remote URL). // gitleaks:allow
  {
    label: "Username or credentials embedded in a URL",
    pattern: /\b\w+:\/\/[^\s/:@]+(:[^\s/@]+)?@/,
    // Drop the whole "user[:pass]@" segment (not a [REDACTED] placeholder
    // in its place) — any non-empty placeholder text there still matches
    // this same "scheme://something@" shape, which would make the // gitleaks:allow
    // redacted result look like it still contains embedded credentials.
    redactPattern: /(\b\w+:\/\/)[^\s/@]+(?::[^\s/@]+)?@/g,
    redactWith: "$1"
  },
  {
    label: "Inline password/secret assignment",
    pattern: /(password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*\S+/i,
    redactPattern: /(password|passwd|secret|api[_-]?key|access[_-]?token)(\s*[:=]\s*)\S+/gi,
    redactWith: `$1$2${REDACTED}`
  },
  {
    label: "Database CLI inline password",
    pattern: /\b(mysql|psql|pg_dump|pg_restore|mongo|redis-cli)\b[^\n]*\s-p\S+/,
    redactPattern: /(\b(?:mysql|psql|pg_dump|pg_restore|mongo|redis-cli)\b[^\n]*\s-p)\S+/g,
    redactWith: `$1${REDACTED}`
  },
  // RFC1918 private ranges (10.x, 172.16-31.x, 192.168.x) plus loopback —
  // an internal IP in a saved command usually implies internal
  // infrastructure (hostnames, paths) alongside it, as in a git remote URL.
  {
    label: "Internal/private IP address",
    pattern: /\b(10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2}|127(?:\.\d{1,3}){3})\b/,
    redactPattern: /\b(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2}|127(?:\.\d{1,3}){3})\b/g,
    redactWith: "[REDACTED_IP]"
  }
];

export function findSecrets(text: string): string[] {
  const labels: string[] = [];
  for (const rule of SECRET_RULES) {
    if (rule.pattern.test(text)) {
      labels.push(rule.label);
    }
  }
  return labels;
}

/**
 * Masks every match of every rule found in `text`, replacing only the
 * sensitive portion (e.g. the value after "password=", not the keyword
 * itself) where a rule's redactPattern captures one, so the result is
 * still a readable, mostly-intact command rather than a wall of
 * placeholders.
 */
export function redactSecrets(text: string): string {
  let result = text;
  for (const rule of SECRET_RULES) {
    result = result.replace(rule.redactPattern, rule.redactWith);
  }
  return result;
}
