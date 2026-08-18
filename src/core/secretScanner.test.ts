import assert from "node:assert/strict";
import test from "node:test";
import { findSecrets } from "./secretScanner.js";

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
  assert.ok(findSecrets("psql postgres://admin:sup3rSecret@db.example.com/prod").includes("Credentials embedded in a URL"));
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
