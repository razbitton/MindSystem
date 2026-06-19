**Source visual truth path**
- `C:\Users\hp\AppData\Local\Temp\codex-clipboard-5509af91-145c-478e-98be-a1eff02a0937.png`
- `C:\Users\hp\.codex\attachments\61cff1a4-3b17-4997-af3c-c0ad38752c5f\pasted-text.txt`

**Implementation screenshot paths**
- `C:\Users\hp\source\repos\MindSystem\.codex-screenshots\tasks-desktop-table-rtl.png`
- `C:\Users\hp\source\repos\MindSystem\.codex-screenshots\tasks-mobile-cards-preserved.png`

**Viewport**
- Desktop: 1440 x 900, dark theme, Hebrew RTL.
- Mobile: 360 x 800, dark theme, Hebrew RTL.

**State**
- Authenticated local dev session with existing local tasks. No task data was created or deleted during this QA pass.

**Checks**
- TypeScript: `pnpm --filter @personal-context-os/web lint` passed.
- Visual smoke test: in-app browser loaded `http://localhost:3004/tasks`, authenticated locally, captured desktop and mobile screenshots, and reset the temporary viewport override.
- Automated desktop metrics: Hebrew RTL, one visible table, four visible rows including the header, zero visible task-card `article` elements.
- Automated desktop width metrics after removing the local page max-width: content root 1168px, task table 1128px in a 1440px viewport.
- Automated mobile metrics: Hebrew RTL, three visible task-card `article` elements, zero visible tables and zero visible rows.

**Patches Made**
- Kept the site shell and other pages untouched.
- Moved the desktop New Task action, filter button, and search input into the same top row as the Tasks title, matching the reference placement.
- Kept the New Task action on the same `Button size="sm"` style as the New Project action.
- Added a desktop-only task table/list surface with columns for actions, status, due date, project, and task details.
- Preserved the current mobile task-card layout and mobile search/filter controls below the `md` breakpoint.
- Extracted the filters into a shared `TaskFilterPanel` so desktop and mobile controls use the same state and behavior.
- Removed the Tasks page-only `max-w-6xl` wrapper so the page uses the same available content width as the other app pages.

**Findings**
- No P0/P1/P2 findings remain.
- [P3] The app shell still provides the existing MindSystem mobile topbar and bottom/user chrome; those were intentionally not changed because the request was scoped to the Tasks page content.

**final result: passed**
