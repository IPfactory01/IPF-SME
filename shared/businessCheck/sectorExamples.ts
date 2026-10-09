/**
 * "For a business like yours": one example per area for each sector the owner can pick, set in
 * Nigerian business life so the owner recognises themselves. The idea area is written for a
 * business that has not started yet. Sector "other" has no entry and falls back to the examples by
 * business type in questions.ts.
 *
 * Keep each example to one sentence, concrete, and in the same register as the rest of the check.
 */
import type { SectionId } from "./questions";

export type SectorId =
  | "fashion"
  | "food and drink"
  | "retail"
  | "services"
  | "professional services"
  | "oil, gas and mining"
  | "technology"
  | "real estate"
  | "health"
  | "education"
  | "manufacturing"
  | "agriculture"
  | "logistics";

export const SECTOR_IDS: readonly SectorId[] = ["fashion", "food and drink", "retail", "services", "professional services", "oil, gas and mining", "technology", "real estate", "health", "education", "manufacturing", "agriculture", "logistics"];

/** How the sector reads inside "For a … business like yours". */
export const SECTOR_NOUNS: Record<SectorId, string> = {
  fashion: "fashion",
  "food and drink": "food and drink",
  retail: "retail",
  services: "personal services",
  "professional services": "professional services",
  "oil, gas and mining": "mining and energy",
  technology: "technology",
  "real estate": "real estate",
  health: "health",
  education: "education",
  manufacturing: "manufacturing",
  agriculture: "farming",
  logistics: "logistics",
};

type AreaSection = Exclude<SectionId, "profile">;

