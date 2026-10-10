/**
 * The method's names (ET, 10 October 2026): every stage, artefact and ritual of The Shift has a proper name, used
 * the same way on the site, in the admin, in the room and in email. Term first, meaning second: the name is the
 * heading, the sentence under it says what it means in plain English. Brand lines ("Find it. Fix it. See the
 * results.", "The Shift") are not method names and do not change.
 */
export const METHOD = {
  businessCheck: "Business Check",
  debrief: "Debrief",
  fullReport: "Full Report",
  reportIntake: "Report Intake",
  currentState: "Current State Assessment",
  workPlan: "Work Plan",
  dataRequest: "Data Request",
  dataRequests: "Data Requests",
  session: "Session",
  findings: "Findings",
  problemStatement: "Problem Statement",
  prescription: "Prescription",
  fix: "The Fix",
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
  businessCheck: "Ten minutes on your phone: a first read on where your business is stuck.",
  debrief: "A free 20-minute call: we walk through your Business Check results, hear the problem in your words and agree next steps.",
  fullReport: "What to do about what the Business Check found, in order, with the number to watch for each.",
  reportIntake: "A short form after payment; your Full Report is built from it the moment you finish.",
  currentState: "Two weeks and two sessions that test the internal and external factors of your business, to locate the one problem to fix first and what to do about it.",
  workPlan: "The two weeks' activities, week by week: what you send, what we do, and when the sessions are.",
  dataRequest: "Something we need from you, with a date.",
  dataRequests: "What we need from you, each with a date.",
  session: "A call with your team at IP Factory, booked on Calendly and recorded in your room.",
  findings: "What the assessment found: the numbers, how the business runs, and the one problem to fix first.",
  problemStatement: "The one problem we fix, in your words.",
  prescription: "What to do about it: the first steps, the tools, and who owns each.",
  fix: "Six weeks on one problem and one Measure of Success. You do the work; we give you the Prescription and check it every week.",
  checkin: "A short weekly call: the reading, what moved, what you do next.",
  measure: "The one number that tells us whether the fix is working.",
  day30: "Thirty days after The Fix ends: did it hold, and what support looks like from here.",
  signOff: "Your agreement that we got it right. The Fix starts from what you sign off.",
  deliverables: "What IP Factory hands over: the Findings, the Problem Statement, the Prescription, the tools and Your Plan.",
  engagement: "Everything from your Current State Assessment to the Day-30 Review, in one room.",
  plan: "The plan in your hands at the end, and what support looks like from here.",
};
