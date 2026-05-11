import { Link } from 'react-router-dom';
import { siteConfig } from '../siteConfig';
import { CountUp } from '../components/CountUp';
import { Reveal } from '../components/Reveal';
import './pages.css';

const featureGroups = [
  {
    title: 'Call execution',
    intro:
      'Everything reps need from "open the queue" to "log the outcome".',
    items: [
      {
        tag: 'Dialer',
        title: 'Dialer sessions',
        description:
          'Build call lists from contact filters, work them inside a focused dialer view, and tag every attempt with a clear disposition.',
      },
      {
        tag: 'Call history',
        title: 'Call attempt history',
        description:
          'Every attempt, every outcome — searchable by agent, contact, campaign or disposition, with a complete audit trail.',
      },
      {
        tag: 'Phone numbers',
        title: 'Tenant + platform phone-number inventory',
        description:
          'Manage which numbers your tenant uses for outbound and how the platform pool is shared, with proper audit fields.',
      },
    ],
  },
  {
    title: 'Contacts & leads',
    intro:
      'Your single source of truth for who you are calling and what happened last.',
    items: [
      {
        tag: 'Contacts',
        title: 'Contacts with custom fields',
        description:
          'Tag, segment and filter contacts using custom fields, advanced filters and saved views.',
      },
      {
        tag: 'Imports',
        title: 'CSV import & history',
        description:
          'Bulk-upload contacts with field mapping, deduplication and a full import history you can audit.',
      },
      {
        tag: 'Compliance',
        title: 'Blacklist & delete policy',
        description:
          'Honour DND/blacklist requests at the tenant level, and configure data-deletion policies that match your contract.',
      },
      {
        tag: 'Lead activity',
        title: 'Contact lead activity timeline',
        description:
          'See every call, message, meeting and disposition for a contact in one timeline so handoffs stay clean.',
      },
    ],
  },
  {
    title: 'Campaigns & dispositions',
    intro:
      'Standardise outcomes, scale outreach across channels, keep reports trustworthy.',
    items: [
      {
        tag: 'Campaigns',
        title: 'Multi-channel campaigns',
        description:
          'Run call, WhatsApp and email campaigns with shared filter builders, statuses and types.',
      },
      {
        tag: 'Dispositions',
        title: 'Tenant + default dispositions',
        description:
          'Configure call outcomes once, enforce them everywhere — with active/inactive controls and clear audit trails.',
      },
      {
        tag: 'Statuses',
        title: 'Contact statuses & temperatures',
        description:
          'Hot/warm/cold and custom contact statuses keep pipeline reports honest across the team.',
      },
    ],
  },
  {
    title: 'Outreach: WhatsApp & email',
    intro:
      'Reach leads where they actually reply, without leaving the workspace.',
    items: [
      {
        tag: 'WhatsApp',
        title: 'WhatsApp Cloud API',
        description:
          'Connect WhatsApp accounts, manage approved templates, send messages and review delivery logs and history.',
      },
      {
        tag: 'Email',
        title: 'Google OAuth + IMAP email',
        description:
          'Send transactional emails and meeting invites from your own mailbox via Google OAuth or IMAP/SMTP.',
      },
      {
        tag: 'Templates',
        title: 'Reusable message templates',
        description:
          'Build approved WhatsApp templates and email templates so the team stops copy-pasting and going off-script.',
      },
    ],
  },
  {
    title: 'Schedule, deals & follow-ups',
    intro:
      'Turn vague "I will call next week" promises into a measurable workflow.',
    items: [
      {
        tag: 'Schedule Hub',
        title: 'Schedule Hub & follow-ups',
        description:
          'See every scheduled callback, follow-up and reminder for your team, with filters and pagination.',
      },
      {
        tag: 'Meetings',
        title: 'Meetings & attendees',
        description:
          'Create and notify meetings, manage attendee email settings and templates, and tie meetings to contacts and deals.',
      },
      {
        tag: 'Deals',
        title: 'Deals & opportunities',
        description:
          'Track deals tied to contacts with customisable currency defaults (INR-first) and clean owner handoffs.',
      },
      {
        tag: 'Tasks',
        title: 'Task manager & activities',
        description:
          'A unified view of what every rep is working on today — and what is overdue.',
      },
    ],
  },
  {
    title: 'Admin, security & reporting',
    intro:
      'Multi-tenant from day one with the controls that buyers ask about.',
    items: [
      {
        tag: 'Reports',
        title: 'Performance reports & charts',
        description:
          'Built-in charts and drill-down reports on call activity, agent performance and campaign throughput.',
      },
      {
        tag: 'Tenants',
        title: 'Multi-tenant architecture',
        description:
          'Application-level tenant isolation with composite indexes and required audit columns on every table.',
      },
      {
        tag: 'Users',
        title: 'Users, roles & profile',
        description:
          'Tenant users, super-admin separation and per-user profile preferences (date format, time zone mode).',
      },
      {
        tag: 'Background',
        title: 'Background jobs & dashboards',
        description:
          'Visibility into background jobs (imports, campaign runs) and tenant-level dashboards for operations leads.',
      },
    ],
  },
];

