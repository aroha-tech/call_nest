import { useState } from 'react';
import { Link } from 'react-router-dom';
import { siteConfig } from '../siteConfig';
import { CountUp } from '../components/CountUp';
import { parseInrPriceLabel } from '../utils/parseInrPriceLabel';
import './pages.css';

export default function Pricing() {
  const [cycle, setCycle] = useState('monthly');
  const { pricing, faqs } = siteConfig;

  const plansSource = cycle === 'monthly' ? pricing.monthly : pricing.yearly;
  const monthlyMap = Object.fromEntries(pricing.monthly.map((p) => [p.name, p]));

  return (
    <div>
      <section className="hero hero--soft">
        <div className="hero__bg" aria-hidden />
        <div className="hero__inner">
          <span className="eyebrow">
            <span className="eyebrow__dot" aria-hidden />
            INR pricing — billed monthly or annually
          </span>
          <h1 className="hero__title text-balance">
            Simple plans. Honest pricing.
          </h1>
          <p className="hero__subtitle">
            Pick the plan that fits your team today. Switch any time. Volume
            discounts and dedicated infrastructure are available on Enterprise.
          </p>

          <div className="pricing-toggle" role="tablist" aria-label="Billing cycle">
            <button
              type="button"
              role="tab"
              aria-selected={cycle === 'monthly'}
              className={
                'pricing-toggle__btn' +
                (cycle === 'monthly' ? ' pricing-toggle__btn--active' : '')
              }
              onClick={() => setCycle('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={cycle === 'yearly'}
              className={
                'pricing-toggle__btn' +
                (cycle === 'yearly' ? ' pricing-toggle__btn--active' : '')
              }
              onClick={() => setCycle('yearly')}
            >
              Yearly
              <span className="pricing-toggle__save">{pricing.yearlySaveLabel}</span>
            </button>
          </div>

          <div className="pricing-grid" style={{ marginTop: '0.5rem' }}>
            {plansSource.map((plan) => {
              const monthlyPlan = monthlyMap[plan.name] || plan;
              const features = monthlyPlan.features || plan.features || [];
              const priceAmount = parseInrPriceLabel(plan.priceLabel);
              return (
                <article
                  key={plan.name}
                  className={
                    'pricing-card' +
                    (plan.popular ? ' pricing-card--popular' : '')
                  }
                >
                  {plan.popular ? (
                    <span className="pricing-card__popular-tag">Most popular</span>
                  ) : null}
                  <h3 className="pricing-card__name">{plan.name}</h3>
                  <p className="pricing-card__best-for">{plan.bestFor}</p>
                  <div className="pricing-card__price">
                    <span className="pricing-card__price-amount">
                      {priceAmount != null ? (
                        <CountUp
                          key={`${plan.name}-${cycle}-${priceAmount}`}
                          end={priceAmount}
                          duration={1.35}
                          prefix="₹"
                          formatIndian
                        />
                      ) : (
                        plan.priceLabel
                      )}
                    </span>
                    <span className="pricing-card__price-period">{plan.period}</span>
                  </div>
                  {plan.savings ? (
                    <p className="pricing-card__savings">{plan.savings}</p>
                  ) : null}
                  <Link
                    to={plan.ctaTarget}
                    className={
                      'btn pricing-card__cta ' +
                      (plan.popular ? 'btn--brand' : 'btn--ghost')
                    }
                  >
                    {plan.ctaLabel}
                  </Link>
                  <ul className="pricing-card__features">
                    {features.map((feat) => (
                      <li key={feat}>{feat}</li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Compare plans</span>
            <h2 className="section-head__title">What is included where</h2>
            <p className="section-head__lead">
              Everything is application-level multi-tenant; what changes between
              plans are limits, advanced features and the level of support.
            </p>
          </div>
          <div className="compare-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  {pricing.comparison.headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pricing.comparison.rows.map((row, idx) => (
                  <tr key={`row-${idx}`}>
                    {row.map((cell, i) => (
                      <td key={`cell-${idx}-${i}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="section section--soft">
        <div className="container container--md">
          <div className="section-head">
            <span className="eyebrow">Pricing FAQs</span>
            <h2 className="section-head__title">Common questions</h2>
          </div>
          <div className="faq-list">
            <details className="faq-item">
              <summary>
                Are prices in INR or USD?
                <span className="faq-item__icon" aria-hidden>+</span>
              </summary>
              <p className="faq-item__body">
                Listed prices are in Indian Rupees (INR). For non-INR billing
                regions or contracted enterprise customers, we will quote
                directly. GST is added per Indian tax law where applicable —
                see our <Link to="/about#legal">About</Link> page for our GSTIN.
              </p>
            </details>
            <details className="faq-item">
              <summary>
                Do you charge per user?
                <span className="faq-item__icon" aria-hidden>+</span>
              </summary>
              <p className="faq-item__body">
                Starter is per user. Pro is offered with unlimited users under a
                fair-use cap (we will reach out if usage looks unusual).
                Enterprise is custom and typically priced per workspace plus
                volume.
              </p>
            </details>
            <details className="faq-item">
              <summary>
                Can I switch plans later?
                <span className="faq-item__icon" aria-hidden>+</span>
              </summary>
              <p className="faq-item__body">
                Yes — upgrade or downgrade any time. Annual customers get a
                pro-rated change on the next billing cycle. We never lock you
                in beyond the contract period.
              </p>
            </details>
            <details className="faq-item">
              <summary>
                Do you offer a free trial?
                <span className="faq-item__icon" aria-hidden>+</span>
              </summary>
              <p className="faq-item__body">
                We run guided pilots rather than open self-serve trials, because
                Call X Time is most useful when set up around your real
                contacts and dispositions. <Link to="/contact">Talk to us</Link>{' '}
                and we will scope a short pilot.
              </p>
            </details>
            {faqs.slice(2, 5).map((faq) => (
              <details className="faq-item" key={faq.q}>
                <summary>
                  {faq.q}
                  <span className="faq-item__icon" aria-hidden>+</span>
                </summary>
                <p className="faq-item__body">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section section--tight">
        <div className="container">
          <div className="cta-banner">
            <div className="cta-banner__inner">
              <h2>Need a custom plan?</h2>
              <p>
                Tell us about your team size and call volume — we will put
                together a plan that fits and walk through the platform with you.
              </p>
              <div className="btn-row" style={{ justifyContent: 'center' }}>
                <Link to="/contact" className="btn btn--brand btn--lg">
                  Talk to sales →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
