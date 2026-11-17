-- The Shift: read MCS's current Work Plan, Sessions and Content board (read only; changes nothing).
-- Paste the whole script into the Supabase SQL Editor and press Run. It returns one cell of text:
-- copy that cell and paste it back to Claude, which builds the import of the engagement manager's plan from it.
-- It reads only the Digital Marketing engagement of the business whose name contains "Crown".
-- It holds no passwords, keys or contact details: titles, dates, statuses and who each item is for.

with mcs as (
  select e.id, e."startedOn", b.name as business
  from engagements e join businesses b on b.id = e."businessId"
  where b.name ilike '%crown%' and e.type = 'digital_marketing'
  order by e.id desc limit 1
)
select json_build_object(
  'engagement', (select json_build_object('id', id, 'startedOn', "startedOn", 'business', business) from mcs),
  'team', (select coalesce(json_agg(json_build_object('userId', t."userId", 'role', t.role, 'name', u.name) order by t."userId"), '[]')
           from engagement_team t join users u on u.id = t."userId" where t."engagementId" = (select id from mcs)),
  'tasks', (select coalesce(json_agg(json_build_object(
              'id', k.id, 'ref', k.ref, 'title', k.title, 'side', k.side, 'kind', k.kind, 'status', k.status,
              'dueOn', k."dueOn", 'week', k."weekNumber", 'order', k."sortOrder", 'section', k.section,
              'work', k.work, 'assignee', k."assigneeUserId", 'reviewer', k."reviewerUserId",
              'files', (select count(*) from engagement_files f where f."taskId" = k.id),
              'messages', (select count(*) from engagement_task_comments c where c."taskId" = k.id)
            ) order by k."weekNumber" nulls last, k."sortOrder", k.id), '[]')
            from engagement_tasks k where k."engagementId" = (select id from mcs)),
  'sessions', (select coalesce(json_agg(json_build_object('id', s.id, 'kind', s.kind, 'title', s.title, 'status', s.status,
               'week', s."weekNumber", 'scheduledFor', s."scheduledFor", 'booked', s."meetingLink" is not null) order by s."weekNumber", s.id), '[]')
               from engagement_sessions s where s."engagementId" = (select id from mcs)),
  'content', (select coalesce(json_agg(json_build_object('id', c.id, 'kind', c.kind, 'title', c.title, 'month', c.month,
              'status', c.status, 'dueOn', c."dueOn") order by c.month, c."sortOrder", c.id), '[]')
              from engagement_content_items c where c."engagementId" = (select id from mcs))
)::text as mcs_plan;
