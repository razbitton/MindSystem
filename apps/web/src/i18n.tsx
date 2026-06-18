"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type Locale = "en" | "he";
export type Direction = "ltr" | "rtl";
export type Theme = "light" | "dark";

const localeStorageKey = "mindsystem.locale";
const themeStorageKey = "mindsystem.theme";

const englishDictionary = {
  "app.name": "MindSystem",
  "app.tagline": "Capture, connect, and act on what matters",
  "language.label": "Language",
  "language.en": "English",
  "language.he": "Hebrew",
  "theme.toggle": "Toggle theme",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "nav.home": "Home",
  "nav.dashboard": "Home",
  "nav.inbox": "Capture",
  "nav.projects": "Projects",
  "nav.tasks": "Tasks",
  "nav.notes": "Notes",
  "nav.documents": "Documents",
  "nav.review": "Review",
  "nav.search": "Search",
  "nav.agents": "Agents",
  "nav.schemas": "Schemas",
  "nav.settings": "Settings",
  "nav.primary": "Primary navigation",
  "nav.workspace": "Workspace",
  "nav.library": "Library",
  "nav.automation": "Automation",
  "nav.admin": "Admin",
  "nav.mobileMenu": "Open navigation",
  "nav.closeMenu": "Close navigation",
  "nav.collapseSidebar": "Collapse sidebar",
  "nav.expandSidebar": "Expand sidebar",
  "command.title": "Command menu",
  "command.description": "Search and jump to anywhere in your workspace",
  "command.placeholder": "Type a command or search…",
  "command.empty": "No matches found.",
  "command.actions": "Actions",
  "command.navigate": "Go to",
  "command.searchFor": "Search for \u201c{query}\u201d",
  "command.hint": "Quick actions",
  "settings.title": "Settings",
  "settings.subtitle": "Manage preferences, connected apps, and your data model.",
  "settings.preferences": "Preferences",
  "settings.connections": "Connections",
  "settings.dataModel": "Data model",
  "settings.appearance": "Appearance",
  "settings.appearanceHelp": "Choose how MindSystem looks on this device.",
  "settings.languageHelp": "Set the language and reading direction.",
  "shell.globalSearch": "Search notes, tasks, projects",
  "shell.quickCapture": "Quick capture",
  "shell.searchHint": "Press Enter to search",
  "auth.title": "Welcome back",
  "auth.subtitle": "Sign in to your private workspace for notes, tasks, projects, and agents.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.passwordPlaceholder": "Enter your password",
  "auth.signIn": "Sign in",
  "auth.signingIn": "Signing in",
  "auth.loginFailed": "Sign-in failed",
  "auth.deploymentNote": "Deployment setup",
  "auth.deploymentDetails": "Set BOOTSTRAP_USER_EMAIL, BOOTSTRAP_USER_PASSWORD, JWT_SECRET, and cookie domain settings in the host environment.",
  "auth.checkingSession": "Checking session.",
  "auth.redirectingToLogin": "Redirecting to sign in.",
  "auth.logout": "Log out",
  "common.refresh": "Refresh",
  "common.copy": "Copy",
  "common.copied": "Copied to clipboard",
  "common.create": "Create",
  "common.capture": "Capture",
  "common.attach": "Attach",
  "common.apply": "Apply",
  "common.approve": "Approve",
  "common.reject": "Reject",
  "common.complete": "Complete",
  "common.loading": "Loading",
  "common.noDate": "No date",
  "common.noDescription": "No description",
  "common.noProject": "No project",
  "common.none": "None",
  "common.status": "Status",
  "common.priority": "Priority",
  "common.project": "Project",
  "common.title": "Title",
  "common.description": "Description",
  "common.body": "Body",
  "common.updated": "Updated",
  "common.due": "Due",
  "common.search": "Search",
  "common.type": "Type",
  "common.results": "Results",
  "common.query": "Query",
  "common.metadataOnly": "Metadata only",
  "common.nothingHere": "Nothing here yet.",
  "common.nothingRecorded": "Nothing recorded yet.",
  "common.new": "New",
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.deleting": "Deleting",
  "common.save": "Save",
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.reset": "Reset",
  "common.all": "All",
  "common.open": "Open",
  "common.cards": "Cards",
  "common.list": "List",
  "common.board": "Board",
  "common.details": "Details",
  "common.advanced": "Advanced details",
  "common.created": "Created",
  "common.optional": "Optional",
  "common.failed": "Something went wrong",
  "common.emptySearch": "Try a broader search or clear the filters.",
  "common.view": "View",
  "common.filter": "Filter",
  "home.title": "Home",
  "home.subtitle": "Capture loose thoughts, see what needs attention, and keep your personal context moving.",
  "home.captureTitle": "Quick capture",
  "home.capturePlaceholder": "Drop a thought, task, meeting note, reminder, or project update here.",
  "home.captureHelp": "MindSystem will keep the raw text and turn it into structured context.",
  "home.today": "Today",
  "home.overdue": "Overdue",
  "home.review": "Review",
  "home.recentNotes": "Recent notes",
  "home.activeProjects": "Active projects",
  "home.urgentTasks": "Urgent tasks",
  "home.recentCaptures": "Recent captures",
  "home.noRecentNotes": "No notes captured yet.",
  "home.noUrgentTasks": "No urgent tasks right now.",
  "home.noProjects": "No active projects yet.",
  "home.captureSuccess": "Captured and organized.",
  "dashboard.title": "Home",
  "dashboard.subtitle": "Today's view across captured memory, open work, active projects, and review load.",
  "dashboard.today": "Today",
  "dashboard.scheduledOrDue": "scheduled or due",
  "dashboard.overdue": "Overdue",
  "dashboard.needsAttention": "needs attention",
  "dashboard.review": "Review",
  "dashboard.pendingDecisions": "pending decisions",
  "dashboard.todayTasks": "Today's tasks",
  "dashboard.urgentTasks": "Urgent tasks",
  "dashboard.activeProjects": "Active projects",
  "dashboard.recentCaptures": "Recent captures",
  "dashboard.projectRisk": "Project risk",
  "dashboard.noRisk": "No risk signals yet.",
  "dashboard.loadError": "Failed to load dashboard",
  "inbox.title": "Capture",
  "inbox.subtitle": "Write naturally. MindSystem keeps the original text and extracts notes, tasks, reminders, and projects.",
  "inbox.capturePanel": "Capture anything",
  "inbox.placeholder": "Project: Migration plan\nTask: review token scopes tomorrow\nNote: prefer read-only agents by default",
  "inbox.resultPanel": "What MindSystem found",
  "inbox.emptyResult": "Captured items will appear here after you submit.",
  "inbox.rawItem": "Raw capture",
  "inbox.detectedIntent": "Detected intent: {intent}",
  "inbox.appliedReview": "{applied} applied, {review} waiting for review",
  "inbox.captureFailed": "Capture failed",
  "inbox.createdEntities": "Created items",
  "inbox.reviewNeeded": "Needs review",
  "projects.title": "Projects",
  "projects.subtitle": "Organize goals, linked notes, tasks, documents, and agent-ready context.",
  "projects.createPanel": "New project",
  "projects.namePlaceholder": "Project name",
  "projects.activeList": "Project workspace",
  "projects.empty": "No projects yet.",
  "projects.loadError": "Failed to load projects",
  "projects.newProject": "New project",
  "projects.editProject": "Edit project",
  "projects.searchPlaceholder": "Search projects",
  "projects.goal": "Goal",
  "projects.noGoal": "No goal set",
  "projects.openProject": "Open project",
  "projects.deleteProject": "Delete project",
  "projects.deleteConfirm": "Delete “{title}”? Tasks, notes, and documents linked to this project will remain, but they will no longer be assigned to it.",
  "projectDetail.fallbackTitle": "Project",
  "projectDetail.fallbackSubtitle": "Project context",
  "projectDetail.summary": "Overview",
  "projectDetail.noGoal": "No goal set",
  "projectDetail.loading": "Loading project.",
  "projectDetail.contextPack": "Agent context",
  "projectDetail.noContextPack": "No context pack yet.",
  "projectDetail.tasks": "Tasks",
  "projectDetail.noTasks": "No tasks linked.",
  "projectDetail.notes": "Notes",
  "projectDetail.documents": "Documents",
  "projectDetail.activity": "Activity",
  "projectDetail.nothingLinked": "Nothing linked yet.",
  "projectDetail.loadError": "Failed to load project",
  "projectDetail.contextHelp": "This is the condensed context agents can use for the project.",
  "tasks.title": "Tasks",
  "tasks.subtitle": "Plan, filter, and complete work across projects and captured context.",
  "tasks.createPanel": "New task",
  "tasks.titlePlaceholder": "Task title",
  "tasks.filters": "Filters",
  "tasks.anyStatus": "Any status",
  "tasks.anyPriority": "Any priority",
  "tasks.anyProject": "Any project",
  "tasks.list": "Task list",
  "tasks.empty": "No matching tasks.",
  "tasks.newTask": "New task",
  "tasks.editTask": "Edit task",
  "tasks.deleteTask": "Delete task",
  "tasks.deleteConfirm": "Delete “{title}”? This cannot be undone.",
  "tasks.searchPlaceholder": "Search tasks",
  "tasks.dueAt": "Due date",
  "tasks.scheduledFor": "Scheduled for",
  "tasks.estimateMinutes": "Estimate minutes",
  "tasks.assignee": "Assignee",
  "notes.title": "Notes",
  "notes.subtitle": "Browse and edit canonical notes created directly or extracted from captures.",
  "notes.createPanel": "New note",
  "notes.list": "Notes",
  "notes.empty": "No notes yet.",
  "notes.newNote": "New note",
  "notes.editNote": "Edit note",
  "notes.deleteNote": "Delete note",
  "notes.deleteConfirm": "Delete “{title}”? This cannot be undone.",
  "notes.searchPlaceholder": "Search notes",
  "notes.allProjects": "All projects",
  "notes.preview": "Preview",
  "notes.takeANote": "Take a note...",
  "notes.titlePlaceholder": "Title",
  "notes.bodyPlaceholder": "Take a note...",
  "notes.color": "Note color",
  "notes.count": "{count} notes",
  "documents.title": "Documents",
  "documents.subtitle": "Reference files, extracted text, and project attachments.",
  "documents.attachPanel": "Attach document",
  "documents.objectKey": "Object key",
  "documents.mimeType": "MIME type",
  "documents.extractedText": "Extracted text",
  "documents.list": "Documents",
  "documents.empty": "No documents attached.",
  "documents.newDocument": "New document",
  "documents.storageDetails": "Storage details",
  "review.title": "Review",
  "review.subtitle": "Approve or reject low-confidence suggestions before they change your workspace.",
  "review.pending": "Pending decisions",
  "review.empty": "No pending review items.",
  "review.loadError": "Failed to load review queue",
  "review.payload": "Suggested payload",
  "review.approve": "Approve",
  "review.reject": "Dismiss",
  "review.confidence": "Confidence",
  "review.suggestedBy": "Suggested by",
  "review.advancedDetails": "Technical details",
  "review.approveTitle": "Apply this suggestion?",
  "review.approveBody": "This will update your workspace with the suggested change.",
  "review.rejectTitle": "Dismiss this suggestion?",
  "review.rejectBody": "This suggestion will be removed from your review queue.",
  "review.approved": "Suggestion applied",
  "review.rejected": "Suggestion dismissed",
  "review.actionError": "Couldn\u2019t complete that action. Please try again.",
  "review.allClear": "You\u2019re all caught up",
  "review.allClearBody": "New suggestions will appear here when there\u2019s something to review.",
  "search.title": "Search",
  "search.subtitle": "Find notes, tasks, projects, documents, and structured memory from one place.",
  "search.placeholder": "Search memory",
  "search.anyType": "Any type",
  "search.noSummary": "No summary",
  "search.empty": "No results yet.",
  "search.allEntities": "All entities",
  "search.retrievalMode": "Retrieval: {mode}",
  "agents.title": "Agents",
  "agents.subtitle": "Create scoped tokens, copy MCP connection details, and review recent agent activity.",
  "agents.createToken": "Create token",
  "agents.defaultName": "Local read-write agent",
  "agents.mcpConfiguration": "MCP configuration",
  "agents.tokens": "Tokens",
  "agents.agentRuns": "Agent runs",
  "agents.auditEvents": "Audit events",
  "agents.selectedScopes": "Selected scopes",
  "agents.scopes": "Access scopes",
  "agents.createdToken": "New token",
  "agents.connectionDetails": "Connection details",
  "schemas.title": "Schemas",
  "schemas.subtitle": "Admin view of entity types, OpenAPI routes, and future project-specific extensions.",
  "schemas.entityModel": "Entity model",
  "schemas.entityDescription": "Generic entity with typed records, canonical JSON, and custom fields.",
  "schemas.openapi": "OpenAPI",
  "schemas.openapiUnavailable": "OpenAPI unavailable.",
  "schemas.projectOverrides": "Project overrides",
  "schemas.noOverrides": "No project-specific overrides defined.",
  "status.active": "Active",
  "status.paused": "Paused",
  "status.completed": "Completed",
  "status.archived": "Archived",
  "status.inbox": "Inbox",
  "status.todo": "Todo",
  "status.in_progress": "In progress",
  "status.waiting": "Waiting",
  "status.done": "Done",
  "status.cancelled": "Cancelled",
  "status.created": "Created",
  "status.review": "Review",
  "status.pending": "Pending",
  "status.approved": "Approved",
  "status.rejected": "Rejected",
  "status.scheduled": "Scheduled",
  "status.running": "Running",
  "status.failed": "Failed",
  "priority.low": "Low",
  "priority.medium": "Medium",
  "priority.high": "High",
  "priority.urgent": "Urgent",
  "entity.project": "Project",
  "entity.task": "Task",
  "entity.note": "Note",
  "entity.document": "Document",
  "entity.decision": "Decision",
  "entity.reminder": "Reminder",
  "entity.person": "Person",
  "entity.goal": "Goal",
  "intent.create_project": "Create project",
  "intent.add_tasks": "Add tasks",
  "intent.capture_note": "Capture note",
  "intent.create_reminder": "Create reminder",
  "intent.mixed": "Mixed",
  "intent.unknown": "Unknown",
  "source.manual": "Manual",
  "source.web": "Web",
  "source.whatsapp": "WhatsApp",
  "source.openclaw": "OpenClaw",
  "source.codex": "Codex",
  "source.api": "API",
  "action.ingest": "Ingest",
  "action.create entity": "Create entity",
  "action.update entity": "Update entity",
  "action.task complete": "Task complete",
  "action.mcp tool call": "MCP tool call",
  "action.token created": "Token created",
  "action.review approve": "Review approved",
  "action.review reject": "Review rejected",
  "action.create_task": "Create task",
  "action.create_note": "Create note",
  "action.create_project": "Create project",
  "action.create_reminder": "Create reminder",
  "action.inspect_normalization": "Inspect normalization",
  "actor.user": "User",
  "actor.agent": "Agent",
  "actor.system": "System",
  "reviewReason.low_confidence_project": "Low-confidence project",
  "reviewReason.low_confidence_task": "Low-confidence task",
  "reviewReason.low_confidence_note": "Low-confidence note",
  "reviewReason.low_confidence_reminder": "Low-confidence reminder",
  "reviewReason.low_confidence_person": "Low-confidence person",
  "reviewReason.low_confidence_decision": "Low-confidence decision",
  "reviewReason.low_confidence_goal": "Low-confidence goal"
} as const;

