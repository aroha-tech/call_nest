import { Link } from 'react-router-dom';
import { siteConfig } from '../siteConfig';
import './pages.css';

const values = [
  {
    icon: '🎯',
    title: 'Customer focus',
    description:
      'We design around real workflows, not trend chasing. If our customers are not noticeably faster after switching, the feature is not done.',
  },
  {
    icon: '🗣',
    title: 'Clear communication',
    description:
      'Honest documentation, plain pricing, an explicit roadmap. No bait-and-switch, no fake AI claims.',
  },
  {
    icon: '⚡',
    title: 'Fast execution',
    description:
      'We ship continuously and iterate visibly. You should never have to wait six months to find out a request is rejected.',
  },
  {
    icon: '🤖',
    title: 'Useful automation',
    description:
      'Automation should remove busywork — not turn the team into spectators of a black-box AI.',
  },
  {
    icon: '🔐',
    title: 'Data integrity & isolation',
    description:
      'Multi-tenant from day one with audit fields on every table. Your data is yours; we treat it like a contract, not a feature flag.',
  },
  {
    icon: '🤝',
    title: 'Team alignment',
    description:
      'Designers, engineers and call-team experts work together so each feature ties back to a real outcome.',
  },
];

const timeline = [
  { year: '2024', label: 'Idea & research', description: 'Talked to call teams across BPO, EdTech, real estate and B2B services.' },
  { year: '2025', label: 'Foundations', description: 'Built the multi-tenant core: contacts, dispositions, dialer sessions, audit fields everywhere.' },
  { year: '2025', label: 'Outreach channels', description: 'Shipped WhatsApp Cloud API and Google OAuth email — multi-channel campaigns went live.' },
  { year: '2026', label: 'Schedule & deals', description: 'Schedule Hub, follow-ups, deals (INR-default), performance reports and charts.' },
  { year: 'Now', label: 'Roadmap in motion', description: 'Pipeline view, public API and AI assistance in active development — see Roadmap.' },
];

