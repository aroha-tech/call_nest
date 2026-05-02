import React, { useState } from 'react';
import styles from './PerformanceReportsGuide.module.scss';

const GUIDE_COLLAPSED_STORAGE_KEY = 'callnest_performance_reports_guide_collapsed';

function readDefaultGuideOpen() {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(GUIDE_COLLAPSED_STORAGE_KEY) !== '1';
  } catch {
    return true;
  }
}

function FlowConnector() {
  return (
    <div className={styles.connector} aria-hidden="true">
      →
    </div>
  );
}

function OrgFlowchartSvg() {
  return (
    <svg
      className={styles.svgFlow}
      viewBox="0 0 720 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="orgFlowArrowhead"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--color-text-tertiary)" />
        </marker>
      </defs>
      <rect className={styles.svgBoxMuted} x="8" y="18" width="200" height="64" rx="10" />
      <text className={styles.svgTitle} x="108" y="48" textAnchor="middle">
        Your organization
      </text>
      <text className={styles.svgSub} x="108" y="66" textAnchor="middle">
        Same company data &amp; rules
      </text>
      <path className={styles.svgArrow} d="M 218 50 L 248 50" markerEnd="url(#orgFlowArrowhead)" />
      <rect className={styles.svgBox} x="258" y="18" width="200" height="64" rx="10" />
      <text className={styles.svgTitle} x="358" y="48" textAnchor="middle">
        Managers / leads
      </text>
      <text className={styles.svgSub} x="358" y="66" textAnchor="middle">
        See their reporting agents
      </text>
      <path className={styles.svgArrow} d="M 468 50 L 498 50" markerEnd="url(#orgFlowArrowhead)" />
      <rect className={styles.svgBox} x="508" y="18" width="200" height="64" rx="10" />
      <text className={styles.svgTitle} x="608" y="48" textAnchor="middle">
        Agents
      </text>
      <text className={styles.svgSub} x="608" y="66" textAnchor="middle">
        Tasks, calls, meetings, deals
      </text>
    </svg>
  );
}

function DataFlowchartSvg() {
  return (
    <svg
      className={styles.svgFlow}
      viewBox="0 0 880 108"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Data flow: filters to insights"
    >
      <title>Data flow from filters to scores and coaching</title>
      <defs>
        <marker
          id="dataFlowArrowhead"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--color-text-tertiary)" />
        </marker>
      </defs>
      <rect className={styles.svgBox} x="6" y="22" width="168" height="64" rx="10" />
      <text className={styles.svgTitle} x="90" y="50" textAnchor="middle">
        1. Filters
      </text>
      <text className={styles.svgSub} x="90" y="68" textAnchor="middle">
        Dates &amp; people
      </text>
      <path className={styles.svgArrow} d="M 182 54 L 208 54" markerEnd="url(#dataFlowArrowhead)" />
      <rect className={styles.svgBox} x="218" y="22" width="168" height="64" rx="10" />
      <text className={styles.svgTitle} x="302" y="50" textAnchor="middle">
        2. Task work
      </text>
      <text className={styles.svgSub} x="302" y="68" textAnchor="middle">
        Daily goals &amp; logs
      </text>
      <path className={styles.svgArrow} d="M 394 54 L 420 54" markerEnd="url(#dataFlowArrowhead)" />
      <rect className={styles.svgBox} x="430" y="22" width="168" height="64" rx="10" />
      <text className={styles.svgTitle} x="514" y="50" textAnchor="middle">
        3. CRM activity
      </text>
      <text className={styles.svgSub} x="514" y="68" textAnchor="middle">
        Dials, follow-ups, meetings
      </text>
      <path className={styles.svgArrow} d="M 606 54 L 632 54" markerEnd="url(#dataFlowArrowhead)" />
      <rect className={styles.svgBoxAccent} x="642" y="22" width="168" height="64" rx="10" />
      <text className={styles.svgTitle} x="726" y="50" textAnchor="middle">
        4. Insights
      </text>
      <text className={styles.svgSub} x="726" y="68" textAnchor="middle">
        Scores, trends, deals
      </text>
    </svg>
  );
}