const FEATURE_AREA_COUNT = featureGroups.length;
const FEATURE_CAPABILITY_COUNT = featureGroups.reduce(
  (acc, g) => acc + g.items.length,
  0
);

export default function Features() {
  const { howItWorks } = siteConfig;
  const stepCount = howItWorks.length;

  return (
    <div>
      <section className="hero hero--soft">
        <div className="hero__bg" aria-hidden />
        <div className="hero__inner">
          <span className="eyebrow">
            <span className="eyebrow__dot" aria-hidden />
            Features that ship today
          </span>
          <h1 className="hero__title text-balance">
            Everything your call team needs, in one workspace
          </h1>
          <p className="hero__subtitle">
            We list only what is live in the product right now. Things on the
            roadmap live on the <Link to="/roadmap">Roadmap</Link> page so you
            always know what is real and what is planned.
          </p>
          <div className="hero__buttons">
            <Link to="/contact" className="btn btn--brand btn--lg">
              Talk to sales →
            </Link>
            <Link to="/pricing" className="btn btn--ghost btn--lg">
              See pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="section section--tight section--soft feature-metrics-section" aria-label="Platform scope">
        <div className="container">
          <div className="feature-metrics">
            <Reveal className="feature-metric">
              <div className="feature-metric__value">
                <CountUp end={FEATURE_AREA_COUNT} duration={1.15} />
              </div>
              <p className="feature-metric__label">Product pillars</p>
            </Reveal>
            <Reveal className="feature-metric" delay={0.06}>
              <div className="feature-metric__value">
                <CountUp end={FEATURE_CAPABILITY_COUNT} duration={1.35} />
              </div>
              <p className="feature-metric__label">Shipped capabilities</p>
            </Reveal>
            <Reveal className="feature-metric" delay={0.12}>
              <div className="feature-metric__value">
                <CountUp end={stepCount} duration={1.05} />
              </div>
              <p className="feature-metric__label">Steps to go live</p>
            </Reveal>
          </div>
        </div>
      </section>

      {featureGroups.map((group, idx) => (
        <section
          key={group.title}
          className={'section ' + (idx % 2 === 1 ? 'section--soft' : '')}
        >
          <div className="container">
            <div className="section-head">
              <h2 className="section-head__title">{group.title}</h2>
              <p className="section-head__lead">{group.intro}</p>
            </div>
            <div className="feature-grid">
              {group.items.map((f, i) => (
                <article className="feature-card" key={f.title}>
                  <span
                    className={
                      'feature-card__icon' +
                      (i % 2 === 1 ? ' feature-card__icon--accent' : '')
                    }
                    aria-hidden
                  >
                    {iconForTag(f.tag)}
                  </span>
                  <span className="tag">{f.tag}</span>
                  <h3 className="feature-card__title">{f.title}</h3>
                  <p className="feature-card__desc">{f.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* HOW IT WORKS */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">How it fits together</span>
            <h2 className="section-head__title">From upload to insights in 4 steps</h2>
          </div>
          <div className="steps">
            {howItWorks.map((step) => (
              <div className="step" key={step.step}>
                <span className="step__num">{step.step}</span>
                <h3 className="step__title">{step.title}</h3>
                <p className="step__desc">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section section--tight">
        <div className="container">
          <div className="cta-banner">
            <div className="cta-banner__inner">
              <h2>Want to see this on your own data?</h2>
              <p>
                We will run a short walkthrough using a sample of your contacts
                so you can see how the workflow lands for your team.
              </p>
              <div className="btn-row" style={{ justifyContent: 'center' }}>
                <Link to="/contact" className="btn btn--brand btn--lg">
                  Book a walkthrough →
                </Link>
                <Link to="/roadmap" className="btn btn--ghost-inverse btn--lg">
                  See the roadmap
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function iconForTag(tag) {
  switch (tag) {
    case 'Dialer':
      return '📞';
    case 'Call history':
      return '🕒';
    case 'Phone numbers':
      return '📱';
    case 'Contacts':
      return '👥';
    case 'Imports':
      return '📥';
    case 'Compliance':
      return '🛡';
    case 'Lead activity':
      return '🧭';
    case 'Campaigns':
      return '🚀';
    case 'Dispositions':
      return '🗂';
    case 'Statuses':
      return '🌡';
    case 'WhatsApp':
      return '💬';
    case 'Email':
      return '✉️';
    case 'Templates':
      return '📝';
    case 'Schedule Hub':
      return '📅';
    case 'Meetings':
      return '🗓';
    case 'Deals':
      return '💼';
    case 'Tasks':
      return '✅';
    case 'Reports':
      return '📊';
    case 'Tenants':
      return '🏢';
    case 'Users':
      return '👤';
    case 'Background':
      return '⚙️';
    default:
      return '✨';
  }
}
