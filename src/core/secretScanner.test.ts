import assert from "node:assert/strict";
import test from "node:test";
import { findSecrets, redactSecrets } from "./secretScanner.js";

test("detects a private key block", () => {
  const findings = findSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----");
  assert.ok(findings.includes("Private key block"));
});

test("detects an AWS access key", () => {
  assert.ok(findSecrets("aws configure set aws_access_key_id AKIAABCDEFGHIJKLMNOP").includes("AWS access key ID"));
});

test("detects a GitHub token", () => {
  assert.ok(findSecrets('curl -H "Authorization: token ghp_1234567890abcdefghijklmnopqrstuvwxyz"').includes("GitHub token"));
});

test("detects credentials embedded in a connection URL", () => {
  assert.ok(findSecrets("psql postgres://admin:sup3rSecret@db.example.com/prod").includes("Username or credentials embedded in a URL"));
});

test("detects a bare username embedded in a URL with no password", () => {
  assert.ok(findSecrets("git remote set-url origin http://deploy_bot@10.20.30.40/org/repo.git").includes("Username or credentials embedded in a URL"));
});

test("detects an internal/private IP address", () => {
  assert.ok(findSecrets("curl http://172.16.5.1/health").includes("Internal/private IP address"));
  assert.ok(findSecrets("ssh admin@10.0.0.5").includes("Internal/private IP address"));
  assert.ok(findSecrets("mysql -h 192.168.1.20").includes("Internal/private IP address"));
  assert.deepEqual(findSecrets("curl http://8.8.8.8"), []);
  assert.deepEqual(findSecrets("curl http://172.32.5.103"), []);
});

test("flags a git remote URL containing a username, internal IP, and internal path all at once", () => {
  const findings = findSecrets("git remote set-url origin http://deploy_bot@10.20.30.40/internal-tools/backend/service.git");
  assert.ok(findings.includes("Username or credentials embedded in a URL"));
  assert.ok(findings.includes("Internal/private IP address"));
});

test("detects a database CLI inline password", () => {
  assert.ok(findSecrets("mysql -u root -pMySecretPass123 -e 'SHOW DATABASES;'").includes("Database CLI inline password"));
});

test("detects an inline password assignment, including compound env var names", () => {
  assert.ok(findSecrets("export DB_PASSWORD=hunter2").includes("Inline password/secret assignment"));
  assert.ok(findSecrets("api_key: abc123").includes("Inline password/secret assignment"));
});

test("detects a JWT", () => {
  assert.ok(findSecrets("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U").includes("JSON Web Token"));
});

test("returns no findings for ordinary commands", () => {
  assert.deepEqual(findSecrets("git status"), []);
  assert.deepEqual(findSecrets("docker run -p 8080:80 nginx"), []);
  assert.deepEqual(findSecrets("kubectl get secrets"), []);
});

test("redactSecrets masks a database CLI inline password but keeps the rest of the command", () => {
  const redacted = redactSecrets("mysql -u root -pMySecretPass123 -e 'SHOW DATABASES;'");
  assert.equal(redacted, "mysql -u root -p[REDACTED] -e 'SHOW DATABASES;'");
  assert.ok(!redacted.includes("MySecretPass123"));
});

test("redactSecrets masks only the value of an inline password assignment, keeping the key name", () => {
  assert.equal(redactSecrets("export DB_PASSWORD=hunter2"), "export DB_PASSWORD=[REDACTED]");
});

test("redactSecrets removes the username/password from a URL entirely, keeping the scheme, host, and path", () => {
  const redacted = redactSecrets("git remote set-url origin http://deploy_bot@10.20.30.40/org/repo.git");
  assert.equal(redacted, "git remote set-url origin http://[REDACTED_IP]/org/repo.git");
  assert.deepEqual(findSecrets(redacted), []);
});

test("redactSecrets masks an entire private key block", () => {
  const redacted = redactSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\nmore key data\n-----END RSA PRIVATE KEY-----");
  assert.equal(redacted, "[REDACTED PRIVATE KEY]");
});

test("redactSecrets masks a bare API key with a generic placeholder", () => {
  assert.equal(redactSecrets("AKIAABCDEFGHIJKLMNOP"), "[REDACTED]");
});

test("redactSecrets leaves ordinary commands completely unchanged", () => {
  assert.equal(redactSecrets("git status"), "git status");
  assert.equal(redactSecrets("docker run -p 8080:80 nginx"), "docker run -p 8080:80 nginx");
});

test("redactSecrets applied to a URL with a username, internal IP, and internal path clears every finding but keeps the path", () => {
  const original = "git remote set-url origin http://deploy_bot@10.20.30.40/internal-tools/backend/service.git";
  const redacted = redactSecrets(original);
  assert.deepEqual(findSecrets(redacted), []);
  assert.ok(redacted.includes("internal-tools/backend/service.git"));
});
