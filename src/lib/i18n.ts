/**
 * English / Bengali strings for the public site and voter portal.
 * The admin dashboard stays in English.
 */
export type Lang = "en" | "bn";
export const LANG_COOKIE = "tt_lang";

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
/** Converts ASCII digits to Bengali digits when lang is "bn". */
export function num(v: number | string, lang: Lang) {
  const s = String(v);
  return lang === "bn" ? s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]) : s;
}

const en = {
  nav: { candidates: "Candidates", how: "How it works", guidelines: "Guidelines", results: "Results", committee: "Committee" },
  voteNow: "Vote now",
  voterPortal: "Voter portal",
  langSwitch: "বাংলা",
  langSwitchLabel: "বাংলায় দেখুন",
  brandSub: "ICT · Islamic University, Kushtia",
  institution: "Islamic University, Bangladesh",
  status: {
    DRAFT: "Draft", SCHEDULED: "Upcoming", LIVE: "Voting live", PAUSED: "Paused", CLOSED: "Closed",
    RESULTS_PUBLISHED: "Results published", NONE: "No election",
  } as Record<string, string>,
  hero: {
    l1: "Your batch.", l2: "Your voice.", l3: "CR Election 2026",
    alt: "আপনার ভোট · আপনার কণ্ঠ",
    lead: (batch: string) => `Choose the Class Representative who will speak for ${batch}. One verified student, one secret ballot — sealed, audited and transparent.`,
    start: "Start voting", open: "Open voter portal", meet: "Meet the candidates", official: "Official results",
    trust: ["OTP-verified voters", "Secret ballot", "Tamper-evident audit log"],
    opensIn: "Voting opens in", closesIn: "Voting closes in",
    statusLabel: "Election status", notAnnounced: "Not yet announced",
    publishedMsg: "The official result has been published by the Election Committee.",
    closedMsg: "Voting has ended. Results are published after verification.",
    scheduleMsg: "The Election Committee will announce the schedule here.",
    pausedMsg: "Voting is temporarily paused by the Election Committee.",
    chipOne: "One ballot per student", chipSealed: "Results sealed until close",
  },
  countdown: { days: "Days", hours: "Hours", minutes: "Minutes", seconds: "Seconds" },
  turnout: { label: "Voter turnout", of: (v: string, e: string) => `${v} of ${e} voted`, auto: "Updates automatically" },
  marquee: (batch: string) => [
    "Islamic University, Bangladesh", "Department of ICT", batch, "One student · one ballot", "Secret & verifiable",
    "Sealed until close", "Mobile-first voting", "Hash-chained audit trail", "Independent Election Committee",
  ],
  campus: {
    eyebrow: "Islamic University · Kushtia", title: "One campus. One voice.",
    sub: "Under the gulmohar trees of our university, the 28th ICT batch chooses who will carry its voice.",
    c1: "The red-brick campus", c2: "The gate", c3: "Where we learn",
  },
  stats: { eligible: "Eligible voters", cast: "Ballots cast", turnout: "Turnout", candidates: "Candidates", window: "Voting window" },
  cand: {
    eyebrow: "Position · Class Representative", title: "Meet the candidates",
    sub: "Approved by the Election Committee. Order does not imply ranking.",
    empty: "Candidates will be announced by the Election Committee.",
    no: "No.", roll: "Roll", introSoon: "Introduction coming soon.", read: "Read manifesto",
    search: "Search by name or roll number", count: (n: string) => `${n} candidates`, noMatch: "No candidate matches your search.",
  },
  how: {
    eyebrow: "Four steps · about two minutes", title: "Vote in under two minutes",
    sub: "Designed for your phone. No app, no account, no passwords.",
    steps: [
      ["Enter your roll", "Type your university roll number."],
      ["Verify the code", "A 6-digit one-time code goes to your registered email or phone."],
      ["Choose & confirm", "Select one candidate, review, then confirm."],
      ["Keep your receipt", "A receipt ID proves your ballot counted — never who you chose."],
    ],
  },
  trust: {
    eyebrow: "Trust by design", title: "Built so nobody has to be trusted",
    sub: "The rules are enforced inside the database itself — not just by the website.",
    cards: [
      ["One person, one vote", "Database-level locking makes a second ballot impossible — even under thousands of simultaneous requests."],
      ["A genuinely secret ballot", "Who voted and what was chosen live in separate tables with no link between them. Your receipt never shows your choice."],
      ["Sealed results", "Candidate-wise counts cannot be computed until voting closes."],
      ["Tamper-evident audit trail", "Every administrative action is recorded in a hash-chained, append-only log."],
      ["Two-person corrections", "No ballot is ever edited. Corrections need a reason and a second administrator’s approval."],
    ],
  },
  timeline: {
    eyebrow: "Election activity", title: "Timeline", sub: "Follow the election from announcement to the official result.",
    inProgress: "In progress", tba: "To be announced",
    items: (n: string) => [
      ["Candidates announced", `${n} approved candidate(s) for Class Representative`],
      ["Voting opens", "Verified students cast one secret ballot"],
      ["Voting closes", "Ballots sealed; no further votes accepted"],
      ["Result verification", "Tally reconciled and verified by the Results Officer"],
      ["Official result", "Published with a downloadable report"],
    ],
  },
  faq: {
    eyebrow: "Before you vote", title: "Election guidelines", sub: "Enforced by the system and by the Election Committee.", go: "Go to voter portal",
    items: (batch: string) => [
      ["Who can vote?", `Only registered, active students of ${batch}. Your roll number must be on the official register.`],
      ["How many votes do I get?", "Exactly one ballot for one Class Representative candidate. Once submitted, it is final — nobody, including administrators, can change it."],
      ["I didn’t get my code.", "Wait a minute and request a new one, and check spam. If your registered contact is wrong, report it on the help page so the committee can correct it."],
      ["Can someone see who I voted for?", "No. Your identity and your choice are stored separately with no link between them. Your receipt proves a ballot was recorded, not what it contained."],
      ["Someone voted using my identity.", "Report it immediately on the help page. The committee investigates in person. A report never creates an extra ballot."],
      ["Can I vote for someone else or share my code?", "No. Voting on behalf of others is misconduct. Never share your one-time code — committee members will never ask for it."],
    ],
  },
  committee: {
    eyebrow: "Independent oversight", title: "Election Committee", empty: "Committee members will be listed here once announced.",
    help: "Need help?", helpText: "Code not arriving, roll not accepted, or a suspected misuse of your identity — tell the committee.",
    anyPhone: "Works on any modern phone browser", report: "Report a problem",
  },
  cta: { a: "Make your vote ", b: "count", c: ".", live: "Voting is live. It takes under two minutes.", notLive: "Open the voter portal when the election goes live.", cast: "Cast your vote", watermark: "ভোট" },
  footer: {
    about: (dept: string, inst: string) => `The official Class Representative election portal of TechTitans-28, ${dept}, ${inst}.`,
    election: "Election", support: "Support",
    links: { portal: "Voter portal", results: "Results & turnout", verify: "Verify a receipt", report: "Report a problem", guide: "Voting guidelines", admin: "Committee sign-in" },
    copyright: "TechTitans-28 Election Committee", tagline: "One student · one ballot · secret vote",
  },
  vote: {
    secure: "Secure ballot", eyebrow: "Islamic University · ICT", tagline: "Your voice. Your secret ballot.", home: "Election home", needHelp: "Need help?",
    portal: "Voter portal", window: "Voting window", fallbackTitle: "CR Election",
    noneTitle: "No election is open", noneBody: "The Election Committee has not opened an election yet.",
    pausedTitle: "Voting is paused", pausedBody: "The Election Committee has temporarily paused voting. Please try again shortly.",
    closedTitle: "Voting has closed", closedBody: "Thank you to every student who took part.", viewResults: "View results & turnout",
    steps: ["Roll number", "Verification", "Ballot"],
    rollTitle: "Enter your university roll number",
    rollSub: "We’ll send a one-time code to the email or phone registered with the department.",
    rollLabel: "Roll number", rollPh: "e.g. 2128001", send: "Send verification code",
    codeTitle: "Enter your code", rollShort: "Roll",
    sent: "If this roll number is registered and eligible, a 6-digit code has been sent to its registered contact.",
    codeLabel: "6-digit code", codeHint: "The code expires in 5 minutes. Never share it.", verify: "Verify & continue",
    changeRoll: "Change roll", resendIn: (s: string) => `Resend in ${s}s`, resend: "Resend code", enter6: "Enter the 6-digit code.",
  },
  ballot: {
    eyebrow: "Official ballot · Class Representative", title: "Choose one candidate",
    signedIn: "Signed in as", secret: "Your choice is secret.",
    pausedTitle: "Voting is paused", closedTitle: "Voting is not open", cannot: "Your ballot cannot be submitted right now.",
    session: "Session", expiresIn: (t: string) => `expires in ${t}`, expired: "expired",
    expiredTitle: "Session expired", expiredBody1: "For security, please", expiredLink: "verify again", expiredBody2: ". No ballot was submitted.",
    legend: "Class Representative candidates", manifesto: "Manifesto", roll: "Roll",
    reviewEyebrow: "Review your ballot", cr: "Class Representative",
    confirm1: "I confirm this is my choice. I understand my ballot is ", final: "final", confirm2: " and cannot be changed after submission.",
    separate: "Your identity is recorded separately from your choice.",
    selected: "Selected:", selectOne: "Select one candidate", review: "Review choice", back: "Back", submit: "Submit final ballot",
  },
  receipt: {
    title: "Your vote has been recorded", thanks: (t: string) => `Thank you for taking part in ${t}.`,
    id: "Receipt ID", submitted: "Submitted", voter: "Voter", status: "Status", complete: "Voting complete",
    note1: "This receipt proves a ballot was recorded for you. It does not — and cannot — show who you voted for. Keep it to verify later at ",
    verify: "Verify receipt", turnout: "See live turnout", signout: "Finish & sign out",
  },
  verify: {
    eyebrow: "Receipt check", title: "Verify your ballot receipt",
    sub: "Enter the receipt ID you received after voting. We confirm that a ballot was recorded for it and when. Receipts never reveal who you voted for, and do not identify you.",
    label: "Receipt ID", hint: "Format: TT28-XXXX-XXXX-XXXX", button: "Verify receipt", found: "Ballot recorded",
    notFound: "No ballot matches this receipt ID. Check the characters, or contact the Election Committee.",
  },
  help: {
    eyebrow: "Help desk", title: "Report a problem", sub: "Your report goes to the Election Committee and is handled manually. Keep your reference number.",
    misuseT: "Identity misuse.", misuse: "If the portal says you have already voted but you did not, report it here and contact the committee in person with your university ID. The committee investigates every case; a report never automatically issues another ballot.",
    codeT: "Code not received.", code: "Wait one minute and request a new code. Check spam folders. If your registered contact is wrong, the committee must correct it.",
    contact: "Committee contact",
    form: { what: "What happened?", name: "Your name", roll: "Roll number", optional: "Optional", reach: "Phone or email to reach you", details: "Details", noCodes: "Do not include any one-time codes.", submit: "Submit report", received: "Report received", ref: "Your reference number", contactBack: "The Election Committee will contact you using the details you provided." },
    categories: {
      IDENTITY_MISUSE: "Someone else may have voted using my identity", OTP_NOT_RECEIVED: "I did not receive my verification code",
      NOT_ON_REGISTER: "My roll number is not accepted", TECHNICAL: "Technical problem while voting", OTHER: "Other",
    } as Record<string, string>,
  },
  candidatePage: { all: "All candidates", eyebrow: "Candidate · Class Representative", roll: "University roll", go: "Go to voter portal", manifesto: "Manifesto", none: "The candidate has not published a manifesto yet." },
  ui: {
    heroL1: "Your batch,", heroL2a: "Your ", heroL2b: "voice", heroL2c: ".",
    heroSub: "CR Election 2026 · TechTitans-28",
    candidatesN: (n: string) => `${n} candidates`, seeAll: "Meet them all →", sealedAfter: "Results only after voting closes",
    archAlt: "An arched academic building of Islamic University",
    menuOpen: "Open menu", menuClose: "Close menu", mainMenu: "Main menu", mobileMenu: "Site menu",
    verifyReceipt: "Verify a receipt", menuFoot: "Islamic University · Department of ICT",
    searchPh: "Search by name or roll number…", searchLabel: "Search candidates by name or roll number", clear: "Clear search",
    countShort: (n: string) => n, noMatch: (q: string) => `No candidate matches “${q}”.`,
    showAll: "Show all candidates", more: (n: string) => `${n} more`, manifesto: "Manifesto", roll: "Roll",
  },
  errors: {} as Record<string, string>,
};

