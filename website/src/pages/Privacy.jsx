import { Link } from 'react-router-dom';
import { siteConfig } from '../siteConfig';

export default function Privacy() {
  const { productName, companyLegalName, contactEmail, lastUpdatedPrivacy } = siteConfig;

  return (
    <div className="page page--wide">
      <h1>Privacy Policy</h1>
      <p className="legal-meta">
        Last updated: {lastUpdatedPrivacy}. Operated by {companyLegalName}. Questions:{' '}
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>

      <p>
        This Privacy Policy describes how {companyLegalName} (“we”, “us”) collects, uses, stores,
        and shares information when you visit this website or use {productName} (the “Service”).
        By using the Service, you agree to this policy. If you do not agree, do not use the
        Service.
      </p>

      <h2>1. Information we collect</h2>
      <p>We may collect:</p>
      <ul>
        <li>
          <strong>Account and contact data</strong> — name, email, phone, company name, billing
          address, and similar details you provide when signing up or contacting us.
        </li>
        <li>
          <strong>Usage and technical data</strong> — IP address, browser type, device
          identifiers, approximate location, pages viewed, and timestamps, collected through logs
          and similar technologies.
        </li>
        <li>
          <strong>Service content</strong> — data you upload or generate in the product (for
          example call logs, notes, or messages), according to your plan and configuration.
        </li>
      </ul>

      <h2>2. OAuth and third-party sign-in (Google, Microsoft)</h2>
      <p>
        If you choose to connect your account using Google, Microsoft, or similar providers, we
        receive tokens and profile information that those providers make available to our
        application, subject to your consent and their terms. We use this only to provide the
        features you enable (for example sending email through your mailbox). We do not sell your
        credentials.
      </p>
      <p>
        You can review and revoke access in your Google or Microsoft account security settings.
        Revoking access may limit certain features in {productName}.
      </p>

      <h2>3. Payment processing</h2>
      <p>
        Payments may be processed by one or more third-party payment gateways. We do not store
        full card numbers on our servers when the gateway tokenizes card data. Payment providers
        process transactions under their own privacy policies and PCI obligations.
      </p>

      <h2>4. How we use information</h2>
      <p>We use information to:</p>
      <ul>
        <li>Provide, operate, and improve the Service;</li>
        <li>Authenticate users and prevent fraud or abuse;</li>
        <li>Communicate about the Service, billing, and support;</li>
        <li>Comply with law and respond to lawful requests;</li>
        <li>Analyse aggregated usage to improve security and product experience.</li>
      </ul>

      <h2>5. Legal basis (where applicable)</h2>
      <p>
        Where the GDPR or similar laws apply, we rely on performance of a contract, legitimate
        interests (such as security and product improvement), consent (where required), and legal
        obligation as appropriate for each processing activity.
      </p>

      <h2>6. Sharing</h2>
      <p>
        We may share information with service providers who assist us (hosting, email delivery,
        analytics, payment processing, customer support tools) under strict confidentiality and
        data-processing terms. We may disclose information if required by law or to protect our
        rights and users’ safety.
      </p>

      <h2>7. Retention</h2>
      <p>
        We retain information for as long as your account is active or as needed to provide the
        Service, comply with legal obligations, resolve disputes, and enforce agreements.
        Retention periods may vary by data category and jurisdiction.
      </p>

      <h2>8. Security</h2>
      <p>
        We implement appropriate technical and organisational measures to protect personal data.
        No method of transmission over the Internet is completely secure; we cannot guarantee
        absolute security.
      </p>

      <h2>9. Your rights</h2>
      <p>
        Depending on your location, you may have rights to access, correct, delete, or restrict
        processing of your personal data, or to object to certain processing. Indian users may have
        rights under the Digital Personal Data Protection Act, 2023. Contact us at{' '}
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a> to exercise applicable rights.
      </p>

      <h2>10. Children</h2>
      <p>
        The Service is not directed at children under 16 (or the minimum age in your region). We
        do not knowingly collect personal data from children.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update this Privacy Policy from time to time. We will post the updated version on
        this page and update the “Last updated” date. Material changes may be communicated by
        email or in-product notice where appropriate.
      </p>

      <h2>12. Contact</h2>
      <p>
        {companyLegalName} — see our <Link to="/about">About</Link> page for address and tax
        registration status (including GSTIN when we publish one). Privacy contact:{' '}
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>
    </div>
  );
}
