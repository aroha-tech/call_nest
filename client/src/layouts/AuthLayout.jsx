import React, { useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
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
    if (mode === 'register') {
      return {
        headline: (
          <h1 className={styles.headline}>
            <span className={styles.headlineStrong}>Start your product&apos;s </span>
            <span className={styles.headlineAccent}>growth journey</span>
            <span className={styles.headlineStrong}> today.</span>
          </h1>
        ),
        sub:
          'Join thousands of growth leaders managing contacts, emails, and meetings in one sanctuary.',
        tagline: 'Your growth engine is ready.',
        features: [
          {
            icon: 'hub',
            title: 'Unified Communication',
            text: 'Every channel in one thread.',
          },
          {
            icon: 'query_stats',
            title: 'Lead Tracking',
            text: 'Live signal on high-value prospects.',
          },
          {
            icon: 'verified_user',
            title: 'Tenant isolation',
            text: 'Your data stays in your workspace.',
          },
          {
            icon: 'rocket_launch',
            title: 'Fast setup',
            text: 'Go live with admin and URL in minutes.',
          },
          {
            icon: 'campaign',
            title: 'Campaigns',
            text: 'Cadences and lists aligned to pipeline.',
          },
          {
            icon: 'groups',
            title: 'Team-ready',
            text: 'Roles for admins, managers, and agents.',
          },
        ],
        foot: `© ${year} Call Nest. Architected for the Obsidian Sanctuary.`,
      };
    }

    return {
      headline: (
        <h1 className={styles.headline}>
          <span className={styles.headlineStrong}>Welcome back to the </span>
          <span className={styles.headlineAccent}>sanctuary</span>
          <span className={styles.headlineStrong}> of focus.</span>
        </h1>
      ),
      tagline: 'Your growth engine is ready.',
      sub: 'Sign in to manage your contacts, emails, and meetings.',
      features: [
        {
          icon: 'dashboard',
          title: 'Dashboard',
          text: 'Pipeline, dispositions, and daily priorities in one view.',
        },
        {
          icon: 'monitoring',
          title: 'Analytics',
          text: 'Campaigns, dialer outcomes, and trends at a glance.',
        },
        {
          icon: 'hub',
          title: 'Networks',
          text: 'Queues, handoffs, and teamwork in sync across your org.',
        },
        {
          icon: 'campaign',
          title: 'Campaigns',
          text: 'Cadences, lists, and outcomes tied to your revenue motion.',
        },
      ],
      foot: `© ${year} Call Nest. Architected for the Obsidian Sanctuary.`,
    };
  }, [mode, year]);

  return (
    <div className={`${styles.wrapper} ${mode === 'register' ? styles.wrapperRegister : ''}`}>
      <aside
        className={`${styles.hero} ${mode === 'register' ? styles.heroRegister : styles.heroLogin}`}
        aria-label="Call Nest"
      >
        <div className={styles.heroTop}>
          <Link to="/" className={styles.logoLink}>
            Call Nest
          </Link>
        </div>
        <div className={styles.heroMain}>
          <div className={styles.heroCopy}>
            {hero.headline}
            {hero.tagline ? <p className={styles.heroTagline}>{hero.tagline}</p> : null}
            <p className={styles.subhead}>{hero.sub}</p>
          </div>
          <ul
            className={`${styles.featureList} ${
              mode === 'login' && hero.features.length > 2 ? styles.featureListQuad : ''
            } ${mode === 'register' && hero.features.length > 4 ? styles.featureListRegister : ''}`}
          >
            {hero.features.map((f) => (
              <li key={f.title} className={styles.featureItem}>
                <span className={styles.featureIconWrap} aria-hidden>
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
