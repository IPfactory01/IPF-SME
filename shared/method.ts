/**
 * The method's names (ET, 10 October 2026; product names from the launch menu, 21 October 2026): every stage, artefact
 * and ritual of The Shift has a proper name, used
 * the same way on the site, in the admin, in the room and in email. Term first, meaning second: the name is the
 * heading, the sentence under it says what it means in plain English. Brand lines ("Find it. Fix it. See the
 * results.", "The Shift") are not method names and do not change.
 *
 * The free 20-minute call is the Discovery Call (ET, 12 October 2026), not the Debrief: "Debrief" is kept free for one
 * of the Business Review's sessions. The code and the database still say debrief for it (the `debriefs`
 * table, `businessSupport.debrief`), which owners and the team never see.
 */
export const METHOD = {
  businessCheck: "Business Health Check",
  discoveryCall: "Discovery Call",
  fullReport: "Full Report",
  reportIntake: "Report Intake",
  currentState: "Business Review",
  workPlan: "Work Plan",
  dataRequest: "Data Request",
  dataRequests: "Data Requests",
  session: "Session",
  findings: "Findings",
  problemStatement: "Problem Statement",
  prescription: "Prescription",
  fix: "Six-Week Fix",
  checkin: "Weekly Check-in",
  measure: "Measure of Success",
  day30: "Day-30 Review",
  signOff: "Sign-off",
  deliverables: "Deliverables",
  engagement: "Engagement",
  plan: "Your Plan",
} as const;

/** What each name means, in one plain sentence, for the line under the heading. */
export const METHOD_MEANING: Record<keyof typeof METHOD, string> = {
  businessCheck: "Ten minutes on your phone: a first read on where your business is stuck, and the first step that fits.",
  discoveryCall: "A free 20-minute call: we walk through your Business Health Check results, hear the problem in your words and agree next steps.",
  fullReport: "What to do about what the Business Health Check found, in order, with the number to watch for each.",
  reportIntake: "A short form after payment; your Full Report is built from it the moment you finish.",
  currentState: "Two weeks and two Sessions that test your whole business, to find the one problem to fix first and what to do about it.",
  workPlan: "The two weeks' activities, week by week: what you send, what we do, and when the Sessions are.",
  dataRequest: "Something we need from you, with a date.",
  dataRequests: "What we need from you, each with a date.",
  session: "A call with your team at IP Factory, booked on Calendly and recorded in your room.",
  findings: "What the assessment found: the numbers, how the business runs, and the one problem to fix first.",
  problemStatement: "The one problem we fix, in your words.",
  prescription: "What to do about it: the first steps, the tools, and who owns each.",
  fix: "Six weeks on one problem and one Measure of Success. Your team does the work; we give you the Prescription and the tools, and review it with you every week.",
  checkin: "A short weekly call: the reading, what moved, what you do next.",
  measure: "The one number that tells us whether the Six-Week Fix is working.",
  day30: "Thirty days after the Six-Week Fix ends: did it hold, and what support looks like from here.",
  signOff: "Your agreement that we got it right. Your Six-Week Fix starts from what you sign off.",
  deliverables: "What IP Factory hands over: the Findings, the Problem Statement, the Prescription, the tools and Your Plan.",
  engagement: "Everything from your Business Review to the Day-30 Review, in one room.",
  plan: "The plan in your hands at the end, and what support looks like from here.",
};