type TranslationKey = keyof typeof englishDictionary;
type Replacements = Record<string, string | number>;

const hebrewDictionary: Partial<Record<TranslationKey, string>> = {
  "app.name": "MindSystem",
  "app.tagline": "ללכוד, לחבר ולפעול על מה שחשוב",
  "language.label": "שפה",
  "language.en": "אנגלית",
  "language.he": "עברית",
  "theme.toggle": "החלפת ערכת נושא",
  "theme.light": "בהיר",
  "theme.dark": "כהה",
  "nav.home": "בית",
  "nav.dashboard": "בית",
  "nav.inbox": "קליטה",
  "nav.projects": "פרויקטים",
  "nav.tasks": "משימות",
  "nav.notes": "הערות",
  "nav.documents": "מסמכים",
  "nav.review": "סקירה",
  "nav.search": "חיפוש",
  "nav.agents": "סוכנים",
  "nav.schemas": "סכמות",
  "nav.settings": "הגדרות",
  "nav.primary": "ניווט ראשי",
  "nav.workspace": "מרחב עבודה",
  "nav.library": "ספרייה",
  "nav.automation": "אוטומציה",
  "nav.admin": "ניהול",
  "nav.mobileMenu": "פתיחת ניווט",
  "nav.closeMenu": "סגירת ניווט",
  "nav.collapseSidebar": "כיווץ סרגל צד",
  "nav.expandSidebar": "הרחבת סרגל צד",
  "command.title": "תפריט פקודות",
  "command.description": "חיפוש ומעבר מהיר לכל מקום במרחב העבודה",
  "command.placeholder": "הקלד פקודה או חיפוש…",
  "command.empty": "לא נמצאו תוצאות.",
  "command.actions": "פעולות",
  "command.navigate": "מעבר אל",
  "command.searchFor": "חיפוש \u201c{query}\u201d",
  "command.hint": "פעולות מהירות",
  "settings.title": "הגדרות",
  "settings.subtitle": "ניהול העדפות, אפליקציות מחוברות ומודל הנתונים.",
  "settings.preferences": "העדפות",
  "settings.connections": "חיבורים",
  "settings.dataModel": "מודל נתונים",
  "settings.appearance": "מראה",
  "settings.appearanceHelp": "בחר כיצד MindSystem ייראה במכשיר הזה.",
  "settings.languageHelp": "הגדר שפה וכיוון קריאה.",
  "shell.globalSearch": "חיפוש בהערות, משימות ופרויקטים",
  "shell.quickCapture": "קליטה מהירה",
  "shell.searchHint": "לחץ Enter כדי לחפש",
  "auth.title": "ברוכים השבים",
  "auth.subtitle": "התחברות למרחב הפרטי שלך לניהול הערות, משימות, פרויקטים וסוכנים.",
  "auth.email": "אימייל",
  "auth.password": "סיסמה",
  "auth.passwordPlaceholder": "הקלד סיסמה",
  "auth.signIn": "כניסה",
  "auth.signingIn": "נכנס",
  "auth.loginFailed": "הכניסה נכשלה",
  "auth.deploymentNote": "הגדרות פריסה",
  "auth.deploymentDetails": "יש להגדיר את BOOTSTRAP_USER_EMAIL, BOOTSTRAP_USER_PASSWORD, JWT_SECRET והגדרות דומיין העוגיות בסביבת האירוח.",
  "auth.checkingSession": "בודק התחברות.",
  "auth.redirectingToLogin": "מעביר למסך הכניסה.",
  "auth.logout": "יציאה",
  "common.refresh": "רענון",
  "common.copy": "העתקה",
  "common.copied": "הועתק ללוח",
  "common.create": "יצירה",
  "common.capture": "קליטה",
  "common.attach": "צירוף",
  "common.apply": "החלה",
  "common.approve": "אישור",
  "common.reject": "דחייה",
  "common.complete": "השלמה",
  "common.loading": "טוען",
  "common.noDate": "אין תאריך",
  "common.noDescription": "אין תיאור",
  "common.noProject": "ללא פרויקט",
  "common.none": "אין",
  "common.status": "סטטוס",
  "common.priority": "עדיפות",
  "common.project": "פרויקט",
  "common.title": "כותרת",
  "common.description": "תיאור",
  "common.body": "תוכן",
  "common.updated": "עודכן",
  "common.due": "תאריך יעד",
  "common.search": "חיפוש",
  "common.type": "סוג",
  "common.results": "תוצאות",
  "common.query": "שאילתה",
  "common.metadataOnly": "מטא-דאטה בלבד",
  "common.nothingHere": "אין כאן פריטים עדיין.",
  "common.nothingRecorded": "אין רשומות עדיין.",
  "common.new": "חדש",
  "common.edit": "עריכה",
  "common.delete": "מחיקה",
  "common.deleting": "מוחק",
  "common.save": "שמירה",
  "common.close": "סגירה",
  "common.cancel": "ביטול",
  "common.reset": "איפוס",
  "common.all": "הכול",
  "common.open": "פתיחה",
  "common.cards": "כרטיסים",
  "common.list": "רשימה",
  "common.board": "לוח",
  "common.details": "פרטים",
  "common.advanced": "פרטים מתקדמים",
  "common.created": "נוצר",
  "common.optional": "אופציונלי",
  "common.failed": "משהו השתבש",
  "common.emptySearch": "נסה חיפוש רחב יותר או נקה את המסננים.",
  "common.view": "תצוגה",
  "common.filter": "סינון",
  "home.title": "בית",
  "home.subtitle": "קליטה מהירה, תמונת מצב יומית והקשר אישי שממשיך להתקדם.",
  "home.captureTitle": "קליטה מהירה",
  "home.capturePlaceholder": "כתוב מחשבה, משימה, הערת פגישה, תזכורת או עדכון פרויקט.",
  "home.captureHelp": "MindSystem ישמור את הטקסט הגולמי ויהפוך אותו להקשר מובנה.",
  "home.today": "היום",
  "home.overdue": "באיחור",
  "home.review": "סקירה",
  "home.recentNotes": "הערות אחרונות",
  "home.activeProjects": "פרויקטים פעילים",
  "home.urgentTasks": "משימות דחופות",
  "home.recentCaptures": "קליטות אחרונות",
  "home.noRecentNotes": "עדיין לא נוצרו הערות.",
  "home.noUrgentTasks": "אין כרגע משימות דחופות.",
  "home.noProjects": "אין עדיין פרויקטים פעילים.",
  "home.captureSuccess": "נקלט ואורגן.",
  "dashboard.title": "בית",
  "dashboard.subtitle": "תמונת היום: זיכרון שנקלט, עבודה פתוחה, פרויקטים פעילים ועומס סקירה.",
  "dashboard.today": "היום",
  "dashboard.scheduledOrDue": "מתוזמנות או לתאריך יעד",
  "dashboard.overdue": "באיחור",
  "dashboard.needsAttention": "דורשות טיפול",
  "dashboard.review": "סקירה",
  "dashboard.pendingDecisions": "החלטות ממתינות",
  "dashboard.todayTasks": "משימות היום",
  "dashboard.urgentTasks": "משימות דחופות",
  "dashboard.activeProjects": "פרויקטים פעילים",
  "dashboard.recentCaptures": "קליטות אחרונות",
  "dashboard.projectRisk": "סיכון בפרויקט",
  "dashboard.noRisk": "אין עדיין סימני סיכון.",
  "dashboard.loadError": "טעינת הבית נכשלה",
  "inbox.title": "קליטה",
  "inbox.subtitle": "כתוב טבעי. MindSystem שומר את המקור ומחלץ הערות, משימות, תזכורות ופרויקטים.",
  "inbox.capturePanel": "קליטה חופשית",
  "inbox.placeholder": "פרויקט: תוכנית מיגרציה\nמשימה: לבדוק מחר הרשאות טוקן\nהערה: להעדיף סוכנים לקריאה בלבד כברירת מחדל",
  "inbox.resultPanel": "מה MindSystem מצא",
  "inbox.emptyResult": "פריטים שנקלטו יופיעו כאן לאחר השליחה.",
  "inbox.rawItem": "קליטה גולמית",
  "inbox.detectedIntent": "כוונה שזוהתה: {intent}",
  "inbox.appliedReview": "{applied} הוחלו, {review} ממתינים לסקירה",
  "inbox.captureFailed": "הקליטה נכשלה",
  "inbox.createdEntities": "פריטים שנוצרו",
  "inbox.reviewNeeded": "דורש סקירה",
  "projects.title": "פרויקטים",
  "projects.subtitle": "ניהול מטרות, הערות, משימות, מסמכים והקשר מוכן לסוכנים.",
  "projects.createPanel": "פרויקט חדש",
  "projects.namePlaceholder": "שם פרויקט",
  "projects.activeList": "מרחב פרויקטים",
  "projects.empty": "אין עדיין פרויקטים.",
  "projects.loadError": "טעינת הפרויקטים נכשלה",
  "projects.newProject": "פרויקט חדש",
  "projects.editProject": "עריכת פרויקט",
  "projects.searchPlaceholder": "חיפוש פרויקטים",
  "projects.goal": "מטרה",
  "projects.noGoal": "לא הוגדרה מטרה",
  "projects.openProject": "פתיחת פרויקט",
  "projects.deleteProject": "מחיקת פרויקט",
  "projects.deleteConfirm": "למחוק את ״{title}״? משימות, הערות ומסמכים שמקושרים לפרויקט יישארו, אבל לא יהיו משויכים אליו.",
  "projectDetail.fallbackTitle": "פרויקט",
  "projectDetail.fallbackSubtitle": "הקשר הפרויקט",
  "projectDetail.summary": "סקירה",
  "projectDetail.noGoal": "לא הוגדרה מטרה",
  "projectDetail.loading": "טוען פרויקט.",
  "projectDetail.contextPack": "הקשר לסוכן",
  "projectDetail.noContextPack": "אין עדיין חבילת הקשר.",
  "projectDetail.tasks": "משימות",
  "projectDetail.noTasks": "אין משימות מקושרות.",
  "projectDetail.notes": "הערות",
  "projectDetail.documents": "מסמכים",
  "projectDetail.activity": "פעילות",
  "projectDetail.nothingLinked": "עדיין אין פריטים מקושרים.",
  "projectDetail.loadError": "טעינת הפרויקט נכשלה",
  "projectDetail.contextHelp": "זהו ההקשר המתומצת שסוכנים יכולים להשתמש בו עבור הפרויקט.",
  "tasks.title": "משימות",
  "tasks.subtitle": "תכנון, סינון והשלמת עבודה לפי פרויקטים והקשר שנקלט.",
  "tasks.createPanel": "משימה חדשה",
  "tasks.titlePlaceholder": "כותרת משימה",
  "tasks.filters": "מסננים",
  "tasks.anyStatus": "כל סטטוס",
  "tasks.anyPriority": "כל עדיפות",
  "tasks.anyProject": "כל פרויקט",
  "tasks.list": "רשימת משימות",
  "tasks.empty": "אין משימות מתאימות.",
  "tasks.newTask": "משימה חדשה",
  "tasks.editTask": "עריכת משימה",
  "tasks.deleteTask": "מחיקת משימה",
  "tasks.deleteConfirm": "למחוק את ״{title}״? אי אפשר לבטל את הפעולה.",
  "tasks.searchPlaceholder": "חיפוש משימות",
  "tasks.dueAt": "תאריך יעד",
  "tasks.scheduledFor": "מתוזמן ל",
  "tasks.estimateMinutes": "הערכת דקות",
  "tasks.assignee": "אחראי",
  "notes.title": "הערות",
  "notes.subtitle": "עיון ועריכה של הערות שנוצרו ישירות או חולצו מקליטות.",
  "notes.createPanel": "הערה חדשה",
  "notes.list": "הערות",
  "notes.empty": "אין עדיין הערות.",
  "notes.newNote": "הערה חדשה",
  "notes.editNote": "עריכת הערה",
  "notes.deleteNote": "מחיקת הערה",
  "notes.deleteConfirm": "למחוק את ״{title}״? אי אפשר לבטל את הפעולה.",
  "notes.searchPlaceholder": "חיפוש הערות",
  "notes.allProjects": "כל הפרויקטים",
  "notes.preview": "תצוגה מקדימה",
  "notes.takeANote": "כתוב פתק...",
  "notes.titlePlaceholder": "כותרת",
  "notes.bodyPlaceholder": "כתוב פתק...",
  "notes.color": "צבע הפתק",
  "notes.count": "{count} פתקים",
  "documents.title": "מסמכים",
  "documents.subtitle": "קבצי מקור, טקסט שחולץ וקישורים לפרויקטים.",
  "documents.attachPanel": "צירוף מסמך",
  "documents.objectKey": "מפתח אובייקט",
  "documents.mimeType": "סוג MIME",
  "documents.extractedText": "טקסט שחולץ",
  "documents.list": "מסמכים",
  "documents.empty": "אין מסמכים מצורפים.",
  "documents.newDocument": "מסמך חדש",
  "documents.storageDetails": "פרטי אחסון",
  "review.title": "סקירה",
  "review.subtitle": "אישור או דחייה של הצעות בביטחון נמוך לפני שינוי המרחב.",
  "review.pending": "החלטות ממתינות",
  "review.empty": "אין פריטי סקירה ממתינים.",
  "review.loadError": "טעינת תור הסקירה נכשלה",
  "review.payload": "מטען מוצע",
  "review.approve": "אישור",
  "review.reject": "התעלמות",
  "review.confidence": "רמת ודאות",
  "review.suggestedBy": "הוצע על ידי",
  "review.advancedDetails": "פרטים טכניים",
  "review.approveTitle": "להחיל את ההצעה?",
  "review.approveBody": "פעולה זו תעדכן את מרחב העבודה עם השינוי המוצע.",
  "review.rejectTitle": "להתעלם מההצעה?",
  "review.rejectBody": "ההצעה תוסר מתור הסקירה שלך.",
  "review.approved": "ההצעה הוחלה",
  "review.rejected": "ההצעה הוסרה",
  "review.actionError": "לא הצלחנו להשלים את הפעולה. נסה שוב.",
  "review.allClear": "סיימת הכול",
  "review.allClearBody": "הצעות חדשות יופיעו כאן כשיהיה מה לסקור.",
  "search.title": "חיפוש",
  "search.subtitle": "מציאת הערות, משימות, פרויקטים, מסמכים וזיכרון מובנה במקום אחד.",
  "search.placeholder": "חיפוש בזיכרון",
  "search.anyType": "כל סוג",
  "search.noSummary": "אין תקציר",
  "search.empty": "אין עדיין תוצאות.",
  "search.allEntities": "כל הישויות",
  "search.retrievalMode": "שליפה: {mode}",
  "agents.title": "סוכנים",
  "agents.subtitle": "יצירת טוקנים מוגבלים, פרטי חיבור MCP ובדיקת פעילות סוכנים.",
  "agents.createToken": "יצירת טוקן",
  "agents.defaultName": "סוכן מקומי לקריאה וכתיבה",
  "agents.mcpConfiguration": "הגדרת MCP",
  "agents.tokens": "טוקנים",
  "agents.agentRuns": "הרצות סוכנים",
  "agents.auditEvents": "אירועי ביקורת",
  "agents.selectedScopes": "הרשאות נבחרות",
  "agents.scopes": "הרשאות גישה",
  "agents.createdToken": "טוקן חדש",
  "agents.connectionDetails": "פרטי חיבור",
  "schemas.title": "סכמות",
  "schemas.subtitle": "תצוגת ניהול לסוגי ישויות, נתיבי OpenAPI והרחבות עתידיות.",
  "schemas.entityModel": "מודל ישויות",
  "schemas.entityDescription": "ישות כללית עם רשומות מסווגות, JSON קנוני ושדות מותאמים.",
  "schemas.openapi": "OpenAPI",
  "schemas.openapiUnavailable": "OpenAPI לא זמין.",
  "schemas.projectOverrides": "דריסות לפי פרויקט",
  "schemas.noOverrides": "לא הוגדרו דריסות סכמות לפי פרויקט.",
  "status.active": "פעיל",
  "status.paused": "מושהה",
  "status.completed": "הושלם",
  "status.archived": "בארכיון",
  "status.inbox": "תיבה",
  "status.todo": "לביצוע",
  "status.in_progress": "בתהליך",
  "status.waiting": "בהמתנה",
  "status.done": "בוצע",
  "status.cancelled": "בוטל",
  "status.created": "נוצר",
  "status.review": "סקירה",
  "status.pending": "ממתין",
  "status.approved": "אושר",
  "status.rejected": "נדחה",
  "status.scheduled": "מתוזמן",
  "status.running": "רץ",
  "status.failed": "נכשל",
  "priority.low": "נמוכה",
  "priority.medium": "בינונית",
  "priority.high": "גבוהה",
  "priority.urgent": "דחופה",
  "entity.project": "פרויקט",
  "entity.task": "משימה",
  "entity.note": "הערה",
  "entity.document": "מסמך",
  "entity.decision": "החלטה",
  "entity.reminder": "תזכורת",
  "entity.person": "אדם",
  "entity.goal": "יעד",
  "intent.create_project": "יצירת פרויקט",
  "intent.add_tasks": "הוספת משימות",
  "intent.capture_note": "קליטת הערה",
  "intent.create_reminder": "יצירת תזכורת",
  "intent.mixed": "מעורב",
  "intent.unknown": "לא ידוע",
  "source.manual": "ידני",
  "source.web": "אינטרנט",
  "source.whatsapp": "WhatsApp",
  "source.openclaw": "OpenClaw",
  "source.codex": "Codex",
  "source.api": "API",
  "action.ingest": "קליטה",
  "action.create entity": "יצירת ישות",
  "action.update entity": "עדכון ישות",
  "action.task complete": "השלמת משימה",
  "action.mcp tool call": "קריאת כלי MCP",
  "action.token created": "טוקן נוצר",
  "action.review approve": "סקירה אושרה",
  "action.review reject": "סקירה נדחתה",
  "action.create_task": "יצירת משימה",
  "action.create_note": "יצירת הערה",
  "action.create_project": "יצירת פרויקט",
  "action.create_reminder": "יצירת תזכורת",
  "action.inspect_normalization": "בדיקת נרמול",
  "actor.user": "משתמש",
  "actor.agent": "סוכן",
  "actor.system": "מערכת",
  "reviewReason.low_confidence_project": "פרויקט בביטחון נמוך",
  "reviewReason.low_confidence_task": "משימה בביטחון נמוך",
  "reviewReason.low_confidence_note": "הערה בביטחון נמוך",
  "reviewReason.low_confidence_reminder": "תזכורת בביטחון נמוך",
  "reviewReason.low_confidence_person": "אדם בביטחון נמוך",
  "reviewReason.low_confidence_decision": "החלטה בביטחון נמוך",
  "reviewReason.low_confidence_goal": "יעד בביטחון נמוך"
};

