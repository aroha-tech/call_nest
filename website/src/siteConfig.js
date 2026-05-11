/**
 * Call X Time product marketing site (e.g. callxtime.com).
 * Operated by Arohva Global — see corporate site in /website-arohva.
 *
 * All visible content for the marketing pages lives in this file so
 * non-developers can update copy, pricing and FAQs without touching JSX.
 */
export const siteConfig = {
  // --- Brand / company -----------------------------------------------------
  siteBrandName: 'Call X Time',
  saasProductName: 'Call X Time',
  tagline: 'Run your call team from one place',
  heroSubtitle:
    'Call X Time gives your team a single workspace for the dialer, contacts, dispositions, campaigns, follow-ups, deals and reports — without juggling spreadsheets, WhatsApp groups and disconnected tools.',
  shortPitch:
    'Call X Time is the operations platform for outbound and follow-up call teams — built by Arohva Global for Indian and global businesses that need clear records, multi-channel outreach and measurable performance.',

  companyLegalName: 'Arohva Global',
  companyTagline: 'Software for serious call teams.',
  addressLines: [
    '[Street / building — update in src/siteConfig.js]',
    '[City, State — PIN]',
    'India',
  ],

  contactEmail: 'hello@callxtime.com',
  supportEmail: 'support@callxtime.com',
  salesEmail: 'sales@callxtime.com',
  phone: '+91-00000-00000',
  phoneDisplay: '+91 00000 00000',

  gstin: '24EOLPP8190F1ZH',
  pan: 'EOLPP8190F',

  websiteUrl: 'https://callxtime.com',
  companySiteUrl: 'https://arohva.com',
  productSiteUrl: 'https://callxtime.com',
  appUrl: 'https://app.callxtime.com',

  metaDescription:
    'Call X Time — call centre and team operations platform by Arohva Global. Dialer, contacts, campaigns, dispositions, WhatsApp & email outreach, deals, follow-ups and reports in one workspace.',
  documentTitle: 'Call X Time — call operations, contacts and team workflows in one place',

  jurisdictionCity: 'Gujarat, India',
  lastUpdatedPrivacy: '2026-05-10',
  lastUpdatedTerms: '2026-05-10',

  // --- Navigation ----------------------------------------------------------
  primaryNav: [
    { label: 'Home', to: '/' },
    { label: 'Features', to: '/features' },
    { label: 'Pricing', to: '/pricing' },
    { label: 'Integrations', to: '/integrations' },
    { label: 'Roadmap', to: '/roadmap' },
    { label: 'About', to: '/about' },
    { label: 'Contact', to: '/contact' },
  ],

  // --- Hero metrics --------------------------------------------------------
  heroBadgeLabel: "What's New?",
  heroBadgeText: 'Multi-channel campaigns + Schedule Hub follow-ups',

  trustedByLine:
    'Trusted by call, sales and support teams scaling outbound operations across India',
  trustedByLogos: [
    'AcmeCo', 'Northwind', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Stark Industries',
  ],

  // --- Core "shipped today" features ---------------------------------------
  // Things we actually ship in the platform right now.
  coreFeatures: [
    {
      tag: 'Dialer',
      title: 'Smart Dialer Sessions',
      description:
        'Set up dialer sessions, work through call lists with full context on the contact, and capture outcomes the moment a call ends.',
    },
    {
      tag: 'Contacts',
      title: 'Contacts & Lead Management',
      description:
        'Tags, custom fields, advanced filters, blacklists, bulk imports and lead activity timelines — built for teams that move thousands of contacts.',
    },
    {
      tag: 'Campaigns',
      title: 'Multi-channel Campaigns',
      description:
        'Run call, WhatsApp and email campaigns with shared filters, statuses and types so the whole team works from one playbook.',
    },
    {
      tag: 'Dispositions',
      title: 'Standardised Dispositions',
      description:
        'Configure call outcomes, contact statuses and temperatures once and enforce them across every agent — no more freeform notes.',
    },
    {
      tag: 'Schedule Hub',
      title: 'Follow-ups & Schedule Hub',
      description:
        'Schedule callbacks, meetings and reminder events from any contact card and never lose a follow-up promise.',
    },
    {
      tag: 'Reports',
      title: 'Performance Reports',
      description:
        'Built-in reports and charts on agent activity, call outcomes, campaign performance and pipeline health.',
    },
  ],

  // --- Why choose us pills -------------------------------------------------
  whyChooseUs: [
    'Built for Indian call teams',
    'Multi-tenant from day one',
    'Tenant-isolated data & audit trail',
    'WhatsApp + Email outreach in one place',
    'Easy to set up, easy to scale',
    'Honest pricing, no per-seat traps',
    'Clear roadmap, real product team',
  ],

  // --- Workflow steps ------------------------------------------------------
  howItWorks: [
    {
      step: '01',
      title: 'Import or sync contacts',
      description:
        'Upload CSVs, map custom fields and assign owners — or push contacts in from your existing systems.',
    },
    {
      step: '02',
      title: 'Run dialer sessions',
      description:
        'Build call lists with filters, work through them in a focused dialer view, and tag every call with a clear disposition.',
    },
    {
      step: '03',
      title: 'Follow up across channels',
      description:
        'Send WhatsApp templates, transactional emails and reminder events from the same workspace, tied to the same contact.',
    },
    {
      step: '04',
      title: 'Measure and improve',
      description:
        'Dashboards and performance reports show what is working, who is converting and where deals are stuck.',
    },
  ],

  // --- Pricing -------------------------------------------------------------
  pricing: {
    yearlySaveLabel: 'Save up to 20%',
    monthly: [
      {
        name: 'Starter',
        bestFor: 'Best for small teams just getting structured',
        priceLabel: '\u20B91,499',
        period: '/user / month',
        ctaLabel: 'Start with Starter',
        ctaTarget: '/contact',
        popular: false,
        features: [
          'Up to 5 users',
          'Contacts, tags & custom fields',
          'Basic dialer sessions',
          'Standard call dispositions',
          'WhatsApp messaging (single account)',
          'Email support',
        ],
      },
      {
        name: 'Pro',
        bestFor: 'For growing call teams running multi-channel campaigns',
        priceLabel: '\u20B92,999',
        period: '/user / month',
        ctaLabel: 'Get Pro',
        ctaTarget: '/contact',
        popular: true,
        features: [
          'Everything in Starter',
          'Unlimited users (fair-use)',
          'Multi-channel campaigns',
          'Schedule Hub & follow-ups',
          'Performance reports & charts',
          'Custom dispositions, statuses & temperatures',
          'WhatsApp Cloud API + Email integrations',
          'Priority support',
        ],
      },
      {
        name: 'Enterprise',
        bestFor: 'For large operations with compliance & integration needs',
        priceLabel: 'Custom',
        period: 'annual contract',
        ctaLabel: 'Talk to sales',
        ctaTarget: '/contact',
        popular: false,
        features: [
          'Everything in Pro',
          'Dedicated tenant infrastructure (on request)',
          'Single sign-on & advanced security review',
          'Custom integrations & data feeds',
          'Onboarding & training program',
          'Named account manager',
          'Custom SLA',
        ],
      },
    ],
    yearly: [
      {
        name: 'Starter',
        bestFor: 'Best for small teams just getting structured',
        priceLabel: '\u20B914,388',
        period: '/user / year',
        savings: 'Save 20% vs monthly',
        ctaLabel: 'Start with Starter',
        ctaTarget: '/contact',
        popular: false,
      },
      {
        name: 'Pro',
        bestFor: 'For growing call teams running multi-channel campaigns',
        priceLabel: '\u20B928,788',
        period: '/user / year',
        savings: 'Save 20% vs monthly',
        ctaLabel: 'Get Pro',
        ctaTarget: '/contact',
        popular: true,
      },
      {
        name: 'Enterprise',
        bestFor: 'For large operations with compliance & integration needs',
        priceLabel: 'Custom',
        period: 'annual contract',
        savings: 'Volume discounts available',
        ctaLabel: 'Talk to sales',
        ctaTarget: '/contact',
        popular: false,
      },
    ],
    comparison: {
      headers: ['Capability', 'Starter', 'Pro', 'Enterprise'],
      rows: [
        ['Users included', 'Up to 5', 'Unlimited (fair-use)', 'Unlimited'],
        ['Contacts & tags', 'Included', 'Included', 'Included'],
        ['Dialer sessions', 'Basic', 'Advanced', 'Advanced'],
        ['Standard dispositions', '\u2713', '\u2713', '\u2713'],
        ['Custom dispositions / statuses / temperatures', '\u2014', '\u2713', '\u2713'],
        ['Multi-channel campaigns', '\u2014', '\u2713', '\u2713'],
        ['Schedule Hub & follow-ups', '\u2014', '\u2713', '\u2713'],
        ['WhatsApp Cloud API', 'Single account', 'Multiple accounts', 'Multiple accounts'],
        ['Email outreach (IMAP / Google OAuth)', 'Limited', '\u2713', '\u2713'],
        ['Performance reports & charts', 'Basic', 'Advanced', 'Advanced'],
        ['SSO / advanced security review', '\u2014', '\u2014', '\u2713'],
        ['Custom integrations', '\u2014', '\u2014', '\u2713'],
        ['Onboarding & training', 'Self-serve', 'Group sessions', 'Dedicated'],
        ['Support', 'Email', 'Priority', 'Named manager + SLA'],
      ],
    },
  },

  // --- Integrations --------------------------------------------------------
  integrations: {
    available: [
      {
        name: 'WhatsApp Cloud API',
        category: 'Messaging',
        description:
          'Send approved templates, log every conversation, and run WhatsApp campaigns tied to the same contacts and dispositions.',
      },
      {
        name: 'Google Workspace (OAuth)',
        category: 'Email & calendar',
        description:
          'Connect Gmail to send transactional emails, attendee meeting invites and follow-ups from your own mailbox.',
      },
      {
        name: 'IMAP / SMTP email',
        category: 'Email',
        description:
          'Bring any compliant business mailbox to send and track outreach without leaving Call X Time.',
      },
      {
        name: 'CSV imports',
        category: 'Data',
        description:
          'Upload contacts and leads in bulk with field mapping, validations and import history.',
      },
      {
        name: 'Webhooks (limited beta)',
        category: 'Automation',
        description:
          'Push contact and call events to your existing automation tools — currently in limited beta.',
      },
    ],
    roadmap: [
      'Public REST API',
      'Zapier / Make.com',
      'HubSpot CRM sync',
      'Zoho CRM sync',
      'Salesforce sync',
      'Razorpay / Stripe billing webhooks',
      'Slack / Microsoft Teams notifications',
      'SMS gateway (DLT-compliant for India)',
      'Voice IVR & cloud telephony partners',
      'Calendly / Google Calendar two-way sync',
    ],
  },

  // --- Roadmap (extra Groilot-style features we don't yet ship) -----------
  roadmap: {
    intro:
      'Here is what we are actively building. Items are grouped by theme, not by quarter — we ship continuously and update this page when items move from in-progress to live.',
    columns: [
      {
        heading: 'Coming next',
        accent: 'green',
        items: [
          {
            title: 'Visual sales pipeline',
            description:
              'Kanban-style pipeline view on top of Deals so reps can drag cards across stages and managers can spot stuck deals instantly.',
          },
          {
            title: 'Customisable dashboards',
            description:
              'Per-user and per-role dashboards with the metrics that matter to that team — built on top of our Performance Reports engine.',
          },
          {
            title: 'Public REST API',
            description:
              'Authenticated, tenant-scoped REST API to read and write contacts, calls, deals and campaigns from your own systems.',
          },
        ],
      },
      {
        heading: 'In design / discovery',
        accent: 'amber',
        items: [
          {
            title: 'AI lead scoring',
            description:
              'Score every contact based on engagement signals (calls, replies, opens) so reps see who to call next without guessing.',
          },
          {
            title: 'AI revenue forecasting',
            description:
              'Forecast deal closures and pipeline coverage using historical disposition and stage-change data — explainable, not a black box.',
          },
          {
            title: 'AI-assisted call notes & summaries',
            description:
              'Auto-summarise call notes and suggest the next disposition, follow-up date and message, with a clear human-in-the-loop step.',
          },
          {
            title: 'AI conversation insights',
            description:
              'Surface recurring objections, winning talk-tracks and coaching opportunities from your team\u2019s call notes.',
          },
        ],
      },
      {
        heading: 'Bigger bets',
        accent: 'blue',
        items: [
          {
            title: 'Cloud telephony partners (India + global)',
            description:
              'Native integrations with one or more cloud-telephony providers so calls can be placed and recorded inside Call X Time.',
          },
          {
            title: 'Mobile companion app',
            description:
              'Field-friendly Android & iOS app for reps who work outside the office.',
          },
          {
            title: 'Workflow automations builder',
            description:
              'Visual builder for triggers and actions across calls, contacts and campaigns — building on our existing Workflow Map.',
          },
          {
            title: 'SOC 2 / ISO 27001 readiness',
            description:
              'Continued investment in audit controls, logging and security reviews for enterprise customers.',
          },
        ],
      },
    ],
  },

  // --- Home: Groilot-style sections (copy aligned to Call X Time) ----------
  homeHero: {
    announcementRight: 'From lead generation to customer retention',
    /** Hero pill — right segment (was static text; now a real link) */
    announcementRightTo: '/features',
    headlineBefore: 'Streamline your calls.',
    headlineAccent: 'Scale your operations with Call X Time',
    primaryCta: 'Start Free Trial',
    secondaryCta: 'Explore Our Pricing',
    /** Hero mockup — animated queue size */
    queueContacts: 142,
  },

  homeBento: {
    eyebrow: 'Core features',
    title: 'Powerful features built to drive sales',
    lead:
      'Everything your sales team needs to automate workflows, gain insights, and keep revenue-critical follow-ups on track.',
    stat2x: {
      value: '2×',
      label: 'Faster response time to qualified leads',
      countUp: { start: 0, end: 2, suffix: '×' },
    },
    teamCard: {
      title: 'Team performance & collaboration',
      body:
        'Keep your sales and operations teams aligned with shared goals, dispositions and activity tracking in one workspace.',
      avatars: ['RK', 'PS', 'AM', 'KV', '+'],
    },
    aiCard: {
      title: 'Lead intelligence (roadmap)',
      body:
        'Identify and prioritise high-intent prospects using engagement signals from calls, WhatsApp and email — rolling out on our public roadmap.',
    },
    stat25: {
      value: '25%',
      label: 'Shorter average follow-up cycles',
      countUp: { start: 0, end: 25, suffix: '%' },
    },
    statTime: {
      value: '8+ hrs',
      label: 'Saved per rep weekly',
      countUp: { start: 0, end: 8, suffix: '+ hrs' },
    },
    automationCard: {
      title: 'Operations automation',
      body:
        'Automate follow-ups, reminders, and tasks so deals keep moving without manual chasing across tools.',
    },
  },

  whyChooseUsTabs: [
    {
      title: 'AI-driven decision making',
      body:
        'Turn dispositions, channel replies and Schedule Hub signals into a clear daily calling priority — without another spreadsheet.',
    },
    {
      title: 'Easy to set up and scale',
      body:
        'Import contacts, configure dispositions once, and invite agents in minutes. Scale to larger teams with the same playbook.',
    },
    {
      title: 'Secure and reliable infrastructure',
      body:
        'Tenant-isolated data, audit-friendly records, and application-level guards on every API — designed for serious operations teams.',
    },
    {
      title: 'Designed for speed, clarity, and growth',
      body:
        'A focused UI for reps, structured outcomes for managers, and reports that leadership can trust.',
    },
    {
      title: 'Automation that saves time',
      body:
        'Templates, reminders, multi-channel campaigns and Schedule Hub reduce the busywork around every call.',
    },
    {
      title: 'Seamless tool integrations',
      body:
        'WhatsApp Cloud API, Google OAuth mail, IMAP/SMTP and CSV imports today — more integrations on the roadmap.',
    },
  ],

  whyChooseUsIntro:
    'Our platform is designed for call-centric revenue teams — streamlining workflows, automating repetitive tasks, and surfacing real-time operational insights.',

  keyFeaturesVisual: [
    {
      tag: 'Pipeline',
      title: 'Visual pipeline tracking',
      description:
        'Track every deal in a clear visual pipeline and see what needs attention instantly.',
      kind: 'pipeline',
    },
    {
      tag: 'Scoring',
      title: 'Lead prioritisation',
      description:
        'Use dispositions, temperatures and channel engagement to focus on the opportunities that actually convert.',
      kind: 'scoring',
    },
    {
      tag: 'Forecasting',
      title: 'Revenue visibility',
      description:
        'Performance reports and pipeline health give leaders a grounded view of what is likely to close.',
      kind: 'forecasting',
    },
    {
      tag: 'Automation',
      title: 'Automated sales workflows',
      description:
        'Save time by automating follow-ups, reminders, and tasks so deals keep moving without effort.',
      kind: 'automation',
    },
  ],

  integrationTeaser: {
    eyebrow: 'Integrations',
    title: 'Powerful integrations at scale',
    lead:
      'Extend Call X Time with messaging, email and data tools your team already relies on — with more connectors shipping continuously.',
    cta: 'Explore integrations',
    tiles: [
      { label: 'WhatsApp', abbr: 'Wa', fade: 0.35 },
      { label: 'Gmail', abbr: 'Gm', fade: 0.5 },
      { label: 'IMAP', abbr: 'Im', fade: 0.65 },
      { label: 'CSV', abbr: 'Cs', fade: 0.85 },
      { label: 'Call X Time', abbr: 'CX', center: true },
      { label: 'Calendar', abbr: 'Ca', fade: 0.85 },
      { label: 'Webhooks', abbr: 'Wh', fade: 0.65 },
      { label: 'Reports', abbr: 'Rp', fade: 0.5 },
      { label: 'Deals', abbr: 'Dl', fade: 0.35 },
    ],
  },

  platformStrip: {
    eyebrow: 'Our platform',
    title: 'Your operations, visualised clearly',
    lead:
      'Get a real-time view of queues, campaigns, dispositions and follow-ups in one intelligent workspace.',
    columns: [
      {
        title: 'Live performance metrics',
        body:
          'See call volumes, outcomes and channel activity as they happen — not at the end of the week.',
      },
      {
        title: 'Predictable follow-up discipline',
        body:
          'Schedule Hub and reminders ensure promises made on calls turn into completed next steps.',
      },
      {
        title: 'Team activity tracking',
        body:
          'Understand who is working which lists, how dispositions are trending, and where coaching helps.',
      },
      {
        title: 'Customisable reporting',
        body:
          'Slice performance by campaign, agent, disposition and channel to match how your business reviews revenue.',
      },
    ],
  },

  humanExpertise: {
    eyebrow: 'AI × Human',
    title: 'Real conversations. Real expertise.',
    lead:
      'Get implementation guidance, workflow design advice, and honest answers from people who have run call operations at scale.',
    cta: 'Talk to sales',
  },

  faqSection: {
    eyebrow: 'FAQs',
    titleLine1: 'Questions?',
    titleLine2: "We've got answers",
    lead:
      'Learn how Call X Time fits into your existing dialer, CRM and messaging stack — and what to expect in the first weeks.',
  },

  blogSection: {
    eyebrow: 'Blogs',
    title: 'Insights, tips & operations trends',
    lead:
      'Practical notes on running disciplined call teams, cleaner dispositions, and multi-channel outreach without chaos.',
    cta: 'Explore all articles',
  },

  // --- Testimonials --------------------------------------------------------
  testimonials: [
    {
      quote:
        '\u201CCall X Time replaced three different tools for us. The team finally has one place to log calls, send WhatsApp messages and book follow-ups.\u201D',
      author: 'Operations Lead, BPO (10\u201350 agents)',
    },
    {
      quote:
        '\u201CDispositions and Schedule Hub alone changed how predictable our pipeline is. We always know what is due today.\u201D',
      author: 'Sales Manager, B2B services',
    },
    {
      quote:
        '\u201COnboarding was unusually smooth for an Indian SaaS \u2014 setup took an afternoon and reports were live the same week.\u201D',
      author: 'Founder, growing call team',
    },
  ],

  // --- FAQs ---------------------------------------------------------------
  faqs: [
    {
      q: 'What is Call X Time used for?',
      a: 'Call X Time is an operations platform for call teams. It combines a dialer, contact and lead management, multi-channel campaigns (call, WhatsApp, email), call dispositions, follow-ups, deals and performance reports in a single tenant-isolated workspace.',
    },
    {
      q: 'Who is Call X Time best for?',
      a: 'Outbound sales, inside sales, telecalling, lead qualification, customer success and BPO teams that need clear records, standardised outcomes and a measurable, auditable workflow.',
    },
    {
      q: 'How quickly can we get started?',
      a: 'Most teams are productive within a day. Standard setup involves importing contacts, configuring dispositions and inviting users. Larger teams can opt for a guided onboarding via the Pro or Enterprise plan.',
    },
    {
      q: 'Is Call X Time suitable for small teams?',
      a: 'Yes. Starter is designed for small teams and individuals who want structure, follow-up discipline and clean records without the complexity of legacy CRMs.',
    },
    {
      q: 'Where is my data hosted? Is it tenant-isolated?',
      a: 'Each customer (tenant) is logically isolated at the application layer. Tenant-scoped queries, indexes and audit fields ensure your contacts, calls and reports cannot be seen by other customers. Hosting region and data residency for Enterprise customers are agreed in writing.',
    },
    {
      q: 'Do you provide onboarding help?',
      a: 'Yes. Self-serve docs and email support are included in Starter. Pro plans include group onboarding sessions. Enterprise plans include a dedicated onboarding and training program with a named account manager.',
    },
    {
      q: 'How do you compare to a generic CRM?',
      a: 'Generic CRMs are deal-first; Call X Time is call-first. The dialer, dispositions, WhatsApp outreach and follow-up engine are first-class \u2014 not afterthought add-ons.',
    },
  ],

  // --- Blog / updates teaser ----------------------------------------------
  blogPosts: [
    {
      title: 'How Indian call teams use dispositions to clean up their pipeline',
      category: 'Operations',
      date: 'Apr 2026',
      excerpt:
        'Standardising call outcomes is the single fastest way to make your pipeline reports trustworthy. Here is the framework we recommend.',
    },
    {
      title: 'Multi-channel outreach without the chaos',
      category: 'Playbook',
      date: 'Apr 2026',
      excerpt:
        'Mixing calls, WhatsApp and email used to mean three tools and zero accountability. Here is how to keep it under one roof.',
    },
    {
      title: 'Schedule Hub: never miss a follow-up promise again',
      category: 'Product',
      date: 'Mar 2026',
      excerpt:
        'A walkthrough of how Schedule Hub turns vague \u201CI will call them next week\u201D into a measurable follow-up workflow.',
    },
    {
      title: 'Why we chose application-level multi-tenancy',
      category: 'Engineering',
      date: 'Mar 2026',
      excerpt:
        'A short note on how Call X Time keeps each customer\u2019s data isolated without spinning up a new database per tenant.',
    },
  ],
};

export function publicSiteHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
