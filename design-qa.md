**Source visual truth path**
- `C:\Users\hp\AppData\Local\Temp\codex-clipboard-5509af91-145c-478e-98be-a1eff02a0937.png`
- `C:\Users\hp\AppData\Local\Temp\codex-clipboard-5b9623e8-7834-4db0-8e05-a94837c2b02b.png`
- `C:\Users\hp\.codex\attachments\61cff1a4-3b17-4997-af3c-c0ad38752c5f\pasted-text.txt`

**Implementation screenshot paths**
- `C:\Users\hp\source\repos\MindSystem\.codex-screenshots\tasks-desktop-table-rtl.png`
- `C:\Users\hp\source\repos\MindSystem\.codex-screenshots\tasks-desktop-search-standard.png`
- `C:\Users\hp\source\repos\MindSystem\.codex-screenshots\tasks-mobile-cards-preserved.png`
- `C:\Users\hp\source\repos\MindSystem\.codex-screenshots\projects-desktop-search-standard.png`
- `C:\Users\hp\source\repos\MindSystem\.codex-screenshots\projects-mobile-header-preserved.png`
- `C:\Users\hp\source\repos\MindSystem\.codex-screenshots\notes-desktop-search-filter-swapped.png`
- `C:\Users\hp\source\repos\MindSystem\.codex-screenshots\notes-mobile-search-filter-swapped.png`

**Viewport**
- Desktop: 1440 x 900, dark theme, Hebrew RTL.
- Mobile: 360 x 800, dark theme, Hebrew RTL.

**State**
- Authenticated local dev session with existing local data. No task, project, or note data was created or deleted during this QA pass.

**Checks**
- TypeScript: `pnpm --filter @personal-context-os/web lint` passed.
- Visual smoke test: in-app browser loaded `http://localhost:3004/tasks`, authenticated locally, captured desktop and mobile screenshots, and reset the temporary viewport override.
- Automated desktop metrics: Hebrew RTL, one visible table, four visible rows including the header, zero visible task-card `article` elements.
- Automated desktop width metrics after removing the local page max-width: content root 1168px, task table 1128px in a 1440px viewport.
- Automated mobile metrics: Hebrew RTL, three visible task-card `article` elements, zero visible tables and zero visible rows.
- Projects header metrics: desktop has one visible header with `פרויקט חדש` and one project search input; mobile keeps the existing PageHeader and mobile search row.
- Notes header metrics: desktop and mobile each have one notes search input with the project selector in the same search surface; the new-note composer remains below the header/search area.
- Notes view metrics: list/card segmented control is removed, `List`/`Cards` labels are absent, and notes render as cards only on desktop and mobile.
- Notes search/filter metrics: the shared outer search/filter wrapper is transparent with `0px` border; the search input and project select keep their own individual surfaces.
- Notes project filter position: desktop and mobile both place the project selector on the opposite side of the notes search row, with the selector left of the search input in the visible LTR control row.
- Page title metrics: Tasks, Projects, and Notes desktop titles all use the PageHeader-equivalent title class, rendering at `24px`, font weight `600`, and `32px` line height in the 1440px desktop viewport.
- Desktop search field parity: Tasks, Projects, and Notes header search inputs all measure `288 x 36px`, use `14px` text, `12px` radius, `1px` border, `40px` left padding, `12px` right padding, `18px` search icon, and the same `bg-secondary/70` / `focus-visible:ring-1` styling.
- Notes mobile search check: the notes search input keeps the same `36px` height, `14px` text, `12px` radius, `1px` border, and `bg-secondary/70` styling while sharing the row with the project selector.

**Patches Made**
- Kept the site shell and other pages untouched.
- Moved the desktop New Task action, filter button, and search input into the same top row as the Tasks title, matching the reference placement.
- Kept the New Task action on the same `Button size="sm"` style as the New Project action.
- Added a desktop-only task table/list surface with columns for actions, status, due date, project, and task details.
- Preserved the current mobile task-card layout and mobile search/filter controls below the `md` breakpoint.
- Extracted the filters into a shared `TaskFilterPanel` so desktop and mobile controls use the same state and behavior.
- Removed the Tasks page-only `max-w-6xl` wrapper so the page uses the same available content width as the other app pages.
- Reused the Tasks desktop header treatment on Projects with the New Project action and search input.
- Reused the same desktop header treatment on Notes and merged the project filter into the search surface.
- Removed the Notes list/cards switcher and kept card rendering as the only notes presentation.
- Removed the Notes search/filter outer background container while keeping the individual search and project controls styled.
- Aligned the custom Tasks, Projects, and Notes desktop page titles with the shared `PageHeader` typography.
- Matched the Notes header search input styling and dimensions to the Tasks/Projects search input while leaving the project selector adjacent in the same row.
- Moved the Notes project selector to the other side of the search row without changing the search input dimensions or mobile behavior.

**Findings**
- No P0/P1/P2 findings remain.
- [P3] The app shell still provides the existing MindSystem mobile topbar and bottom/user chrome; those were intentionally not changed because the request was scoped to the Tasks page content.

**final result: passed**