interface I18nContextValue {
  locale: Locale;
  direction: Direction;
  setLocale: (locale: Locale) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  t: (key: TranslationKey, replacements?: Replacements) => string;
  translateValue: (group: "status" | "priority" | "entity" | "intent" | "source" | "action" | "reviewReason" | "actor", value?: string | null) => string;
  formatDate: (value?: string | null) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(localeStorageKey);
    if (stored === "he" || stored === "en") {
      setLocaleState(stored);
    } else if (window.navigator.language.toLowerCase().startsWith("he")) {
      setLocaleState("he");
    }

    const storedTheme = window.localStorage.getItem(themeStorageKey);
    if (storedTheme === "dark" || storedTheme === "light") {
      setThemeState(storedTheme);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setThemeState("dark");
    }
  }, []);

  const direction: Direction = locale === "he" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    document.body.dir = direction;
  }, [direction, locale]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = locale === "he" ? hebrewDictionary : englishDictionary;

    function t(key: TranslationKey, replacements: Replacements = {}) {
      let text = dictionary[key] ?? englishDictionary[key] ?? key;
      for (const [name, replacement] of Object.entries(replacements)) {
        text = text.replaceAll(`{${name}}`, String(replacement));
      }
      return text;
    }

    function translateValue(group: "status" | "priority" | "entity" | "intent" | "source" | "action" | "reviewReason" | "actor", valueToTranslate?: string | null) {
      if (!valueToTranslate) return "";
      const key = `${group}.${valueToTranslate}` as TranslationKey;
      return key in englishDictionary ? t(key) : humanize(valueToTranslate);
    }

    function formatDate(valueToFormat?: string | null) {
      if (!valueToFormat) return t("common.noDate");
      const date = new Date(valueToFormat);
      if (Number.isNaN(date.getTime())) return t("common.noDate");
      return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
    }

    return {
      locale,
      direction,
      theme,
      t,
      translateValue,
      formatDate,
      setLocale(nextLocale: Locale) {
        window.localStorage.setItem(localeStorageKey, nextLocale);
        setLocaleState(nextLocale);
      },
      setTheme(nextTheme: Theme) {
        window.localStorage.setItem(themeStorageKey, nextTheme);
        setThemeState(nextTheme);
      },
      toggleTheme() {
        setThemeState((current) => {
          const next = current === "dark" ? "light" : "dark";
          window.localStorage.setItem(themeStorageKey, next);
          return next;
        });
      }
    };
  }, [direction, locale, theme]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside LocaleProvider");
  return value;
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className="inline-flex items-center rounded-lg border border-border bg-card p-0.5"
      role="group"
      aria-label={t("language.label")}
    >
      {(["en", "he"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={
            locale === code
              ? "rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
              : "rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          {code === "en" ? "EN" : "עב"}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme, t } = useI18n();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={t("theme.toggle")}
      aria-label={`${t("theme.toggle")}: ${isDark ? t("theme.light") : t("theme.dark")}`}
      className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
