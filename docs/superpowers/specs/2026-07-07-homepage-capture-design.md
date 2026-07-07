# Homepage Capture Design

## Context

The current home page works like a small dashboard: quick capture, recent updates, projects, and inbox all compete for attention. For a personal engineering knowledge base, the primary daily action should be faster: open the app, type or paste rough material, and let the system suggest a reasonable structure.

The chosen direction is a focused capture workspace. It keeps the experience close to an intelligent organizer while the first implementation remains local and deterministic.

## Goals

- Make the home page input-first.
- Let the user paste logs, notes, links, decisions, command output, or rough thoughts without choosing metadata first.
- Provide lightweight organization suggestions without making the page feel like a form.
- Save to the existing Markdown/frontmatter storage model.
- Implement the first organizer with local rules, while keeping a clear replacement point for a future AI organizer.

## Non-Goals

- Do not add AI calls in this first pass.
- Do not change the Markdown data format.
- Do not add remote sync, multi-user collaboration, branching, or push flows.
- Do not redesign the full app navigation beyond the home page workflow.

## Home Page Layout

The home page becomes a single focused capture workspace.

The primary visual element is a large text area. It should occupy most of the first screen and be ready for immediate typing. The page should not ask the user to pick project, type, tags, status, or source before entering content.

Below the input is a compact action and suggestion row:

- `Organize and save`: runs the local organizer, applies the current suggestion, and saves.
- `Save to inbox`: stores the content as a draft inbox note with minimal metadata.
- `Suggested`: a quiet status line with compact chips for project, type, and tags.
- `Review details`: opens the full metadata editor only when the user wants to inspect or override the suggestion.

The suggestion area should behave like autocomplete feedback, not a side panel. It should not use a large right rail or large stacked cards. On narrow screens it remains a one-line or wrapped chip row below the input.

## Organizer Behavior

The first organizer is rule-based and local.

Inputs:

- Raw body text.
- Existing project list from the current summary.
- Existing tags from the current summary.

Outputs:

- `title`
- `type`
- `project`
- `tags`
- `status`
- `source`
- `body`
- confidence or reason text for display when useful

Project inference:

- Match existing project slug or title found in the input.
- Prefer exact slug/title matches over loose keyword matches.
- If no project is found, leave project empty and treat the entry as an inbox draft.

Type inference:

- Troubleshooting: error, exception, failed, failure, timeout, root cause, fix, resolved, symptom, cause, verification.
- Decision: decision, decide, option, trade-off, chosen, alternative, consequence.
- Runbook: steps, procedure, rollback, checklist, verify, command sequence.
- Reference: URL-heavy input, article notes, docs, source summary.
- Note: fallback.

Tag inference:

- Preserve inline tags such as `#redis`.
- Extract useful technical terms from a small local keyword list.
- Reuse existing tags where the input contains matching words.
- Keep tags unique, lowercase when appropriate, and limited to a small set.

Title inference:

- Use the first meaningful short line.
- Strip Markdown heading markers and extra whitespace.
- If the first line is too long, truncate to a readable title.
- If no useful line exists, use `Untitled note`.

Save behavior:

- If the organizer finds a project, save as a structured project entry with status `active`.
- If it does not find a project, save to inbox with status `draft`.
- User changes in `Review details` always override organizer suggestions.

## Architecture

Add a local organizer module in the core layer:

```text
src/core/organizer.ts
src/core/organizer.test.ts
```

The organizer should be pure and easy to test. It should not read or write files directly.

Suggested API shape:

```ts
interface OrganizeDraftInput {
  body: string;
  projects: ProjectWiki[];
  tags: string[];
}

interface OrganizedDraft {
  title: string;
  type: EntryType;
  project: string;
  tags: string[];
  status: EntryStatus;
  source: string;
  body: string;
  saveTarget: "project" | "inbox";
}
```

Expose the organizer through `POST /api/organize`. Keep the rules in the core module and call them from the server. This keeps future AI credentials and model calls out of the browser while preserving the same response shape for the UI.

The UI should keep the organizer as a replaceable dependency. A future AI-backed implementation should be able to return the same `OrganizedDraft` shape.

## UI Flow

1. User opens Workbench.
2. Cursor is ready in the large capture input.
3. User pastes or types rough content.
4. User clicks `Organize and save`.
5. The server runs the organizer and returns the suggested metadata.
6. The app saves to a project entry when project is known, otherwise to inbox.
7. The input clears and the summary refreshes.
8. A concise notice confirms where the note was saved.

`Review details` opens an inline expandable editor with title, project, type, tags, status, and source. Closing it returns the page to the focused input view.

## Error Handling

- Empty or whitespace-only input: show a clear inline message and do not save.
- Organizer cannot infer project: save to inbox and show that the item needs project review.
- Save failure: preserve the input text and show the error.
- Git status failures remain isolated to the Git view and should not block capture.

## Testing

Core tests:

- infers project from existing project title and slug.
- infers troubleshooting, decision, runbook, reference, and note fallbacks.
- extracts inline tags and reuses existing tags.
- generates a title from a Markdown heading or first meaningful line.
- returns inbox target when no project is matched.

UI/manual verification:

- Home page opens with the capture input as the dominant element.
- Suggestions remain visually small.
- `Save to inbox` works without project metadata.
- `Organize and save` saves to project when project inference succeeds.
- `Review details` overrides organizer output.

## Implementation Notes

Use WSL for project commands:

```bash
cd /home/hanwei/project/self/knowledge
npm test
npm run build
```

The repository currently may need `npm install` before tests and build can run.
