import { annotateCommand, extractComments, extractToolTags, skipLeadingComments, splitCommandUnits, type ExtractedComments } from "./commandRules.js";

export interface OrganizeDraftInput {
  body: string;
  tags: string[];
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
  if (splitCommandUnits(raw).length > 1) {
    return buildCombinedDraft(raw, input.tags);
  }
  const extracted = extractComments(raw);
  return buildDraft(extracted, input.tags);
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
  return units.map((unit) => buildDraft(unit, input.tags));
}

function buildDraft(extracted: ExtractedComments, existingTags: string[]): OrganizedDraft {
  const { body } = extracted;
  const annotation = extracted.annotation || annotateCommand(body);

  return {
    title: inferTitle(body),
    body,
    annotation,
    tags: inferTags(body, annotation, existingTags)
  };
}

function buildCombinedDraft(raw: string, existingTags: string[]): OrganizedDraft {
  // Body is kept exactly as pasted — no comment, including the one before
  // the first command, is ever stripped out here. The annotation is a
  // non-destructive summary of whatever comments exist (or the curated
  // guess if there are none), never a "this one is special" extraction.
  const annotation = extractComments(raw).annotation || annotateCommand(raw);

  return {
    title: inferTitle(skipLeadingComments(raw)),
    body: raw,
    annotation,
    tags: inferTags(raw, annotation, existingTags)
  };
}

function inferTitle(body: string): string {
  const line = body.split("\n").find(Boolean);
  if (!line) {
    return "Untitled command";
  }
  return line.length > 72 ? `${line.slice(0, 69).trimEnd()}...` : line;
}

function inferTags(body: string, annotation: string, existingTags: string[]): string[] {
  const toolTags = extractToolTags(body);
  const haystack = `${body}\n${annotation}`;
  const inlineTags = [...haystack.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((match) => match[1]);
  const reusedTags = existingTags.filter((tag) => tag && haystack.toLowerCase().includes(tag.toLowerCase()));
  return unique([...toolTags, ...inlineTags, ...reusedTags]).slice(0, 6);
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
