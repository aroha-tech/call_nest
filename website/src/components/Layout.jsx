import { Link, NavLink } from 'react-router-dom';
import { siteConfig } from '../siteConfig';
import './Layout.css';

const navLinkClass = ({ isActive }) =>
  'layout__nav-link' + (isActive ? ' layout__nav-link--active' : '');

export default function Layout({ children }) {
  const domainLabel = (() => {
    try {
      const u = new URL(siteConfig.websiteUrl);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return 'arohva.com';
    }
  })();

  return (
    <div className="layout">
      <header className="layout__header">
        <div className="layout__inner">
          <Link to="/" className="layout__brand">
            <span className="layout__brand-mark" aria-hidden />
            {siteConfig.productName}
          </Link>
          <nav className="layout__nav" aria-label="Main">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/product" className={navLinkClass}>
              Product
            </NavLink>
            <NavLink to="/about" className={navLinkClass}>
              About
            </NavLink>
            <NavLink to="/privacy" className={navLinkClass}>
              Privacy
            </NavLink>
            <NavLink to="/terms" className={navLinkClass}>
              Terms
            </NavLink>
            <span className="layout__nav-cta">
              <Link className="btn btn--primary" to="/product">
                Overview
              </Link>
            </span>
          </nav>
        </div>
      </header>

      <main id="main-content">{children}</main>

      <footer className="layout__footer">
        <div className="layout__footer-inner">
          <p className="layout__footer-copy">
            © {new Date().getFullYear()} {siteConfig.companyLegalName}. {siteConfig.productName} ·{' '}
            {domainLabel}
          </p>
          <div className="layout__footer-links">
            <Link to="/privacy">Privacy Policy</Link>
            <span aria-hidden> · </span>
            <Link to="/terms">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
