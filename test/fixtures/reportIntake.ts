import type { ReportIntake } from "@shared/fullReport/intake";

/** A fictional Report Intake: a Lagos fabric retailer. No real person or business. */
export const sampleIntake: ReportIntake = {
  location: "A shop in Balogun Market, Lagos, and orders on WhatsApp",
  registration: "business_name",
  products: [
    { name: "Ankara fabric (6 yards)", basis: "price", price: 18_000, percent: null, dealSize: null },
    { name: "Lace fabric (5 yards)", basis: "price", price: 65_000, percent: null, dealSize: null },
    { name: "Aso-oke sets", basis: "varies", price: null, percent: null, dealSize: null },
  ],
  bestCustomer: "Tailors in Surulere who buy every week for their clients' events",
  competitors: ["Mama Bisi Fabrics", "Two online sellers on Instagram"],
  pricePosition: "lower",
  topEarner: 1,
  costShare: "50_75",
  marginPercent: null,
  topCustomerShare: "20_50",
  channels: ["word_of_mouth", "walk_in", "social_media"],
  enquiries: "50_200",
  conversion: 3,
  repeat: "occasionally",
  roles: "Me (buying, pricing and the big customers), one shop attendant, my sister on WhatsApp orders",
  tools: ["whatsapp", "paper"],
  lastMonthRevenue: 2_400_000,
  monthlyCosts: 2_150_000,
  biggestCost: "stock",
  cash: "500k_2m",
  owed: "under_1m",
  loans: "none",
  goal: "Open a second shop in Yaba and reach ₦4 million a month",
};
