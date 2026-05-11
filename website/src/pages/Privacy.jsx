import { Link } from 'react-router-dom';
import { siteConfig } from '../siteConfig';
import './pages.css';

export default function Privacy() {
  const {
    saasProductName,
    companyLegalName,
    contactEmail,
    lastUpdatedPrivacy,
  } = siteConfig;

  return (
    <div className="page page--legal container">
      <h1>Privacy Policy</h1>
      <p className="legal-meta">
        Last updated: {lastUpdatedPrivacy}. Operated by {companyLegalName}.
        Questions: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>

      <p>
        This Privacy Policy describes how {companyLegalName} (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;) collects, uses, stores and shares information when you
        visit this website or use {saasProductName} (the &ldquo;Service&rdquo;).
        By using the Service you agree to this policy. If you do not agree, do
        not use the Service.
      </p>

      <h2>1. Information we collect</h2>
      <p>We may collect:</p>
      <ul>
        <li>
          <strong>Account and contact data</strong> — name, email, phone,
          company name, billing address and similar details you provide when
          signing up or contacting us.
        </li>
        <li>
          <strong>Usage and technical data</strong> — IP address, browser type,
          device identifiers, approximate location, pages viewed and timestamps,
          collected through logs and similar technologies.
        </li>
        <li>
          <strong>Service content</strong> — data you upload or generate in the
          product (for example contacts, call logs, dispositions, notes,
          campaign data and messages), according to your plan and configuration.
        </li>
      </ul>

      <h2>2. Tenant isolation &amp; multi-tenancy</h2>
      <p>
        {saasProductName} is multi-tenant. Each customer (tenant) is logically
        isolated at the application layer: every tenant-scoped table carries a
        <code> tenant_id</code>, and queries are filtered by tenant on every
        read and write. A super-admin role exists for {companyLegalName} staff
        to operate the platform; access by super-admins to tenant data is
        restricted to legitimate operational reasons (debugging, support
        requests, abuse investigations) and is logged.
      </p>

      <h2>3. OAuth and third-party sign-in (Google, Microsoft, WhatsApp)</h2>
      <p>
        If you connect your account using Google, Microsoft, WhatsApp Cloud API
        or similar providers, we receive tokens and profile information that
        those providers make available to our application, subject to your
        consent and their terms. We use these only to provide the features you
        enable (for example sending email through your mailbox or posting
        WhatsApp messages from your business account). We do not sell your
        credentials.
      </p>
      <p>
        You can review and revoke access in your Google, Microsoft or Meta
        account security settings. Revoking access may limit certain features
        in {saasProductName}.
      </p>

      <h2>4. Payment processing</h2>
      <p>
        Payments may be processed by one or more third-party payment gateways.
        We do not store full card numbers on our servers when the gateway
        tokenises card data. Payment providers process transactions under their
        own privacy policies and PCI obligations.
      </p>

      <h2>5. How we use information</h2>
      <p>We use information to:</p>
      <ul>
        <li>Provide, operate and improve the Service;</li>
        <li>Authenticate users and prevent fraud or abuse;</li>
        <li>Communicate about the Service, billing and support;</li>
        <li>Comply with law and respond to lawful requests;</li>
        <li>Analyse aggregated usage to improve security and product experience.</li>
      </ul>

      <h2>6. Legal basis (where applicable)</h2>
      <p>
        Where the GDPR or similar laws apply, we rely on performance of a
        contract, legitimate interests (such as security and product
        improvement), consent (where required) and legal obligation as
        appropriate for each processing activity.
      </p>

      <h2>7. Sharing</h2>
      <p>
        We may share information with service providers who assist us (hosting,
        email delivery, WhatsApp delivery, analytics, payment processing,
        customer support tools) under strict confidentiality and
        data-processing terms. We may disclose information if required by law
        or to protect our rights and users&rsquo; safety.
      </p>

      <h2>8. Retention</h2>
      <p>
        We retain information for as long as your account is active or as
        needed to provide the Service, comply with legal obligations, resolve
        disputes and enforce agreements. Tenant administrators can configure
        contact-deletion policies inside the Service. Retention periods may
        vary by data category and jurisdiction.
      </p>

      <h2>9. Security</h2>
      <p>
        We implement appropriate technical and organisational measures to
        protect personal data — including tenant scoping, audit fields on every
        table, role-based access for super-admins and standard production
        hardening. No method of transmission over the Internet is completely
        secure; we cannot guarantee absolute security.
      </p>

      <h2>10. Your rights</h2>
      <p>
        Depending on your location, you may have rights to access, correct,
        delete or restrict processing of your personal data, or to object to
        certain processing. Indian users may have rights under the Digital
        Personal Data Protection Act, 2023. Contact us at{' '}
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a> to exercise
        applicable rights.
      </p>

      <h2>11. Children</h2>
      <p>
        The Service is not directed at children under 16 (or the minimum age in
        your region). We do not knowingly collect personal data from children.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update this Privacy Policy from time to time. We will post the
        updated version on this page and update the &ldquo;Last updated&rdquo;
        date. Material changes may be communicated by email or in-product notice
        where appropriate.
      </p>

      <h2>13. Contact</h2>
      <p>
        {companyLegalName} — see our <Link to="/about#legal">About</Link> page
        for address and tax registration. Privacy contact:{' '}
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>
    </div>
  );
}
