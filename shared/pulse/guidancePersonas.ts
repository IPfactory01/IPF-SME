/**
 * Persona-tailored variants for Pulse question guidance.
 *
 * Extends shared/pulseQuestionGuidance.ts without replacing it: the canonical
 * plain-language explanation is preserved for every question, and this
 * catalogue supplies optional industry-specific example variants plus a
 * staff-size framing clause. A respondent's displayed guidance is resolved
 * deterministically from (questionId, industry, staffSize); identical
 * respondents always see identical guidance, and scoring is never affected.
 *
 * Content rules:
 *  - Variants illustrate the question; they never steer toward an answer.
 *  - The canonical plain-language meaning is preserved — variants may add an
 *    industry concrete example or a size-framing clause, never change scope.
 *  - Any gap falls back to the generic QUESTION_GUIDANCE entry; a missing
 *    variant can never leave a question without guidance.
 *
 * Industry ids mirror shared/assessmentContent.ts INDUSTRIES. Staff size ids
 * mirror STAFF_COUNT_OPTIONS (micro / small / medium / large).
 */

export type IndustryId =
  | "retail"
  | "professional"
  | "manufacturing"
  | "distribution"
  | "hospitality"
  | "food_agriculture"
  | "health"
  | "education"
  | "other";

export type StaffSizeId = "micro" | "small" | "medium" | "large";

export type PersonaVariant = {
  /** Optional industry-specific example replacing the generic example. */
  example?: string;
};

/** Optional size-framing clause appended to the explanation. */
export const STAFF_SIZE_FRAMING: Record<StaffSizeId, string> = {
  micro:
    "In a small team where people often wear several hats, think about how the work actually moves between the few of you rather than what an organisation chart suggests.",
  small:
    "Think about how the work moves between your colleagues, keeping in mind that in a team of this size some steps may still live informally with particular people.",
  medium:
    "Think about how work moves between your departments, where defined roles mean handoffs and approvals matter more than in a small team.",
  large:
    "Think about how work moves between your departments and divisions, where documented handoffs and approvals are essential for consistency across many teams.",
};

type IndustryExamples = Record<string, PersonaVariant>;

/**
 * Industry example variants per question. `industrySpecific` holds the example
 * text keyed by industry id; `other` falls back to the generic example.
 */
