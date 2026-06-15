import type { AppContext } from "./types.js";

export async function getDashboard(context: AppContext) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const [todayTasks, overdueTasks, urgentTasks, activeProjects, recentItems, reviewCount] = await Promise.all([
    context.pool.query(
      `select * from tasks
       where workspace_id = $1 and status not in ('done', 'cancelled')
       and (due_at between $2 and $3 or scheduled_for between $2 and $3)
       order by coalesce(due_at, scheduled_for), priority desc
       limit 25`,
      [context.workspaceId, startOfDay, endOfDay]
    ),
    context.pool.query(
      `select * from tasks
       where workspace_id = $1 and status not in ('done', 'cancelled') and due_at < $2
       order by due_at asc
       limit 25`,
      [context.workspaceId, now]
    ),
    context.pool.query(
      `select * from tasks
       where workspace_id = $1 and status not in ('done', 'cancelled') and priority = 'urgent'
       order by due_at nulls last, updated_at desc
       limit 25`,
      [context.workspaceId]
    ),
    context.pool.query(
      `select * from projects
       where workspace_id = $1 and status = 'active'
       order by priority desc, updated_at desc
       limit 25`,
      [context.workspaceId]
    ),
    context.pool.query(
      `select id, source_type, raw_text, created_at from raw_items
       where workspace_id = $1
       order by created_at desc
       limit 10`,
      [context.workspaceId]
    ),
    context.pool.query(
      `select count(*)::int as count from review_queue
       where workspace_id = $1 and status = 'pending'`,
      [context.workspaceId]
    )
  ]);

  return {
    todayTasks: todayTasks.rows,
    overdueTasks: overdueTasks.rows,
    urgentTasks: urgentTasks.rows,
    activeProjects: activeProjects.rows,
    projectRisk: [],
    recentCapturedItems: recentItems.rows,
    reviewQueueCount: reviewCount.rows[0]?.count ?? 0
  };
}
