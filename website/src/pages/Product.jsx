import { Link } from 'react-router-dom';
import { siteConfig } from '../siteConfig';

export default function Product() {
  const { productName } = siteConfig;

  return (
    <div>
      <div className="product-hero">
        <div className="product-hero__inner page" style={{ paddingTop: 'calc(var(--nav-h) + 2.5rem)' }}>
          <p className="product-hero__eyebrow">Product</p>
          <h1 className="product-hero__title">What {productName} is for</h1>
          <p className="product-hero__lead">
            Replace the sections below with your real modules, screenshots, and customer stories.
            This page is structured so you can grow it into a full marketing site.
          </p>
        </div>
      </div>

      <div className="page" style={{ paddingTop: '2rem' }}>
        <div className="product-split">
          <div className="card product-split__main">
            <h2 style={{ marginTop: 0 }}>What it is</h2>
            <p>
              {productName} helps teams manage calls, contacts, and related workflows in one place.
              Describe your actual capabilities here: dialer behaviour, CRM links, WhatsApp or
              email, reporting, and anything else buyers care about.
            </p>
            <ul className="product-list">
              <li>Configurable workflows for your team’s process</li>
              <li>History and context so handoffs stay clean</li>
              <li>Room to add integrations you already use</li>
            </ul>
          </div>
          <aside className="card product-split__aside">
            <h3 style={{ marginTop: 0 }}>Who it’s for</h3>
            <p style={{ marginBottom: 0 }}>
              Sales and support teams, BPOs, and SMBs that need dependable call operations with clear
              records. Narrow this to your ideal customer when you’re ready.
            </p>
          </aside>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Integrations &amp; compliance</h2>
          <p>
            Where you connect email or identity via Google, Microsoft, or others, that use is
            covered in our{' '}
            <Link to="/privacy">Privacy Policy</Link> and <Link to="/terms">Terms of Service</Link>.
            Listing those documents on a public domain like <strong>arohva.com</strong> supports
            OAuth verification and partner reviews.
          </p>
        </div>

        <p className="muted" style={{ marginTop: '1.5rem' }}>
          Next steps: pricing, FAQs, a contact or demo form, and real assets—when you connect this
          build to production hosting.
        </p>
      </div>
    </div>
  );
}
