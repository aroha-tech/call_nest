import { useState } from 'react';
import { Link } from 'react-router-dom';
import { siteConfig } from '../siteConfig';
import { Reveal } from '../components/Reveal';
import { CountUp } from '../components/CountUp';
import { RollingNumber } from '../components/RollingNumber';
import {
  IconSearch,
  IconPlus,
  IconDotsHorizontal,
  IconSparkleCta,
  IconHeroCtaSparkles,
} from '../components/marketingIcons';
import { parseInrPriceLabel } from '../utils/parseInrPriceLabel';
import './pages.css';

function planFeaturesFor(planName) {
  const row = siteConfig.pricing.monthly.find((p) => p.name === planName);
  return row?.features ?? [];
}

export default function Home() {
  const {
    siteBrandName,
    heroSubtitle,
    heroBadgeLabel,
    heroBadgeText,
    trustedByLine,
    trustedByLogos,
    homeHero,
    homeBento,
    whyChooseUsTabs,
    whyChooseUsIntro,
    keyFeaturesVisual,
    integrationTeaser,
    platformStrip,
    humanExpertise,
    faqSection,
    blogSection,
    testimonials,
    faqs,
    blogPosts,
    pricing,
  } = siteConfig;

  const [whyIdx, setWhyIdx] = useState(1);
  const [billing, setBilling] = useState('monthly');
  const plans =
    billing === 'monthly'
      ? pricing.monthly.slice(0, 3)
      : pricing.yearly.slice(0, 3);

  const activeWhy = whyChooseUsTabs[whyIdx] ?? whyChooseUsTabs[0];

  return (
    <div className="home-page">
      {/* HERO — dark + streaks */}
      <section className="hero hero--dark">
        <div className="hero__streaks" aria-hidden />
        <div className="hero__vignette" aria-hidden />
        <div className="hero__inner hero__inner--narrow hero__inner--left">
          <div className="hero__hero-row">
          <div className="hero__copy-col">
            <div className="hero-announce">
              <span className="hero-announce__left">
                <span className="hero-announce__dot" aria-hidden />
                {heroBadgeLabel}
              </span>
              {homeHero.announcementRightTo ? (
                <Link
                  to={homeHero.announcementRightTo}
                  className="hero-announce__lead"
                >
                  <span className="hero-announce__lead-text">{homeHero.announcementRight}</span>
                  <svg
                    className="hero-announce__arrow"
                    width={11}
                    height={10}
                    viewBox="0 0 11 10"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M5.2381 9.43608L10 4.93608M10 4.93608L5.2381 0.436081M10 4.93608H0"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinejoin="bevel"
                    />
                  </svg>
                </Link>
              ) : (
                <span className="hero-announce__lead hero-announce__lead--static">
                  <span className="hero-announce__lead-text">{homeHero.announcementRight}</span>
                  <svg
                    className="hero-announce__arrow"
                    width={11}
                    height={10}
                    viewBox="0 0 11 10"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M5.2381 9.43608L10 4.93608M10 4.93608L5.2381 0.436081M10 4.93608H0"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinejoin="bevel"
                    />
                  </svg>
                </span>
              )}
            </div>

            <h1 className="hero__title hero__title--dark text-balance">
              <span className="hero__title-line hero__title-line--plain">{homeHero.headlineBefore}</span>{' '}
              <span className="hero__title-line hero__title-line--plain">
                {homeHero.headlineAccent}
              </span>
            </h1>
            <p className="hero__subtitle hero__subtitle--dark">{heroSubtitle}</p>

            <div className="hero__buttons hero__buttons--groilot">
              <Link to="/contact" className="btn btn--hero-primary hero-cta-primary">
                <IconHeroCtaSparkles className="hero-cta-sparkle-icon" />
                {homeHero.primaryCta}
              </Link>
              <Link
                to="/pricing"
                className="btn btn--text btn--text-inverse hero-cta-explore"
              >
                {homeHero.secondaryCta}
                <span className="hero-cta-explore__arrow" aria-hidden>
                  →
                </span>
              </Link>
            </div>
          </div>

          <div className="hero__visual hero__visual--lift">
            <div className="hero__visual-frame hero__visual-frame--browser">
              <div className="hero-browser-bar">
                <span className="hero-browser-dots" aria-hidden />
                <span className="hero-browser-url">{siteConfig.websiteUrl.replace(/^https?:\/\//, '')}/</span>
              </div>
              <div className="hero__visual-screen hero__visual-screen--compact hero-dash">
                <aside className="hero-dash__side">
                  <div className="hero-dash__brand">
                    <span className="hero-dash__mark" aria-hidden />
                    <span className="hero-dash__brand-name">{siteBrandName}</span>
                  </div>
                  <div className="hero-dash__search" role="presentation">
                    <IconSearch className="hero-dash__search-icon" size={14} />
                    Search workspace…
                  </div>
                  <nav className="hero-dash__nav" aria-label="Workspace">
                    <span className="hero-dash__nav-h">Workspace</span>
                    <ul>
                      <li className="is-active">Dashboard</li>
                      <li>Calls</li>
                      <li>Contacts</li>
                      <li>Campaigns</li>
                      <li>Dispositions</li>
                      <li>WhatsApp</li>
                      <li>Schedule Hub</li>
                      <li>Deals</li>
                      <li>Reports</li>
                    </ul>
                  </nav>
                </aside>
                <div className="hero-dash__main">
                  <header className="hero-dash__head">
                    <h2 className="hero-dash__title">Dashboard</h2>
                    <div className="hero-dash__head-actions">
                      <div className="hero-dash__facepile" aria-hidden>
                        {['RK', 'PS', 'AM'].map((ch) => (
                          <span key={ch} className="hero-dash__face">
                            {ch}
                          </span>
                        ))}
                      </div>
                      <span className="hero-dash__icon-btn" aria-hidden>
                        <IconPlus size={15} />
                      </span>
                      <span className="hero-dash__icon-btn hero-dash__icon-btn--ghost" aria-hidden>
                        <IconDotsHorizontal size={16} />
                      </span>
                    </div>
                  </header>
                  <div className="hero-dash__toolbar">
                    <span className="hero-dash__meta">
                      Last update <strong>2m ago</strong>
                    </span>
                    <span className="hero-dash__chip">Filter</span>
                    <span className="hero-dash__chip hero-dash__chip--accent">Import / Export</span>
                  </div>
                  <div className="hero-dash__queue hero-dash__queue--highlight">
                    <span>
                      <strong>Today&apos;s queue</strong>
                      <span className="hero-dash__queue-sub">
                        {' '}
                        <span className="hero-queue-count">{homeHero.queueContacts ?? 142}</span>{' '}
                        contacts
                      </span>
                    </span>
                    <span className="hero-dash__live">Live</span>
                  </div>
                  <div className="hero-dash__rows">
                    <div className="hero-dash__row">
                      <span>Ravi Kumar · Follow-up tomorrow</span>
                      <span className="hero-dash__pill hero-dash__pill--good">Interested</span>
                    </div>
                    <div className="hero-dash__row">
                      <span>Priya Shah · Pricing sent</span>
                      <span className="hero-dash__pill hero-dash__pill--warn">Awaiting reply</span>
                    </div>
                    <div className="hero-dash__row">
                      <span>Rohit Mehra · WhatsApp template sent</span>
                      <span className="hero-dash__pill hero-dash__pill--info">Outreach</span>
                    </div>
                    <div className="hero-dash__row">
                      <span>Anjali Verma · Demo booked</span>
                      <span className="hero-dash__pill hero-dash__pill--good">Hot lead</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* TRUSTED */}
      <section className="section section--tight section--soft">
        <div className="container container--xl">
          <Reveal>
            <p className="center muted" style={{ marginBottom: '1.25rem' }}>
              {trustedByLine}
            </p>
          </Reveal>
          <div className="marquee">
            <div className="marquee__track">
              <div className="marquee__group">
                {trustedByLogos.map((name) => (
                  <div className="marquee__logo" key={`a-${name}`}>
                    {name}
                  </div>
                ))}
              </div>
              <div className="marquee__group" aria-hidden="true">
                {trustedByLogos.map((name) => (
                  <div className="marquee__logo" key={`b-${name}`}>
                    {name}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BENTO */}
      <section className="section section--soft">
        <div className="container container--xl">
          <Reveal className="section-head">
            <span className="eyebrow">{homeBento.eyebrow}</span>
            <h2 className="section-head__title">{homeBento.title}</h2>
            <p className="section-head__lead">{homeBento.lead}</p>
          </Reveal>

          <div className="bento">
            <Reveal className="bento__cell bento__stat bento__stat--sm" delay={0.04}>
              <span className="bento__stat-value">
                {homeBento.stat2x.countUp ? (
                  <RollingNumber
                    end={homeBento.stat2x.countUp.end}
                    suffix={homeBento.stat2x.countUp.suffix}
                    duration={1.15}
                    stagger={0.08}
                  />
                ) : (
                  homeBento.stat2x.value
                )}
              </span>
              <p className="bento__stat-label">{homeBento.stat2x.label}</p>
            </Reveal>

            <Reveal className="bento__cell bento__team" delay={0.08}>
              <div className="bento__team-copy">
                <h3>{homeBento.teamCard.title}</h3>
                <p>{homeBento.teamCard.body}</p>
              </div>
              <div className="bento__avatars" aria-hidden>
                {homeBento.teamCard.avatars.map((ch) =>
                  ch === '+' ? (
                    <span key="add" className="bento__avatar bento__avatar--add" title="Add">
                      <IconPlus size={16} />
                    </span>
                  ) : (
                    <span key={ch} className="bento__avatar">
                      {ch}
                    </span>
                  ),
                )}
              </div>
            </Reveal>

            <Reveal className="bento__cell bento__ai" delay={0.06}>
              <div className="bento__ai-visual">
                <span className="bento__ai-ring" />
              </div>
              <h3>{homeBento.aiCard.title}</h3>
              <p>{homeBento.aiCard.body}</p>
            </Reveal>

            <Reveal className="bento__mid" delay={0.1}>
              <div className="bento__cell bento__stat bento__stat--blue">
                <span className="bento__stat-value bento__stat-value--lg">
                  {homeBento.stat25.countUp ? (
                    <RollingNumber
                      end={homeBento.stat25.countUp.end}
                      suffix={homeBento.stat25.countUp.suffix}
                      duration={1.25}
                      stagger={0.06}
                    />
                  ) : (
                    homeBento.stat25.value
                  )}
                </span>
                <p className="bento__stat-label bento__stat-label--inverse">
                  {homeBento.stat25.label}
                </p>
                <div className="bento__mini-bars" aria-hidden>
                  <span />
                  <span />
                  <span />
                  <span className="is-tall" />
                </div>
              </div>
              <Link to="/contact" className="bento__cta-card">
                <IconSparkleCta className="icon-sparkle" size={18} />
                <span>{homeHero.primaryCta}</span>
              </Link>
            </Reveal>

            <Reveal className="bento__cell bento__auto" delay={0.12}>
              <div className="bento__auto-visual">
                <span className="bento__wave" aria-hidden />
                <div className="bento__auto-stat">
                  <span className="bento__stat-value bento__stat-value--inverse">
                    {homeBento.statTime.countUp ? (
                      <RollingNumber
                        end={homeBento.statTime.countUp.end}
                        suffix={homeBento.statTime.countUp.suffix}
                        duration={1.2}
                        stagger={0.07}
                      />
                    ) : (
                      homeBento.statTime.value
                    )}
                  </span>
                  <span className="bento__auto-sub">{homeBento.statTime.label}</span>
                </div>
              </div>
              <h3>{homeBento.automationCard.title}</h3>
              <p>{homeBento.automationCard.body}</p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* WHY CHOOSE US */}
      <section className="section">
        <div className="container container--xl">
          <div className="why-grid">
            <Reveal className="why-grid__copy">
              <span className="eyebrow">Why choose us</span>
              <h2 className="section-head__title" style={{ textAlign: 'left', margin: 0 }}>
                Why revenue teams choose {siteBrandName}
              </h2>
              <p className="section-head__lead" style={{ textAlign: 'left' }}>
                {whyChooseUsIntro}
              </p>
            </Reveal>

            <Reveal className="why-grid__panel" delay={0.06}>
              <ul className="why-list" role="tablist" aria-label="Why choose us">
                {whyChooseUsTabs.map((item, i) => (
                  <li key={item.title}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={whyIdx === i}
                      className={
                        'why-list__btn' + (whyIdx === i ? ' is-active' : '')
                      }
                      onClick={() => setWhyIdx(i)}
                    >
                      <span className="why-list__icon" aria-hidden>
                        {whyIdx === i ? '◆' : '◇'}
                      </span>
                      <span className="why-list__label">{item.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="why-detail" role="tabpanel" key={whyIdx}>
                <p>{activeWhy.body}</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* KEY FEATURES 2×2 */}
      <section className="section section--soft">
        <div className="container container--xl">
          <Reveal className="section-head">
            <span className="eyebrow">Key features</span>
            <h2 className="section-head__title">What we value most</h2>
            <p className="section-head__lead">
              Software grounded in principles that support real teams, real work, and measurable
              outcomes.
            </p>
          </Reveal>
          <div className="keyviz-grid">
            {keyFeaturesVisual.map((f, i) => (
              <Reveal key={f.title} className="keyviz-card" delay={0.05 * i}>
                <span className="tag">{f.tag}</span>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
                <div className="keyviz-card__art">
                  <KeyFeatureArt kind={f.kind} />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* INTEGRATIONS */}
      <section className="section">
        <div className="container container--xl">
          <Reveal className="section-head">
            <span className="eyebrow">{integrationTeaser.eyebrow}</span>
            <h2 className="section-head__title">{integrationTeaser.title}</h2>
            <p className="section-head__lead">{integrationTeaser.lead}</p>
            <Link to="/integrations" className="btn btn--primary btn--lg" style={{ marginTop: '0.5rem' }}>
              {integrationTeaser.cta} →
            </Link>
          </Reveal>

          <Reveal className="intg-grid" delay={0.08}>
            {integrationTeaser.tiles.map((t) => (
              <div
                key={t.label}
                className={
                  'intg-tile' +
                  (t.center ? ' intg-tile--center' : '')
                }
                style={
                  t.fade != null && !t.center
                    ? { opacity: t.fade, transform: `scale(${0.92 + t.fade * 0.08})` }
                    : undefined
                }
              >
                <span className="intg-tile__mark">{t.abbr}</span>
                <span className="intg-tile__label">{t.label}</span>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="section section--soft">
        <div className="container container--xl">
          <Reveal className="section-head">
            <span className="eyebrow">Customer voices</span>
            <h2 className="section-head__title">Teams trust the workspace</h2>
          </Reveal>
          <div className="testimonial-grid">
            {testimonials.map((t, i) => (
              <Reveal key={t.author} className="testimonial card--lift" delay={0.06 * i}>
                <p className="testimonial__quote">{t.quote}</p>
                <p className="testimonial__author">{t.author}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* PLATFORM STRIP */}
      <section className="section section--platform">
        <div className="section--platform__glow" aria-hidden />
        <div className="container container--xl">
          <Reveal className="section-head">
            <span className="eyebrow eyebrow--inverse">{platformStrip.eyebrow}</span>
            <h2 className="section-head__title">{platformStrip.title}</h2>
            <p className="section-head__lead">{platformStrip.lead}</p>
          </Reveal>
          <div className="platform-cols">
            {platformStrip.columns.map((col, i) => (
              <Reveal key={col.title} className="platform-col" delay={0.05 * i}>
                <span className="platform-col__icon" aria-hidden>
                  {['⊞', '⌁', '◈', '▦'][i] ?? '◆'}
                </span>
                <h3>{col.title}</h3>
                <p>{col.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="section" id="pricing-teaser">
        <div className="container container--xl">
          <Reveal className="section-head">
            <span className="eyebrow">Pricing</span>
            <h2 className="section-head__title">Simple plans. Powerful results.</h2>
            <p className="section-head__lead">
              Choose a plan that fits your team today and scales as you grow.
            </p>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="pricing-toggle">
              <button
                type="button"
                className={
                  'pricing-toggle__btn' +
                  (billing === 'monthly' ? ' pricing-toggle__btn--active' : '')
                }
                onClick={() => setBilling('monthly')}
              >
                Monthly
              </button>
              <button
                type="button"
                className={
                  'pricing-toggle__btn' +
                  (billing === 'yearly' ? ' pricing-toggle__btn--active' : '')
                }
                onClick={() => setBilling('yearly')}
              >
                Yearly
                <span className="pricing-toggle__save">{pricing.yearlySaveLabel}</span>
              </button>
            </div>
          </Reveal>

          <div className="pricing-grid">
            {plans.map((plan, i) => {
              const priceAmount = parseInrPriceLabel(plan.priceLabel);
              return (
              <Reveal
                key={plan.name + billing}
                className={
                  'pricing-card card--lift' +
                  (plan.popular ? ' pricing-card--popular' : '')
                }
                delay={0.06 * i}
              >
                {plan.popular ? (
                  <span className="pricing-card__popular-tag">Popular</span>
                ) : null}
                <h3 className="pricing-card__name">{plan.name}</h3>
                <p className="pricing-card__best-for">{plan.bestFor}</p>
                <div className="pricing-card__price">
                  <span className="pricing-card__price-amount">
                    {priceAmount != null ? (
                      <CountUp
                        key={`${plan.name}-${billing}-${priceAmount}`}
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
                  {plan.ctaLabel} →
                </Link>
                <ul className="pricing-card__features">
                  {planFeaturesFor(plan.name).slice(0, 6).map((feat) => (
                    <li key={feat}>{feat}</li>
                  ))}
                </ul>
              </Reveal>
            );
            })}
          </div>
          <div className="center" style={{ marginTop: '2rem' }}>
            <Link to="/pricing" className="btn btn--ghost">
              Full comparison &amp; FAQ →
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ SPLIT */}
      <section className="section section--soft faq-split-section">
        <div className="container container--xl">
          <div className="faq-split">
            <Reveal className="faq-split__intro">
              <span className="eyebrow">{faqSection.eyebrow}</span>
              <h2 className="faq-split__title">
                {faqSection.titleLine1}
                <br />
                {faqSection.titleLine2}
              </h2>
              <p className="muted">{faqSection.lead}</p>
              <Link to="/contact" className="btn btn--white btn--lg faq-split__cta">
                Contact us →
              </Link>
            </Reveal>
            <div className="faq-split__list">
              {faqs.slice(0, 6).map((faq, i) => (
                <Reveal key={faq.q} delay={0.04 * i}>
                  <details className="faq-item faq-item--rich">
                    <summary>
                      <span className="faq-item__plus" aria-hidden>
                        +
                      </span>
                      {faq.q}
                    </summary>
                    <p className="faq-item__body">{faq.a}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AI × HUMAN */}
      <section className="section section--human">
        <div className="container container--xl">
          <Reveal className="human-head">
            <span className="eyebrow">{humanExpertise.eyebrow}</span>
            <h2 className="human-head__title">{humanExpertise.title}</h2>
            <p className="human-head__lead">{humanExpertise.lead}</p>
            <Link to="/contact" className="btn btn--primary btn--lg">
              {humanExpertise.cta} →
            </Link>
          </Reveal>
          <div className="human-visuals">
            <Reveal className="human-card human-card--portrait" delay={0.06}>
              <div className="human-card__silhouette" aria-hidden />
            </Reveal>
            <Reveal className="human-card human-card--glow" delay={0.1}>
              <span className="human-card__rings" aria-hidden />
            </Reveal>
          </div>
        </div>
      </section>

      {/* BLOG SPLIT */}
      <section className="section">
        <div className="container container--xl">
          <div className="blog-split">
            <Reveal className="blog-split__intro">
              <span className="eyebrow">{blogSection.eyebrow}</span>
              <h2 className="section-head__title" style={{ textAlign: 'left', margin: 0 }}>
                {blogSection.title}
              </h2>
              <p className="section-head__lead" style={{ textAlign: 'left' }}>
                {blogSection.lead}
              </p>
              <Link to="/about" className="btn btn--white btn--lg blog-split__cta">
                {blogSection.cta} →
              </Link>
            </Reveal>
            <div className="blog-split__list">
              {blogPosts.map((p, i) => (
                <Reveal key={p.title} delay={0.05 * i}>
                  <article className="blog-row card--lift">
                    <div className="blog-row__text">
                      <h3 className={i === 2 ? 'blog-row__title blog-row__title--accent' : 'blog-row__title'}>
                        {p.title}
                      </h3>
                      <p className="blog-row__excerpt">{p.excerpt}</p>
                      <div className="blog-row__meta">
                        <span>{p.category}</span>
                        <span>{p.date}</span>
                      </div>
                    </div>
                    <div className="blog-row__media" aria-hidden />
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section section--tight">
        <div className="container container--xl">
          <Reveal>
            <div className="cta-banner">
              <div className="cta-banner__inner">
                <h2>Ready to run your call team from one workspace?</h2>
                <p>
                  Talk to us about your workflow — we will show you how {siteBrandName} fits, and
                  what is on the roadmap next.
                </p>
                <div className="btn-row" style={{ justifyContent: 'center' }}>
                  <Link to="/contact" className="btn btn--brand btn--lg">
                    Talk to sales →
                  </Link>
                  <Link to="/roadmap" className="btn btn--ghost-inverse btn--lg">
                    See the roadmap
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

function KeyFeatureArt({ kind }) {
  if (kind === 'pipeline') {
    return (
      <div className="kv-pipeline">
        {['Contact', 'Demo', 'Deal', 'Close'].map((c) => (
          <div key={c} className="kv-pipeline__col">
            <span className="kv-pipeline__head">{c}</span>
            <span className="kv-pipeline__card" />
            <span className="kv-pipeline__card kv-pipeline__card--short" />
            <span className="kv-pipeline__dot" />
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'scoring') {
    return (
      <div className="kv-score">
        <div className="kv-score__chip">
          <span>AI</span>
        </div>
        <div className="kv-score__rows">
          {[
            ['A', '95%'],
            ['B', '80%'],
            ['C', '60%'],
          ].map(([g, v]) => (
            <div key={g} className="kv-score__row">
              <span className="kv-score__badge">{g}</span>
              <span className="kv-score__bar" style={{ width: v }} />
              <span className="kv-score__val">{v}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === 'forecasting') {
    return (
      <div className="kv-chart">
        <svg viewBox="0 0 120 48" className="kv-chart__svg" aria-hidden>
          <defs>
            <linearGradient id="kvGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(13,148,136,0.5)" />
              <stop offset="100%" stopColor="rgba(13,148,136,0.02)" />
            </linearGradient>
          </defs>
          <path
            d="M0,38 C20,34 25,18 40,22 S70,8 90,14 S110,6 120,10 L120,48 L0,48 Z"
            fill="url(#kvGrad)"
          />
          <path
            d="M0,38 C20,34 25,18 40,22 S70,8 90,14 S110,6 120,10"
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2"
          />
          <circle cx="72" cy="17" r="3.5" fill="var(--brand)" />
        </svg>
        <span className="kv-chart__tip">₹16L</span>
      </div>
    );
  }
  return (
    <div className="kv-flow">
      <div className="kv-flow__step">
        <span>1</span>
      </div>
      <span className="kv-flow__arrow" aria-hidden>
        →
      </span>
      <div className="kv-flow__step">
        <span>2</span>
      </div>
      <span className="kv-flow__arrow" aria-hidden>
        →
      </span>
      <div className="kv-flow__step is-done">
        <span>✓</span>
      </div>
    </div>
  );
}
