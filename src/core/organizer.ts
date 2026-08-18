import { annotateCommand, commandSignature, extractComments, extractSeparatedOverview, extractToolTags, skipLeadingComments, splitCommandUnits, type ExtractedComments } from "./commandRules.js";
import type { Entry } from "./types.js";

export interface OrganizeDraftInput {
  body: string;
  tags: string[];
  entries?: Entry[];
}

export interface OrganizedDraft {
  title: string;
  body: string;
  annotation: string;
  tags: string[];
}

const TAG_PATTERN = /^[a-z0-9][a-z0-9._-]{0,23}$/;

export function organizeDraft(input: OrganizeDraftInput): OrganizedDraft {
  const raw = input.body.trim();
  // A body with more than one actual command line, being kept as a single
  // combined entry, keeps every comment inline (including the one before
  // the first command — it's that command's own comment, not a block-level
  // summary just because it's first) instead of stripping comments out —
  // that's only appropriate when the body ends up as one runnable command.
  const entries = input.entries ?? [];
  if (splitCommandUnits(raw).length > 1) {
    return buildCombinedDraft(raw, input.tags, entries);
  }
  const extracted = extractComments(raw);
  return buildDraft(extracted, input.tags, entries);
}

/**
 * Like organizeDraft, but when `split` is true and the pasted body contains
 * more than one command line, returns one OrganizedDraft per command
 * (see splitCommandUnits) instead of combining everything into one. Falls
 * back to the single-draft behavior when `split` is false or only one
 * command is present.
 */
export function organizeDrafts(input: OrganizeDraftInput & { split: boolean }): OrganizedDraft[] {
  if (!input.split) {
    return [organizeDraft(input)];
  }
  const units = splitCommandUnits(input.body.trim());
  if (units.length <= 1) {
    return [organizeDraft(input)];
  }
  const entries = input.entries ?? [];
  return units.map((unit) => buildDraft(unit, input.tags, entries));
}

function buildDraft(extracted: ExtractedComments, existingTags: string[], entries: Entry[]): OrganizedDraft {
  const { body } = extracted;
  const annotation = extracted.annotation || annotateCommand(body);

  return {
    title: inferTitle(body),
    body,
    annotation,
    tags: inferTags(body, annotation, existingTags, entries)
  };
}

function buildCombinedDraft(raw: string, existingTags: string[], entries: Entry[]): OrganizedDraft {
  // A leading comment block only counts as a genuine, block-level overview
  // — extracted out of the body — when it's separated from the first
  // command by a blank line (see extractSeparatedOverview). Without that
  // separator it's indistinguishable from an ordinary per-command comment,
  // so it stays inline like every other one.
  const { body, overview } = extractSeparatedOverview(raw);
  const annotation = overview || extractComments(body).annotation || annotateCommand(body);

  return {
    title: inferTitle(skipLeadingComments(body)),
    body,
    annotation,
    tags: inferTags(body, annotation, existingTags, entries)
  };
}

export function inferTitle(body: string): string {
  const line = body.split("\n").find(Boolean);
  if (!line) {
    return "Untitled command";
  }
  return line.length > 72 ? `${line.slice(0, 69).trimEnd()}...` : line;
}

function inferTags(body: string, annotation: string, existingTags: string[], entries: Entry[]): string[] {
  const toolTags = extractToolTags(body);
  const haystack = `${body}\n${annotation}`;
  const inlineTags = [...haystack.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((match) => match[1]);
  const reusedTags = existingTags.filter((tag) => tag && haystack.toLowerCase().includes(tag.toLowerCase()));
  const similarTags = findSimilarTags(body, entries);
  return unique([...toolTags, ...inlineTags, ...reusedTags, ...similarTags]).slice(0, 6);
}

/**
 * Carries tags forward from previously-saved commands that share the same
 * signature (same tool + same flags, see commandSignature) as the new
 * command — e.g. a manually-tagged "kubectl rollout restart
 * deployment/api" lends its tags to a later "kubectl rollout restart
 * deployment/web" even though the resource name differs.
 */
function findSimilarTags(body: string, entries: Entry[]): string[] {
  const signature = commandSignature(body);
  if (!signature) {
    return [];
  }
  const tags: string[] = [];
  for (const entry of entries) {
    if (commandSignature(entry.body) === signature) {
      tags.push(...entry.tags);
    }
  }
  return tags;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = value.trim().toLowerCase();
    if (clean && TAG_PATTERN.test(clean) && !seen.has(clean)) {
      seen.add(clean);
      result.push(clean);
    }
  }
  return result;
}
