import { describe, expect, it } from "vitest";
import { taskFromLink, taskLink } from "@shared/links";

/** An email's link opens the exact item (R89). */
describe("a link to one item", () => {
  it("writes and reads the engagement and the item", () => {
    const link = taskLink("https://ipfactory.example.test", 4, 51);
    expect(link).toBe("https://ipfactory.example.test/admin?engagement=4&task=51");
    expect(taskFromLink(new URL(link).search)).toEqual({ engagementId: 4, taskId: 51 });
    expect(taskFromLink("?engagement=4")).toEqual({ engagementId: 4, taskId: null });
    expect(taskFromLink("?engagement=nope&task=2")).toBeNull();
    expect(taskFromLink("")).toBeNull();
  });
});
