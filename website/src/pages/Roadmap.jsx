import { Link } from 'react-router-dom';
import { siteConfig } from '../siteConfig';
import './pages.css';

export default function Roadmap() {
  const { roadmap, integrations } = siteConfig;

  return (
    <div>
      <section className="hero hero--soft">
        <div className="hero__bg" aria-hidden />
        <div className="hero__inner">
          <span className="eyebrow">
            <span className="eyebrow__dot" aria-hidden />
            Roadmap — what we are building next
          </span>
          <h1 className="hero__title text-balance">
            Real product. Real roadmap. No vapourware.
          </h1>
          <p className="hero__subtitle">{roadmap.intro}</p>
          <div className="hero__buttons">
            <Link to="/features" className="btn btn--ghost btn--lg">
              See what ships today
            </Link>
            <Link to="/contact" className="btn btn--brand btn--lg">
              Be a design partner →
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="roadmap-grid">
            {roadmap.columns.map((col) => (
              <div className="roadmap-column" key={col.heading}>
                <h3 className="roadmap-column__heading">
                  <span
                    className={`roadmap-column__dot roadmap-column__dot--${col.accent}`}
                    aria-hidden
                  />
                  {col.heading}
                </h3>
                {col.items.map((item) => (
                  <div className="roadmap-item" key={item.title}>
                    <h4>{item.title}</h4>
                    <p>{item.description}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations roadmap */}
      <section className="section section--soft">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Integrations roadmap</span>
            <h2 className="section-head__title">Tools we plan to connect to</h2>
            <p className="section-head__lead">
              Already-shipping integrations live on the{' '}
              <Link to="/integrations">Integrations</Link> page. Below is what
              we are actively building or evaluating.
            </p>
          </div>
          <div className="integration-roadmap-grid">
            {integrations.roadmap.map((name) => (
              <div className="integration-roadmap-card" key={name}>
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Honesty box */}
      <section className="section">
        <div className="container container--md">
          <div className="card" style={{ padding: '2rem' }}>
            <h2 style={{ marginTop: 0 }}>How we treat the roadmap</h2>
            <p>
              <strong>This page is a commitment to honesty, not to dates.</strong>{' '}
              We do not put quarter labels on the items here because every team
              that has ever shipped software knows quarter labels are mostly
              fiction. Instead, we promise the following:
            </p>
            <ul>
              <li>
                <strong>If it is on this page, we are working on it</strong> —
                in design, in build, or in active discovery with customers.
              </li>
              <li>
                <strong>If it is shipped, it moves to the{' '}
                <Link to="/features">Features</Link> page</strong> — and disappears
                from here.
              </li>
              <li>
                <strong>If we drop something, we will say so</strong> — quietly
                removing roadmap items is not the kind of company we want to be.
              </li>
            </ul>
            <p style={{ marginBottom: 0 }}>
              Want to influence what ships next?{' '}
              <Link to="/contact">Talk to us</Link>. We weigh customer requests
              heavily, especially from teams that are actively running their
              calls on Call X Time.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section section--tight">
        <div className="container">
          <div className="cta-banner">
            <div className="cta-banner__inner">
              <h2>Want a feature pulled forward?</h2>
              <p>
                Enterprise customers can sponsor specific roadmap items as part
                of their contract — we work openly about scope, timeline and
                trade-offs.
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
