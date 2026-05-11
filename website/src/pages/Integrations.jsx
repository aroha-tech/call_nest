import { Link } from 'react-router-dom';
import { siteConfig } from '../siteConfig';
import { CountUp } from '../components/CountUp';
import { Reveal } from '../components/Reveal';
import './pages.css';

export default function Integrations() {
  const { integrations } = siteConfig;
  const liveCount = integrations.available.length;
  const roadmapCount = integrations.roadmap.length;

  return (
    <div>
      <section className="hero hero--soft">
        <div className="hero__bg" aria-hidden />
        <div className="hero__inner">
          <span className="eyebrow">
            <span className="eyebrow__dot" aria-hidden />
            Connected to the tools your team already uses
          </span>
          <h1 className="hero__title text-balance">
            Integrations that make Call X Time the centre of your stack
          </h1>
          <p className="hero__subtitle">
            We are building integrations the same way we build the rest of the
            product — ship what is solid, document what is in beta, and be
            honest about what is on the roadmap.
          </p>
          <div className="hero__buttons">
            <Link to="/contact" className="btn btn--brand btn--lg">
              Request an integration →
            </Link>
            <Link to="/roadmap" className="btn btn--ghost btn--lg">
              See the roadmap
            </Link>
          </div>
        </div>
      </section>

      <section className="section section--tight section--soft feature-metrics-section" aria-label="Integration coverage">
        <div className="container">
          <div className="feature-metrics feature-metrics--two">
            <Reveal className="feature-metric">
              <div className="feature-metric__value">
                <CountUp end={liveCount} duration={1.2} />
              </div>
              <p className="feature-metric__label">Live connectors today</p>
            </Reveal>
            <Reveal className="feature-metric" delay={0.08}>
              <div className="feature-metric__value">
                <CountUp end={roadmapCount} duration={1.35} />
              </div>
              <p className="feature-metric__label">Items on the roadmap</p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* AVAILABLE */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Available now</span>
            <h2 className="section-head__title">What you can connect today</h2>
            <p className="section-head__lead">
              Each of these is live in the product. Some are in limited beta
              and we will note that on the card.
            </p>
          </div>
          <div className="feature-grid">
            {integrations.available.map((integration) => (
              <article className="integration-card" key={integration.name}>
                <div className="integration-card__head">
                  <h3 className="integration-card__name">{integration.name}</h3>
                  <span className="integration-card__category">
                    {integration.category}
                  </span>
                </div>
                <p className="integration-card__desc">{integration.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ROADMAP */}
      <section className="section section--soft">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">On the integration roadmap</span>
            <h2 className="section-head__title">
              Integrations we are actively building or evaluating
            </h2>
            <p className="section-head__lead">
              Listed here so you can plan around them. Want to be a design
              partner for one of these? <Link to="/contact">Tell us</Link> —
              early input shapes the final shape.
            </p>
          </div>
          <div className="integration-roadmap-grid">
            {integrations.roadmap.map((name) => (
              <div className="integration-roadmap-card" key={name}>
                {name}
              </div>
            ))}
          </div>
          <p className="muted center" style={{ marginTop: '2rem' }}>
            Don&apos;t see your tool? See our broader{' '}
            <Link to="/roadmap">product roadmap</Link> or{' '}
            <Link to="/contact">request it</Link>.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="section section--tight">
        <div className="container">
          <div className="cta-banner">
            <div className="cta-banner__inner">
              <h2>Need a private integration?</h2>
              <p>
                Enterprise customers can request custom integrations with
                internal systems, data warehouses or CRMs as part of their
                contract.
              </p>
              <div className="btn-row" style={{ justifyContent: 'center' }}>
                <Link to="/contact" className="btn btn--brand btn--lg">
                  Talk to sales →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
