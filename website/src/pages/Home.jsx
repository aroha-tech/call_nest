import { Link } from 'react-router-dom';
import { siteConfig } from '../siteConfig';

export default function Home() {
  const { productName, tagline } = siteConfig;

  return (
    <div className="home">
      <section className="home__hero" aria-labelledby="hero-title">
        <div className="home__hero-bg" aria-hidden />
        <div className="home__hero-grid" aria-hidden />
        <div className="home__hero-inner">
          <p className="home__badge">Operations platform</p>
          <h1 id="hero-title" className="home__title">
            {productName}
          </h1>
          <p className="home__subtitle">{tagline}</p>
          <div className="btn-row">
            <Link className="btn btn--primary" to="/product">
              Explore the product
            </Link>
            <Link className="btn btn--ghost" to="/about">
              Company &amp; legal
            </Link>
          </div>
          <div className="home__trust">
            <span className="home__trust-item">
              <strong>Privacy</strong> — <Link to="/privacy">Policy</Link>
            </span>
            <span className="home__trust-item">
              <strong>Terms</strong> — <Link to="/terms">Service</Link>
            </span>
            <span className="home__trust-item">
              <strong>Verification-ready</strong> — OAuth, payments, legal docs
            </span>
          </div>
        </div>
      </section>

      <section className="home__section" aria-labelledby="section-build">
        <h2 id="section-build" className="home__section-title">
          Built for serious call teams
        </h2>
        <p className="home__section-lead">
          One place to align dialling, customer context, and outcomes—without losing the audit trail
          your business needs.
        </p>
        <div className="home__grid">
          <article className="home__feature">
            <div className="home__feature-icon" aria-hidden>
              📞
            </div>
            <h3>Call workflows</h3>
            <p>
              Structure how your team places and follows up on calls, with clear ownership and
              history you can stand behind.
            </p>
          </article>
          <article className="home__feature">
            <div className="home__feature-icon home__feature-icon--warm" aria-hidden>
              🔗
            </div>
            <h3>Connected stack</h3>
            <p>
              Email and messaging integrations where you need them—documented in our legal pages for
              OAuth and compliance reviews.
            </p>
          </article>
          <article className="home__feature">
            <div className="home__feature-icon" aria-hidden>
              ✓
            </div>
            <h3>Transparent policies</h3>
            <p>
              Published privacy and terms, plus company details on file—so partners and platforms
              can verify who operates {productName}.
            </p>
          </article>
        </div>

        <div className="home__cta">
          <p>
            Replace placeholder company data in <code>src/siteConfig.js</code> before you point{' '}
            <strong>arohva.com</strong> here.
          </p>
          <div className="btn-row" style={{ justifyContent: 'center' }}>
            <Link className="btn btn--primary" to="/about">
              View company details
            </Link>
            <Link className="btn btn--ghost" to="/product">
              Read product overview
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