export const SECTOR_EXAMPLES: Record<AreaSection, Record<SectorId, string>> = {
  founder: {
    fashion: "A designer whose pieces sell out at every Lagos pop-up may still find it hard to chase a boutique for payment, or to say no when a big client asks for a discount.",
    "food and drink": "A caterer whose jollof is the talk of every party may still find it hard to price a corporate contract or chase payment from the client's accounts department.",
    retail: "A shop owner who knows every customer on the street by name may still lose track of stock, cash and what each shelf really earns.",
    services: "A brilliant hairstylist may find managing staff, rotas and no-shows harder than the work itself.",
    "professional services": "A respected adviser can win clients on reputation alone and still find it hard to price the work, chase fees or build a team that delivers without them.",
    "oil, gas and mining": "A trader with strong contacts at the mine or the depot may still find the paperwork, finance and compliance of a bigger operation the hardest part.",
    technology: "A strong developer can build a great product and still find selling it to a bank or a school the hardest part.",
    "real estate": "An agent who can close any inspection may still struggle to build a team that sells without them.",
    health: "A respected pharmacist or doctor may run an excellent practice and still find the books, the staff and the HMO paperwork the hardest part.",
    education: "A gifted teacher who started a school may find fee collection, staffing and parents' expectations harder than the teaching.",
    manufacturing: "A producer who knows the machines inside out may still find it hard to negotiate with distributors or plan cash around diesel and raw-material prices.",
    agriculture: "A farmer who grows an excellent crop may still lose out at harvest because the buyers at the market set the price.",
    logistics: "An owner who built the business on personal relationships may find that managing riders, drivers and fuel is where it slips.",
  },
  idea: {
    fashion: "A planned clothing line deciding whether to start with made-to-order pieces for friends or a small ready-to-wear drop on Instagram.",
    "food and drink": "A planned zobo or juice brand deciding whether to start with office deliveries or supermarket shelves.",
    retail: "A planned cosmetics or provisions shop deciding whether to sell online first or rent a stall.",
    services: "A planned cleaning or events service deciding whether to serve churches, schools or small shops first.",
    "professional services": "A planned advisory firm deciding whether to serve a few large corporate clients or many smaller businesses first.",
    "oil, gas and mining": "A planned mineral-trading business deciding whether to start with one mineral and one buyer, or several at once.",
    technology: "A planned app deciding whether to start with a few businesses that pay or chase thousands of free users.",
    "real estate": "A planned property business deciding whether to start with lettings, short-lets or sales.",
    health: "A planned pharmacy or wellness service deciding whether to start in one neighbourhood or online.",
    education: "A planned tutorial centre deciding whether to start with WAEC and JAMB preparation or after-school care.",
    manufacturing: "A planned soap or packaged-snacks business deciding whether to start small by hand or invest in a machine.",
    agriculture: "A planned poultry or fish farm deciding whether to start with a few hundred birds or wait until it can raise more money.",
    logistics: "A planned delivery business deciding whether to start with one bike for local vendors or partner with an existing fleet.",
  },
  intent: {
    fashion: "A ready-to-wear label deciding whether to stay bespoke for a loyal few or build collections that sell in stores and online.",
    "food and drink": "A small chops business deciding whether to stay in events or open a kitchen that supplies offices and cafés every day.",
    retail: "A provisions store deciding whether to open a second branch or move into wholesale for smaller shops.",
    services: "A cleaning company choosing between more homes in Lekki and a few large office contracts.",
    "professional services": "A consultancy choosing between staying a trusted adviser to a few clients or building a firm with partners, a brand and a team.",
    "oil, gas and mining": "A mining services company choosing between chasing every licence-holder and specialising in the one service it does best.",
    technology: "A software start-up choosing between building for SMEs across Nigeria or a handful of big corporate clients.",
    "real estate": "A property firm deciding whether to keep brokering sales or start developing its own small estates.",
    health: "A clinic deciding whether to add a lab and pharmacy or open a second location.",
    education: "A private school weighing a secondary section against a second primary campus.",
    manufacturing: "A packaged-water or snacks producer choosing between more distributors in the South-West and expanding to the North.",
    agriculture: "A poultry farm deciding whether to keep selling live birds or move into processed, packaged chicken.",
    logistics: "A dispatch business deciding whether to stay with e-commerce deliveries in Lagos or move into interstate haulage.",
  },
  market: {
    fashion: "A designer finding that most repeat orders come from wedding parties and aso-ebi groups, not walk-in buyers.",
    "food and drink": "A bakery realising that schools and offices buy steadily every week, while walk-in sales only spike at weekends.",
    retail: "A phone-accessories shop in Computer Village finding that the stall opposite undercuts it on its five best-sellers.",
    services: "A laundry finding that its most profitable customers are hotels and short-let apartments, not households.",
    "professional services": "An advisory firm finding that its best-paying clients are traders and exporters who need deals closed, not general advice.",
    "oil, gas and mining": "A gold or tin trader learning that export buyers pay more for verified, documented supply than local buyers pay for volume.",
    technology: "A payments app learning that market traders use it far more than the salaried workers it was built for.",
    "real estate": "An agency discovering that diaspora buyers pay faster and haggle less than local buyers.",
    health: "A diagnostic centre finding that most of its revenue comes from HMO referrals, not walk-in patients.",
    education: "A school learning that parents choose it for the after-school care, not the curriculum it advertises.",
    manufacturing: "A paint manufacturer finding that contractors buy in bulk while individual buyers barely move volume.",
    agriculture: "A cassava farmer discovering that processors will pay more for a steady supply than market buyers pay for single loads.",
    logistics: "A haulage company finding that a few FMCG distributors bring most of the profit, while small senders bring most of the work.",
  },
  offer: {
    fashion: "A fashion house making everything from agbada to bridal gowns, and struggling to be known for anything.",
    "food and drink": "A restaurant with a sixty-item menu where ten dishes bring in most of the sales.",
    retail: "A supermarket stocking hundreds of lines while a handful carry the month.",
    services: "An events company offering planning, décor, catering and ushers, and hard to recommend for any one of them.",
    "professional services": "A firm offering advice, introductions and deal support, and unable to say in one line what clients hire it for.",
    "oil, gas and mining": "A supplier to oil and gas operators offering everything from logistics to equipment hire, and known for none of it.",
    technology: "A software company that builds a different custom app for every client and has no product it can sell twice.",
    "real estate": "A firm doing sales, lettings, facility management and valuations, with no clear reason to pick it over the others.",
    health: "A clinic offering every service while patients only come for one or two tests.",
    education: "A tutorial centre offering every subject and exam when parents mainly want WAEC and JAMB results.",
    manufacturing: "A plastics maker producing many product lines while two of them carry the factory.",
    agriculture: "A farm selling raw produce when buyers would pay more for it sorted, cleaned and packed.",
    logistics: "A logistics firm offering bikes, vans and trucks, with customers unsure what it does best.",
  },
  model: {
    fashion: "A tailor can be fully booked for December weddings and still make little if fabric, power and overtime are not priced into each outfit.",
    "food and drink": "A restaurant can be full every night and still lose money when diesel, gas and food prices rise faster than the menu.",
    retail: "A provisions store can sell out every week and still earn little if the margin on each item is thin and credit sales stay unpaid.",
    services: "A salon can be busy all day and still struggle if its prices have not moved since before the naira fell.",
    "professional services": "A brokerage that closes large deals but earns nothing between them, because every fee depends on a transaction completing.",
    "oil, gas and mining": "A mineral trader with large volumes and thin margins, where transport, royalties and the dollar price decide whether a deal makes money.",
    technology: "A tech company can win new subscribers every month and still lose money if winning each one costs more than they ever pay.",
    "real estate": "A developer can sell every unit off-plan and still lose money when cement and iron-rod prices jump mid-build.",
    health: "A hospital can see more patients than ever and still struggle when HMO tariffs stay fixed while drug prices rise.",
    education: "A school can be full and still run short when fees are fixed for the year but salaries, diesel and food keep rising.",
    manufacturing: "A factory can run three shifts and still lose money when its inputs are priced in dollars and its products are sold in naira.",
    agriculture: "A farm can have a bumper harvest and still lose money when everyone harvests at once and prices crash.",
    logistics: "A dispatch business can do hundreds of deliveries a day and still lose money if fuel, bike repairs and failed deliveries are not priced in.",
  },
  sales: {
    fashion: "A designer selling only through Instagram DMs, with no way to follow up everyone who asked \"how much?\"",
    "food and drink": "A small chops vendor who gets most orders from WhatsApp status and has quiet weeks with no warning.",
    retail: "A store waiting for walk-ins while competitors sell on Jumia, Instagram and WhatsApp.",
    services: "A cleaning company that wins work only by word of mouth, with no plan to reach new estates or offices.",
    "professional services": "A firm whose new clients all come from the founder's network, with nothing that brings in work when the network goes quiet.",
    "oil, gas and mining": "A supplier that wins contracts only through personal contacts at a few operators, with nothing in place when a contact moves on.",
    technology: "A start-up with thousands of downloads but very few paying users.",
    "real estate": "An agent with plenty of enquiries that never turn into inspections, let alone sales.",
    health: "A clinic that gets patients by referral only and has no way to reach companies for staff health checks.",
    education: "A school that depends on word of mouth and struggles to fill new classes each September.",
    manufacturing: "A manufacturer whose sales depend on the owner phoning the same distributors in Onitsha and Kano.",
    agriculture: "A farmer who sells only to middlemen at the farm gate and has never reached a processor or supermarket directly.",
    logistics: "A logistics firm that depends on two big clients and has no way to win the next ten.",
  },
  operations: {
    fashion: "A fashion house where only the creative director can approve a design, a fitting or a price.",
    "food and drink": "A kitchen where the food tastes different depending on who is cooking that day.",
    retail: "A supermarket where the stock count never matches the books.",
    services: "A salon that runs smoothly only on the days the owner is in.",
    "professional services": "A practice where every proposal, contract and client call still waits for the founder.",
    "oil, gas and mining": "A site or depot that runs only when the owner is there to sign off every load.",
    technology: "A start-up where every customer complaint still ends up on the founder's phone.",
    "real estate": "A firm where only the owner knows the terms agreed with each landlord.",
    health: "A clinic where patient records are on paper and nobody can find last month's results.",
    education: "A school where the proprietor still signs off every purchase and every parent's complaint.",
    manufacturing: "A factory where production stops whenever the one trained machine operator is absent.",
    agriculture: "A farm where workers wait for the owner to arrive before feeding, spraying or harvesting.",
    logistics: "A dispatch business that tracks riders by phone call, so nobody knows where each package is.",
  },
  finance: {
    fashion: "A designer who adds a round figure to the cost of fabric and forgets labour, power and the free adjustments.",
    "food and drink": "A food business that is profitable on paper but cannot pay suppliers because corporate clients pay in sixty days.",
    retail: "A trader who prices by adding ₦500 to cost without counting transport, damage and theft.",
    services: "An events company paid late by corporate clients that borrows each month to pay its vendors.",
    "professional services": "A consultancy paid late on every invoice that borrows each month to cover salaries.",
    "oil, gas and mining": "A trader who must pay miners upfront in cash while buyers pay 60 days after delivery.",
    technology: "A start-up that knows its monthly users but not how many months of cash it has left.",
    "real estate": "A developer whose money is tied up in half-finished units while interest on the loan keeps running.",
    health: "A hospital owed millions by HMOs while it pays its suppliers and staff on time every month.",
    education: "A school that has given so many parents discounts and payment plans that it cannot pay salaries on time.",
    manufacturing: "A manufacturer that no longer knows its true cost per carton since the last exchange-rate change.",
    agriculture: "A farmer who mixes farm money and household money, and never knows whether the season made a profit.",
    logistics: "An owner who cannot say which routes or clients make money once fuel and repairs are counted.",
  },
  risk: {
    fashion: "A label that has never registered its brand name, while copies of its designs turn up in Balogun market.",
    "food and drink": "A food brand selling well without NAFDAC registration for its best product.",
    retail: "A shop whose entire stock sits uninsured in one store, with no records for tax.",
    services: "A salon where one senior stylist holds the loyal clients, and could leave with them.",
    "professional services": "An intermediary whose fee rests on a handshake, with no signed mandate if the deal closes without them.",
    "oil, gas and mining": "A trader working without the right mining or export permits, where one inspection could stop every shipment.",
    technology: "A start-up holding customer data without the protections the Nigeria Data Protection Act requires.",
    "real estate": "A firm selling plots without checking the title documents or the C of O.",
    health: "A pharmacy or clinic running on a lapsed licence, or keeping poor records of controlled drugs.",
    education: "A school that has never checked its approval status or its fire and safety requirements.",
    manufacturing: "A factory without SON certification for its main product, or with a single supplier for a critical input.",
    agriculture: "A farm with no plan for flooding, pests or a disease outbreak in the pens.",
    logistics: "A fleet running without proper insurance, vehicle papers or driver checks.",
  },
  exit: {
    fashion: "A label worth little to an investor because buyers come for the designer personally.",
    "food and drink": "A restaurant chain whose recipes and supplier deals exist only in the owner's head.",
    retail: "A chain of stores with strong sales but no accounts an investor could trust.",
    services: "A salon worth little to a buyer because clients come for the owner personally.",
    "professional services": "A practice worth little to a buyer because clients come for the founder personally.",
    "oil, gas and mining": "A mining services company worth little to an investor because the licences, contracts and relationships all sit with the founder.",
    technology: "A start-up that wants investment but has no clean record of revenue, users or who owns what.",
    "real estate": "A property company whose value sits in assets with incomplete documents.",
    health: "A hospital that could attract a partner but has never had its books audited.",
    education: "A school that could be sold or franchised, but whose systems all depend on the proprietor.",
    manufacturing: "A factory that could attract an investor, if its machines, contracts and land title were in order.",
    agriculture: "A farm that could raise money from an agric fund, if it could show three years of clean numbers.",
    logistics: "A logistics firm whose only value is its trucks, because its client contracts are informal.",
  },
  transition: {
    fashion: "A designer of fifteen years who wants to step back from every fitting, but whose clients still ask for them by name.",
    "food and drink": "A founder whose restaurant runs on their own recipes and who now wants a head chef to take over.",
    retail: "A trader whose children may take over the shops, with no plan for how or when.",
    services: "An events planner whose clients still ask for them by name after twenty years.",
    "professional services": "A senior professional whose clients still ask for them by name after twenty years.",
    "oil, gas and mining": "A founder who built the business on personal relationships with operators, and has no one ready to hold them.",
    technology: "A founder who built the product and now needs to be the chief executive, not the lead developer.",
    "real estate": "A founder ready to hand day-to-day sales to a younger team without losing key clients.",
    health: "A medical director nearing retirement with no successor ready to run the hospital.",
    education: "A proprietor who wants the school to outlive them, with no board or head ready to lead it.",
    manufacturing: "A founder who started the factory decades ago and now wants a professional manager to run it.",
    agriculture: "A farmer who wants the next generation to take over, with no plan for the land, the money or the roles.",
    logistics: "An owner who wants to step back, but whose drivers and clients only answer to them.",
  },
};
