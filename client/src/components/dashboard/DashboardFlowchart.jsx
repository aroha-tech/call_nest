import React from 'react';
import { Link } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermission';
import { useEmailModuleEnabled } from '../../hooks/useEmailModuleEnabled';
import { PERMISSIONS } from '../../utils/permissionUtils';
import styles from './DashboardFlowchart.module.scss';

function ArrowRight() {
  return (
    <span className={styles.connectorH} aria-hidden>
      <svg className={styles.arrowSvg} viewBox="0 0 24 12" fill="none">
        <path
          d="M1 6h18M15 1l6 5-6 5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function ArrowDown() {
  return (
    <span className={styles.connectorV} aria-hidden>
      <svg className={styles.arrowSvgDown} viewBox="0 0 12 24" fill="none">
        <path
          d="M6 1v18M1 15l5 6 5-6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function Node({ title, hint, to, canAccess }) {
  const body = (
    <>
      <span className={styles.nodeLabel}>{title}</span>
      {hint ? <span className={styles.nodeHint}>{hint}</span> : null}
    </>
  );
  const className = `${styles.node} ${canAccess ? styles.clickable : ''}`;
  if (to && canAccess) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <div className={className} title={!canAccess ? 'No access — ask an admin' : undefined}>
      {body}
    </div>
  );
}

/**
 * Tenant workspace: how leads, contacts, campaigns, activities, and dialer settings connect.
 */
function TenantFlow() {
  const { can, canAny } = usePermissions();
  const { emailModuleEnabled } = useEmailModuleEnabled();

  const p = {
    leads: can(PERMISSIONS.LEADS_READ),
    contacts: can(PERMISSIONS.CONTACTS_READ),
    campaigns: canAny([PERMISSIONS.CONTACTS_READ, PERMISSIONS.LEADS_READ]),
    activities: can(PERMISSIONS.DIAL_EXECUTE),
    dispositions: can(PERMISSIONS.DISPOSITIONS_MANAGE),
    dialing: can(PERMISSIONS.DISPOSITIONS_MANAGE),
    scripts: can(PERMISSIONS.SETTINGS_MANAGE),
    settings: can(PERMISSIONS.SETTINGS_MANAGE),
    wa: can(PERMISSIONS.SETTINGS_MANAGE),
    email: can(PERMISSIONS.SETTINGS_MANAGE),
  };

  return (
    <div className={styles.inner}>
      <div className={styles.row}>
        <Node title="Leads" hint="Capture & qualify" to="/leads" canAccess={p.leads} />
        <ArrowRight />
        <Node title="Contacts" hint="Directory & history" to="/contacts" canAccess={p.contacts} />
        <ArrowRight />
        <Node title="Campaigns" hint="Segments & outreach" to="/campaigns" canAccess={p.campaigns} />
      </div>

      <div className={styles.merge}>
        <ArrowDown />
      </div>

      <div className={styles.row}>
        <Node
          title="Activities"
          hint="Calls, tasks & follow-ups"
          to="/activities"
          canAccess={p.activities}
        />
      </div>

      <div className={styles.merge}>
        <div className={styles.mergeCap} aria-hidden />
        <ArrowDown />
      </div>

      <div className={styles.branchRow}>
        <div className={styles.branchCol}>
          <Node
            title="Dispositions"
            hint="Call outcomes"
            to="/workflow/dispositions"
            canAccess={p.dispositions}
          />
          <Node
            title="Dialing sets"
            hint="Queues & rules"
            to="/workflow/dialing-sets"
            canAccess={p.dialing}
          />
        </div>
        <div className={styles.branchCol}>
          <Node
            title="Dialer scripts"
            hint="Agent talk tracks"
            to="/resources/dialer-scripts"
            canAccess={p.scripts}
          />
          <Node
            title="Workspace settings"
            hint="Company, fields, tags"
            to="/settings"
            canAccess={p.settings}
          />
        </div>
        <div className={styles.branchCol}>
          <Node title="WhatsApp" hint="Accounts & templates" to="/whatsapp/accounts" canAccess={p.wa} />
          {emailModuleEnabled ? (
            <Node title="Email" hint="Accounts & templates" to="/email/sent" canAccess={p.email} />
          ) : null}
        </div>
      </div>

      <p className={styles.note}>
        Typical path: leads and contacts feed campaigns and activities; dispositions and dialing sets shape
        how calls are logged; scripts and channel settings live alongside workspace configuration.
      </p>
    </div>
  );
}

/**
 * Super Admin: tenant onboarding → masters → defaults → visibility.
 */
function PlatformFlow() {
  return (
    <div className={styles.inner}>
      <div className={styles.row}>
        <Node title="Tenants" hint="Onboard organizations" to="/admin/tenants" canAccess />
        <ArrowRight />
        <Node title="System masters" hint="Industries, types, statuses" to="/admin/masters/industries" canAccess />
        <ArrowRight />
        <Node
          title="Default workflow"
          hint="Dispositions & dialing defaults"
          to="/admin/workflow/default-dispositions"
          canAccess
        />
      </div>

      <div className={styles.merge}>
        <ArrowDown />
      </div>

      <div className={`${styles.row} ${styles.rowSpaced}`}>
        <Node title="Platform users" hint="Roles across tenants" to="/admin/users" canAccess />
      </div>

      <p className={styles.note}>
        Configure master data and defaults before tenants go live; new workspaces inherit industry defaults
        when a tenant is created with an industry.
      </p>
    </div>
  );
}

/**
 * Visual flow map (tenant or platform).
 * @param {{ variant: 'tenant' | 'platform', compact?: boolean }} props — `compact` omits outer title block (e.g. Workflow page uses PageHeader).
 */
export function DashboardFlowchart({ variant, compact = false }) {
  const isPlatform = variant === 'platform';
  const flow = isPlatform ? <PlatformFlow /> : <TenantFlow />;

  if (compact) {
    return (
      <div className={styles.panel} aria-label={isPlatform ? 'Platform process map' : 'Workspace process map'}>
        {flow}
      </div>
    );
  }

  return (
    <section className={styles.wrap} aria-labelledby="dashboard-flowchart-title">
      <header className={styles.header}>
        <h2 id="dashboard-flowchart-title" className={styles.title}>
          {isPlatform ? 'Platform flow' : 'Workspace flow'}
        </h2>
        <p className={styles.subtitle}>
          {isPlatform
            ? 'How super-admin areas connect: tenants, master data, and default dialer assets.'
            : 'How the main areas of your workspace connect — use this map to navigate with context.'}
        </p>
      </header>

      <div className={styles.panel}>{flow}</div>
    </section>
  );
}
