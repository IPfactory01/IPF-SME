/**
 * Tagging a colleague in an item's messages (R86): "@Kemi" or "@Kemi Producer" names a person on the engagement. Read
 * from the text as written, so nothing new is stored; whoever is named is emailed and sees it on their Today.
 */
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The people a message names, among those given (each once). A first name counts only when no one else shares it. */
export function mentionedIn<T extends { userId: number; name: string }>(body: string, people: readonly T[]): T[] {
  const firstOf = (name: string) => name.trim().split(/\s+/)[0] ?? "";
  return people.filter(person => {
    const name = person.name.trim();
    if (!name) return false;
    const full = new RegExp(`(^|\\s)@${escape(name)}(?![\\p{L}\\p{N}])`, "iu");
    if (full.test(body)) return true;
    const first = firstOf(name);
    const shared = people.filter(other => firstOf(other.name).toLowerCase() === first.toLowerCase()).length > 1;
    return !shared && new RegExp(`(^|\\s)@${escape(first)}(?![\\p{L}\\p{N}])`, "iu").test(body);
  });
}