export type Dict = typeof en;

const bn: Dict = {
  nav: { candidates: "প্রার্থী", how: "ভোটদান পদ্ধতি", guidelines: "নির্দেশিকা", results: "ফলাফল", committee: "নির্বাচন কমিটি" },
  voteNow: "ভোট দিন",
  voterPortal: "ভোটার পোর্টাল",
  langSwitch: "English",
  langSwitchLabel: "View in English",
  brandSub: "আইসিটি · ইসলামী বিশ্ববিদ্যালয়, কুষ্টিয়া",
  institution: "ইসলামী বিশ্ববিদ্যালয়, বাংলাদেশ",
  status: {
    DRAFT: "খসড়া", SCHEDULED: "আসন্ন", LIVE: "ভোট চলছে", PAUSED: "স্থগিত", CLOSED: "সমাপ্ত",
    RESULTS_PUBLISHED: "ফলাফল প্রকাশিত", NONE: "কোনো নির্বাচন নেই",
  },
  hero: {
    l1: "আপনার ব্যাচ।", l2: "আপনার কণ্ঠ।", l3: "সিআর নির্বাচন ২০২৬",
    alt: "Your batch · Your voice",
    lead: (batch) => `${batch}-এর হয়ে কে কথা বলবেন, সেই ক্লাস প্রতিনিধিকে বেছে নিন। একজন যাচাইকৃত শিক্ষার্থী, একটি গোপন ব্যালট — সুরক্ষিত, নিরীক্ষিত ও স্বচ্ছ।`,
    start: "ভোট দেওয়া শুরু করুন", open: "ভোটার পোর্টাল খুলুন", meet: "প্রার্থীদের দেখুন", official: "আনুষ্ঠানিক ফলাফল",
    trust: ["ওটিপি-যাচাইকৃত ভোটার", "গোপন ব্যালট", "কারচুপি-প্রতিরোধী অডিট লগ"],
    opensIn: "ভোটগ্রহণ শুরু হতে বাকি", closesIn: "ভোটগ্রহণ শেষ হতে বাকি",
    statusLabel: "নির্বাচনের অবস্থা", notAnnounced: "এখনও ঘোষণা করা হয়নি",
    publishedMsg: "নির্বাচন কমিটি আনুষ্ঠানিক ফলাফল প্রকাশ করেছে।",
    closedMsg: "ভোটগ্রহণ শেষ হয়েছে। যাচাইয়ের পর ফলাফল প্রকাশ করা হবে।",
    scheduleMsg: "নির্বাচন কমিটি এখানে সময়সূচি ঘোষণা করবে।",
    pausedMsg: "নির্বাচন কমিটি সাময়িকভাবে ভোটগ্রহণ স্থগিত রেখেছে।",
    chipOne: "প্রতি শিক্ষার্থী একটি ব্যালট", chipSealed: "ভোট শেষ না হওয়া পর্যন্ত ফলাফল সিলগালা",
  },
  countdown: { days: "দিন", hours: "ঘণ্টা", minutes: "মিনিট", seconds: "সেকেন্ড" },
  turnout: { label: "ভোটার উপস্থিতি", of: (v, e) => `${e} জনের মধ্যে ${v} জন ভোট দিয়েছেন`, auto: "স্বয়ংক্রিয়ভাবে হালনাগাদ হয়" },
  marquee: (batch) => [
    "ইসলামী বিশ্ববিদ্যালয়, বাংলাদেশ", "তথ্য ও যোগাযোগ প্রযুক্তি বিভাগ", batch, "এক শিক্ষার্থী · এক ব্যালট", "গোপন ও যাচাইযোগ্য",
    "ভোট শেষ পর্যন্ত সিলগালা", "মোবাইলেই ভোট", "হ্যাশ-শৃঙ্খলিত অডিট", "স্বাধীন নির্বাচন কমিটি",
  ],
  campus: {
    eyebrow: "ইসলামী বিশ্ববিদ্যালয় · কুষ্টিয়া", title: "এক ক্যাম্পাস। এক কণ্ঠ।",
    sub: "প্রিয় বিশ্ববিদ্যালয়ের কৃষ্ণচূড়ার ছায়ায় আইসিটির ২৮তম ব্যাচ বেছে নেবে, কে বহন করবে তাদের কণ্ঠ।",
    c1: "লাল ইটের ক্যাম্পাস", c2: "প্রধান ফটক", c3: "যেখানে আমরা শিখি",
  },
  stats: { eligible: "যোগ্য ভোটার", cast: "প্রদত্ত ব্যালট", turnout: "উপস্থিতি", candidates: "প্রার্থী", window: "ভোটগ্রহণের সময়" },
  cand: {
    eyebrow: "পদ · ক্লাস প্রতিনিধি (সিআর)", title: "প্রার্থীদের সাথে পরিচিত হোন",
    sub: "নির্বাচন কমিটি কর্তৃক অনুমোদিত। তালিকার ক্রম কোনো র‍্যাঙ্কিং নির্দেশ করে না।",
    empty: "নির্বাচন কমিটি শীঘ্রই প্রার্থীদের নাম ঘোষণা করবে।",
    no: "নং", roll: "রোল", introSoon: "পরিচিতি শীঘ্রই আসছে।", read: "ইশতেহার পড়ুন",
    search: "নাম বা রোল নম্বর দিয়ে খুঁজুন", count: (n) => `${n} জন প্রার্থী`, noMatch: "আপনার খোঁজার সাথে কোনো প্রার্থী মেলেনি।",
  },
  how: {
    eyebrow: "চারটি ধাপ · প্রায় দুই মিনিট", title: "দুই মিনিটেই ভোট দিন",
    sub: "আপনার ফোনের জন্যই তৈরি। কোনো অ্যাপ, অ্যাকাউন্ট বা পাসওয়ার্ড লাগবে না।",
    steps: [
      ["রোল নম্বর দিন", "আপনার বিশ্ববিদ্যালয়ের রোল নম্বর লিখুন।"],
      ["কোড যাচাই করুন", "আপনার নিবন্ধিত ইমেইল বা ফোনে ৬ অঙ্কের একটি এককালীন কোড যাবে।"],
      ["বেছে নিন ও নিশ্চিত করুন", "একজন প্রার্থী বেছে নিন, পর্যালোচনা করুন, তারপর নিশ্চিত করুন।"],
      ["রসিদ সংরক্ষণ করুন", "রসিদ আইডি প্রমাণ করে আপনার ব্যালট গণনা হয়েছে — কাকে ভোট দিয়েছেন তা কখনও নয়।"],
    ],
  },
  trust: {
    eyebrow: "আস্থার ভিত্তিতে নকশা", title: "কাউকে অন্ধ বিশ্বাস করতে হবে না",
    sub: "নিয়মগুলো শুধু ওয়েবসাইটে নয় — সরাসরি ডেটাবেসের ভেতরেই প্রয়োগ করা হয়।",
    cards: [
      ["এক ব্যক্তি, এক ভোট", "ডেটাবেস-স্তরের সুরক্ষায় দ্বিতীয় ব্যালট দেওয়া অসম্ভব — একই সময়ে হাজারো অনুরোধ এলেও।"],
      ["সত্যিকারের গোপন ব্যালট", "কে ভোট দিয়েছেন আর কী বেছে নিয়েছেন — দুটি আলাদা জায়গায় সংরক্ষিত, কোনো সংযোগ ছাড়া। রসিদে কখনও আপনার পছন্দ দেখায় না।"],
      ["সিলগালা ফলাফল", "ভোটগ্রহণ শেষ না হওয়া পর্যন্ত প্রার্থীভিত্তিক গণনা করাই যায় না।"],
      ["কারচুপি-প্রতিরোধী অডিট", "প্রতিটি প্রশাসনিক কাজ হ্যাশ-শৃঙ্খলিত, অপরিবর্তনীয় লগে সংরক্ষিত থাকে।"],
      ["দুই-ব্যক্তির সংশোধন", "কোনো ব্যালট কখনও সম্পাদনা করা হয় না। সংশোধনে কারণ ও দ্বিতীয় একজন প্রশাসকের অনুমোদন লাগে।"],
    ],
  },
  timeline: {
    eyebrow: "নির্বাচনী কার্যক্রম", title: "সময়রেখা", sub: "ঘোষণা থেকে আনুষ্ঠানিক ফলাফল পর্যন্ত নির্বাচন অনুসরণ করুন।",
    inProgress: "চলমান", tba: "পরে ঘোষণা করা হবে",
    items: (n) => [
      ["প্রার্থী ঘোষণা", `ক্লাস প্রতিনিধি পদে ${n} জন অনুমোদিত প্রার্থী`],
      ["ভোটগ্রহণ শুরু", "যাচাইকৃত শিক্ষার্থীরা একটি করে গোপন ব্যালট দেবেন"],
      ["ভোটগ্রহণ শেষ", "ব্যালট সিলগালা; আর কোনো ভোট গ্রহণ করা হবে না"],
      ["ফলাফল যাচাই", "ফলাফল কর্মকর্তা গণনা মিলিয়ে যাচাই করবেন"],
      ["আনুষ্ঠানিক ফলাফল", "ডাউনলোডযোগ্য প্রতিবেদনসহ প্রকাশ"],
    ],
  },
  faq: {
    eyebrow: "ভোট দেওয়ার আগে", title: "নির্বাচনী নির্দেশিকা", sub: "সিস্টেম ও নির্বাচন কমিটি — উভয়েই এগুলো প্রয়োগ করে।", go: "ভোটার পোর্টালে যান",
    items: (batch) => [
      ["কে ভোট দিতে পারবেন?", `শুধুমাত্র ${batch}-এর নিবন্ধিত ও সক্রিয় শিক্ষার্থীরা। আপনার রোল নম্বর অবশ্যই অফিসিয়াল তালিকায় থাকতে হবে।`],
      ["আমি কয়টি ভোট দিতে পারব?", "ক্লাস প্রতিনিধি পদে ঠিক একটি ব্যালট। জমা দেওয়ার পর তা চূড়ান্ত — প্রশাসকসহ কেউই তা পরিবর্তন করতে পারবেন না।"],
      ["আমি কোড পাইনি।", "এক মিনিট অপেক্ষা করে নতুন কোড চান এবং স্প্যাম ফোল্ডার দেখুন। নিবন্ধিত যোগাযোগ তথ্য ভুল হলে সাহায্য পাতায় জানান, কমিটি তা সংশোধন করবে।"],
      ["কেউ কি দেখতে পারবে আমি কাকে ভোট দিয়েছি?", "না। আপনার পরিচয় ও আপনার পছন্দ আলাদাভাবে সংরক্ষিত, দুটির মধ্যে কোনো সংযোগ নেই। রসিদ শুধু প্রমাণ করে একটি ব্যালট জমা হয়েছে, তাতে কী ছিল তা নয়।"],
      ["কেউ আমার পরিচয় ব্যবহার করে ভোট দিয়েছে।", "অবিলম্বে সাহায্য পাতায় জানান। কমিটি সরাসরি তদন্ত করবে। অভিযোগ করলে কখনও স্বয়ংক্রিয়ভাবে অতিরিক্ত ব্যালট দেওয়া হয় না।"],
      ["আমি কি অন্যের হয়ে ভোট দিতে বা কোড শেয়ার করতে পারি?", "না। অন্যের হয়ে ভোট দেওয়া অসদাচরণ। আপনার এককালীন কোড কখনও কাউকে দেবেন না — কমিটির সদস্যরা কখনও তা চাইবেন না।"],
    ],
  },
  committee: {
    eyebrow: "স্বাধীন তত্ত্বাবধান", title: "নির্বাচন কমিটি", empty: "ঘোষণার পর কমিটির সদস্যদের নাম এখানে দেওয়া হবে।",
    help: "সাহায্য প্রয়োজন?", helpText: "কোড আসছে না, রোল নম্বর গ্রহণ হচ্ছে না, বা পরিচয়ের অপব্যবহারের সন্দেহ — কমিটিকে জানান।",
    anyPhone: "যেকোনো আধুনিক মোবাইল ব্রাউজারে চলে", report: "সমস্যা জানান",
  },
  cta: { a: "আপনার ভোট, আপনার ", b: "অধিকার", c: "।", live: "ভোটগ্রহণ চলছে। সময় লাগবে দুই মিনিটেরও কম।", notLive: "নির্বাচন শুরু হলে ভোটার পোর্টাল খুলুন।", cast: "ভোট দিন", watermark: "ভোট" },
  footer: {
    about: () => "টেকটাইটানস-২৮, তথ্য ও যোগাযোগ প্রযুক্তি বিভাগ, ইসলামী বিশ্ববিদ্যালয়ের ক্লাস প্রতিনিধি নির্বাচনের অফিসিয়াল পোর্টাল।",
    election: "নির্বাচন", support: "সহায়তা",
    links: { portal: "ভোটার পোর্টাল", results: "ফলাফল ও উপস্থিতি", verify: "রসিদ যাচাই", report: "সমস্যা জানান", guide: "ভোটদান নির্দেশিকা", admin: "কমিটি লগইন" },
    copyright: "টেকটাইটানস-২৮ নির্বাচন কমিটি", tagline: "এক শিক্ষার্থী · এক ব্যালট · গোপন ভোট",
  },
  vote: {
    secure: "সুরক্ষিত ব্যালট", eyebrow: "ইসলামী বিশ্ববিদ্যালয় · আইসিটি", tagline: "আপনার কণ্ঠ। আপনার গোপন ব্যালট।", home: "নির্বাচনের মূল পাতা", needHelp: "সাহায্য প্রয়োজন?",
    portal: "ভোটার পোর্টাল", window: "ভোটগ্রহণের সময়", fallbackTitle: "সিআর নির্বাচন",
    noneTitle: "কোনো নির্বাচন চালু নেই", noneBody: "নির্বাচন কমিটি এখনও কোনো নির্বাচন শুরু করেনি।",
    pausedTitle: "ভোটগ্রহণ স্থগিত", pausedBody: "নির্বাচন কমিটি সাময়িকভাবে ভোটগ্রহণ স্থগিত রেখেছে। একটু পরে আবার চেষ্টা করুন।",
    closedTitle: "ভোটগ্রহণ শেষ হয়েছে", closedBody: "অংশ নেওয়ার জন্য প্রত্যেক শিক্ষার্থীকে ধন্যবাদ।", viewResults: "ফলাফল ও উপস্থিতি দেখুন",
    steps: ["রোল নম্বর", "যাচাই", "ব্যালট"],
    rollTitle: "আপনার বিশ্ববিদ্যালয়ের রোল নম্বর লিখুন",
    rollSub: "বিভাগে নিবন্ধিত আপনার ইমেইল বা ফোনে আমরা একটি এককালীন কোড পাঠাব।",
    rollLabel: "রোল নম্বর", rollPh: "যেমন: 2128001", send: "যাচাই কোড পাঠান",
    codeTitle: "আপনার কোড লিখুন", rollShort: "রোল",
    sent: "রোল নম্বরটি নিবন্ধিত ও যোগ্য হলে, নিবন্ধিত যোগাযোগ ঠিকানায় একটি ৬ অঙ্কের কোড পাঠানো হয়েছে।",
    codeLabel: "৬ অঙ্কের কোড", codeHint: "কোডটির মেয়াদ ৫ মিনিট। কখনও কাউকে দেবেন না।", verify: "যাচাই করে এগিয়ে যান",
    changeRoll: "রোল পরিবর্তন", resendIn: (s) => `${s} সেকেন্ড পর আবার পাঠানো যাবে`, resend: "আবার কোড পাঠান", enter6: "৬ অঙ্কের কোডটি লিখুন।",
  },
  ballot: {
    eyebrow: "অফিসিয়াল ব্যালট · ক্লাস প্রতিনিধি", title: "একজন প্রার্থী বেছে নিন",
    signedIn: "প্রবেশ করেছেন:", secret: "আপনার পছন্দ গোপন থাকবে।",
    pausedTitle: "ভোটগ্রহণ স্থগিত", closedTitle: "ভোটগ্রহণ চালু নেই", cannot: "এই মুহূর্তে আপনার ব্যালট জমা দেওয়া যাবে না।",
    session: "সেশন", expiresIn: (t) => `শেষ হবে ${t} পর`, expired: "মেয়াদোত্তীর্ণ",
    expiredTitle: "সেশনের মেয়াদ শেষ", expiredBody1: "নিরাপত্তার জন্য অনুগ্রহ করে", expiredLink: "আবার যাচাই করুন", expiredBody2: "। কোনো ব্যালট জমা হয়নি।",
    legend: "ক্লাস প্রতিনিধি পদপ্রার্থী", manifesto: "ইশতেহার", roll: "রোল",
    reviewEyebrow: "আপনার ব্যালট পর্যালোচনা করুন", cr: "ক্লাস প্রতিনিধি",
    confirm1: "আমি নিশ্চিত করছি এটিই আমার পছন্দ। আমি বুঝি যে আমার ব্যালট ", final: "চূড়ান্ত", confirm2: " এবং জমা দেওয়ার পর পরিবর্তন করা যাবে না।",
    separate: "আপনার পরিচয় আপনার পছন্দ থেকে আলাদাভাবে সংরক্ষিত হয়।",
    selected: "নির্বাচিত:", selectOne: "একজন প্রার্থী বেছে নিন", review: "পছন্দ পর্যালোচনা", back: "ফিরে যান", submit: "চূড়ান্ত ব্যালট জমা দিন",
  },
  receipt: {
    title: "আপনার ভোট গ্রহণ করা হয়েছে", thanks: (t) => `${t}-এ অংশ নেওয়ার জন্য ধন্যবাদ।`,
    id: "রসিদ আইডি", submitted: "জমার সময়", voter: "ভোটার", status: "অবস্থা", complete: "ভোটদান সম্পন্ন",
    note1: "এই রসিদ প্রমাণ করে আপনার একটি ব্যালট জমা হয়েছে। আপনি কাকে ভোট দিয়েছেন তা এটি দেখায় না — দেখাতেও পারে না। পরে যাচাইয়ের জন্য সংরক্ষণ করুন: ",
    verify: "রসিদ যাচাই", turnout: "সরাসরি উপস্থিতি দেখুন", signout: "শেষ করে বের হন",
  },
  verify: {
    eyebrow: "রসিদ যাচাই", title: "আপনার ব্যালটের রসিদ যাচাই করুন",
    sub: "ভোট দেওয়ার পর পাওয়া রসিদ আইডি লিখুন। আমরা নিশ্চিত করব যে এর বিপরীতে একটি ব্যালট জমা হয়েছে এবং কখন। রসিদ কখনও আপনার পছন্দ বা পরিচয় প্রকাশ করে না।",
    label: "রসিদ আইডি", hint: "ফরম্যাট: TT28-XXXX-XXXX-XXXX", button: "রসিদ যাচাই করুন", found: "ব্যালট জমা হয়েছে",
    notFound: "এই রসিদ আইডির সাথে কোনো ব্যালট মেলেনি। অক্ষরগুলো আবার দেখুন, অথবা নির্বাচন কমিটির সাথে যোগাযোগ করুন।",
  },
  help: {
    eyebrow: "সহায়তা কেন্দ্র", title: "সমস্যা জানান", sub: "আপনার অভিযোগ নির্বাচন কমিটির কাছে যাবে এবং তারা নিজেরা তা দেখবেন। রেফারেন্স নম্বরটি সংরক্ষণ করুন।",
    misuseT: "পরিচয়ের অপব্যবহার।", misuse: "আপনি ভোট না দিলেও পোর্টাল যদি বলে আপনি ইতিমধ্যে ভোট দিয়েছেন, এখানে জানান এবং বিশ্ববিদ্যালয়ের আইডি কার্ডসহ সরাসরি কমিটির সাথে যোগাযোগ করুন। কমিটি প্রতিটি ঘটনা তদন্ত করে; অভিযোগ করলে কখনও স্বয়ংক্রিয়ভাবে নতুন ব্যালট দেওয়া হয় না।",
    codeT: "কোড পাইনি।", code: "এক মিনিট অপেক্ষা করে নতুন কোড চান। স্প্যাম ফোল্ডার দেখুন। নিবন্ধিত যোগাযোগ তথ্য ভুল হলে কমিটিকে তা সংশোধন করতে হবে।",
    contact: "কমিটির যোগাযোগ",
    form: { what: "কী হয়েছে?", name: "আপনার নাম", roll: "রোল নম্বর", optional: "ঐচ্ছিক", reach: "যোগাযোগের ফোন বা ইমেইল", details: "বিস্তারিত", noCodes: "কোনো এককালীন কোড লিখবেন না।", submit: "অভিযোগ জমা দিন", received: "অভিযোগ গৃহীত হয়েছে", ref: "আপনার রেফারেন্স নম্বর", contactBack: "আপনার দেওয়া তথ্য ব্যবহার করে নির্বাচন কমিটি যোগাযোগ করবে।" },
    categories: {
      IDENTITY_MISUSE: "কেউ হয়তো আমার পরিচয় ব্যবহার করে ভোট দিয়েছে", OTP_NOT_RECEIVED: "আমি যাচাই কোড পাইনি",
      NOT_ON_REGISTER: "আমার রোল নম্বর গ্রহণ করা হচ্ছে না", TECHNICAL: "ভোট দেওয়ার সময় প্রযুক্তিগত সমস্যা", OTHER: "অন্যান্য",
    },
  },
  candidatePage: { all: "সকল প্রার্থী", eyebrow: "প্রার্থী · ক্লাস প্রতিনিধি", roll: "বিশ্ববিদ্যালয় রোল", go: "ভোটার পোর্টালে যান", manifesto: "ইশতেহার", none: "প্রার্থী এখনও ইশতেহার প্রকাশ করেননি।" },
  ui: {
    heroL1: "আপনার ব্যাচ,", heroL2a: "আপনার ", heroL2b: "কণ্ঠ", heroL2c: "।",
    heroSub: "সিআর নির্বাচন ২০২৬ · টেকটাইটানস-২৮",
    candidatesN: (n) => `${n} জন প্রার্থী`, seeAll: "সবার পরিচিতি দেখুন →", sealedAfter: "ভোট শেষে ফলাফল",
    archAlt: "ইসলামী বিশ্ববিদ্যালয়ের খিলানযুক্ত একাডেমিক ভবন",
    menuOpen: "মেনু খুলুন", menuClose: "মেনু বন্ধ করুন", mainMenu: "প্রধান মেনু", mobileMenu: "সাইটের মেনু",
    verifyReceipt: "রসিদ যাচাই করুন", menuFoot: "ইসলামী বিশ্ববিদ্যালয় · তথ্য ও যোগাযোগ প্রযুক্তি বিভাগ",
    searchPh: "নাম বা রোল নম্বর দিয়ে খুঁজুন…", searchLabel: "নাম বা রোল নম্বর দিয়ে প্রার্থী খুঁজুন", clear: "খোঁজা মুছুন",
    countShort: (n) => `${n} জন`, noMatch: (q) => `“${q}” নামে বা রোলে কোনো প্রার্থী পাওয়া যায়নি।`,
    showAll: "সব প্রার্থী দেখুন", more: (n) => `আরও ${n} জন`, manifesto: "ইশতেহার", roll: "রোল",
  },
  errors: {
    VALIDATION: "তথ্যে ভুল আছে। আবার দেখে নিন।",
    INVALID_OTP: "কোডটি ভুল অথবা মেয়াদোত্তীর্ণ।",
    OTP_LOCKED: "অনেকবার ভুল চেষ্টা হয়েছে। নতুন কোড চান।",
    RATE_LIMITED: "অনেক বেশি অনুরোধ। একটু অপেক্ষা করে আবার চেষ্টা করুন।",
    ALREADY_VOTED: "এই নির্বাচনে আপনার একটি ব্যালট ইতিমধ্যে গৃহীত হয়েছে।",
    INVALID_CANDIDATE: "নির্বাচিত প্রার্থী ব্যালটে নেই।",
    NOT_ELIGIBLE: "এই নির্বাচনে আপনি ভোট দেওয়ার যোগ্য নন।",
    ELECTION_NOT_OPEN: "ভোটগ্রহণ এখনও শুরু হয়নি।",
    ELECTION_PAUSED: "নির্বাচন কমিটি সাময়িকভাবে ভোটগ্রহণ স্থগিত রেখেছে।",
    ELECTION_CLOSED: "ভোটগ্রহণ শেষ হয়েছে।",
    NO_ELECTION: "কোনো নির্বাচন চালু নেই।",
    SESSION_INVALID: "আপনার সেশনের মেয়াদ শেষ। আবার যাচাই করুন।",
    NETWORK: "নেটওয়ার্ক সমস্যা — সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।",
    CSRF: "নিরাপত্তা যাচাই ব্যর্থ হয়েছে। পাতাটি রিফ্রেশ করে আবার চেষ্টা করুন।",
    INTERNAL: "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।",
    BAD_REQUEST: "অনুরোধটি প্রক্রিয়া করা যায়নি।",
    UNAUTHENTICATED: "চালিয়ে যেতে লগইন করুন।",
    MFA_REQUIRED: "দুই-ধাপের যাচাই প্রয়োজন।",
    INVALID_CREDENTIALS: "ইমেইল বা পাসওয়ার্ড সঠিক নয়।",
    FORBIDDEN: "এই কাজটি করার অনুমতি আপনার নেই।",
    NOT_FOUND: "চাওয়া রেকর্ডটি পাওয়া যায়নি।",
    CONFLICT: "এই পরিবর্তন বর্তমান অবস্থার সাথে সাংঘর্ষিক।",
    INVALID_TRANSITION: "নির্বাচনের অবস্থার এই পরিবর্তন অনুমোদিত নয়।",
    ELECTION_LOCKED: "এই নির্বাচনে এখন আর এভাবে পরিবর্তন করা যাবে না।",
    CANDIDATES_LOCKED: "ভোটগ্রহণ শুরু হলে প্রার্থী তালিকা লক হয়ে যায়।",
    RESULTS_SEALED: "নির্বাচন শেষ না হওয়া পর্যন্ত প্রার্থীভিত্তিক ফলাফল সিলগালা।",
    SECOND_PERSON_REQUIRED: "এই অনুরোধটি ভিন্ন একজন অনুমোদিত অ্যাডমিনকে পর্যালোচনা করতে হবে।",
    INVALID_STATE: "বর্তমান অবস্থায় এই কাজটি সম্ভব নয়।",
    RECONCILIATION_FAILED: "ব্যালট ও অংশগ্রহণের সংখ্যা মিলছে না।",
    TIE_NOTE_REQUIRED: "ফলাফলে সমান ভোট। কমিটির সমতা নিষ্পত্তির নোট লিপিবদ্ধ করুন।",
    PAYLOAD_TOO_LARGE: "আপলোড করা ফাইলটি খুব বড়।",
    UNSUPPORTED_MEDIA: "এই ধরনের ফাইল সমর্থিত নয়।",
  },
};

export const DICT: Record<Lang, Dict> = { en, bn };
export const dict = (lang: Lang) => DICT[lang];

const BENGALI = /[\u0980-\u09FF]/;

/**
 * User-facing message for an API error. In Bengali, a message the server already wrote in Bengali
 * (the admin-only services do) is kept because it is more specific; otherwise the code's Bengali text is used.
 */
export function errorText(lang: Lang, err: { code: string; message: string }) {
  if (lang !== "bn" || BENGALI.test(err.message)) return err.message;
  return DICT.bn.errors[err.code] || err.message;
}
