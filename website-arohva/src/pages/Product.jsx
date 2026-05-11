import { Link } from 'react-router-dom';
import { siteConfig, publicSiteHostname } from '../siteConfig';

export default function Product() {
  const { siteBrandName, saasProductName, productSiteUrl, websiteUrl } = siteConfig;
  const domain = publicSiteHostname(websiteUrl);

  return (
    <div>
      <div className="product-hero">
        <div
          className="product-hero__inner page"
          style={{ paddingTop: 'calc(var(--nav-h) + 2.5rem)' }}
        >
          <p className="product-hero__eyebrow">Flagship product</p>
          <h1 className="product-hero__title">{saasProductName}</h1>
          <p className="product-hero__lead">
            {saasProductName} is built and operated by {siteBrandName}. Technical overview,
            positioning, and go-to-market pages live on the product site.
          </p>
        </div>
      </div>

      <div className="page" style={{ paddingTop: '2rem' }}>
        <div className="product-split">
          <div className="card product-split__main">
            <h2 style={{ marginTop: 0 }}>What it is</h2>
            <p>
              {saasProductName} helps teams manage calls, contacts, and related workflows in one
              place. Visit the product domain for the full story, modules you ship, and integration
              notes for buyers.
            </p>
            <ul className="product-list">
              <li>Configurable workflows for your team’s process</li>
              <li>History and context so handoffs stay clean</li>
              <li>Room for integrations you already use</li>
            </ul>
            <p style={{ marginBottom: 0 }}>
              <a className="btn btn--primary" href={productSiteUrl} rel="noopener noreferrer">
                Open {saasProductName} website
              </a>
            </p>
          </div>
          <aside className="card product-split__aside">
            <h3 style={{ marginTop: 0 }}>Corporate</h3>
            <p>
              Contracts, GSTIN, and legal entity name are listed under{' '}
              <Link to="/about">About</Link>. This page stays on <strong>{domain}</strong> for
              visitors who start from the company site.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
