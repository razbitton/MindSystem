"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Locale = "en" | "he";
export type Direction = "ltr" | "rtl";

const localeStorageKey = "personal-context-os.locale";

const dictionaries = {
  en: {
    "app.name": "Personal Context OS",
    "app.tagline": "Personal memory and task operations",
    "language.label": "Language",
    "language.en": "English",
    "language.he": "Hebrew",
    "nav.dashboard": "Dashboard",
    "nav.inbox": "Inbox",
    "nav.projects": "Projects",
    "nav.tasks": "Tasks",
    "nav.notes": "Notes",
    "nav.documents": "Documents",
    "nav.review": "Review",
    "nav.search": "Search",
    "nav.agents": "Agents",
    "nav.schemas": "Schemas",
    "nav.primary": "Primary navigation",
    "auth.title": "Sign in",
    "auth.subtitle": "Access your private memory, tasks, projects, and agent settings.",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.passwordPlaceholder": "Enter your password",
    "auth.signIn": "Sign in",
    "auth.signingIn": "Signing in",
    "auth.loginFailed": "Sign-in failed",
    "auth.deploymentNote": "For deployment, set BOOTSTRAP_USER_EMAIL, BOOTSTRAP_USER_PASSWORD, JWT_SECRET, and cookie domain settings in the host environment.",
    "auth.checkingSession": "Checking session.",
    "auth.redirectingToLogin": "Redirecting to sign in.",
    "auth.logout": "Log out",
    "common.refresh": "Refresh",
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
    "common.nothingHere": "Nothing here.",
    "common.nothingRecorded": "Nothing recorded.",
    "dashboard.title": "Dashboard",
    "dashboard.subtitle": "Today's operational view across captured memory, open work, active projects, and review load.",
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
    "inbox.title": "Inbox",
    "inbox.subtitle": "Capture raw context first; structured entities are created after normalization.",
    "inbox.capturePanel": "Capture",
    "inbox.placeholder": "Project: Migration plan\nTask: review token scopes tomorrow\nNote: prefer read-only agents by default",
    "inbox.resultPanel": "Normalization result",
    "inbox.emptyResult": "No capture submitted yet.",
    "inbox.rawItem": "Raw item",
    "inbox.detectedIntent": "Detected intent: {intent}",
    "inbox.appliedReview": "Applied {applied}; review items {review}",
    "inbox.captureFailed": "Capture failed",
    "projects.title": "Projects",
    "projects.subtitle": "Project-specific context, schema overrides, tasks, notes, documents, and generated context packs.",
    "projects.createPanel": "Create project",
    "projects.namePlaceholder": "Project name",
    "projects.activeList": "Active list",
    "projects.empty": "No projects yet.",
    "projects.loadError": "Failed to load projects",
    "projectDetail.fallbackTitle": "Project",
    "projectDetail.fallbackSubtitle": "Project context",
    "projectDetail.summary": "Summary",
    "projectDetail.noGoal": "No goal set",
    "projectDetail.loading": "Loading project.",
    "projectDetail.contextPack": "Context pack",
    "projectDetail.noContextPack": "No context pack yet.",
    "projectDetail.tasks": "Tasks",
    "projectDetail.noTasks": "No tasks linked.",
    "projectDetail.notes": "Notes",
    "projectDetail.documents": "Documents",
    "projectDetail.activity": "Activity timeline",
    "projectDetail.nothingLinked": "Nothing linked.",
    "projectDetail.loadError": "Failed to load project",
    "tasks.title": "Tasks",
    "tasks.subtitle": "Open work across inbox, projects, due dates, priorities, and agent-created items.",
    "tasks.createPanel": "Create task",
    "tasks.titlePlaceholder": "Task title",
    "tasks.filters": "Filters",
    "tasks.anyStatus": "Any status",
    "tasks.anyPriority": "Any priority",
    "tasks.anyProject": "Any project",
    "tasks.list": "Task list",
    "tasks.empty": "No matching tasks.",
    "notes.title": "Notes",
    "notes.subtitle": "Canonical notes created directly or extracted from raw captures.",
    "notes.createPanel": "Create note",
    "notes.list": "Notes",
    "notes.empty": "No notes yet.",
    "documents.title": "Documents",
    "documents.subtitle": "Document metadata, extracted text, and project attachment records.",
    "documents.attachPanel": "Attach document",
    "documents.objectKey": "Object key",
    "documents.mimeType": "MIME type",
    "documents.extractedText": "Extracted text",
    "documents.list": "Documents",
    "documents.empty": "No documents attached.",
    "review.title": "Review queue",
    "review.subtitle": "Low-confidence or risky normalization suggestions waiting for approval.",
    "review.pending": "Pending",
    "review.empty": "No pending review items.",
    "review.loadError": "Failed to load review queue",
    "search.title": "Search",
    "search.subtitle": "Structured filters plus full-text retrieval, with vector search ready in the chunk layer.",
    "search.placeholder": "Search memory",
    "search.anyType": "Any type",
    "search.noSummary": "No summary",
    "search.empty": "No results.",
    "agents.title": "Agents",
    "agents.subtitle": "Scoped token management, MCP connection details, recent runs, and audit events.",
    "agents.createToken": "Create token",
    "agents.defaultName": "Local read-write agent",
    "agents.mcpConfiguration": "MCP configuration",
    "agents.tokens": "Tokens",
    "agents.agentRuns": "Agent runs",
    "agents.auditEvents": "Audit events",
    "schemas.title": "Schemas",
    "schemas.subtitle": "Base entity types and extension points for project-specific custom fields.",
    "schemas.entityModel": "Entity model",
    "schemas.entityDescription": "Generic entity plus canonical JSON and custom fields.",
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
  },
  he: {
    "app.name": "מערכת ההקשר האישית",
    "app.tagline": "ניהול זיכרון, משימות וסוכני AI",
    "language.label": "שפה",
    "language.en": "אנגלית",
    "language.he": "עברית",
    "nav.dashboard": "לוח בקרה",
    "nav.inbox": "תיבת כניסה",
    "nav.projects": "פרויקטים",
    "nav.tasks": "משימות",
    "nav.notes": "הערות",
    "nav.documents": "מסמכים",
    "nav.review": "סקירה",
    "nav.search": "חיפוש",
    "nav.agents": "סוכנים",
    "nav.schemas": "סכמות",
    "nav.primary": "ניווט ראשי",
    "auth.title": "כניסה",
    "auth.subtitle": "גישה לזיכרון, למשימות, לפרויקטים ולהגדרות הסוכנים הפרטיים שלך.",
    "auth.email": "אימייל",
    "auth.password": "סיסמה",
    "auth.passwordPlaceholder": "הקלד/י סיסמה",
    "auth.signIn": "כניסה",
    "auth.signingIn": "נכנס",
    "auth.loginFailed": "הכניסה נכשלה",
    "auth.deploymentNote": "לקראת פריסה, הגדירו בסביבת השרת את BOOTSTRAP_USER_EMAIL, BOOTSTRAP_USER_PASSWORD, JWT_SECRET והגדרות הדומיין של העוגייה.",
    "auth.checkingSession": "בודק התחברות.",
    "auth.redirectingToLogin": "מעביר למסך הכניסה.",
    "auth.logout": "יציאה",
    "common.refresh": "רענון",
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
    "common.nothingHere": "אין כאן פריטים.",
    "common.nothingRecorded": "אין רשומות.",
    "dashboard.title": "לוח בקרה",
    "dashboard.subtitle": "תצוגת העבודה להיום: זיכרון שנקלט, משימות פתוחות, פרויקטים פעילים ועומס סקירה.",
    "dashboard.today": "היום",
    "dashboard.scheduledOrDue": "מתוזמנות או לתאריך יעד",
    "dashboard.overdue": "באיחור",
    "dashboard.needsAttention": "דורשות טיפול",
    "dashboard.review": "סקירה",
    "dashboard.pendingDecisions": "החלטות ממתינות",
    "dashboard.todayTasks": "משימות להיום",
    "dashboard.urgentTasks": "משימות דחופות",
    "dashboard.activeProjects": "פרויקטים פעילים",
    "dashboard.recentCaptures": "קליטות אחרונות",
    "dashboard.projectRisk": "סיכוני פרויקט",
    "dashboard.noRisk": "אין עדיין אותות סיכון.",
    "dashboard.loadError": "טעינת לוח הבקרה נכשלה",
    "inbox.title": "תיבת כניסה",
    "inbox.subtitle": "קודם שומרים הקשר גולמי; לאחר הנרמול נוצרים ישויות ומבנים.",
    "inbox.capturePanel": "קליטה",
    "inbox.placeholder": "Project: תוכנית מעבר\nTask: לבדוק הרשאות סוכנים מחר\nNote: עדיף סוכנים לקריאה בלבד כברירת מחדל",
    "inbox.resultPanel": "תוצאת נרמול",
    "inbox.emptyResult": "עדיין לא נשלחה קליטה.",
    "inbox.rawItem": "פריט גולמי",
    "inbox.detectedIntent": "כוונה שזוהתה: {intent}",
    "inbox.appliedReview": "הוחלו {applied}; פריטים לסקירה {review}",
    "inbox.captureFailed": "הקליטה נכשלה",
    "projects.title": "פרויקטים",
    "projects.subtitle": "הקשר לפי פרויקט, הרחבות סכמות, משימות, הערות, מסמכים וחבילות הקשר.",
    "projects.createPanel": "יצירת פרויקט",
    "projects.namePlaceholder": "שם פרויקט",
    "projects.activeList": "רשימה פעילה",
    "projects.empty": "אין עדיין פרויקטים.",
    "projects.loadError": "טעינת הפרויקטים נכשלה",
    "projectDetail.fallbackTitle": "פרויקט",
    "projectDetail.fallbackSubtitle": "הקשר פרויקט",
    "projectDetail.summary": "תקציר",
    "projectDetail.noGoal": "לא הוגדרה מטרה",
    "projectDetail.loading": "טוען פרויקט.",
    "projectDetail.contextPack": "חבילת הקשר",
    "projectDetail.noContextPack": "אין עדיין חבילת הקשר.",
    "projectDetail.tasks": "משימות",
    "projectDetail.noTasks": "אין משימות מקושרות.",
    "projectDetail.notes": "הערות",
    "projectDetail.documents": "מסמכים",
    "projectDetail.activity": "ציר פעילות",
    "projectDetail.nothingLinked": "אין פריטים מקושרים.",
    "projectDetail.loadError": "טעינת הפרויקט נכשלה",
    "tasks.title": "משימות",
    "tasks.subtitle": "עבודה פתוחה לפי תיבת כניסה, פרויקטים, תאריכי יעד, עדיפויות ופריטים שנוצרו על ידי סוכנים.",
    "tasks.createPanel": "יצירת משימה",
    "tasks.titlePlaceholder": "כותרת משימה",
    "tasks.filters": "מסננים",
    "tasks.anyStatus": "כל סטטוס",
    "tasks.anyPriority": "כל עדיפות",
    "tasks.anyProject": "כל פרויקט",
    "tasks.list": "רשימת משימות",
    "tasks.empty": "אין משימות מתאימות.",
    "notes.title": "הערות",
    "notes.subtitle": "הערות קנוניות שנוצרו ישירות או חולצו מקליטות גולמיות.",
    "notes.createPanel": "יצירת הערה",
    "notes.list": "הערות",
    "notes.empty": "אין עדיין הערות.",
    "documents.title": "מסמכים",
    "documents.subtitle": "מטא-דאטה של מסמכים, טקסט שחולץ וקישורים לפרויקטים.",
    "documents.attachPanel": "צירוף מסמך",
    "documents.objectKey": "מפתח אובייקט",
    "documents.mimeType": "סוג MIME",
    "documents.extractedText": "טקסט שחולץ",
    "documents.list": "מסמכים",
    "documents.empty": "אין מסמכים מצורפים.",
    "review.title": "תור סקירה",
    "review.subtitle": "הצעות נרמול עם ביטחון נמוך או סיכון מחכות לאישור.",
    "review.pending": "ממתין",
    "review.empty": "אין פריטי סקירה ממתינים.",
    "review.loadError": "טעינת תור הסקירה נכשלה",
    "search.title": "חיפוש",
    "search.subtitle": "מסננים מובנים יחד עם חיפוש טקסט מלא, עם שכבת chunks שמוכנה לחיפוש וקטורי.",
    "search.placeholder": "חיפוש בזיכרון",
    "search.anyType": "כל סוג",
    "search.noSummary": "אין תקציר",
    "search.empty": "אין תוצאות.",
    "agents.title": "סוכנים",
    "agents.subtitle": "ניהול טוקנים מוגבלים, פרטי חיבור MCP, הרצות אחרונות ואירועי ביקורת.",
    "agents.createToken": "יצירת טוקן",
    "agents.defaultName": "סוכן מקומי לקריאה וכתיבה",
    "agents.mcpConfiguration": "הגדרת MCP",
    "agents.tokens": "טוקנים",
    "agents.agentRuns": "הרצות סוכנים",
    "agents.auditEvents": "אירועי ביקורת",
    "schemas.title": "סכמות",
    "schemas.subtitle": "סוגי ישויות בסיסיים ונקודות הרחבה לשדות מותאמים לפי פרויקט.",
    "schemas.entityModel": "מודל ישויות",
    "schemas.entityDescription": "ישות כללית עם JSON קנוני ושדות מותאמים.",
    "schemas.openapi": "OpenAPI",
    "schemas.openapiUnavailable": "OpenAPI לא זמין.",
    "schemas.projectOverrides": "דריסות לפי פרויקט",
    "schemas.noOverrides": "לא הוגדרו דריסות סכמות לפי פרויקט.",
    "status.active": "פעיל",
    "status.paused": "מושהה",
    "status.completed": "הושלם",
    "status.archived": "בארכיון",
    "status.inbox": "תיבת כניסה",
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
    "source.web": "Web",
    "source.whatsapp": "WhatsApp",
    "source.openclaw": "OpenClaw",
    "source.codex": "Codex",
    "source.api": "API",
    "action.ingest": "קליטה",
    "action.create entity": "יצירת ישות",
    "action.update entity": "עדכון ישות",
    "action.task complete": "השלמת משימה",
    "action.mcp tool call": "קריאת כלי MCP",
    "action.token created": "יצירת טוקן",
    "action.review approve": "אישור סקירה",
    "action.review reject": "דחיית סקירה",
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
  }
} as const;