export const PERSONA_EXAMPLES: Record<string, IndustryExamples> = {
  "S-01": {
    retail: {
      example:
        "For example, reducing delays in responding to customers on the shop floor, cutting repeated stock-taking entries, or improving daily sales reporting.",
    },
    professional: {
      example:
        "For example, reducing time spent preparing client documents, cutting repeated data entry between engagements, or improving the quality of client reporting.",
    },
    manufacturing: {
      example:
        "For example, reducing delays on the production line, cutting repeated quality-check entries, or improving the accuracy of production reporting.",
    },
    distribution: {
      example:
        "For example, reducing delays in dispatching orders, cutting repeated delivery documentation, or improving the visibility of stock in transit.",
    },
    hospitality: {
      example:
        "For example, reducing delays in responding to guest requests, cutting repeated reservation updates, or improving daily occupancy reporting.",
    },
    health: {
      example:
        "For example, reducing delays in patient follow-up, cutting repeated record entry, or improving the quality of daily clinical or administrative reporting.",
    },
    education: {
      example:
        "For example, reducing delays in responding to students or parents, cutting repeated enrolment data entry, or improving progress reporting.",
    },
    food_agriculture: {
      example:
        "For example, reducing delays in moving produce to market, cutting repeated harvest record-keeping, or improving yield and cost reporting.",
    },
    other: {
      example:
        "For example, reducing delays in responding to customers, cutting repeated data entry, or improving the quality of management reporting.",
    },
  },
  "S-02": {
    retail: {
      example:
        "For example, the owner or store manager who can approve priorities such as a new till system and remove obstacles, rather than only an interested sales assistant.",
    },
    professional: {
      example:
        "For example, a partner or practice lead who can approve priorities such as a new document workflow and remove obstacles, rather than only an interested associate.",
    },
    manufacturing: {
      example:
        "For example, a plant or operations manager who can approve priorities such as a new scheduling process and remove obstacles, rather than only an interested technician.",
    },
    distribution: {
      example:
        "For example, an operations director who can approve priorities such as a new dispatch system and remove obstacles, rather than only an interested logistics officer.",
    },
    hospitality: {
      example:
        "For example, the owner or general manager who can approve priorities such as a new booking or staffing process and remove obstacles, rather than only an interested front-desk staff member.",
    },
    health: {
      example:
        "For example, a medical director or facility manager who can approve priorities and remove obstacles, rather than only an interested clinician or administrator.",
    },
    education: {
      example:
        "For example, the principal or academic lead who can approve priorities and remove obstacles, rather than only an interested teacher or administrator.",
    },
    food_agriculture: {
      example:
        "For example, the farm or operations manager who can approve priorities such as a new record-keeping approach and remove obstacles, rather than only an interested worker.",
    },
    other: {
      example:
        "For example, a director who can approve priorities and remove obstacles, rather than only an interested employee.",
    },
  },
  "S-03": {
    retail: {
      example:
        "For example, whether spending on a new point-of-sale system or supplier relationship is decided case by case, or compared using agreed criteria such as urgency, customer impact or operational risk.",
    },
    professional: {
      example:
        "For example, whether investment in a new client tool or internal process is decided case by case, or compared using agreed criteria such as urgency, client impact or delivery risk.",
    },
    manufacturing: {
      example:
        "For example, whether investment in equipment or process changes is decided case by case, or compared using agreed criteria such as urgency, throughput impact or safety risk.",
    },
    distribution: {
      example:
        "For example, whether investment in vehicles, warehousing or routing tools is decided case by case, or compared using agreed criteria such as urgency, delivery impact or cost risk.",
    },
    hospitality: {
      example:
        "For example, whether spending on a booking system or kitchen process is decided case by case, or compared using agreed criteria such as urgency, guest impact or operational risk.",
    },
    health: {
      example:
        "For example, whether investment in patient records or equipment is decided case by case, or compared using agreed criteria such as urgency, patient impact or compliance risk.",
    },
    education: {
      example:
        "For example, whether investment in learning tools or administration is decided case by case, or compared using agreed criteria such as urgency, student impact or operational risk.",
    },
    food_agriculture: {
      example:
        "For example, whether investment in irrigation, machinery or market channels is decided case by case, or compared using agreed criteria such as urgency, yield impact or climate risk.",
    },
    other: {
      example:
        "For example, whether ideas are chosen case by case, or compared using agreed criteria such as urgency, customer impact or operational risk.",
    },
  },
  "P-01": {
    retail: {
      example:
        "For example, the steps for opening the shop each day, receiving a supplier delivery, handling a customer return, or closing the tills at night.",
    },
    professional: {
      example:
        "For example, the steps for onboarding a new client, preparing an engagement deliverable, reviewing a billable hour, or closing a completed file.",
    },
    manufacturing: {
      example:
        "For example, the steps for scheduling a production run, quality-checking an item, handling a machine breakdown, or dispatching finished goods.",
    },
    distribution: {
      example:
        "For example, the steps for receiving stock, picking an order, loading a vehicle, or reconciling deliveries with what was dispatched.",
    },
    hospitality: {
      example:
        "For example, the steps for checking a guest in, turning over a room, preparing a shift handover, or reconciling the day's takings.",
    },
    health: {
      example:
        "For example, the steps for registering a patient, moving them between appointments, handling a test result, or discharging them safely.",
    },
    education: {
      example:
        "For example, the steps for admitting a student, preparing a class timetable, marking assessments, or issuing a certificate.",
    },
    food_agriculture: {
      example:
        "For example, the steps for preparing a planting bed, applying inputs, harvesting a batch, or transporting produce to a buyer.",
    },
    other: {
      example:
        "For example, the steps for onboarding a client, processing an order, approving an expense, or preparing a monthly report.",
    },
  },
  "P-02": {
    retail: {
      example:
        "For example, when a refund needs manager approval, is it clear who approves it and what a sales assistant should do if a receipt is missing?",
    },
    professional: {
      example:
        "For example, when a client document needs a sign-off, is it clear who reviews it and what an associate should do if required information is missing?",
    },
    manufacturing: {
      example:
        "For example, when a quality issue is found on the line, is it clear who stops production and what an operator should do if the cause is unknown?",
    },
    distribution: {
      example:
        "For example, when a delivery address looks wrong, is it clear who authorises the correction and what the driver should do if no one is reachable?",
    },
    hospitality: {
      example:
        "For example, when a guest complaint needs compensation, is it clear who approves it and what front-desk staff should do if the guest is upset?",
    },
    health: {
      example:
        "For example, when a test result is abnormal, is it clear who must be notified and what a clinician should do if the patient cannot be reached?",
    },
    education: {
      example:
        "For example, when a student raises a grievance, is it clear who handles it and what a teacher should do if it involves another staff member?",
    },
    food_agriculture: {
      example:
        "For example, when a batch fails inspection, is it clear who decides what happens to it and what a worker should do if the buyer rejects part of the load?",
    },
    other: {
      example:
        "For example, when a customer request needs approval, is it clear who approves it and what staff should do if information is missing?",
    },
  },
  "P-03": {
    retail: {
      example:
        "For example, tracking how long refunds take to process, how many stock counts disagree with records, or how often a till does not balance.",
    },
    professional: {
      example:
        "For example, tracking how long proposals take to produce, how many invoices are disputed, or how often deadlines are missed.",
    },
    manufacturing: {
      example:
        "For example, tracking how long a production run takes, how many items fail quality checks, or how often machines are unexpectedly down.",
    },
    distribution: {
      example:
        "For example, tracking how long orders take from placement to delivery, how many items are damaged in transit, or how often deliveries are returned for correction.",
    },
    hospitality: {
      example:
        "For example, tracking how long check-ins take, how many reservations are double-booked, or how often a table is held longer than needed.",
    },
    health: {
      example:
        "For example, tracking how long appointments run behind schedule, how many records are incomplete, or how often a follow-up is missed.",
    },
    education: {
      example:
        "For example, tracking how long admission applications take, how many records are returned for correction, or how often classes run short-staffed.",
    },
    food_agriculture: {
      example:
        "For example, tracking how long harvests take to reach market, how many batches are rejected, or how often deliveries are delayed.",
    },
    other: {
      example:
        "For example, tracking how long invoices take to process, how many applications are returned for correction, or how often an order is delayed.",
    },
  },
  "D-01": {
    retail: {
      example:
        "For example, supplier price lists, customer loyalty details or stock records may sit in a system, spreadsheet, email inbox or paper notebook.",
    },
    professional: {
      example:
        "For example, client files, engagement documents or billing records may sit in a practice system, shared drive, email inbox or paper folder.",
    },
    manufacturing: {
      example:
        "For example, supplier specifications, quality records or production schedules may sit in a system, spreadsheet, email inbox or paper file.",
    },
    distribution: {
      example:
        "For example, customer delivery records, stock locations or invoicing details may sit in a system, spreadsheet, email inbox or paper logbook.",
    },
    hospitality: {
      example:
        "For example, guest reservations, supplier menus or staff rotas may sit in a booking system, spreadsheet, email inbox or paper sheet.",
    },
    health: {
      example:
        "For example, patient records, test results or appointment details may sit in a clinic system, spreadsheet, email inbox or paper file.",
    },
    education: {
      example:
        "For example, student records, enrolment forms or assessment results may sit in a school system, spreadsheet, email inbox or paper file.",
    },
    food_agriculture: {
      example:
        "For example, land records, input purchases or sales receipts may sit in a system, notebook, spreadsheet or paper receipt file.",
    },
    other: {
      example:
        "For example, customer records, transaction details or approval documents may sit in a system, spreadsheet, email inbox or paper file.",
    },
  },
  "D-02": {
    retail: {
      example:
        "For example, checking for duplicate customer loyalty entries, missing supplier contact details, incorrect prices or stock figures that disagree between records.",
    },
    professional: {
      example:
        "For example, checking for duplicate client records, missing contact details, incorrect billing dates or fee figures that disagree between documents.",
    },
    manufacturing: {
      example:
        "For example, checking for duplicate supplier entries, missing specification documents, incorrect quantities or production figures that disagree between reports.",
    },
    distribution: {
      example:
        "For example, checking for duplicate customer addresses, missing delivery details, incorrect quantities or stock figures that disagree between warehouses.",
    },
    hospitality: {
      example:
        "For example, checking for duplicate guest profiles, missing contact details, incorrect rates or room availability that disagrees between systems.",
    },
    health: {
      example:
        "For example, checking for duplicate patient records, missing contact details, incorrect dates of birth or test results that disagree between visits.",
    },
    education: {
      example:
        "For example, checking for duplicate student records, missing guardian contacts, incorrect dates or grades that disagree between registers.",
    },
    food_agriculture: {
      example:
        "For example, checking for duplicate buyer records, missing input delivery details, incorrect weights or sales figures that disagree between notebooks.",
    },
    other: {
      example:
        "For example, checking for duplicate customer records, missing contact details, incorrect dates or conflicting figures between reports.",
    },
  },
  "D-03": {
    retail: {
      example:
        "For example, restricting staff access to takings records or setting rules before customer contact details are shared with a delivery partner.",
    },
    professional: {
      example:
        "For example, restricting staff access to client files or setting rules before client information is shared with an external provider.",
    },
    manufacturing: {
      example:
        "For example, restricting staff access to pricing or supplier contracts, or setting rules before technical specifications are shared with an external vendor.",
    },
    distribution: {
      example:
        "For example, restricting staff access to customer pricing or setting rules before delivery information is shared with a subcontracted transporter.",
    },
    hospitality: {
      example:
        "For example, restricting staff access to guest payment details or setting rules before guest information is shared with a tour operator.",
    },
    health: {
      example:
        "For example, restricting staff access to patient records to those who need them, or setting rules before information is shared with a referral facility.",
    },
    education: {
      example:
        "For example, restricting staff access to student records or setting rules before pupil information is shared with a third-party provider.",
    },
    food_agriculture: {
      example:
        "For example, restricting access to sales contracts or setting rules before buyer contact details are shared with an external agent.",
    },
    other: {
      example:
        "For example, restricting staff access to payroll records or setting rules before customer information is shared with an external provider.",
    },
  },
  "T-01": {
    retail: {
      example:
        "For example, moving a supplier order from a delivery note into the till or stock records without typing the same figures in twice.",
    },
    professional: {
      example:
        "For example, moving a client's details from an enquiry into the engagement file, invoicing or reporting without entering the same information again.",
    },
    manufacturing: {
      example:
        "For example, moving a production order from scheduling into quality records or inventory without re-entering the same quantities by hand.",
    },
    distribution: {
      example:
        "For example, moving an order from the sales record into dispatch and invoicing without retyping the same delivery details.",
    },
    hospitality: {
      example:
        "For example, moving a guest's reservation into check-in, billing or housekeeping records without re-entering the same booking details.",
    },
    health: {
      example:
        "For example, moving a patient's registration details into consultation, test orders or billing without re-entering the same information twice.",
    },
    education: {
      example:
        "For example, moving a student's admission details into class registers, fee records or reporting without typing the same information again.",
    },
    food_agriculture: {
      example:
        "For example, moving a harvest record into sales and payment records without rewriting the same quantities in another notebook or system.",
    },
    other: {
      example:
        "For example, moving a customer's details from a sales enquiry into onboarding, invoicing or reporting without entering the same information again.",
    },
  },
  "T-02": {
    retail: {
      example:
        "For example, controlling till user access, keeping copies of sales records, responding to a stolen card terminal, or checking lessons after a takings discrepancy.",
    },
    professional: {
      example:
        "For example, controlling user access to client files, keeping copies of engagement documents, responding to a lost laptop, or checking lessons after a data incident.",
    },
    manufacturing: {
      example:
        "For example, controlling machine operator access, keeping backups of production records, responding to an equipment failure, or checking lessons after an incident.",
    },
    distribution: {
      example:
        "For example, controlling driver and depot access, keeping copies of dispatch records, responding to a lost device, or checking lessons after a cargo incident.",
    },
    hospitality: {
      example:
        "For example, controlling user access to the booking system, keeping copies of takings records, responding to a card payment outage, or checking lessons after an incident.",
    },
    health: {
      example:
        "For example, controlling user access to patient records, keeping backups of clinical data, responding to a lost device, or checking lessons after a record breach.",
    },
    education: {
      example:
        "For example, controlling user access to student records, keeping backups of enrolment data, responding to a lost device, or checking lessons after an incident.",
    },
    food_agriculture: {
      example:
        "For example, controlling access to sales and financial records, keeping copies of receipts, responding to a stolen phone or device, or checking lessons after a loss.",
    },
    other: {
      example:
        "For example, controlling passwords and user access, keeping backups, responding to a lost device, or checking lessons after an incident.",
    },
  },
  "T-03": {
    retail: {
      example:
        "For example, approving an AI pricing or inventory assistant before staff use it with sales information and reviewing who has access to it.",
    },
    professional: {
      example:
        "For example, approving a generative-AI drafting tool before staff use it with client information and reviewing who has access to it.",
    },
    manufacturing: {
      example:
        "For example, approving an AI-based quality or scheduling tool before it is used with production information and reviewing who has access to it.",
    },
    distribution: {
      example:
        "For example, approving an AI route-planning or demand tool before it is used with customer delivery information and reviewing who has access to it.",
    },
    hospitality: {
      example:
        "For example, approving an AI booking or guest-service tool before it is used with guest information and reviewing who has access to it.",
    },
    health: {
      example:
        "For example, approving an AI scheduling or records tool before it is used with patient information and reviewing who has access to it.",
    },
    education: {
      example:
        "For example, approving an AI marking or administration tool before it is used with student information and reviewing who has access to it.",
    },
    food_agriculture: {
      example:
        "For example, approving an AI yield or market-price tool before it is used with production or sales information and reviewing who has access to it.",
    },
    other: {
      example:
        "For example, approving a generative-AI tool before staff use it with work information and reviewing who has access to it.",
    },
  },
  "PE-01": {
    retail: {
      example:
        "For example, sales assistants and cashiers can use a new till or stock tool confidently because they have been shown how and know who to ask.",
    },
    professional: {
      example:
        "For example, associates and support staff can use a new document or AI-assisted tool confidently because they have received relevant training and can ask for help.",
    },
    manufacturing: {
      example:
        "For example, operators and line supervisors can use a new production or quality tool confidently because they have been trained and know who to ask.",
    },
    distribution: {
      example:
        "For example, drivers, dispatchers and warehouse staff can use a new tracking or ordering tool confidently because they have been shown how and know who to ask.",
    },
    hospitality: {
      example:
        "For example, front-desk and kitchen staff can use a new booking or till tool confidently because they have been trained and know who to ask for help.",
    },
    health: {
      example:
        "For example, clinical and administrative staff can use a new records or scheduling tool confidently because they have been trained and know who to ask.",
    },
    education: {
      example:
        "For example, teachers and administrators can use a new learning or records tool confidently because they have been trained and know who to ask.",
    },
    food_agriculture: {
      example:
        "For example, field workers and sales staff can use a new record-keeping or market tool confidently because they have been shown how and know who to ask.",
    },
    other: {
      example:
        "For example, a team can use a new reporting or AI-assisted tool safely because it has received relevant training and can ask for help.",
    },
  },
  "PE-02": {
    retail: {
      example:
        "For example, a store manager owns the adoption of a new till process, a senior cashier trains others, and staff know where to raise problems.",
    },
    professional: {
      example:
        "For example, a practice manager owns adoption, a senior associate trains colleagues, and staff know where to raise concerns.",
    },
    manufacturing: {
      example:
        "For example, a production supervisor owns adoption, a senior operator trains the line, and staff know where to raise concerns.",
    },
    distribution: {
      example:
        "For example, a logistics manager owns adoption, a senior dispatcher trains drivers, and staff know where to raise concerns.",
    },
    hospitality: {
      example:
        "For example, a front-office manager owns adoption, an experienced team member trains new staff, and employees know where to raise concerns.",
    },
    health: {
      example:
        "For example, a clinical lead owns adoption, a senior nurse or administrator trains colleagues, and staff know where to raise concerns.",
    },
    education: {
      example:
        "For example, a head of administration owns adoption, a senior teacher trains colleagues, and staff know where to raise concerns.",
    },
    food_agriculture: {
      example:
        "For example, a farm manager owns adoption, a senior worker trains the team, and staff know where to raise concerns.",
    },
    other: {
      example:
        "For example, a manager owns adoption, a subject-matter expert trains users, and staff know where to raise concerns.",
    },
  },
  "PE-03": {
    retail: {
      example:
        "For example, checking till feedback, support requests, or the unofficial notebooks staff keep to track prices and supplier contacts.",
    },
    professional: {
      example:
        "For example, checking user feedback, support requests, or the unofficial spreadsheets staff keep to track billable work and client deadlines.",
    },
    manufacturing: {
      example:
        "For example, checking operator feedback, maintenance requests, or the unofficial paper logs used to track machine issues between shifts.",
    },
    distribution: {
      example:
        "For example, checking driver feedback, dispatch queries, or the unofficial notebooks used to track deliveries the system does not capture.",
    },
    hospitality: {
      example:
        "For example, checking guest feedback, front-desk queries, or the unofficial workarounds staff use when the booking system is slow.",
    },
    health: {
      example:
        "For example, checking clinician feedback, administrative queries, or the unofficial paper registers used when the system is unavailable.",
    },
    education: {
      example:
        "For example, checking teacher feedback, student queries, or the unofficial spreadsheets used to track attendance alongside the register.",
    },
    food_agriculture: {
      example:
        "For example, checking worker feedback, sales queries, or the unofficial notebooks used to record harvests the main record does not capture.",
    },
    other: {
      example:
        "For example, checking user feedback, support requests, adoption data or the unofficial spreadsheets people create to get work done.",
    },
  },
  "G-01": {
    retail: {
      example:
        "For example, whether staff know not to put supplier pricing or customer contact details into public AI tools without approval.",
    },
    professional: {
      example:
        "For example, whether staff know not to put confidential client information into public AI tools without approval.",
    },
    manufacturing: {
      example:
        "For example, whether staff know not to put production specifications or supplier contracts into public AI tools without approval.",
    },
    distribution: {
      example:
        "For example, whether staff know not to put customer delivery or pricing details into public AI tools without approval.",
    },
    hospitality: {
      example:
        "For example, whether staff know not to put guest payment or personal details into public AI tools without approval.",
    },
    health: {
      example:
        "For example, whether staff know not to put patient information into public AI tools without approval.",
    },
    education: {
      example:
        "For example, whether staff know not to put student or parent information into public AI tools without approval.",
    },
    food_agriculture: {
      example:
        "For example, whether staff know not to put sales contracts or buyer details into public AI tools without approval.",
    },
    other: {
      example:
        "For example, whether staff know not to put confidential client information into public AI tools without approval.",
    },
  },
  "G-02": {
    retail: {
      example:
        "For example, a cashier checks an AI-drafted stock note before it is shared with a supplier and knows who is accountable for its accuracy.",
    },
    professional: {
      example:
        "For example, an associate checks an AI-drafted client response before it is sent and knows who is accountable for its accuracy.",
    },
    manufacturing: {
      example:
        "For example, a quality officer checks an AI-suggested inspection note before it is recorded and knows who is accountable for it.",
    },
    distribution: {
      example:
        "For example, a dispatcher checks an AI-drafted delivery message before it is sent and knows who is accountable for its accuracy.",
    },
    hospitality: {
      example:
        "For example, front-desk staff check an AI-drafted guest message before it is sent and know who is accountable for its accuracy.",
    },
    health: {
      example:
        "For example, a clinician checks an AI-assisted summary before it enters the patient record and knows who remains responsible for it.",
    },
    education: {
      example:
        "For example, a teacher checks an AI-assisted report before it goes to a parent and knows who is accountable for its content.",
    },
    food_agriculture: {
      example:
        "For example, a sales officer checks an AI-drafted buyer message before it is sent and knows who is accountable for its accuracy.",
    },
    other: {
      example:
        "For example, an employee checks an AI-drafted customer response before it is sent and knows who is accountable for its accuracy.",
    },
  },
  "G-03": {
    retail: {
      example:
        "For example, recording an AI pricing assistant that gave a wrong figure and escalating when it affected a customer transaction.",
    },
    professional: {
      example:
        "For example, recording an AI tool that produced an incorrect output and escalating the issue when it affected a client or control.",
    },
    manufacturing: {
      example:
        "For example, recording an AI quality tool that missed a defect and escalating when it affected a batch or safety check.",
    },
    distribution: {
      example:
        "For example, recording an AI routing tool that gave a wrong address and escalating when it delayed a delivery.",
    },
    hospitality: {
      example:
        "For example, recording a booking assistant that double-booked a room and escalating when it affected a guest.",
    },
    health: {
      example:
        "For example, recording an AI scheduling tool that assigned a wrong appointment and escalating when it affected a patient.",
    },
    education: {
      example:
        "For example, recording an AI marking tool that scored incorrectly and escalating when it affected a student's record.",
    },
    food_agriculture: {
      example:
        "For example, recording a market-price tool that gave a wrong quote and escalating when it affected a sale.",
    },
    other: {
      example:
        "For example, recording an AI tool that produced an incorrect output and escalating the issue when it affected a customer or control.",
    },
  },
  "O-01": {
    retail: {
      example:
        "For example, entering daily sales into a record, updating stock after deliveries, reconciling till takings or preparing routine supplier orders.",
    },
    professional: {
      example:
        "For example, copying information into client files, checking standard documents, sending routine updates or reconciling recurring records.",
    },
    manufacturing: {
      example:
        "For example, logging production quantities, checking standard quality documents, reporting daily output or reconciling inventory counts.",
    },
    distribution: {
      example:
        "For example, entering delivery notes, checking dispatch documents, sending routine shipment updates or reconciling stock movements.",
    },
    hospitality: {
      example:
        "For example, updating reservations, checking housekeeping lists, sending routine confirmations or reconciling daily takings.",
    },
    health: {
      example:
        "For example, entering patient details, checking standard forms, sending routine appointment reminders or reconciling attendance records.",
    },
    education: {
      example:
        "For example, entering enrolment details, checking attendance lists, sending routine notices or reconciling fee records.",
    },
    food_agriculture: {
      example:
        "For example, recording daily harvest quantities, checking standard input lists, updating buyers on availability or reconciling sales records.",
    },
    other: {
      example:
        "For example, copying information into systems, checking standard documents, sending routine updates or reconciling recurring records.",
    },
  },
  "O-02": {
    retail: {
      example:
        "For example, photographing a supplier invoice, texting it to the owner for approval and then typing the figures into the till record.",
    },
    professional: {
      example:
        "For example, downloading a spreadsheet, emailing it for approval and then typing the approved figures into another system.",
    },
    manufacturing: {
      example:
        "For example, writing production figures on paper, passing the sheet to the supervisor and then typing them into the daily report.",
    },
    distribution: {
      example:
        "For example, photographing a delivery note, sending it to the office by messaging app and then typing the quantities into the stock record.",
    },
    hospitality: {
      example:
        "For example, writing reservations in a book, calling the kitchen and then typing the bookings into the system later.",
    },
    health: {
      example:
        "For example, noting patient details on paper, handing the sheet to the records officer and then typing them into the system.",
    },
    education: {
      example:
        "For example, marking attendance on paper, passing the register to the office and then typing the entries into the record system.",
    },
    food_agriculture: {
      example:
        "For example, writing harvest weights in a notebook, messaging them to the sales agent and then re-entering them in the sales record.",
    },
    other: {
      example:
        "For example, downloading a spreadsheet, emailing it for approval and then typing the approved figures into another system.",
    },
  },
  "O-03": {
    retail: {
      example:
        "For example, finding a supplier's price list, sorting customer enquiries by type, drafting routine order confirmations or summarising the day's sales.",
    },
    professional: {
      example:
        "For example, searching for a clause in a template, classifying incoming client enquiries, drafting standard correspondence or summarising meeting notes.",
    },
    manufacturing: {
      example:
        "For example, finding a standard operating procedure, classifying incoming quality issues, drafting routine production notices or summarising shift reports.",
    },
    distribution: {
      example:
        "For example, finding a customer's pricing terms, classifying incoming orders, drafting routine dispatch confirmations or summarising daily deliveries.",
    },
    hospitality: {
      example:
        "For example, finding a cancellation policy, classifying incoming booking enquiries, drafting standard confirmations or summarising the day's occupancy.",
    },
    health: {
      example:
        "For example, finding a treatment policy, classifying incoming appointment requests, drafting routine reminders or summarising daily attendance.",
    },
    education: {
      example:
        "For example, finding an admission policy, classifying incoming enquiries, drafting standard notices or summarising weekly attendance.",
    },
    food_agriculture: {
      example:
        "For example, finding a buyer's terms, classifying incoming offers, drafting routine availability updates or summarising weekly sales.",
    },
    other: {
      example:
        "For example, searching for a policy, classifying incoming requests, drafting standard correspondence or summarising meeting notes.",
    },
  },
  "O-04": {
    retail: {
      example:
        "For example, staff using personal accounts on public chatbots to help draft supplier messages or analyse sales figures.",
    },
    professional: {
      example:
        "For example, staff using personal accounts on public chatbots to help draft client documents or analyse engagement data.",
    },
    manufacturing: {
      example:
        "For example, staff using personal accounts on public chatbots to help draft production reports or analyse quality data.",
    },
    distribution: {
      example:
        "For example, staff using personal accounts on public chatbots to help draft dispatch messages or analyse delivery records.",
    },
    hospitality: {
      example:
        "For example, staff using personal accounts on public chatbots to help draft guest messages or analyse occupancy data.",
    },
    health: {
      example:
        "For example, staff using personal accounts on public chatbots to help draft correspondence or analyse patient administration data.",
    },
    education: {
      example:
        "For example, staff using personal accounts on public chatbots to help draft notices or analyse student records.",
    },
    food_agriculture: {
      example:
        "For example, staff using personal accounts on public chatbots to help draft buyer messages or analyse sales records.",
    },
    other: {
      example:
        "For example, staff using personal accounts on public chatbots to help write documents or analyse work information.",
    },
  },
  "O-05": {
    retail: {
      example:
        "For example, a pilot of an AI stock assistant that is only being explored, one being tested by the store manager, or one already used in daily sales records.",
    },
    professional: {
      example:
        "For example, a pilot of an AI drafting tool that is only being explored, one being tested by a small team, or one already used in live client work.",
    },
    manufacturing: {
      example:
        "For example, a pilot of a quality-assistance tool that is only being explored, one being tested by a shift team, or one already used on the production line.",
    },
    distribution: {
      example:
        "For example, a pilot of a route-planning tool that is only being explored, one being tested by a few drivers, or one already used in daily dispatch.",
    },
    hospitality: {
      example:
        "For example, a pilot of an automated guest-messaging tool that is only being explored, one being tested by front desk, or one already used in daily check-ins.",
    },
    health: {
      example:
        "For example, a pilot of a scheduling assistant that is only being explored, one being tested by the front office, or one already used in daily appointments.",
    },
    education: {
      example:
        "For example, a pilot of a learning or administration tool that is only being explored, one being tested by a few teachers, or one already used in daily records.",
    },
    food_agriculture: {
      example:
        "For example, a pilot of a market-price tool that is only being explored, one being tested by the sales lead, or one already used in live sales decisions.",
    },
    other: {
      example:
        "For example, a pilot that is only being explored, one being tested by a small team, or one already used in a live business process.",
    },
  },
  "O-06": {
    retail: {
      example:
        "For example, a weekly stock count with a known backlog of unrecorded deliveries, repeated till discrepancies or a measurable queue at the counter.",
    },
    professional: {
      example:
        "For example, a monthly client review with a known backlog of unprocessed files, repeated invoicing corrections or a measurable turnaround delay.",
    },
    manufacturing: {
      example:
        "For example, a daily production review with a known backlog of unprocessed items, repeated quality corrections or a measurable downtime figure.",
    },
    distribution: {
      example:
        "For example, a weekly dispatch review with a known backlog of unfulfilled orders, repeated delivery corrections or a measurable turnaround delay.",
    },
    hospitality: {
      example:
        "For example, a daily operations review with a known backlog of pending housekeeping, repeated booking corrections or a measurable check-in delay.",
    },
    health: {
      example:
        "For example, a weekly patient-flow review with a known backlog of pending results, repeated record corrections or a measurable appointment delay.",
    },
    education: {
      example:
        "For example, a weekly administration review with a known backlog of unprocessed applications, repeated record corrections or a measurable response delay.",
    },
    food_agriculture: {
      example:
        "For example, a weekly sales review with a known backlog of unfulfilled orders, repeated quantity corrections or a measurable delivery delay.",
    },
    other: {
      example:
        "For example, a monthly reconciliation with a known backlog, repeated corrections or a measurable approval delay.",
    },
  },
};
