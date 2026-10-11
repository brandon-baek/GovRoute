import type { Journey } from "@/lib/schema";
import { mergeProcessJourneys } from "@/lib/process-catalog";

const checked = "2026-09-03";

const legacyJourneys: Journey[] = [
  {
    id: "journey-passport-lost",
    slug: "replace-a-lost-or-stolen-passport",
    title: "Replace a lost or stolen passport",
    summary: "Report the passport so it can be invalidated, then use the correct replacement process for where you are.",
    category: "Documents and identity",
    jurisdiction: "federal",
    audience: ["U.S. citizens"],
    aliases: ["lost passport", "stolen passport", "passport missing", "replace passport", "DS-64", "DS-11"],
    reviewStatus: "verified",
    reviewedAt: checked,
    estimatedTime: "About 5 minutes to understand the route",
    officialAction: { label: "Report a lost or stolen passport", url: "https://travel.state.gov/content/travel/en/passports/have-passport/lost-stolen.html" },
    steps: [
      { id: "report", title: "Report the passport", detail: "Report it online, by phone, or by mailing Form DS-64. Once reported, the passport is invalid and cannot be used if found.", sourceIds: ["usa-lost-passport", "state-lost-passport"], action: { label: "Choose how to report it", url: "https://travel.state.gov/content/travel/en/passports/have-passport/lost-stolen.html" } },
      { id: "location", title: "Use the route for your location", detail: "Inside the U.S., replacement generally uses Form DS-11 in person. Outside the U.S., contact the nearest U.S. embassy or consulate.", sourceIds: ["usa-lost-passport", "state-lost-passport"] },
      { id: "timing", title: "Check current processing guidance", detail: "Processing options and timing can change. Confirm them on the State Department site before making travel plans.", sourceIds: ["state-processing"], action: { label: "Check processing times", url: "https://travel.state.gov/content/travel/en/passports/how-apply/processing-times.html" } }
    ],
    sources: [
      { id: "usa-lost-passport", title: "Replace your lost or stolen U.S. passport", url: "https://www.usa.gov/lost-stolen-passport", publisher: "USA.gov", lastChecked: checked },
      { id: "state-lost-passport", title: "Lost or Stolen Passports", url: "https://travel.state.gov/content/travel/en/passports/have-passport/lost-stolen.html", publisher: "U.S. Department of State", lastChecked: checked },
      { id: "state-processing", title: "Passport Processing Times", url: "https://travel.state.gov/content/travel/en/passports/how-apply/processing-times.html", publisher: "U.S. Department of State", lastChecked: checked }
    ]
  },
  {
    id: "journey-passport-apply",
    slug: "apply-for-or-renew-a-passport",
    title: "Apply for or renew a U.S. passport",
    summary: "Determine whether you must apply in person or may renew, gather the required documents, and submit through an official channel.",
    category: "Documents and identity",
    jurisdiction: "federal",
    audience: ["U.S. citizens"],
    aliases: ["new passport", "renew passport", "passport application", "passport expired", "DS-11", "DS-82"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Start with the official passport guide", url: "https://travel.state.gov/content/travel/en/passports.html" },
    steps: [
      { id: "choose", title: "Check whether to apply or renew", detail: "Your age, prior passport, and its condition determine whether you apply in person or can use a renewal process.", sourceIds: ["state-passports", "usa-passports"], action: { label: "Use the passport route finder", url: "https://travel.state.gov/content/travel/en/passports.html" } },
      { id: "prepare", title: "Gather the required evidence", detail: "Follow the checklist for your route, including citizenship evidence, acceptable identification, a compliant photo, and the correct form.", sourceIds: ["state-passports"] },
      { id: "submit", title: "Submit through the official channel", detail: "Apply in person when required or use the official renewal route. Confirm current fees and processing times immediately before submitting.", sourceIds: ["state-passports"] }
    ],
    sources: [
      { id: "state-passports", title: "U.S. Passports", url: "https://travel.state.gov/content/travel/en/passports.html", publisher: "U.S. Department of State", lastChecked: checked },
      { id: "usa-passports", title: "How to apply for or renew a U.S. passport", url: "https://www.usa.gov/passport", publisher: "USA.gov", lastChecked: checked }
    ]
  },
  {
    id: "journey-ss-card",
    slug: "replace-a-social-security-card",
    title: "Replace a Social Security card",
    summary: "Check whether you can request a replacement online; otherwise prepare the documents Social Security requires.",
    category: "Documents and identity",
    jurisdiction: "federal",
    audience: ["People with a Social Security number"],
    aliases: ["lost social security card", "replace ssn card", "new social security card", "SS card"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Start with Social Security", url: "https://www.ssa.gov/number-card/replace-card" },
    steps: [
      { id: "online", title: "Check online eligibility", detail: "Social Security offers an online replacement option for many people. Availability depends on your situation and state-issued identification.", sourceIds: ["ssa-replace"] },
      { id: "documents", title: "Prepare original identity documents if needed", detail: "If you cannot complete the request online, use Social Security's document checklist and application route. Do not mail documents until the official instructions tell you to.", sourceIds: ["ssa-replace", "usa-ss-card"] },
      { id: "protect", title: "Respond to identity theft separately", detail: "A missing card does not always require a fraud report, but suspicious use of your number should be handled through IdentityTheft.gov.", sourceIds: ["identity-theft-gov"] }
    ],
    sources: [
      { id: "ssa-replace", title: "Replace Social Security card", url: "https://www.ssa.gov/number-card/replace-card", publisher: "Social Security Administration", lastChecked: checked },
      { id: "usa-ss-card", title: "Replace Social Security card", url: "https://www.usa.gov/social-security-card", publisher: "USA.gov", lastChecked: checked },
      { id: "identity-theft-gov", title: "Report identity theft and get a recovery plan", url: "https://www.identitytheft.gov/", publisher: "Federal Trade Commission", lastChecked: checked }
    ]
  },
  {
    id: "journey-ca-license",
    slug: "get-or-replace-a-california-driver-license",
    title: "Get or replace a California driver’s license",
    summary: "Use the California DMV route for a first license, renewal, or replacement and bring the documents listed for that transaction.",
    category: "Driving and transportation",
    jurisdiction: "california",
    audience: ["California residents"],
    aliases: ["lost license", "California driver license", "DMV license", "renew drivers license", "replace drivers license"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Choose a DMV license service", url: "https://www.dmv.ca.gov/portal/driver-licenses-identification-cards/" },
    steps: [
      { id: "transaction", title: "Choose your transaction", detail: "The DMV uses different routes for a first license, renewal, replacement, name change, and REAL ID upgrade.", sourceIds: ["dmv-license"] },
      { id: "prepare", title: "Complete the application and document check", detail: "Use the DMV checklist for the exact transaction before visiting an office or paying online.", sourceIds: ["dmv-license"] },
      { id: "finish", title: "Finish online or at a DMV office", detail: "Some transactions can be completed online. Others require an appointment, documents, photo, test, or in-person identity verification.", sourceIds: ["dmv-license"] }
    ],
    sources: [{ id: "dmv-license", title: "Driver’s Licenses and Identification Cards", url: "https://www.dmv.ca.gov/portal/driver-licenses-identification-cards/", publisher: "California DMV", lastChecked: checked }]
  },
  {
    id: "journey-ca-real-id",
    slug: "get-a-california-real-id",
    title: "Get a California REAL ID",
    summary: "Apply through the California DMV, upload or gather the required documents, and complete identity verification in person.",
    category: "Documents and identity",
    jurisdiction: "california",
    audience: ["California residents"],
    aliases: ["REAL ID", "California real id", "federal compliant ID", "DMV real ID"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Start the REAL ID application", url: "https://www.dmv.ca.gov/portal/driver-licenses-identification-cards/real-id/" },
    steps: [
      { id: "check", title: "Decide whether you need a REAL ID", detail: "A passport or another federally accepted document may meet your federal identification need. Check the official guidance before applying.", sourceIds: ["dmv-real-id"] },
      { id: "documents", title: "Gather the required documents", detail: "Use the DMV checklist for proof of identity, Social Security number, and California residency. Requirements depend on your documents and name history.", sourceIds: ["dmv-real-id"] },
      { id: "visit", title: "Complete the DMV visit", detail: "Start the application online when available, then bring the required originals to a DMV office for verification.", sourceIds: ["dmv-real-id"] }
    ],
    sources: [{ id: "dmv-real-id", title: "REAL ID", url: "https://www.dmv.ca.gov/portal/driver-licenses-identification-cards/real-id/", publisher: "California DMV", lastChecked: checked }]
  },
  {
    id: "journey-ca-unemployment",
    slug: "apply-for-california-unemployment",
    title: "Apply for California unemployment benefits",
    summary: "Review eligibility, create or use myEDD, file a claim, and keep certifying for benefits while the claim is active.",
    category: "Jobs and unemployment",
    jurisdiction: "california",
    audience: ["California workers"],
    aliases: ["lost my job", "unemployment", "EDD", "laid off", "unemployment insurance", "UI claim"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "File with California EDD", url: "https://edd.ca.gov/en/unemployment/filing_a_claim/" },
    steps: [
      { id: "eligibility", title: "Review basic eligibility", detail: "EDD evaluates work history, earnings, availability for work, and the reason you are no longer working.", sourceIds: ["edd-file"] },
      { id: "information", title: "Gather employment information", detail: "Prepare identity, contact, and recent employer information using EDD's current checklist.", sourceIds: ["edd-file"] },
      { id: "claim", title: "File the claim", detail: "Use UI Online through myEDD or another method listed by EDD. Save confirmations and respond to follow-up requests.", sourceIds: ["edd-file"] },
      { id: "certify", title: "Certify for benefits", detail: "Continue certifying for each period requested and report work or earnings accurately while the claim is active.", sourceIds: ["edd-certify"] }
    ],
    sources: [
      { id: "edd-file", title: "Filing an Unemployment Claim", url: "https://edd.ca.gov/en/unemployment/filing_a_claim/", publisher: "California Employment Development Department", lastChecked: checked },
      { id: "edd-certify", title: "Certify for Benefits", url: "https://edd.ca.gov/en/unemployment/certify/", publisher: "California Employment Development Department", lastChecked: checked }
    ]
  },
  {
    id: "journey-calfresh",
    slug: "apply-for-calfresh",
    title: "Apply for CalFresh food benefits",
    summary: "Submit a CalFresh application, complete the county interview, and provide requested verification.",
    category: "Food and household support",
    jurisdiction: "california",
    audience: ["California households"],
    aliases: ["food stamps", "CalFresh", "SNAP California", "food assistance", "EBT"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Apply through BenefitsCal", url: "https://benefitscal.com/" },
    steps: [
      { id: "apply", title: "Submit an application", detail: "Apply online through BenefitsCal or use a method offered by your county. You can begin with basic contact information and complete the rest as directed.", sourceIds: ["cdss-calfresh", "benefitscal"] },
      { id: "interview", title: "Complete the county interview", detail: "Your county will contact you for an interview and explain what verification is needed for your household.", sourceIds: ["cdss-calfresh"] },
      { id: "respond", title: "Provide requested verification", detail: "Submit only the documents your county requests, watch for notices, and use the appeal information on a notice if you disagree with a decision.", sourceIds: ["cdss-calfresh"] }
    ],
    sources: [
      { id: "cdss-calfresh", title: "CalFresh", url: "https://www.cdss.ca.gov/calfresh", publisher: "California Department of Social Services", lastChecked: checked },
      { id: "benefitscal", title: "BenefitsCal", url: "https://benefitscal.com/", publisher: "California counties", lastChecked: checked }
    ]
  },
  {
    id: "journey-medi-cal",
    slug: "apply-for-medi-cal",
    title: "Apply for Medi-Cal",
    summary: "Choose an official application channel, submit household information, and respond to county requests or notices.",
    category: "Health care",
    jurisdiction: "california",
    audience: ["California residents"],
    aliases: ["Medi-Cal", "California Medicaid", "health insurance help", "medical coverage", "low income health insurance"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "See Medi-Cal application options", url: "https://www.dhcs.ca.gov/services/medi-cal/Pages/ApplyforMedi-Cal.aspx" },
    steps: [
      { id: "route", title: "Choose an application route", detail: "Apply online, through Covered California, or through your county using the current options listed by the Department of Health Care Services.", sourceIds: ["dhcs-apply"] },
      { id: "submit", title: "Submit household information", detail: "Provide the requested information about household members, income, and existing coverage. The exact verification depends on your situation.", sourceIds: ["dhcs-apply"] },
      { id: "follow-up", title: "Respond to county notices", detail: "Watch for requests for documents or a decision notice, and use the contact or appeal instructions printed on the notice when needed.", sourceIds: ["dhcs-apply"] }
    ],
    sources: [{ id: "dhcs-apply", title: "Apply for Medi-Cal", url: "https://www.dhcs.ca.gov/services/medi-cal/Pages/ApplyforMedi-Cal.aspx", publisher: "California Department of Health Care Services", lastChecked: checked }]
  },
  {
    id: "journey-ca-business",
    slug: "start-a-business-in-california",
    title: "Start and register a business in California",
    summary: "Choose a business structure, register where required, handle tax accounts, and check local permits.",
    category: "Business",
    jurisdiction: "federal-and-state",
    audience: ["California business owners"],
    aliases: ["start business", "California LLC", "register company", "business license", "form a corporation", "sole proprietor"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Use California’s business guide", url: "https://calosba.ca.gov/for-small-businesses-and-non-profits/set-up-your-business-in-california/" },
    steps: [
      { id: "plan", title: "Choose a structure and name", detail: "Compare legal and tax implications before filing. Check name availability and any naming rules for the structure you choose.", sourceIds: ["ca-business", "sos-biz"] },
      { id: "register", title: "Register the entity if required", detail: "Corporations, LLCs, and limited partnerships generally file with the Secretary of State. Other structures may use county filings.", sourceIds: ["sos-biz"] },
      { id: "tax", title: "Set up tax accounts", detail: "Check whether you need a federal EIN and register for applicable California tax programs.", sourceIds: ["irs-ein", "ftb-start"] },
      { id: "permits", title: "Check licenses and local permits", detail: "Use CalGold and your city or county to identify permits and registrations for your location and activity.", sourceIds: ["calgold"] }
    ],
    sources: [
      { id: "ca-business", title: "Set Up Your Business in California", url: "https://calosba.ca.gov/for-small-businesses-and-non-profits/set-up-your-business-in-california/", publisher: "California Office of the Small Business Advocate", lastChecked: checked },
      { id: "sos-biz", title: "bizfile Online", url: "https://bizfileonline.sos.ca.gov/", publisher: "California Secretary of State", lastChecked: checked },
      { id: "irs-ein", title: "Employer Identification Number", url: "https://www.irs.gov/businesses/small-businesses-self-employed/employer-id-numbers", publisher: "Internal Revenue Service", lastChecked: checked },
      { id: "ftb-start", title: "Business filing information", url: "https://www.ftb.ca.gov/file/business/index.html", publisher: "California Franchise Tax Board", lastChecked: checked },
      { id: "calgold", title: "CalGold Permit Assistance", url: "https://www.calgold.ca.gov/", publisher: "State of California", lastChecked: checked }
    ]
  },
  {
    id: "journey-ca-birth-certificate",
    slug: "get-a-california-birth-certificate",
    title: "Get a California birth certificate",
    summary: "Identify the correct vital records office, choose an authorized or informational copy, and submit the required identity statement.",
    category: "Documents and identity",
    jurisdiction: "california",
    audience: ["People born in California", "Eligible requesters"],
    aliases: ["birth certificate", "vital record", "proof of birth", "California birth record"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "View California vital records instructions", url: "https://www.cdph.ca.gov/Programs/CHSI/Pages/Vital-Records.aspx" },
    steps: [
      { id: "office", title: "Choose the correct office", detail: "California Department of Public Health and county recorder offices handle copies. The best route can depend on the event date and county.", sourceIds: ["cdph-vital"] },
      { id: "copy", title: "Choose the copy type", detail: "Authorized copies can be used to establish identity; informational copies cannot. Eligibility rules apply to authorized copies.", sourceIds: ["cdph-vital"] },
      { id: "submit", title: "Submit the application and identity statement", detail: "Use the current state or county form and follow notarization and payment instructions for your chosen submission method.", sourceIds: ["cdph-vital"] }
    ],
    sources: [{ id: "cdph-vital", title: "Vital Records", url: "https://www.cdph.ca.gov/Programs/CHSI/Pages/Vital-Records.aspx", publisher: "California Department of Public Health", lastChecked: checked }]
  },
  {
    id: "journey-ca-vote",
    slug: "register-to-vote-in-california",
    title: "Register to vote in California",
    summary: "Check eligibility, register or update your record, and confirm your status through the Secretary of State.",
    category: "Voting and civic life",
    jurisdiction: "california",
    audience: ["Eligible California residents"],
    aliases: ["register to vote", "voter registration", "change party", "change voting address", "California election"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Register on the official state site", url: "https://registertovote.ca.gov/" },
    steps: [
      { id: "eligibility", title: "Check eligibility", detail: "Review California’s citizenship, residency, age, and status requirements before submitting a registration.", sourceIds: ["sos-vote"] },
      { id: "register", title: "Register or update your record", detail: "Use the official online registration system or another state-approved method. Re-register after relevant name, address, or party changes.", sourceIds: ["register-vote", "sos-vote"] },
      { id: "confirm", title: "Check your voter status", detail: "Use the state voter status tool or contact your county elections office to confirm your record and election information.", sourceIds: ["voter-status"] }
    ],
    sources: [
      { id: "sos-vote", title: "Voter Registration", url: "https://www.sos.ca.gov/elections/voter-registration", publisher: "California Secretary of State", lastChecked: checked },
      { id: "register-vote", title: "California Online Voter Registration", url: "https://registertovote.ca.gov/", publisher: "California Secretary of State", lastChecked: checked },
      { id: "voter-status", title: "My Voter Status", url: "https://voterstatus.sos.ca.gov/EN/Authenticate", publisher: "California Secretary of State", lastChecked: checked }
    ]
  },
  {
    id: "journey-federal-taxes",
    slug: "file-a-federal-tax-return",
    title: "File a federal tax return",
    summary: "Determine whether you need to file, gather tax records, choose an IRS-supported filing option, and keep confirmation.",
    category: "Taxes",
    jurisdiction: "federal",
    audience: ["Individual taxpayers"],
    aliases: ["file taxes", "tax return", "income tax", "1040", "IRS filing", "free file"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Go to IRS filing options", url: "https://www.irs.gov/filing/individuals/how-to-file" },
    steps: [
      { id: "requirement", title: "Check whether you need to file", detail: "Use the IRS filing requirement guidance for your income, filing status, age, and other circumstances.", sourceIds: ["irs-file"] },
      { id: "records", title: "Gather tax records", detail: "Collect income statements, deduction or credit records, identity information, and prior-year information required by your chosen filing method.", sourceIds: ["irs-file"] },
      { id: "method", title: "Choose a filing method", detail: "Use an IRS online filing option, approved software or preparer, or paper forms. Eligibility for free services varies.", sourceIds: ["irs-file", "irs-free"] },
      { id: "confirm", title: "Save proof of filing", detail: "Keep the accepted-return confirmation and a copy of the return. Use IRS tools for refund or account follow-up.", sourceIds: ["irs-file"] }
    ],
    sources: [
      { id: "irs-file", title: "How to File", url: "https://www.irs.gov/filing/individuals/how-to-file", publisher: "Internal Revenue Service", lastChecked: checked },
      { id: "irs-free", title: "IRS Free File", url: "https://www.irs.gov/filing/irs-free-file-do-your-taxes-for-free", publisher: "Internal Revenue Service", lastChecked: checked }
    ]
  },
  {
    id: "journey-irs-notice",
    slug: "respond-to-an-irs-notice",
    title: "Respond to an IRS notice or letter",
    summary: "Read the notice carefully, compare it with your records, and respond by the method and date printed on that specific notice.",
    category: "Taxes",
    jurisdiction: "federal",
    audience: ["Taxpayers who received an IRS notice"],
    aliases: ["IRS letter", "tax notice", "IRS mail", "CP notice", "owe IRS", "audit letter"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Understand an IRS notice", url: "https://www.irs.gov/individuals/understanding-your-irs-notice-or-letter" },
    steps: [
      { id: "read", title: "Identify what the notice asks", detail: "Use the notice number and explanation printed on the letter. A notice may request information, explain a change, or require payment or a response.", sourceIds: ["irs-notice"] },
      { id: "compare", title: "Compare the notice with your records", detail: "Check the tax year, amounts, and issue against your filed return and supporting documents before responding.", sourceIds: ["irs-notice"] },
      { id: "respond", title: "Follow the notice-specific instructions", detail: "Respond using the address, phone number, online tool, and date printed on the notice. Keep copies of everything you send.", sourceIds: ["irs-notice"], caution: "GovGuide cannot determine a legal deadline from a generic question; use the date on your actual notice." }
    ],
    sources: [{ id: "irs-notice", title: "Understanding Your IRS Notice or Letter", url: "https://www.irs.gov/individuals/understanding-your-irs-notice-or-letter", publisher: "Internal Revenue Service", lastChecked: checked }]
  },
  {
    id: "journey-ein",
    slug: "get-an-employer-identification-number",
    title: "Get an Employer Identification Number",
    summary: "Confirm that your organization needs an EIN, form the entity first when applicable, and apply directly with the IRS.",
    category: "Business",
    jurisdiction: "federal",
    audience: ["Business owners", "Organizations"],
    aliases: ["EIN", "employer ID", "tax ID for business", "federal tax number", "SS-4"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Apply with the IRS", url: "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number" },
    steps: [
      { id: "need", title: "Confirm that you need an EIN", detail: "The IRS explains when a business or organization needs an EIN and when a responsible party may apply.", sourceIds: ["irs-get-ein"] },
      { id: "form", title: "Form the legal entity first", detail: "If you are creating an LLC, corporation, partnership, or exempt organization, complete the state formation step before requesting the EIN.", sourceIds: ["irs-get-ein"] },
      { id: "apply", title: "Apply directly with the IRS", detail: "Use an official IRS application method. The IRS does not charge for an EIN.", sourceIds: ["irs-get-ein"], action: { label: "Open the IRS EIN page", url: "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number" } }
    ],
    sources: [{ id: "irs-get-ein", title: "Get an Employer Identification Number", url: "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number", publisher: "Internal Revenue Service", lastChecked: checked }]
  },
  {
    id: "journey-fafsa",
    slug: "apply-for-federal-student-aid",
    title: "Apply for federal student aid with the FAFSA form",
    summary: "Create the required StudentAid.gov accounts, gather financial information, submit the FAFSA form, and review school requests.",
    category: "Education",
    jurisdiction: "federal",
    audience: ["Students", "Contributors to a student’s FAFSA form"],
    aliases: ["FAFSA", "college financial aid", "student aid", "Pell grant", "pay for college"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Start at StudentAid.gov", url: "https://studentaid.gov/h/apply-for-aid/fafsa" },
    steps: [
      { id: "account", title: "Create the required StudentAid.gov accounts", detail: "The student and any required contributors need their own accounts. Do not share credentials.", sourceIds: ["studentaid-fafsa"] },
      { id: "prepare", title: "Gather the requested information", detail: "Use the current FAFSA checklist for identity, tax, financial, and school information. Contributor requirements depend on the student’s situation.", sourceIds: ["studentaid-fafsa"] },
      { id: "submit", title: "Complete and submit the FAFSA form", detail: "Review every section, obtain required contributor consent and signatures, and save the submission confirmation.", sourceIds: ["studentaid-fafsa"] },
      { id: "follow", title: "Review the summary and school follow-up", detail: "Correct errors if needed and respond to verification or financial aid requests from each school.", sourceIds: ["studentaid-fafsa"] }
    ],
    sources: [{ id: "studentaid-fafsa", title: "FAFSA Application", url: "https://studentaid.gov/h/apply-for-aid/fafsa", publisher: "Federal Student Aid", lastChecked: checked }]
  },
  {
    id: "journey-medicare",
    slug: "sign-up-for-medicare",
    title: "Sign up for Medicare",
    summary: "Check whether enrollment is automatic, identify your enrollment period, and use Social Security’s application route when action is required.",
    category: "Health care",
    jurisdiction: "federal",
    audience: ["People approaching Medicare eligibility", "Some people with disabilities"],
    aliases: ["Medicare", "turning 65", "health insurance 65", "Medicare Part A", "Medicare Part B"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Check Medicare enrollment", url: "https://www.medicare.gov/basics/get-started-with-medicare/sign-up" },
    steps: [
      { id: "automatic", title: "Check whether enrollment is automatic", detail: "Some people receiving Social Security benefits are enrolled automatically; others must sign up.", sourceIds: ["medicare-signup", "ssa-medicare"] },
      { id: "period", title: "Identify the enrollment period that applies", detail: "The timing and possible consequences of delaying Part B depend on your coverage and circumstances. Use the official enrollment guidance.", sourceIds: ["medicare-signup"] },
      { id: "apply", title: "Apply through Social Security if needed", detail: "Social Security handles Medicare enrollment applications. Medicare.gov explains coverage choices after enrollment.", sourceIds: ["ssa-medicare", "medicare-signup"] }
    ],
    sources: [
      { id: "medicare-signup", title: "Sign up for Medicare", url: "https://www.medicare.gov/basics/get-started-with-medicare/sign-up", publisher: "Centers for Medicare & Medicaid Services", lastChecked: checked },
      { id: "ssa-medicare", title: "Sign up for Medicare", url: "https://www.ssa.gov/medicare/sign-up", publisher: "Social Security Administration", lastChecked: checked }
    ]
  },
  {
    id: "journey-identity-theft",
    slug: "report-and-recover-from-identity-theft",
    title: "Report and recover from identity theft",
    summary: "Create an official recovery plan, secure affected accounts, and keep records as you complete each step.",
    category: "Scams and safety",
    jurisdiction: "federal",
    audience: ["Identity theft victims"],
    aliases: ["identity stolen", "identity theft", "someone used my SSN", "fraud account", "credit fraud"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Start a recovery plan", url: "https://www.identitytheft.gov/" },
    steps: [
      { id: "plan", title: "Create an IdentityTheft.gov recovery plan", detail: "Report what happened to the Federal Trade Commission and use the personalized checklist it generates.", sourceIds: ["identity-theft-gov"] },
      { id: "accounts", title: "Contact affected companies", detail: "Use the recovery plan to close or secure fraudulent accounts and keep confirmation numbers and correspondence.", sourceIds: ["identity-theft-gov"] },
      { id: "credit", title: "Protect your credit files", detail: "Follow the official plan for fraud alerts, credit freezes, and reviewing credit reports when those steps fit your situation.", sourceIds: ["identity-theft-gov"] },
      { id: "records", title: "Keep an incident file", detail: "Save the FTC report, dates, names, letters, and proof of each action. A police report may be useful in some situations.", sourceIds: ["identity-theft-gov"] }
    ],
    sources: [{ id: "identity-theft-gov", title: "IdentityTheft.gov", url: "https://www.identitytheft.gov/", publisher: "Federal Trade Commission", lastChecked: checked }]
  },
  {
    id: "journey-report-fraud",
    slug: "report-a-scam-or-fraud",
    title: "Report a scam or fraud",
    summary: "Protect yourself first, report the incident to the right official system, and preserve evidence for follow-up.",
    category: "Scams and safety",
    jurisdiction: "federal-and-state",
    audience: ["Consumers", "Fraud victims"],
    aliases: ["report scam", "fraud", "scammed", "online scam", "consumer complaint", "ReportFraud"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Use USA.gov’s reporting guide", url: "https://www.usa.gov/where-report-scams" },
    steps: [
      { id: "secure", title: "Stop contact and secure affected accounts", detail: "Do not send more money or information. Contact the payment provider or affected company using a trusted number.", sourceIds: ["usa-report-scams", "ftc-report"] },
      { id: "route", title: "Choose the correct report", detail: "Use USA.gov’s router for the scam type. General consumer fraud can be reported to the FTC; internet crime may also belong with the FBI’s IC3.", sourceIds: ["usa-report-scams", "ftc-report", "ic3"] },
      { id: "evidence", title: "Preserve evidence", detail: "Save messages, receipts, account records, URLs, and report confirmation numbers. Do not upload sensitive information except to the official system that asks for it.", sourceIds: ["usa-report-scams"] }
    ],
    sources: [
      { id: "usa-report-scams", title: "Where to report scams", url: "https://www.usa.gov/where-report-scams", publisher: "USA.gov", lastChecked: checked },
      { id: "ftc-report", title: "ReportFraud.ftc.gov", url: "https://reportfraud.ftc.gov/", publisher: "Federal Trade Commission", lastChecked: checked },
      { id: "ic3", title: "Internet Crime Complaint Center", url: "https://www.ic3.gov/", publisher: "Federal Bureau of Investigation", lastChecked: checked }
    ]
  },
  {
    id: "journey-disaster",
    slug: "apply-for-federal-disaster-assistance",
    title: "Apply for federal disaster assistance",
    summary: "Confirm that your area and loss qualify for an open disaster program, document damage, and apply through DisasterAssistance.gov.",
    category: "Emergencies and disasters",
    jurisdiction: "federal",
    audience: ["People affected by a federally declared disaster"],
    aliases: ["disaster aid", "FEMA help", "wildfire assistance", "flood assistance", "DisasterAssistance", "storm damage"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Check and apply for disaster assistance", url: "https://www.disasterassistance.gov/" },
    steps: [
      { id: "safety", title: "Address immediate safety needs", detail: "Follow local emergency instructions first. Government assistance applications do not replace emergency response or insurance notification.", sourceIds: ["fema-individual"] },
      { id: "check", title: "Check the declared disaster and available help", detail: "Use DisasterAssistance.gov to see whether assistance is available for your location and situation.", sourceIds: ["disaster-gov", "fema-individual"] },
      { id: "document", title: "Document damage and contact insurance", detail: "Photograph damage when safe, keep receipts, and notify your insurer. FEMA may ask about insurance coverage and decisions.", sourceIds: ["fema-individual"] },
      { id: "apply", title: "Apply and save the registration number", detail: "Apply through DisasterAssistance.gov or another FEMA-approved channel, then respond to inspection or document requests.", sourceIds: ["disaster-gov", "fema-individual"] }
    ],
    sources: [
      { id: "disaster-gov", title: "DisasterAssistance.gov", url: "https://www.disasterassistance.gov/", publisher: "Federal Emergency Management Agency", lastChecked: checked },
      { id: "fema-individual", title: "Individual Assistance", url: "https://www.fema.gov/assistance/individual", publisher: "Federal Emergency Management Agency", lastChecked: checked }
    ]
  },
  {
    id: "journey-green-card",
    slug: "renew-or-replace-a-green-card",
    title: "Renew or replace a Green Card",
    summary: "Confirm that Form I-90 is the correct route, prepare the required evidence, and file through USCIS.",
    category: "Immigration and citizenship",
    jurisdiction: "federal",
    audience: ["Lawful permanent residents", "Conditional permanent residents with limited I-90 situations"],
    aliases: ["renew green card", "lost green card", "replace permanent resident card", "I-90", "expired green card"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Review Form I-90", url: "https://www.uscis.gov/i-90" },
    steps: [
      { id: "route", title: "Confirm that Form I-90 is the right route", detail: "USCIS lists the reasons that use Form I-90. Some conditional-resident situations require a different petition.", sourceIds: ["uscis-i90", "usa-green-card"] },
      { id: "evidence", title: "Gather evidence for your filing reason", detail: "Use the current USCIS instructions for the copy, identity, or biographic evidence that applies to your situation.", sourceIds: ["uscis-i90"] },
      { id: "file", title: "File with USCIS and track the receipt", detail: "Use the filing method USCIS allows for your situation. Keep the receipt notice and attend any biometrics appointment requested.", sourceIds: ["uscis-i90"] }
    ],
    sources: [
      { id: "uscis-i90", title: "Application to Replace Permanent Resident Card (Green Card)", url: "https://www.uscis.gov/i-90", publisher: "U.S. Citizenship and Immigration Services", lastChecked: checked },
      { id: "usa-green-card", title: "Renew or replace your Permanent Resident Card", url: "https://www.usa.gov/renew-green-card", publisher: "USA.gov", lastChecked: checked }
    ]
  },
  {
    id: "journey-va-disability",
    slug: "file-a-va-disability-claim",
    title: "File a VA disability claim",
    summary: "Check the benefit route, gather service and medical evidence, submit the claim, and track VA requests.",
    category: "Veterans",
    jurisdiction: "federal",
    audience: ["Veterans", "Eligible service members"],
    aliases: ["VA disability", "veteran benefits", "disability claim", "service connected disability", "VA claim"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Start a VA disability claim", url: "https://www.va.gov/disability/how-to-file-claim/" },
    steps: [
      { id: "route", title: "Confirm the claim type", detail: "VA explains original, increased, secondary, and other disability claim routes. Choose the one that matches what changed or what you are claiming.", sourceIds: ["va-file"] },
      { id: "evidence", title: "Gather supporting evidence", detail: "Evidence commonly includes current medical information and a connection to service. VA lists acceptable evidence and can help obtain some federal records.", sourceIds: ["va-evidence"] },
      { id: "submit", title: "Submit the claim", detail: "File online or use another VA-approved method. Save the confirmation and copies of uploaded evidence.", sourceIds: ["va-file"] },
      { id: "track", title: "Track requests and exams", detail: "Check claim status and attend any requested claim exam. Respond by the instructions in each VA notice.", sourceIds: ["va-file"] }
    ],
    sources: [
      { id: "va-file", title: "How to file a VA disability claim", url: "https://www.va.gov/disability/how-to-file-claim/", publisher: "U.S. Department of Veterans Affairs", lastChecked: checked },
      { id: "va-evidence", title: "Evidence needed for your disability claim", url: "https://www.va.gov/disability/how-to-file-claim/evidence-needed/", publisher: "U.S. Department of Veterans Affairs", lastChecked: checked }
    ]
  },
  {
    id: "journey-social-security-retirement",
    slug: "apply-for-social-security-retirement",
    title: "Apply for Social Security retirement benefits",
    summary: "Review how timing affects your benefit, gather account and banking information, and apply through Social Security.",
    category: "Retirement",
    jurisdiction: "federal",
    audience: ["Workers approaching retirement"],
    aliases: ["Social Security retirement", "retirement benefits", "claim social security", "retire", "SSA retirement"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Apply with Social Security", url: "https://www.ssa.gov/apply" },
    steps: [
      { id: "timing", title: "Review when to start benefits", detail: "Your claiming age affects the monthly amount. Use Social Security’s estimates and official retirement guidance before choosing a start date.", sourceIds: ["ssa-retirement"] },
      { id: "prepare", title: "Gather application information", detail: "Prepare identity, work, family, and direct-deposit information using Social Security’s application checklist.", sourceIds: ["ssa-apply"] },
      { id: "apply", title: "Apply through Social Security", detail: "Apply online when eligible or use the phone or appointment options Social Security provides. Save the confirmation and respond to document requests.", sourceIds: ["ssa-apply"] }
    ],
    sources: [
      { id: "ssa-retirement", title: "Retirement Benefits", url: "https://www.ssa.gov/retirement", publisher: "Social Security Administration", lastChecked: checked },
      { id: "ssa-apply", title: "Apply for Social Security benefits", url: "https://www.ssa.gov/apply", publisher: "Social Security Administration", lastChecked: checked }
    ]
  },
  {
    id: "journey-usps-address",
    slug: "change-your-mailing-address",
    title: "Change your mailing address",
    summary: "Submit an official USPS change of address, then update high-priority government records separately.",
    category: "Moving and addresses",
    jurisdiction: "federal-and-state",
    audience: ["People moving within the United States"],
    aliases: ["change address", "moved", "forward mail", "USPS address", "update government address"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Use the official moving guide", url: "https://www.usa.gov/change-address" },
    steps: [
      { id: "usps", title: "Set up mail forwarding with USPS", detail: "Use the official USPS change-of-address site or a Post Office. Avoid look-alike sites that charge unnecessary fees.", sourceIds: ["usa-address", "usps-move"] },
      { id: "agencies", title: "Update government agencies separately", detail: "Mail forwarding does not change your address with IRS, Social Security, immigration, DMV, voter registration, or benefits programs.", sourceIds: ["usa-address"] },
      { id: "records", title: "Keep confirmations and monitor mail", detail: "Save each confirmation and check old and new mail channels for time-sensitive notices during the transition.", sourceIds: ["usa-address"] }
    ],
    sources: [
      { id: "usa-address", title: "How to change your address", url: "https://www.usa.gov/change-address", publisher: "USA.gov", lastChecked: checked },
      { id: "usps-move", title: "Official USPS Change-of-Address", url: "https://moversguide.usps.com/", publisher: "U.S. Postal Service", lastChecked: checked }
    ]
  },
  {
    id: "journey-federal-benefits",
    slug: "find-government-benefits",
    title: "Find government benefits you may qualify for",
    summary: "Use the official Benefit Finder to identify possible programs, then verify eligibility and apply with the agency that runs each program.",
    category: "Benefits",
    jurisdiction: "federal-and-state",
    audience: ["People seeking government assistance"],
    aliases: ["benefits", "government assistance", "help paying bills", "Benefit Finder", "what aid can I get", "financial help"],
    reviewStatus: "verified",
    reviewedAt: checked,
    officialAction: { label: "Use the official Benefit Finder", url: "https://www.usa.gov/benefit-finder" },
    steps: [
      { id: "finder", title: "Answer the Benefit Finder questions", detail: "USA.gov uses your answers to suggest federal and state programs that may fit. You can skip questions you do not want to answer.", sourceIds: ["benefit-finder"] },
      { id: "review", title: "Review each suggested program", detail: "A suggestion is not an eligibility decision. Open the official program page and check location, income, age, household, or status rules.", sourceIds: ["benefit-finder"] },
      { id: "apply", title: "Apply with the responsible agency", detail: "Use the application link and contact information on the official program page. Keep application confirmations and notices.", sourceIds: ["benefit-finder"] }
    ],
    sources: [{ id: "benefit-finder", title: "Government benefits finder", url: "https://www.usa.gov/benefit-finder", publisher: "USA.gov", lastChecked: checked }]
  }
];

export const journeys = mergeProcessJourneys(legacyJourneys);