export function PerformanceReportsGuide({ isAgent, canViewTeam, viewMode }) {
  const [guideOpen, setGuideOpen] = useState(readDefaultGuideOpen);

  function handleGuideToggle(e) {
    const next = e.currentTarget.open;
    setGuideOpen(next);
    if (!next) {
      try {
        window.localStorage.setItem(GUIDE_COLLAPSED_STORAGE_KEY, '1');
      } catch {
        /* private mode / blocked storage */
      }
    }
  }

  function handlePreferGuideOpen() {
    try {
      window.localStorage.removeItem(GUIDE_COLLAPSED_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setGuideOpen(true);
  }

  const roleSentence = isAgent
    ? 'You are viewing your own numbers. Admins and managers can open the same page for the whole team or one person.'
    : viewMode === 'individual'
      ? 'You are focused on one agent. Switch to Team to compare everyone in your scope, or use By manager to group by team lead.'
      : 'You are viewing everyone you are allowed to see (usually your reporting agents). Use Individual to zoom into one person.';

  const orgSteps = [
    {
      title: 'Company',
      body: 'One workspace: shared dispositions, tasks, and CRM records. Reports always stay inside your tenant.',
    },
    {
      title: 'Managers',
      body: 'Users with a Manager on their profile roll up under that lead in By manager. Set this in user settings if grouping is empty.',
    },
    {
      title: 'Agents',
      body: 'Front-line work: task completion, dialer attempts, scheduled follow-ups, meetings, and opportunities.',
    },
  ];

  const dataSteps = [
    {
      title: 'Choose scope',
      body: 'Pick dates and calendar month. Team vs Individual controls whose rows appear.',
      accent: true,
    },
    {
      title: 'Task performance',
      body: 'Assigned vs achieved days, targets for calls/meetings/deals, and the score from your task weights.',
    },
    {
      title: 'Real CRM signals',
      body: 'Dial attempts, schedule hub follow-ups, calendar meetings, and new opportunities in the same date range.',
    },
    {
      title: 'Outcomes',
      body: 'Charts, tables, coaching flags, and CSV export — so you can brief the business in one place.',
    },
  ];

  return (
    <div className={styles.wrap}>
      <details className={styles.details} open={guideOpen} onToggle={handleGuideToggle}>
        <summary className={styles.summary}>
          <span className={styles.chevron} aria-hidden="true">
            ▼
          </span>
          <div className={styles.summaryMain}>
            <div className={styles.summaryText}>
              <h2 className={styles.summaryTitle}>How this report fits your organization</h2>
              <p className={styles.summaryLead}>
                Simple map of who sees what, how data moves from work to numbers, and what each tab is for. First time
                here it stays open; after you close it once, it starts collapsed on your next visit.
              </p>
              <p className={styles.summaryTool}>
                <button
                  type="button"
                  className={styles.preferOpenBtn}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePreferGuideOpen();
                  }}
                >
                  Prefer this guide expanded when I open Reports
                </button>
              </p>
            </div>
          </div>
        </summary>
        <div className={styles.body}>
          <p className={styles.roleNote}>{roleSentence}</p>

          <section aria-labelledby="org-flow-heading">
            <h3 id="org-flow-heading" className={styles.sectionTitle}>
              Organization flow
            </h3>
            <OrgFlowchartSvg />
            <div className={styles.flowLane}>
              {orgSteps.map((step, i) => (
                <React.Fragment key={step.title}>
                  <div className={`${styles.flowNode} ${i === 0 ? styles.flowNodeAccent : ''}`}>
                    <span className={styles.flowStepNum}>{i + 1}</span>
                    <h4 className={styles.flowNodeTitle}>{step.title}</h4>
                    <p className={styles.flowNodeBody}>{step.body}</p>
                  </div>
                  {i < orgSteps.length - 1 ? <FlowConnector /> : null}
                </React.Fragment>
              ))}
            </div>
          </section>

          <section aria-labelledby="data-flow-heading">
            <h3 id="data-flow-heading" className={styles.sectionTitle}>
              From work to numbers (data flow)
            </h3>
            <DataFlowchartSvg />
            <div className={styles.flowLane}>
              {dataSteps.map((step, i) => (
                <React.Fragment key={step.title}>
                  <div className={`${styles.flowNode} ${step.accent ? styles.flowNodeAccent : ''}`}>
                    <span className={styles.flowStepNum}>{i + 1}</span>
                    <h4 className={styles.flowNodeTitle}>{step.title}</h4>
                    <p className={styles.flowNodeBody}>{step.body}</p>
                  </div>
                  {i < dataSteps.length - 1 ? <FlowConnector /> : null}
                </React.Fragment>
              ))}
            </div>
          </section>

          <section aria-labelledby="tabs-heading">
            <h3 id="tabs-heading" className={styles.sectionTitle}>
              What each tab shows
            </h3>
            <ul className={styles.tabMap}>
              <li>
                <strong>Overview</strong>
                Charts plus a full table: scores, tasks, CRM counts, and pipeline value side by side.
              </li>
              <li>
                <strong>Team KPI / My KPI</strong>
                Deeper columns: days achieved, consistency, conversion hints, and the same CRM columns.
              </li>
              {canViewTeam ? (
                <li>
                  <strong>By manager</strong>
                  Agents grouped under their assigned manager for team-lead conversations.
                </li>
              ) : null}
              <li>
                <strong>Calendar &amp; trend</strong>
                Day-by-day status for the chosen month and weekly trend lines with matching charts.
              </li>
              <li>
                <strong>Coaching</strong>
                Who triggered coaching rules and suggested next steps, with a quick bar view of scores.
              </li>
            </ul>
          </section>
        </div>
      </details>
    </div>
  );
}
