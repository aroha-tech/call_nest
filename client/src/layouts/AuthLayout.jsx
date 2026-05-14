import React, { useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { PRODUCT_DISPLAY_NAME } from '../config/productBrand';
import styles from './AuthLayout.module.scss';

function useAuthHeroMode() {
  const { pathname } = useLocation();
  return pathname.includes('/register') ? 'register' : 'login';
}

/**
 * Split-screen auth shell: marketing hero (left) + form (right).
 * Register hero matches the provided reference layout and copy.
 */
export function AuthLayout() {
  const mode = useAuthHeroMode();
  const year = new Date().getFullYear();

  const hero = useMemo(() => {
    return {
      headline: (
        <h1 className={styles.headline}>
          <span className={styles.headlineStrong}>Power Connections.<br />Drive </span>
          <span className={styles.headlineAccent}>Growth.</span>
        </h1>
      ),
      sub: 'CallXTime is your all-in-one growth engine for calls, meetings, and customer engagement.',
      features: [
        {
          icon: 'call',
          title: 'Smart Calling',
          text: 'HD calls with intelligent routing and voicemail.',
          iconColorClass: styles.iconPurple,
        },
        {
          icon: 'chat',
          title: 'AI Transcription',
          text: 'Real-time transcription and summaries.',
          iconColorClass: styles.iconGreen,
        },
        {
          icon: 'bar_chart',
          title: 'Analytics',
          text: 'Track performance and optimize outcomes.',
          iconColorClass: styles.iconYellow,
        },
        {
          icon: 'group',
          title: 'Built for Teams',
          text: 'Collaborate seamlessly and scale faster.',
          iconColorClass: styles.iconBlue,
        },
        {
          icon: 'translate',
          title: 'Global Translation',
          text: 'AI-driven live translation for international calls.',
          iconColorClass: styles.iconOrange,
        },
      ],
      foot: `© ${year} ${PRODUCT_DISPLAY_NAME}. All rights reserved.`,
    };
  }, [year]);

  return (
    <div className={`${styles.wrapper} ${mode === 'register' ? styles.wrapperRegister : ''}`}>
      <aside
        className={`${styles.hero} ${mode === 'register' ? styles.heroRegister : styles.heroLogin}`}
        aria-label={PRODUCT_DISPLAY_NAME}
      >
        <div className={styles.heroTop}>
          <Link to="/" className={styles.logoLink} style={{ display: 'block', textShadow: 'none' }}>
            <img src="/logos/CallXTime_WhiteLogo.png" alt={PRODUCT_DISPLAY_NAME} style={{ height: '96px', width: 'auto', objectFit: 'contain', transform: 'translateY(-12px)' }} />
          </Link>
        </div>
        <div className={styles.heroMain}>
          <div className={styles.heroCopy}>
            {hero.headline}
            {hero.tagline ? <p className={styles.heroTagline}>{hero.tagline}</p> : null}
            <p className={styles.subhead}>{hero.sub}</p>
          </div>
          <ul className={styles.featureListStack}>
            {hero.features.map((f) => (
              <li key={f.title} className={styles.featureItem}>
                <span className={`${styles.featureIconWrap} ${f.iconColorClass || ''}`} aria-hidden>
                  <MaterialSymbol name={f.icon} className={styles.featureIcon} size="md" />
                </span>
                <div className={styles.featureCopy}>
                  <span className={styles.featureTitle}>{f.title}</span>
                  <span className={styles.featureText}>{f.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className={styles.heroFoot}>{hero.foot}</p>
      </aside>
      <main className={styles.formColumn}>
        <div className={styles.formInner}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