type TranslationKey = keyof typeof dictionaries.en;
type Replacements = Record<string, string | number>;

interface I18nContextValue {
  locale: Locale;
  direction: Direction;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, replacements?: Replacements) => string;
  translateValue: (group: "status" | "priority" | "entity" | "intent" | "source" | "action" | "reviewReason" | "actor", value?: string | null) => string;
  formatDate: (value?: string | null) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(localeStorageKey);
    if (stored === "he" || stored === "en") {
      setLocaleState(stored);
      return;
    }
    if (window.navigator.language.toLowerCase().startsWith("he")) {
      setLocaleState("he");
    }
  }, []);

  const direction: Direction = locale === "he" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    document.body.dir = direction;
  }, [direction, locale]);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = dictionaries[locale];

    function t(key: TranslationKey, replacements: Replacements = {}) {
      let text: string = dictionary[key] ?? dictionaries.en[key] ?? key;
      for (const [name, replacement] of Object.entries(replacements)) {
        text = text.replaceAll(`{${name}}`, String(replacement));
      }
      return text;
    }

    function translateValue(group: "status" | "priority" | "entity" | "intent" | "source" | "action" | "reviewReason" | "actor", value?: string | null) {
      if (!value) return "";
      const key = `${group}.${value}` as TranslationKey;
      return key in dictionary ? t(key) : humanize(value);
    }

    function formatDate(valueToFormat?: string | null) {
      if (!valueToFormat) return t("common.noDate");
      return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(valueToFormat));
    }

    return {
      locale,
      direction,
      t,
      translateValue,
      formatDate,
      setLocale(nextLocale: Locale) {
        window.localStorage.setItem(localeStorageKey, nextLocale);
        setLocaleState(nextLocale);
      }
    };
  }, [direction, locale]);

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
    <div className="language-switcher" aria-label={t("language.label")}>
      <button className={locale === "en" ? "language-button active" : "language-button"} type="button" onClick={() => setLocale("en")}>
        EN
      </button>
      <button className={locale === "he" ? "language-button active" : "language-button"} type="button" onClick={() => setLocale("he")}>
        עב
      </button>
    </div>
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
