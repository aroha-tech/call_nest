import React from 'react';
import { MaterialSymbol } from './MaterialSymbol';
import { InfoHelpIcon } from './InfoHelpIcon';
import styles from './PageHeader.module.scss';

function inferTitleIcon(title = '') {
  const t = String(title).toLowerCase();
  if (t.includes('lead')) return 'group';
  if (t.includes('contact')) return 'contacts';
  if (t.includes('dashboard') || t.includes('home')) return 'space_dashboard';
  if (t.includes('profile')) return 'account_circle';
  if (t.includes('user')) return 'group';
  if (t.includes('tenant') || t.includes('workspace')) return 'apartment';
  if (t.includes('campaign')) return 'campaign';
  if (t.includes('call')) return 'call';
  if (t.includes('meeting') || t.includes('schedule')) return 'event';
  if (t.includes('email')) return 'mail';
  if (t.includes('whatsapp')) return 'chat';
  if (t.includes('integration')) return 'extension';
  if (t.includes('report')) return 'analytics';
  if (t.includes('activity')) return 'timeline';
  if (t.includes('settings')) return 'settings';
  if (t.includes('notification')) return 'notifications';
  return 'dashboard';
}

export function PageHeader({
  title,
  description,
  /** Visible subtitle under the title (e.g. settings pages). Help modal still uses `description` when set. */
  subtitle,
  actions,
  breadcrumbs,
  className = '',
  actionsAlign = 'start',
  titleIcon,
}) {
  const resolvedTitleIcon = titleIcon || inferTitleIcon(title);
  return (
    <div className={`${styles.header} ${className}`}>
      {breadcrumbs && <div className={styles.breadcrumbs}>{breadcrumbs}</div>}
      <div
        className={`${styles.row} ${actionsAlign === 'center' ? styles.rowActionsCenter : ''}`}
      >
        <div className={styles.info}>
          <h1 className={styles.title}>
            <span className={styles.titleLeading}>
              {resolvedTitleIcon ? (
                <span className={styles.titleIconWrap} aria-hidden>
                  <MaterialSymbol name={resolvedTitleIcon} size="sm" className={styles.titleIcon} />
                </span>
              ) : null}
              <span>{title}</span>
            </span>
            <InfoHelpIcon
              title={`About ${title}`}
              modalTitle={title}
              message={description || subtitle || ''}
              variant="title"
              className={styles.titleInfoBtn}
            />
          </h1>
          {subtitle ? <p className={styles.description}>{subtitle}</p> : null}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
