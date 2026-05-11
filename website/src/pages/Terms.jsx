import { Link } from 'react-router-dom';
import { siteConfig } from '../siteConfig';
import './pages.css';

export default function Terms() {
  const {
    saasProductName,
    companyLegalName,
    contactEmail,
    lastUpdatedTerms,
    jurisdictionCity,
    gstin,
  } = siteConfig;
  const gstRegistered = Boolean(gstin);

  return (
    <div className="page page--legal container">
      <h1>Terms of Service</h1>
      <p className="legal-meta">
        Last updated: {lastUpdatedTerms}. Operated by {companyLegalName}.
        Questions: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>

      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and
        use of {saasProductName} and related websites and services (the
        &ldquo;Service&rdquo;) offered by {companyLegalName} (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;). By creating an account, clicking to accept or using
        the Service, you agree to these Terms. If you are accepting on behalf
        of an organisation, you represent that you have authority to bind that
        organisation.
      </p>

      <h2>1. The Service</h2>
      <p>
        We provide {saasProductName} as described on our website and order
        forms. Features may differ by plan and may evolve as the product
        evolves. We may modify, suspend or discontinue parts of the Service
        with reasonable notice where practicable.
      </p>

      <h2>2. Accounts and acceptable use</h2>
      <p>You agree to:</p>
      <ul>
        <li>Provide accurate registration information and keep it current;</li>
        <li>Maintain the security of your credentials and OAuth connections;</li>
        <li>
          Use the Service only in compliance with applicable law and these
          Terms;
        </li>
        <li>
          Not misuse the Service (including attempting to access other
          tenants&rsquo; data, disrupt systems, send spam, breach
          telemarketing/DLT laws, or violate third-party rights).
        </li>
        <li>
          Honour applicable do-not-call, do-not-disturb and consent rules for
          your jurisdiction when using the dialer, WhatsApp and email features.
        </li>
      </ul>

      <h2>3. Third-party services (OAuth, integrations)</h2>
      <p>
        The Service may allow you to connect third-party accounts (such as
        Google or Microsoft for email or sign-in, WhatsApp Cloud API for
        messaging). Your use of those services is also governed by the third
        party&rsquo;s terms and privacy policy. We are not responsible for
        third-party services&rsquo; availability or practices. You authorise us
        to access and use data from connected accounts only as needed to
        provide the features you enable.
      </p>

      <h2>4. Fees, taxes (GST) and payment</h2>
      <p>
        Paid plans are billed according to the prices and billing cycle shown
        at purchase or in your order. Unless stated otherwise, fees may be
        shown exclusive or inclusive of tax depending on what we display at
        checkout.
      </p>
      {gstRegistered ? (
        <p>
          We are registered for goods and services tax (GST) in India. Our
          GSTIN is on our <Link to="/about#legal">About</Link> page. We will
          issue tax documents as required by law, including GST details where
          applicable.
        </p>
      ) : (
        <p>
          We are not registered for GST in India at present. Fees are billed
          accordingly; if our registration status changes, we will update our{' '}
          <Link to="/about#legal">About</Link> page and invoice you consistent
          with applicable law.
        </p>
      )}
      <p>
        Payments are processed through payment gateways or methods we specify.
        Failed payments may result in suspension of access until resolved.
      </p>

      <h2>5. Intellectual property</h2>
      <p>
        We retain all rights in the Service, software and branding. You retain
        rights in data you submit. You grant us a licence to host, process and
        display your content solely to operate the Service for you.
      </p>

      <h2>6. Confidentiality and data</h2>
      <p>
        Our collection and use of personal data is described in our{' '}
        <Link to="/privacy">Privacy Policy</Link>. You are responsible for the
        legality of content you process through the Service and for obtaining
        any consents required from your end users — including consent to call,
        message or email them under applicable telemarketing and data-protection
        laws.
      </p>

      <h2>7. Tenant separation &amp; super admin</h2>
      <p>
        {saasProductName} is multi-tenant. Tenants are logically isolated at the
        application layer; data of one tenant is not accessible to another via
        the application. {companyLegalName} super-admin staff can access tenant
        data only for legitimate operational reasons (support, debugging, abuse
        investigation) and such access is logged.
      </p>

      <h2>8. Disclaimer</h2>
      <p>
        THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
        AVAILABLE&rdquo;. TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM
        ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS
        FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY
        INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR
        FOR LOSS OF PROFITS, DATA OR GOODWILL. OUR TOTAL LIABILITY FOR ANY
        CLAIM ARISING OUT OF THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE
        AMOUNTS YOU PAID US FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE
        THE CLAIM (OR, IF NO FEES APPLY, ONE HUNDRED INDIAN RUPEES). SOME
        JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS; IN THOSE CASES OUR
        LIABILITY IS LIMITED TO THE MINIMUM ALLOWED BY LAW.
      </p>

      <h2>10. Indemnity</h2>
      <p>
        You will defend and indemnify us against claims arising from your use
        of the Service, your content or your violation of these Terms or
        applicable law, except to the extent caused by our gross negligence or
        wilful misconduct.
      </p>

      <h2>11. Term and termination</h2>
      <p>
        These Terms apply for as long as you use the Service. You may stop
        using the Service at any time. We may suspend or terminate access for
        breach of these Terms or for legal or security reasons. Provisions
        that by nature should survive will survive termination.
      </p>

      <h2>12. Governing law &amp; jurisdiction</h2>
      <p>
        These Terms are governed by the laws of India, without regard to
        conflict-of-law rules. Courts at {jurisdictionCity} shall have
        exclusive jurisdiction, subject to mandatory consumer protections where
        they apply.
      </p>

      <h2>13. Changes</h2>
      <p>
        We may update these Terms from time to time. We will post the new Terms
        on this page and update the &ldquo;Last updated&rdquo; date. Continued
        use after changes constitutes acceptance, except where required consent
        cannot be implied under law.
      </p>

      <h2>14. Contact</h2>
      <p>
        {companyLegalName} —{' '}
        <Link to="/about#legal">About</Link> page for address
        {gstRegistered ? ' and GSTIN' : ' and business details'}. Legal /
        terms: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>
    </div>
  );
}
