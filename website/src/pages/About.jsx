import { siteConfig } from '../siteConfig';

export default function About() {
  const gstRegistered = Boolean(siteConfig.gstin);

  return (
    <div className="page">
      <h1>About us</h1>
      <p className="lead">
        Official company details for customers, partners, and verification (payments, OAuth app
        listings, and tax information when applicable). Update <code>src/siteConfig.js</code> with
        your real information.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Legal entity</h2>
        <p>
          <strong>{siteConfig.companyLegalName}</strong>
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          Use the exact name as on your incorporation documents (and on your GST registration
          certificate, once you have one).
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Registered address</h2>
        {siteConfig.addressLines.map((line) => (
          <p key={line} style={{ margin: '0 0 0.25rem' }}>
            {line}
          </p>
        ))}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>GST (India)</h2>
        {gstRegistered ? (
          <p style={{ marginBottom: 0 }}>
            <strong>GSTIN:</strong> {siteConfig.gstin}
          </p>
        ) : (
          <p className="muted" style={{ marginBottom: 0 }}>
            We are <strong>not</strong> registered for GST in India at this time. If that changes,
            we will publish our GSTIN here. Have your accountant confirm when registration is
            required for your supplies.
          </p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Contact</h2>
        <p>
          General / legal:{' '}
          <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>
        </p>
        <p>
          Support:{' '}
          <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>
        </p>
        <p style={{ marginBottom: 0 }}>
          Phone: <a href={`tel:${siteConfig.phone.replace(/\s/g, '')}`}>{siteConfig.phone}</a>
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Website</h2>
        <p style={{ marginBottom: 0 }}>
          <a href={siteConfig.websiteUrl} rel="noopener noreferrer">
            {siteConfig.websiteUrl}
          </a>
        </p>
      </div>
    </div>
  );
}
