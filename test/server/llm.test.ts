import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/_core/env", () => ({ ENV: { forgeApiKey: "test-key", forgeApiUrl: "" } }));

const { invokeLLM } = await import("@server/_core/llm");

const messages = [{ role: "user" as const, content: "Hello" }];
const reply = (text: string) => new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: text } }] }), { status: 200, headers: { "content-type": "application/json" } });
const failure = () => new Response("busy", { status: 503 });

describe("the AI client's time budget", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries a failed request and returns the reply that follows", async () => {
    fetchMock.mockResolvedValueOnce(failure()).mockResolvedValueOnce(reply("Second time lucky"));
    const result = await invokeLLM({ messages });
    expect(result.choices[0].message.content).toBe("Second time lucky");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops retrying the moment the caller's signal fires, instead of backing off for up to two minutes", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      setTimeout(() => controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError")), 5);
      return failure();
    });
    const started = Date.now();
    await expect(invokeLLM({ messages, signal: controller.signal })).rejects.toMatchObject({ name: "TimeoutError" });
    expect(Date.now() - started).toBeLessThan(250);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes the signal to the request itself and sends nothing once it has already fired", async () => {
    fetchMock.mockResolvedValue(reply("unused"));
    const live = new AbortController();
    await invokeLLM({ messages, signal: live.signal });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: live.signal });

    const done = new AbortController();
    done.abort();
    fetchMock.mockClear();
    await expect(invokeLLM({ messages, signal: done.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
