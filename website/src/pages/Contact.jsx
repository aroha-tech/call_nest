import { useState } from 'react';
import { Link } from 'react-router-dom';
import { siteConfig } from '../siteConfig';
import './pages.css';

export default function Contact() {
  const { salesEmail, supportEmail, contactEmail, phoneDisplay, addressLines } =
    siteConfig;

  const [form, setForm] = useState({
    name: '',
    company: '',
    phone: '',
    email: '',
    message: '',
  });

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const subject = encodeURIComponent(
      `Call X Time enquiry from ${form.name || 'website'}`,
    );
    const lines = [
      `Name: ${form.name}`,
      `Company: ${form.company}`,
      `Phone: ${form.phone}`,
      `Email: ${form.email}`,
      '',
      'Message:',
      form.message,
    ];
    const body = encodeURIComponent(lines.join('\n'));
    window.location.href = `mailto:${salesEmail}?subject=${subject}&body=${body}`;
  }

  return (
    <div>
      <section className="hero hero--soft">
        <div className="hero__bg" aria-hidden />
        <div className="hero__inner">
          <span className="eyebrow">
            <span className="eyebrow__dot" aria-hidden />
            We typically reply within one business day
          </span>
          <h1 className="hero__title text-balance">
            Let&apos;s talk about your call workflow
          </h1>
          <p className="hero__subtitle">
            Tell us what your team does today and what is breaking. We will
            walk through how Call X Time fits — and be honest if it doesn&apos;t.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="contact-grid">
            <div className="contact-info">
              <div className="contact-info__item">
                <h4>Sales</h4>
                <a href={`mailto:${salesEmail}`}>{salesEmail}</a>
                <p className="muted" style={{ margin: '0.4rem 0 0' }}>
                  For demos, pilots and pricing questions.
                </p>
              </div>
              <div className="contact-info__item">
                <h4>Support</h4>
                <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
                <p className="muted" style={{ margin: '0.4rem 0 0' }}>
                  For existing customers — bugs, account issues, urgent help.
                </p>
              </div>
              <div className="contact-info__item">
                <h4>General &amp; legal</h4>
                <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                <p className="muted" style={{ margin: '0.4rem 0 0' }}>
                  Privacy, partnerships, press and everything else.
                </p>
              </div>
              <div className="contact-info__item">
                <h4>Phone</h4>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {phoneDisplay}
                </span>
              </div>
              <div className="contact-info__item">
                <h4>Address</h4>
                {addressLines.map((line) => (
                  <p key={line} style={{ margin: '0 0 0.25rem' }}>
                    {line}
                  </p>
                ))}
                <p className="muted" style={{ margin: '0.4rem 0 0', fontSize: '0.85rem' }}>
                  Operated by Arohva Global. See{' '}
                  <Link to="/about#legal">company &amp; GST details</Link>.
                </p>
              </div>
            </div>

            <form className="contact-form" onSubmit={handleSubmit} noValidate>
              <h3 style={{ marginTop: 0 }}>Tell us a bit about you</h3>
              <p className="muted" style={{ marginTop: 0 }}>
                Submitting this opens your email client with a pre-filled
                message to our sales team.
              </p>

              <div className="contact-form__row">
                <div className="contact-form__field" style={{ marginBottom: 0 }}>
                  <label htmlFor="name">Your full name</label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. Priya Shah"
                  />
                </div>
                <div className="contact-form__field" style={{ marginBottom: 0 }}>
                  <label htmlFor="company">Company</label>
                  <input
                    id="company"
                    name="company"
                    type="text"
                    value={form.company}
                    onChange={handleChange}
                    placeholder="e.g. Acme Pvt Ltd"
                  />
                </div>
              </div>

              <div className="contact-form__row">
                <div className="contact-form__field" style={{ marginBottom: 0 }}>
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    placeholder="you@company.com"
                  />
                </div>
                <div className="contact-form__field" style={{ marginBottom: 0 }}>
                  <label htmlFor="phone">Phone (optional)</label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="+91 ..."
                  />
                </div>
              </div>

              <div className="contact-form__field">
                <label htmlFor="message">How can we help?</label>
                <textarea
                  id="message"
                  name="message"
                  required
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Tell us about your call team — size, channels, current pain points..."
                />
              </div>

              <button type="submit" className="btn btn--brand btn--lg">
                Send via email →
              </button>
              <p className="contact-form__hint">
                Prefer email? Write to{' '}
                <a href={`mailto:${salesEmail}`}>{salesEmail}</a>.
              </p>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
