import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatNaira, PRICES } from "@shared/businessSupport";
import { PLATFORM_PERMISSIONS, PLATFORM_ROLE_PERMISSIONS } from "@shared/platformPermissions";

/**
 * The product documents in docs/product describe the code. These checks fail when the code grows past them, so a new
 * page, table, price or role cannot ship undocumented.
 */
const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const DOCS = "docs/product";
const docs = readdirSync(resolve(process.cwd(), DOCS)).filter((name) => name.endsWith(".md"));

describe("product documents", () => {
  it("has the six documents and an index that links each one", () => {
    const expected = ["01-prd.md", "02-technical-requirements.md", "03-app-flow.md", "04-design-brief.md", "05-backend-schema.md", "06-implementation-plan.md"];
    for (const name of expected) expect(docs, name).toContain(name);
    const index = read(`${DOCS}/README.md`);
    for (const name of expected) expect(index, name).toContain(`](${name})`);
  });

  it("documents every page route in the app flow", () => {
    const routes = Array.from(read("client/src/App.tsx").matchAll(/<Route path="([^"]+)"/g), (match) => match[1]);
    expect(routes.length).toBeGreaterThan(10);
    const flow = read(`${DOCS}/03-app-flow.md`);
    for (const route of routes) expect(flow, route).toContain(`\`${route}\``);
  });

  it("documents every database table in the backend schema", () => {
    const tables = Array.from(read("drizzle/schema.ts").matchAll(/pgTable\(\s*"([^"]+)"/g), (match) => match[1]);
    expect(tables.length).toBeGreaterThan(30);
    const schema = read(`${DOCS}/05-backend-schema.md`);
    for (const table of tables) expect(schema, table).toContain(`\`${table}\``);
  });

  it("states the prices the code charges", () => {
    const prd = read(`${DOCS}/01-prd.md`);
    for (const amount of [PRICES.fullReport, PRICES.currentState, PRICES.fix, PRICES.standardEngagementCap]) expect(prd).toContain(formatNaira(amount));
  });

  it("lists each role's permissions as the code grants them", () => {
    const schema = read(`${DOCS}/05-backend-schema.md`);
    for (const [role, permissions] of Object.entries(PLATFORM_ROLE_PERMISSIONS)) {
      const row = schema.split("\n").find((line) => line.startsWith(`| ${role} |`));
      expect(row, role).toBeTruthy();
      if (permissions.length === PLATFORM_PERMISSIONS.length) expect(row).toMatch(/Everything/);
      else if (!permissions.length) expect(row).toMatch(/Nothing/);
      else for (const permission of permissions) expect(row, `${role}: ${permission}`).toContain(permission);
    }
  });

  it("has no broken links between documents or to files in the repository", () => {
    for (const name of docs) {
      const text = read(`${DOCS}/${name}`);
      for (const [, target] of Array.from(text.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g))) {
        if (/^https?:|^mailto:/.test(target)) continue;
        expect(existsSync(resolve(process.cwd(), DOCS, target)) || existsSync(resolve(dirname(resolve(process.cwd(), DOCS, name)), target)), `${name} → ${target}`).toBe(true);
      }
    }
  });

  it("is where AGENTS.md sends every agent before a product change", () => {
    expect(read("AGENTS.md")).toContain("docs/product/");
  });
});
