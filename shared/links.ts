/** A link that opens one item in the team's workspace (R89): the engagement, its Work Plan, and the item's panel. */
export const taskLink = (origin: string, engagementId: number, taskId: number) => `${origin}/admin?engagement=${engagementId}&task=${taskId}`;

/** Reads such a link back on arrival. */
export function taskFromLink(search: string) {
  const params = new URLSearchParams(search);
  const engagementId = Number(params.get("engagement"));
  const taskId = Number(params.get("task"));
  return Number.isInteger(engagementId) && engagementId > 0 ? { engagementId, taskId: Number.isInteger(taskId) && taskId > 0 ? taskId : null } : null;
}