export default function About() {
  const {
    siteBrandName,
    companyLegalName,
    companySiteUrl,
    contactEmail,
    supportEmail,
    salesEmail,
    phoneDisplay,
    addressLines,
    websiteUrl,
    gstin,
    pan,
  } = siteConfig;

  const gstRegistered = Boolean(gstin);

  return (
    <div>
      <section className="hero hero--soft">
        <div className="hero__bg" aria-hidden />
        <div className="hero__inner">
          <span className="eyebrow">
            <span className="eyebrow__dot" aria-hidden />
            About {companyLegalName}
          </span>
          <h1 className="hero__title text-balance">
            We build software for serious call teams
          </h1>
          <p className="hero__subtitle">
            {siteBrandName} is the flagship product of {companyLegalName}. We
            are based in India, focused on Indian and global call-team workflows,
            and committed to a product that is honest about what it does and
            where it is going.
          </p>
          <div className="hero__buttons">
            <Link to="/contact" className="btn btn--brand btn--lg">
              Talk to us →
            </Link>
            <Link to="/features" className="btn btn--ghost btn--lg">
              See the product
            </Link>
          </div>

          <div className="about-stats" style={{ marginTop: '3rem' }}>
            <div className="about-stat">
              <p className="about-stat__value">100%</p>
              <p className="about-stat__label">Tenant isolation, by design</p>
            </div>
            <div className="about-stat">
              <p className="about-stat__value">3 channels</p>
              <p className="about-stat__label">Calls · WhatsApp · Email</p>
            </div>
            <div className="about-stat">
              <p className="about-stat__value">India-first</p>
              <p className="about-stat__label">INR-native pricing &amp; GST-ready</p>
            </div>
            <div className="about-stat">
              <p className="about-stat__value">No vapourware</p>
              <p className="about-stat__label">Public roadmap. Real product.</p>
            </div>
          </div>
        </div>
      </section>

      {/* OUR STORY */}
      <section className="section">
        <div className="container container--md">
          <div className="section-head section-head--left">
            <span className="eyebrow">Our story</span>
            <h2 className="section-head__title">
              Built because call teams deserved better tools
            </h2>
          </div>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.7 }}>
            {companyLegalName} started with a simple observation: most call
            teams in India were running serious operations on a stack of
            spreadsheets, WhatsApp groups and a generic CRM that was never
            designed for outbound calling.
          </p>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.7 }}>
            {siteBrandName} is what we built in response — a workspace where
            the dialer, contacts, dispositions, follow-ups, multi-channel
            outreach, deals and reports live together. It is not a generic
            CRM with a phone bolt-on. It is call-first, and the rest of the
            product is shaped around that.
          </p>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.7, marginBottom: 0 }}>
            We are deliberate about scope. We list only what is live on the{' '}
            <Link to="/features">Features</Link> page, and everything else lives
            on the <Link to="/roadmap">Roadmap</Link> with no fake quarter
            labels.
          </p>
        </div>
      </section>

      {/* TIMELINE */}
      <section className="section section--soft">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Timeline</span>
            <h2 className="section-head__title">Where we have been</h2>
          </div>
          <div className="grid grid--3">
            {timeline.map((t) => (
              <div className="card" key={`${t.year}-${t.label}`}>
                <div className="muted" style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {t.year}
                </div>
                <h3 style={{ margin: '0.5rem 0 0.4rem' }}>{t.label}</h3>
                <p className="muted" style={{ margin: 0, fontSize: '0.92rem' }}>
                  {t.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MISSION & VISION */}
      <section className="section">
        <div className="container">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <div className="card" style={{ padding: '2rem' }}>
              <span className="eyebrow" style={{ marginBottom: '1rem' }}>Mission</span>
              <h2 style={{ fontSize: '1.5rem', margin: '1rem 0 0.75rem' }}>
                Make call work simpler, smarter and more measurable
              </h2>
              <p style={{ marginBottom: 0 }}>
                Give every call team — small or large — the same workspace,
                discipline and reporting that the best operators expect.
              </p>
            </div>
            <div className="card" style={{ padding: '2rem', background: 'var(--bg-soft)' }}>
              <span className="eyebrow" style={{ marginBottom: '1rem' }}>Vision</span>
              <h2 style={{ fontSize: '1.5rem', margin: '1rem 0 0.75rem' }}>
                One workspace for every conversation a team has with its
                customers
              </h2>
              <p style={{ marginBottom: 0 }}>
                We want Call X Time to be the boring, dependable layer your team
                opens at the start of the day and trusts at the end of the
                quarter.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* VALUES */}
      <section className="section section--soft">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Our values</span>
            <h2 className="section-head__title">What we value most</h2>
            <p className="section-head__lead">
              These show up in the product, in pricing, and in how we run the
              company day to day.
            </p>
          </div>
          <div className="value-grid">
            {values.map((v) => (
              <div className="value-card" key={v.title}>
                <div className="value-card__icon" aria-hidden>{v.icon}</div>
                <h3 className="value-card__title">{v.title}</h3>
                <p className="value-card__desc">{v.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPANY / LEGAL */}
      <section className="section" id="legal">
        <div className="container">
          <div className="section-head section-head--left">
            <span className="eyebrow">Company &amp; legal</span>
            <h2 className="section-head__title">{companyLegalName}</h2>
            <p className="section-head__lead">
              Official company details, used by partners and platforms (payment
              gateways, OAuth providers and tax authorities) to verify the
              entity behind {siteBrandName}.
            </p>
          </div>

          <div className="legal-grid">
            <div className="legal-card">
              <h3>Legal entity</h3>
              <p>
                <strong>{companyLegalName}</strong>
              </p>
              <p className="muted" style={{ marginBottom: 0 }}>
                Operates {siteBrandName} (this product) — see corporate site at{' '}
                <a href={companySiteUrl} rel="noopener noreferrer">
                  {companySiteUrl}
                </a>
                .
              </p>
            </div>

            <div className="legal-card">
              <h3>Registered address</h3>
              {addressLines.map((line) => (
                <p key={line} style={{ margin: '0 0 0.25rem' }}>
                  {line}
                </p>
              ))}
            </div>

            <div className="legal-card">
              <h3>GST (India)</h3>
              {gstRegistered ? (
                <p style={{ marginBottom: 0 }}>
                  <strong>GSTIN:</strong> {gstin}
                </p>
              ) : (
                <p className="muted" style={{ marginBottom: 0 }}>
                  Not registered for GST in India at this time.
                </p>
              )}
              {pan ? (
                <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                  <strong>PAN:</strong> {pan}
                </p>
              ) : null}
            </div>

            <div className="legal-card">
              <h3>Contact</h3>
              <p>
                Sales: <a href={`mailto:${salesEmail}`}>{salesEmail}</a>
              </p>
              <p>
                Support: <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
              </p>
              <p>
                General &amp; legal:{' '}
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
              </p>
              <p style={{ marginBottom: 0 }}>
                Phone: <strong>{phoneDisplay}</strong>
              </p>
            </div>

            <div className="legal-card">
              <h3>Website</h3>
              <p style={{ marginBottom: 0 }}>
                <a href={websiteUrl} rel="noopener noreferrer">
                  {websiteUrl}
                </a>
              </p>
            </div>

            <div className="legal-card">
              <h3>Policies</h3>
              <p>
                <Link to="/privacy">Privacy Policy</Link>
              </p>
              <p style={{ marginBottom: 0 }}>
                <Link to="/terms">Terms of Service</Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section section--tight">
        <div className="container">
          <div className="cta-banner">
            <div className="cta-banner__inner">
              <h2>Want to know more before you talk to sales?</h2>
              <p>
                Read what is live today on the{' '}
                <Link to="/features" style={{ color: '#fff', textDecoration: 'underline' }}>Features</Link>{' '}
                page, see what is next on{' '}
                <Link to="/roadmap" style={{ color: '#fff', textDecoration: 'underline' }}>Roadmap</Link>, or
                go straight to{' '}
                <Link to="/pricing" style={{ color: '#fff', textDecoration: 'underline' }}>Pricing</Link>.
              </p>
              <div className="btn-row" style={{ justifyContent: 'center' }}>
                <Link to="/contact" className="btn btn--brand btn--lg">
                  Talk to us →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
