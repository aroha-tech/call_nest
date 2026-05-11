import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { siteConfig, publicSiteHostname } from '../siteConfig';
import './Layout.css';

const navLinkClass = ({ isActive }) =>
  'site-nav__link' + (isActive ? ' site-nav__link--active' : '');

export default function Layout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const {
    siteBrandName,
    companyLegalName,
    companySiteUrl,
    primaryNav,
    contactEmail,
    supportEmail,
    salesEmail,
    phoneDisplay,
    websiteUrl,
    addressLines,
    shortPitch,
  } = siteConfig;

  const domain = publicSiteHostname(websiteUrl) || 'callxtime.com';
  const year = new Date().getFullYear();

  return (
    <div className="site">
      <header className="site-header">
        <div className="site-header__inner">
          <Link to="/" className="brand" aria-label={`${siteBrandName} home`}>
            <span className="brand__mark" aria-hidden />
            <span className="brand__name">
              {siteBrandName}
              <span className="brand__by">by {companyLegalName}</span>
            </span>
          </Link>

          <nav
            className={'site-nav' + (menuOpen ? ' site-nav--open' : '')}
            aria-label="Main navigation"
          >
            {primaryNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={navLinkClass}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="site-header__end">
            <Link to="/contact" className="btn btn--sm site-header__sales">
              Talk to sales
            </Link>
            <button
              type="button"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              className={
                'menu-toggle btn--menu' + (menuOpen ? ' menu-toggle--open' : '')
              }
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="menu-toggle__bars" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main id="main-content">{children}</main>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="site-footer__top">
            <div className="site-footer__brand-block">
              <div className="site-footer__brand">
                <span className="brand__mark" aria-hidden />
                {siteBrandName}
              </div>
              <p className="site-footer__pitch">{shortPitch}</p>
              <p className="site-footer__contact-line">
                Sales: <a href={`mailto:${salesEmail}`}>{salesEmail}</a>
              </p>
              <p className="site-footer__contact-line">
                Support: <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
              </p>
              <p className="site-footer__contact-line">Phone: {phoneDisplay}</p>
            </div>

            <div>
              <h4>Product</h4>
              <ul className="site-footer__list">
                <li>
                  <Link to="/features">Features</Link>
                </li>
                <li>
                  <Link to="/pricing">Pricing</Link>
                </li>
                <li>
                  <Link to="/integrations">Integrations</Link>
                </li>
                <li>
                  <Link to="/roadmap">Roadmap</Link>
                </li>
              </ul>
            </div>

            <div>
              <h4>Company</h4>
              <ul className="site-footer__list">
                <li>
                  <Link to="/about">About</Link>
                </li>
                <li>
                  <Link to="/contact">Contact</Link>
                </li>
                <li>
                  <a href={companySiteUrl} rel="noopener noreferrer">
                    Parent: {companyLegalName}
                  </a>
                </li>
                <li>
                  <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                </li>
              </ul>
            </div>

            <div>
              <h4>Legal</h4>
              <ul className="site-footer__list">
                <li>
                  <Link to="/privacy">Privacy Policy</Link>
                </li>
                <li>
                  <Link to="/terms">Terms of Service</Link>
                </li>
                <li>
                  <Link to="/about#legal">Company &amp; GST</Link>
                </li>
              </ul>
              <div style={{ marginTop: '1rem', fontSize: '0.82rem', opacity: 0.7 }}>
                {addressLines.join(', ')}
              </div>
            </div>
          </div>

          <div className="site-footer__bottom">
            <span>
              © {year} {companyLegalName}. {siteBrandName} · {domain}
            </span>
            <span className="site-footer__legal-links">
              <Link to="/privacy">Privacy</Link>
              <span className="site-footer__legal-sep">·</span>
              <Link to="/terms">Terms</Link>
              <span className="site-footer__legal-sep">·</span>
              <a href={companySiteUrl} rel="noopener noreferrer">
                {companyLegalName}
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
