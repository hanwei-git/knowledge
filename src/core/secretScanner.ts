interface SecretRule {
  label: string;
  pattern: RegExp;
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
 */
const SECRET_RULES: SecretRule[] = [
  { label: "Private key block", pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { label: "AWS access key ID", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "AWS secret access key", pattern: /aws_secret_access_key\s*[:=]\s*\S+/i },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { label: "Stripe secret key", pattern: /\bsk_(live|test)_[A-Za-z0-9]{16,}\b/ },
  { label: "Generic API-style secret key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { label: "JSON Web Token", pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
  { label: "Bearer token", pattern: /Authorization:\s*Bearer\s+\S+/i },
  { label: "Credentials embedded in a URL", pattern: /\b\w+:\/\/[^\s/:@]+:[^\s/@]+@/ },
  { label: "Inline password/secret assignment", pattern: /(password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*\S+/i },
  { label: "Database CLI inline password", pattern: /\b(mysql|psql|pg_dump|pg_restore|mongo|redis-cli)\b[^\n]*\s-p\S+/ }
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
