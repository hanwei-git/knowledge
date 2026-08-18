#!/usr/bin/env bash
# Hard-blocks commits containing secrets/URLs/IPs/denylisted names in the
# staged diff. Mirrors .github/workflows/secret-scan.yml, which is the real
# backstop (this hook can be skipped with --no-verify; CI can't).
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
config="$repo_root/.gitleaks.toml"

if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --source "$repo_root" --config "$config" --redact --verbose
  exit $?
fi

if command -v docker >/dev/null 2>&1; then
  docker run --rm -v "$repo_root:/repo" -w /repo zricethezav/gitleaks:latest \
    protect --staged --source /repo --config /repo/.gitleaks.toml --redact --verbose
  exit $?
fi

echo "error: pre-commit secret scan requires 'gitleaks' or 'docker' on PATH, found neither." >&2
echo "Install gitleaks: https://github.com/gitleaks/gitleaks#installing" >&2
echo "(or install Docker; the hook will use it automatically)" >&2
exit 1
