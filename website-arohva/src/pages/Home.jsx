import { Link } from 'react-router-dom';
import { siteConfig, publicSiteHostname } from '../siteConfig';

export default function Home() {
  const { siteBrandName, tagline, saasProductName, productSiteUrl, websiteUrl } = siteConfig;
  const domain = publicSiteHostname(websiteUrl);

  return (
    <div className="home">
      <section className="home__hero" aria-labelledby="hero-title">
        <div className="home__hero-bg" aria-hidden />
        <div className="home__hero-grid" aria-hidden />
        <div className="home__hero-inner">
          <p className="home__badge">Company</p>
          <h1 id="hero-title" className="home__title">
            {siteBrandName}
          </h1>
          <p className="home__subtitle">{tagline}</p>
          <div className="btn-row">
            <a className="btn btn--primary" href={productSiteUrl} rel="noopener noreferrer">
              {saasProductName} product site
            </a>
            <Link className="btn btn--ghost" to="/about">
              Legal &amp; GST
            </Link>
          </div>
          <div className="home__trust">
            <span className="home__trust-item">
              <strong>Product brand</strong> — {saasProductName}
            </span>
            <span className="home__trust-item">
              <strong>Privacy</strong> — <Link to="/privacy">Policy</Link>
            </span>
            <span className="home__trust-item">
              <strong>Terms</strong> — <Link to="/terms">Service</Link>
            </span>
          </div>
        </div>
      </section>

      <section className="home__section" aria-labelledby="section-corp">
        <h2 id="section-corp" className="home__section-title">
          One legal entity, clear separation
        </h2>
        <p className="home__section-lead">
          {siteBrandName} is the GST-registered company. {saasProductName} is our customer-facing
          product brand and is described on the product website.
        </p>
        <div className="home__cta">
          <p>
            Visiting <strong>{domain}</strong> — corporate and compliance information. For
            features, pricing, and product copy, use the {saasProductName} site.
          </p>
          <div className="btn-row" style={{ justifyContent: 'center' }}>
            <Link className="btn btn--primary" to="/about">
              Company &amp; tax details
            </Link>
            <a className="btn btn--ghost" href={productSiteUrl} rel="noopener noreferrer">
              Open {saasProductName}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
