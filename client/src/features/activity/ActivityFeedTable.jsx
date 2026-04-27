import React from 'react';
import { Link } from 'react-router-dom';
import { MaterialSymbol } from '../../components/ui/MaterialSymbol';
import { formatDateTimeDisplay, formatRelativeTimeShort } from '../../utils/dateTimeDisplay';
import {
  ACTIVITY_KIND_LABEL,
  ROLE_LABELS,
  activityIconForKind,
  avatarHueFromString,
  initialsFromName,
  statusBadgeForActivity,
  valueColumnForActivity,
} from './activityFeedDisplay';

const STATUS_VARIANT_TO_CLASS = {
  teal: 'activityStatusTeal',
  blue: 'activityStatusBlue',
  green: 'activityStatusGreen',
  purple: 'activityStatusPurple',
  amber: 'activityStatusAmber',
  rose: 'activityStatusRose',
  slate: 'activityStatusSlate',
};

/**
 * @param {object} props
 * @param {Array} props.rows
 * @param {object} props.tableStyles — SCSS module from TenantDashboardPage (activity table classes)
 * @param {string} props.dtMode
 * @param {import('react-router-dom').NavigateFunction} props.navigate
 */
export function ActivityFeedTable({ rows, tableStyles, dtMode, navigate }) {
  return (
    <div className={tableStyles.activityTableScroll}>
      <table className={tableStyles.activityTable}>
        <thead>
          <tr>
            <th className={tableStyles.activityTh}>Activity</th>
            <th className={tableStyles.activityTh}>Status</th>
            <th className={tableStyles.activityTh}>Member</th>
            <th className={`${tableStyles.activityTh} ${tableStyles.activityThInfo}`.trim()}>Info</th>
            <th className={`${tableStyles.activityTh} ${tableStyles.activityThWhen}`.trim()}>When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((it, idx) => {
            const actor = it.actor;
            const memberName = actor?.name || 'System';
            const memberRole = actor?.role ? ROLE_LABELS[actor.role] || actor.role : null;
            const { name: iconName, wrap: iconWrap } = activityIconForKind(it.kind);
            const { label: statusLabel, variant: statusVariant } = statusBadgeForActivity(it.kind, it.title);
            const subtitle = it.detail
              ? it.detail
              : memberRole
                ? `${ACTIVITY_KIND_LABEL[it.kind] || it.kind} · ${memberRole}`
                : ACTIVITY_KIND_LABEL[it.kind] || it.kind;
            const hue = avatarHueFromString(memberName);
            const key = it.id != null ? `a-${it.id}` : `${it.kind}-${it.at}-${idx}`;
            const statusKey = STATUS_VARIANT_TO_CLASS[statusVariant] || 'activityStatusSlate';
            const statusClass = tableStyles[statusKey] || tableStyles.activityStatusSlate;

            function rowActivate() {
              if (it.href) navigate(it.href);
            }

            return (
              <tr
                key={key}
                className={`${tableStyles.activityTr} ${it.href ? tableStyles.activityTrClick : ''}`.trim()}
                onClick={it.href ? rowActivate : undefined}
                onKeyDown={
                  it.href
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          rowActivate();
                        }
                      }
                    : undefined
                }
                tabIndex={it.href ? 0 : undefined}
                role={it.href ? 'link' : undefined}
                aria-label={it.href ? `Open activity: ${it.title}` : undefined}
              >
                <td className={tableStyles.activityTd}>
                  <div className={tableStyles.activityDetailCell}>
                    <div className={`${tableStyles.activityIconWrap} ${tableStyles[iconWrap] || ''}`.trim()}>
                      <MaterialSymbol name={iconName} size="sm" className={tableStyles.activityIconGlyph} />
                    </div>
                    <div className={tableStyles.activityDetailText}>
                      {it.href ? (
                        <Link to={it.href} className={tableStyles.activityRowTitleLink} onClick={(e) => e.stopPropagation()}>
                          {it.title}
                        </Link>
                      ) : (
                        <span className={tableStyles.activityRowTitleStatic}>{it.title}</span>
                      )}
                      <span className={tableStyles.activityRowSubtitle}>{subtitle}</span>
                    </div>
                  </div>
                </td>
                <td className={tableStyles.activityTd}>
                  <span className={`${tableStyles.activityStatus} ${statusClass}`.trim()}>{statusLabel}</span>
                </td>
                <td className={tableStyles.activityTd}>
                  <div className={tableStyles.activityMember}>
                    <span
                      className={tableStyles.activityAvatar}
                      style={{
                        background: `linear-gradient(135deg, hsl(${hue}, 58%, 42%) 0%, hsl(${(hue + 40) % 360}, 52%, 32%) 100%)`,
                      }}
                      aria-hidden
                    >
                      {initialsFromName(memberName)}
                    </span>
                    <span className={tableStyles.activityMemberName}>
                      {memberName}
                      {memberRole ? <span className={tableStyles.activityMemberRole}> · {memberRole}</span> : null}
                    </span>
                  </div>
                </td>
                <td className={`${tableStyles.activityTd} ${tableStyles.activityTdInfo}`.trim()}>
                  <span className={tableStyles.activityValue}>{valueColumnForActivity(it)}</span>
                </td>
                <td className={`${tableStyles.activityTd} ${tableStyles.activityTdWhen}`.trim()}>
                  <div className={tableStyles.activityWhenCell}>
                    <span className={tableStyles.activityWhen} title={formatDateTimeDisplay(it.at, dtMode)}>
                      {formatRelativeTimeShort(it.at)}
                    </span>
                    <button
                      type="button"
                      className={tableStyles.activityRowMenuBtn}
                      aria-label="Row actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MaterialSymbol name="more_horiz" size="sm" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
