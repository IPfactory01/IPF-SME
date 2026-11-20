/**
 * Respondent-facing guidance for the approved Pulse question bank.
 *
 * This catalogue is deliberately separate from question IDs, options, gates and
 * scoring. It explains terms in plain language without directing respondents
 * toward a particular answer. The server projects it alongside the approved
 * question text; no scoring mechanics are exposed to the browser.
 */
export type QuestionGuidance = {
  plainLanguage: string;
  example: string;
};

export const QUESTION_GUIDANCE: Record<string, QuestionGuidance> = {
  "S-01": {
    plainLanguage: "Think about the specific business issue your organisation hopes AI or a better way of working could address.",
    example: "For example, reducing delays in responding to customers, cutting repeated data entry, or improving the quality of management reporting.",
  },
  "S-02": {
    plainLanguage: "Consider whether someone has both responsibility for this work and enough authority to make decisions or secure support.",
    example: "For example, a director who can approve priorities and remove obstacles, rather than only an interested employee.",
  },
  "S-03": {
    plainLanguage: "Think about how your organisation decides which improvement ideas deserve attention and budget first.",
    example: "For example, whether ideas are chosen case by case, or compared using agreed criteria such as urgency, customer impact or operational risk.",
  },
  "P-01": {
    plainLanguage: "A workflow is the repeatable set of steps people follow to complete an important task.",
    example: "For example, the steps for onboarding a client, processing an order, approving an expense, or preparing a monthly report.",
  },
  "P-02": {
    plainLanguage: "Think about whether people know who does each step, who approves it, how work moves between teams, and what happens when something unusual occurs.",
    example: "For example, when a customer request needs approval, is it clear who approves it and what staff should do if information is missing?",
  },
  "P-03": {
    plainLanguage: "Consider whether you use evidence to understand how a workflow is performing, rather than relying only on impressions.",
    example: "For example, tracking how long invoices take to process, how many applications are returned for correction, or how often an order is delayed.",
  },
  "D-01": {
    plainLanguage: "Think about whether the information people need for important work is available digitally and can be found when needed.",
    example: "For example, customer records, transaction details or approval documents may sit in a system, spreadsheet, email inbox or paper file.",
  },
  "D-02": {
    plainLanguage: "Data quality means whether information is accurate, complete, current and consistent enough to rely on.",
    example: "For example, checking for duplicate customer records, missing contact details, incorrect dates or conflicting figures between reports.",
  },
  "D-03": {
    plainLanguage: "Consider the rules that determine who may use information, who can access it, how long it is kept and when it may be shared.",
    example: "For example, restricting staff access to payroll records or setting rules before customer information is shared with an external provider.",
  },
  "T-01": {
    plainLanguage: "Think about whether the tools your team uses work together for important day-to-day tasks without people repeatedly copying, retyping or manually transferring information.",
    example: "For example, moving a customer’s details from a sales enquiry into onboarding, invoicing or reporting without entering the same information again.",
  },
  "T-02": {
    plainLanguage: "Consider the basic safeguards that protect systems and information, and whether they are reviewed when something goes wrong.",
    example: "For example, controlling passwords and user access, keeping backups, responding to a lost device, or checking lessons after an incident.",
  },
  "T-03": {
    plainLanguage: "Think about how the organisation decides which AI and automation tools may be used, how they are set up, and how their use is overseen.",
    example: "For example, approving a generative-AI tool before staff use it with work information and reviewing who has access to it.",
  },
  "PE-01": {
    plainLanguage: "Consider whether employees have the confidence, practical skills and support to use the approved tools that matter in their roles.",
    example: "For example, a team can use a new reporting or AI-assisted tool safely because it has received relevant training and can ask for help.",
  },
  "PE-02": {
    plainLanguage: "Think about whether the people responsible for introducing a change, training colleagues and supporting teams are clearly identified.",
    example: "For example, a manager owns adoption, a subject-matter expert trains users, and staff know where to raise concerns.",
  },
  "PE-03": {
    plainLanguage: "Consider how you find out whether people are using a new process or tool as intended and where they are creating workarounds.",
    example: "For example, checking user feedback, support requests, adoption data or the unofficial spreadsheets people create to get work done.",
  },
  "G-01": {
    plainLanguage: "Think about the organisation-wide rules that explain what employees may and may not do with AI for work.",
    example: "For example, whether staff know not to put confidential client information into public AI tools without approval.",
  },
  "G-02": {
    plainLanguage: "Consider when a person must review AI-assisted work and who remains responsible for the final decision or output.",
    example: "For example, an employee checks an AI-drafted customer response before it is sent and knows who is accountable for its accuracy.",
  },
  "G-03": {
    plainLanguage: "Think about whether the organisation keeps a clear record of important AI uses, problems, exceptions and changes, and knows when to escalate them.",
    example: "For example, recording an AI tool that produced an incorrect output and escalating the issue when it affected a customer or control.",
  },
  "O-01": {
    plainLanguage: "Think about tasks that follow repeatable rules and use staff time repeatedly, rather than occasional one-off work.",
    example: "For example, copying information into systems, checking standard documents, sending routine updates or reconciling recurring records.",
  },
  "O-02": {
    plainLanguage: "Consider how often staff move the same information manually between files, emails, spreadsheets and separate systems.",
    example: "For example, downloading a spreadsheet, emailing it for approval and then typing the approved figures into another system.",
  },
  "O-03": {
    plainLanguage: "Think about recurring information work that takes time even when the content or task is similar each time.",
    example: "For example, searching for a policy, classifying incoming requests, drafting standard correspondence or summarising meeting notes.",
  },
  "O-04": {
    plainLanguage: "Consider whether employees are using AI tools that the organisation has not formally approved for work.",
    example: "For example, staff using personal accounts on public chatbots to help write documents or analyse work information.",
  },
  "O-05": {
    plainLanguage: "Think about any AI or automation trials already under way and how far they have progressed.",
    example: "For example, a pilot that is only being explored, one being tested by a small team, or one already used in a live business process.",
  },
  "O-06": {
    plainLanguage: "Consider whether there is a regular process where you can see the scale of the work and evidence of delay, error, rework or weak control.",
    example: "For example, a monthly reconciliation with a known backlog, repeated corrections or a measurable approval delay.",
  },
};

