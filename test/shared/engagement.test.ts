import { describe, expect, it } from "vitest";
import { ASSESSMENT_TEMPLATE, splitNumberedList } from "@shared/engagement";

describe("numbered questions in a task's detail", () => {
  it("splits the six pre-call questions into their opening line and six items", () => {
    const six = ASSESSMENT_TEMPLATE.dataRequests.find(item => item.title.startsWith("Six quick questions"))!;
    const list = splitNumberedList(six.detail)!;
    expect(list.intro).toBe("A few words each is enough.");
    expect(list.items).toHaveLength(6);
    expect(list.items[0]).toBe("What do you sell, and who buys it?");
    expect(list.items[5]).toBe("If you could fix one thing in three months, what would it be?");
  });

  it("works without an opening line and with items already on their own lines", () => {
    expect(splitNumberedList("1. Bank statements\n2. Price list")).toEqual({ intro: "", items: ["Bank statements", "Price list"] });
  });

  it("leaves ordinary text alone: no list, a single item, numbers out of order, or a number inside a sentence", () => {
    expect(splitNumberedList("Rent, salaries, stock, power, fuel and loan repayments. A rough list is fine.")).toBeNull();
    expect(splitNumberedList("Send this. 1. Only one thing")).toBeNull();
    expect(splitNumberedList("1. First 3. Third")).toBeNull();
    expect(splitNumberedList("Sales for the last 12 months. Month by month.")).toBeNull();
  });
});
