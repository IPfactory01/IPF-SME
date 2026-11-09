import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatNaira, PRICES } from "@shared/businessSupport";
import { priceLabel, PRODUCTS } from "@shared/products";
import { PLATFORM_PERMISSIONS, PLATFORM_ROLE_PERMISSIONS } from "@shared/platformPermissions";
import { ENGAGEMENT_TEAM_ROLE_LABELS } from "@shared/engagement";
import { AUDIT_ACTIONS } from "@server/audit";
import { appRouter } from "@server/routers";

/**
 * The product documents in docs/product describe the code. These checks fail when the code grows past them, so a new
 * page, table, price or role cannot ship undocumented.
 */
const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const DOCS = "docs/product";
const docs = readdirSync(resolve(process.cwd(), DOCS)).filter((name) => name.endsWith(".md"));

/** Every server source file, for the checks that read what the server does. */
const serverFiles = (dir = "server"): string[] => readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? serverFiles(`${dir}/${entry.name}`) : entry.name.endsWith(".ts") ? [`${dir}/${entry.name}`] : []));

/**
 * The fixed words of every email subject the server writes (`subject: "…"`, `const subject = …`, a plain or template
 * literal): the longest literal run of each, without its interpolations. A subject passed on (`message.subject`) is
 * checked where it is built.
 */
function emailSubjectWords() {
  const found = new Set<string>();
  for (const file of serverFiles()) {
    for (const match of read(file).matchAll(/(?:subject:|const subject =)\s*([^\n]+)/g)) {
      const literals = Array.from(match[1].matchAll(/`([^`]*)`|"([^"]*)"/g), (literal) => literal[1] ?? literal[2] ?? "");
      const runs = literals.flatMap((literal) => literal.split(/\$\{[^}]*\}/)).map((run) => run.replace(/^[\s:,.\[\]()]+|[\s:,.\[\]()]+$/g, ""));
      const longest = runs.filter((run) => /[a-z]{3}/i.test(run) && run.includes(" ") && !run.includes("${")).sort((a, b) => b.length - a.length)[0];
      if (longest && longest.length >= 8) found.add(longest);
    }
  }
  return [...found];
}

/**
 * The audit actions the server records: the action in every recordAudit call and every direct insert into the audit
 * table, including both arms of a conditional (`setup ? "a" : "b"`).
 */
function recordedAuditActions() {
  const found = new Set<string>();
  for (const file of serverFiles()) {
    const text = read(file);
    for (const call of text.matchAll(/recordAudit\(|insert\(adminAccessAuditEvents\)\.values\(/g)) {
      const end = text.indexOf("})", call.index);
      const action = text.slice(call.index, end < 0 ? undefined : end).match(/action:\s*(?:[^,"\n]*\?\s*)?"([a-z_]+)"(?:\s*:\s*"([a-z_]+)")?/);
      if (action) { found.add(action[1]); if (action[2]) found.add(action[2]); }
    }
  }
  return [...found];
}

describe("product documents", () => {
  it("has the product documents and an index that links each one", () => {
    const expected = ["01-prd.md", "02-technical-requirements.md", "03-app-flow.md", "04-design-brief.md", "05-backend-schema.md", "06-implementation-plan.md", "09-coverage-matrix.md"];
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

  it("states the prices the code charges, and every product on the menu with its price", () => {
    const prd = read(`${DOCS}/01-prd.md`);
    for (const amount of Object.values(PRICES)) expect(prd).toContain(formatNaira(amount));
    for (const product of PRODUCTS) {
      expect(prd, product.id).toContain(product.name);
      expect(prd, product.id).toContain(priceLabel(product.price));
    }
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

  it("lists every server action in the coverage matrix", () => {
    const matrix = read(`${DOCS}/09-coverage-matrix.md`);
    const procedures = Object.keys((appRouter as unknown as { _def: { procedures: Record<string, unknown> } })._def.procedures);
    expect(procedures.length).toBeGreaterThan(100);
    // An engagement action may be written without its "engagement." prefix (`staff.assign`).
    const missing = procedures.filter((name) => !matrix.includes(`\`${name}\``) && !(name.startsWith("engagement.") && matrix.includes(`\`${name.slice("engagement.".length)}\``)));
    expect(missing, "add a row (or the name to a row) in docs/product/09-coverage-matrix.md").toEqual([]);
  });

  it("names every platform permission and every project role in the app flow", () => {
    const flow = read(`${DOCS}/03-app-flow.md`);
    expect(PLATFORM_PERMISSIONS.filter((permission) => !flow.includes(`\`${permission}\``))).toEqual([]);
    expect(Object.values(ENGAGEMENT_TEAM_ROLE_LABELS).filter((label) => !flow.includes(label))).toEqual([]);
  });

  it("lists every email the server sends in the app flow", () => {
    const flow = read(`${DOCS}/03-app-flow.md`).toLowerCase();
    const subjects = emailSubjectWords();
    expect(subjects.length).toBeGreaterThan(15);
    expect(subjects.filter((words) => !flow.includes(words.toLowerCase())), "add the email to section 6 of docs/product/03-app-flow.md").toEqual([]);
  });

  it("records only the audit actions it declares, and documents each in the backend schema", () => {
    const declared = new Set<string>(AUDIT_ACTIONS);
    expect(recordedAuditActions().filter((action) => !declared.has(action)), "add the action to AUDIT_ACTIONS in server/audit.ts").toEqual([]);
    const schema = read(`${DOCS}/05-backend-schema.md`);
    expect(AUDIT_ACTIONS.filter((action) => !schema.includes(`\`${action}\``)), "add the action to the audit table in docs/product/05-backend-schema.md").toEqual([]);
  });

  it("is where AGENTS.md sends every agent before a product change", () => {
    expect(read("AGENTS.md")).toContain("docs/product/");
  });
});
