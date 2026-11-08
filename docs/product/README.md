# Product documents

The eight documents that describe The Shift, by IP Factory. They are the shared source for the founders, the desk, the
developers and every coding agent. Read the one you need before changing the product; update it in the same change when
the product changes.

| # | Document | What it covers | Read it when |
|---|---|---|---|
| 1 | [Product requirements (PRD)](01-prd.md) | The problem, the users and their jobs, the journey, the products, requirements by stage with priority and status, measures, risks, open decisions | Deciding what to build or change |
| 2 | [Technical requirements](02-technical-requirements.md) | Stack, hosting, database, configuration, integrations, security, AI use, testing | Choosing how to build |
| 3 | [App flow](03-app-flow.md) | Who arrives where, the two front doors, payment terms, every journey as a service blueprint, status models, emails, exceptions; then the pages, the admin console and the room | Changing a screen or a step |
| 4 | [Design brief](04-design-brief.md) | Brand, colours, fonts, components, motion, words, email and PDF look | Building or changing anything people see |
| 5 | [Backend schema](05-backend-schema.md) | Where client data lives, who can see it, the planned engagement layer, findings to fix | Touching data, permissions or access |
| 6 | [Implementation plan](06-implementation-plan.md) | What gets built next, in what order, with acceptance criteria | Planning the next piece of work |
| 7 | [Engagement room brief](07-engagement-room-brief.md) | The objective of the client's room, the five moments, what is on the page, the chain from Discovery Call to work plan | Changing anything the owner sees in their room |
| 8 | [Decision log](08-decision-log.md) | Every decision with who took it and when, and where we depart from the concept note | Asking why something is the way it is |

**Sources:** *Business Support Concept Note and Launch Blueprint v0.8.1* (6 October 2026), the decisions taken while
building (decision log), and the code itself, checked on 9 October 2026.

**Keeping them true:** `test/docs/productDocs.test.ts` fails if a page route or a database table is added without being
documented, or if a document link breaks. Older notes in `docs/ipf-factory/` are history: they describe the move from
JUMP and the Manus launch.
