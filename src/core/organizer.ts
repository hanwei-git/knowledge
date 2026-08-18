import { annotateCommand, extractComments, extractToolTags, splitCommandUnits, type ExtractedComments } from "./commandRules.js";

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
  const extracted = extractComments(input.body.trim());
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

function inferTitle(body: string): string {
  const line = body.split("\n").find(Boolean);
  if (!line) {
    return "Untitled command";
  }
  return line.length > 72 ? `${line.slice(0, 69).trimEnd()}...` : line;
}

function inferTags(body: string, annotation: string, existingTags: string[]): string[] {
  const toolTags = extractToolTags(body);
  const inlineTags = [...annotation.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((match) => match[1]);
  const haystack = `${body}\n${annotation}`.toLowerCase();
  const reusedTags = existingTags.filter((tag) => tag && haystack.includes(tag.toLowerCase()));
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
