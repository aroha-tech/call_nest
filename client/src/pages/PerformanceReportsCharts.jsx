import React, { useId, useMemo } from 'react';
import styles from './PerformanceReportsCharts.module.scss';

const COLORS = {
  primary: '#3b82f6',
  green: '#22c55e',
  purple: '#a855f7',
  orange: '#f97316',
  amber: '#eab308',
  slate: '#64748b',
};

const PIE_COLORS = [COLORS.primary, COLORS.green, COLORS.amber, COLORS.orange, COLORS.purple, COLORS.slate];

function shortLabel(name, max = 14) {
  if (name == null) return '';
  const s = String(name);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Integer count charts: tight scale when values are tiny; readable ticks for larger totals. */
function countAxisTopAndTicks(rawMax) {
  const m = Math.max(0, Number(rawMax) || 0);
  let top;
  if (m === 0) top = 4;
  else if (m === 1) top = 2;
  else if (m <= 4) top = m + 1;
  else if (m <= 12) top = Math.ceil(m * 1.12);
  else {
    const p = Math.ceil(m * 1.12);
    const exp = Math.pow(10, Math.floor(Math.log10(p)));
    top = Math.ceil(p / exp) * exp;
  }
  const step = top <= 4 ? 1 : Math.max(1, Math.round(top / 5));
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== top) ticks.push(top);
  return { top, ticks };
}

const DIALS_PER_HOUR_COLOR = '#7c3aed';

/** Floor width so a 1–2 agent chart is not stretched across the card (prevents oversized text/bars). */
const MIN_BAR_CHART_VIEWBOX_W = 268;

function ChartCard({ title, subtitle, children, tall, insight }) {
  return (
    <div className={`${styles.chartCard} ${tall ? styles.chartCardTall : ''}`}>
      <div className={styles.chartCardHeader}>
        <h4 className={styles.chartTitle}>{title}</h4>
        {subtitle ? <p className={styles.chartSubtitle}>{subtitle}</p> : null}
      </div>
      {insight ? (
        <p className={styles.chartInsight} role="status">
          {insight}
        </p>
      ) : null}
      <div className={styles.chartCardBody}>{children}</div>
    </div>
  );
}

function DashboardSection({ kicker, title, lede, children }) {
  const sid = useId().replace(/:/g, '');
  return (
    <section className={styles.dashSection} aria-labelledby={`${sid}-h`}>
      <header className={styles.dashSectionHead}>
        {kicker ? <span className={styles.dashSectionKicker}>{kicker}</span> : null}
        <h3 id={`${sid}-h`} className={styles.dashSectionTitle}>
          {title}
        </h3>
        {lede ? <p className={styles.dashSectionLede}>{lede}</p> : null}
      </header>
      {children}
    </section>
  );
}

function EmptyChart({ message }) {
  return <div className={styles.chartEmpty}>{message}</div>;
}

function HorizontalMetricRow({ label, value, max, color, suffix = '' }) {
  const pct = max > 0 ? Math.min(100, (Number(value) / max) * 100) : 0;
  return (
    <div className={styles.hRow}>
      <span className={styles.hRowLabel} title={label}>
        {shortLabel(label, 18)}
      </span>
      <div className={styles.hRowTrack}>
        <div className={styles.hRowFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={styles.hRowValue}>
        {typeof value === 'number' && value % 1 !== 0 ? value.toFixed(1) : value}
        {suffix}
      </span>
    </div>
  );
}

/** Left-to-right flow: team CRM totals for the period */
function TeamPipelineFlowDiagram({ dials, scheduledFollowUps, meetings, opps, formatInt }) {
  const pipeArrowId = `pipeArrow-${useId().replace(/:/g, '')}`;
  const w = 760;
  const h = 118;
  const bw = 138;
  const bh = 62;
  const y0 = 28;
  const starts = [14, 194, 374, 554];
  const stages = [
    { label: 'Dial attempts', sub: 'CRM / dialer', v: dials, fill: COLORS.primary },
    { label: 'Follow-ups', sub: 'Schedule hub', v: scheduledFollowUps, fill: COLORS.green },
    { label: 'Meetings', sub: 'Calendar', v: meetings, fill: COLORS.purple },
    { label: 'New opps', sub: 'Pipeline count', v: opps, fill: COLORS.orange },
  ];

  return (
    <svg className={styles.pipelineSvg} viewBox={`0 0 ${w} ${h}`} aria-label="Team activity flow diagram">
      <title>Team totals flow from calls through scheduled follow-ups and meetings to opportunities</title>
      {stages.map((s, i) => {
        const x = starts[i];
        return (
          <g key={s.label}>
            <rect
              x={x}
              y={y0}
              width={bw}
              height={bh}
              rx="12"
              fill={s.fill}
              fillOpacity="0.14"
              stroke={s.fill}
              strokeWidth="1.5"
            />
            <text x={x + bw / 2} y={y0 + 28} textAnchor="middle" className={styles.svgBarValue}>
              {formatInt(s.v)}
            </text>
            <text x={x + bw / 2} y={y0 + 44} textAnchor="middle" className={styles.svgBarLabel}>
              {s.label}
            </text>
            <text x={x + bw / 2} y={y0 + 56} textAnchor="middle" className={styles.svgTick}>
              {s.sub}
            </text>
            {i < stages.length - 1 ? (
              <path
                d={`M ${x + bw + 4} ${y0 + bh / 2} L ${starts[i + 1] - 4} ${y0 + bh / 2}`}
                stroke="var(--color-text-tertiary)"
                strokeWidth="2"
                fill="none"
                markerEnd={`url(#${pipeArrowId})`}
              />
            ) : null}
          </g>
        );
      })}
      <defs>
        <marker id={pipeArrowId} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <polygon points="0 0, 7 3.5, 0 7" fill="var(--color-text-tertiary)" />
        </marker>
      </defs>
    </svg>
  );
}

function GaugeRing({ label, value, max, suffix = '', color, hint }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Number(value) / max) : 0;
  const dash = `${pct * c} ${c}`;

  return (
    <div className={styles.gaugeItem}>
      <svg className={styles.gaugeSvg} width="124" height="124" viewBox="0 0 124 124">
        <circle cx="62" cy="62" r={r} fill="none" stroke="var(--color-border-subtle)" strokeWidth="10" />
        <circle
          cx="62"
          cy="62"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={dash}
          transform="rotate(-90 62 62)"
        />
        <text x="62" y="67" textAnchor="middle" className={styles.svgBarValue} fontSize="15">
          {typeof value === 'number' && value % 1 !== 0 ? value.toFixed(1) : value}
          {suffix}
        </text>
      </svg>
      <span className={styles.gaugeLabel}>{label}</span>
      {hint ? <span className={styles.diagramNote}>{hint}</span> : null}
    </div>
  );
}

function TeamAverageGauges({ summary }) {
  if (!summary.length) return null;
  const n = summary.length;
  const avgCompl =
    summary.reduce((a, s) => a + Number(s.avg_completion_percent || 0), 0) / n;
  const avgScore = summary.reduce((a, s) => a + Number(s.avg_score || 0), 0) / n;
  const maxScore = Math.max(100, ...summary.map((s) => Number(s.avg_score || 0)), avgScore, 1);

  return (
    <div className={styles.gaugeRow}>
      <GaugeRing
        label="Avg completion %"
        value={avgCompl}
        max={100}
        suffix="%"
        color={COLORS.primary}
        hint="Across agents in view"
      />
      <GaugeRing
        label="Avg score"
        value={avgScore}
        max={maxScore}
        color={COLORS.green}
        hint="Weighted task score"
      />
    </div>
  );
}

/** Vertical bar chart — scores by agent */
function VerticalBarChartScores({ summary, formatInt }) {
  const n = summary.length;
  if (!n) return null;
  const scores = summary.map((s) => Number(s.avg_score || 0));
  const maxY = Math.max(8, ...scores) * 1.08;
  const chartH = 168;
  const left = 38;
  const bottom = 62;
  const barW = Math.min(28, Math.max(16, Math.floor(380 / n)));
  const gap = Math.max(10, Math.min(18, Math.floor(260 / n)));
  const plotW = n * (barW + gap) + 16;
  const w = Math.max(left + plotW + 10, MIN_BAR_CHART_VIEWBOX_W);
  const h = chartH + bottom;
  const baseY = chartH;

  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => (maxY * i) / ticks);

  return (
    <svg className={styles.barChartSvg} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {tickVals.map((tv) => {
        const y = baseY - (tv / maxY) * (chartH - 16);
        return (
          <g key={tv}>
            <line
              x1={left}
              y1={y}
              x2={w - 8}
              y2={y}
              className={styles.svgGridLine}
            />
            <text x={4} y={y + 4} className={styles.svgTick}>
              {tv >= 10 ? Math.round(tv) : tv.toFixed(0)}
            </text>
          </g>
        );
      })}
      {summary.map((s, i) => {
        const sc = Number(s.avg_score || 0);
        const bh = (sc / maxY) * (chartH - 16);
        const x = left + i * (barW + gap);
        const y = baseY - bh;
        return (
          <g key={s.user_id}>
            <rect x={x} y={y} width={barW} height={bh} rx="4" fill={COLORS.primary} opacity="0.9" />
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" className={styles.svgTick}>
              {sc >= 10 ? formatInt(sc) : sc.toFixed(1)}
            </text>
            <text
              x={x + barW / 2}
              y={baseY + 18}
              textAnchor="middle"
              className={styles.svgBarLabel}
              transform={`rotate(-24 ${x + barW / 2} ${baseY + 18})`}
            >
              <title>{s.user_name}</title>
              {shortLabel(s.user_name, n <= 6 ? 14 : 12)}
            </text>
          </g>
        );
      })}
      <line x1={left} y1={baseY} x2={w - 8} y2={baseY} stroke="var(--color-border-subtle)" strokeWidth="1.2" />
    </svg>
  );
}

/** Grouped vertical bars: dials, scheduled follow-ups, meetings per agent — integer Y-axis */
function GroupedVerticalBarsActivity({ summary, formatInt }) {
  const n = summary.length;
  if (!n) return null;
  const rawMax = Math.max(
    0,
    ...summary.flatMap((s) => [
      Number(s.crm_total_calls || 0),
      Number(s.crm_scheduled_follow_ups || 0),
      Number(s.crm_calendar_meetings || 0),
    ])
  );
  const { top, ticks } = countAxisTopAndTicks(rawMax);

  const chartH = 172;
  const left = 44;
  const bottom = 82;
  const innerBar = 12;
  const innerGap = 3;
  const groupW = innerBar * 3 + innerGap * 2 + 14;
  const groupGap = Math.max(10, Math.min(24, Math.floor(400 / Math.max(n, 1))));
  const plotW = n * (groupW + groupGap);
  const w = Math.max(left + plotW + 8, MIN_BAR_CHART_VIEWBOX_W);
  const h = chartH + bottom;
  const baseY = chartH;
  const plotTop = 10;

  const legend = [
    { c: COLORS.primary, t: 'Dials' },
    { c: COLORS.green, t: 'Follow-ups' },
    { c: COLORS.purple, t: 'Mtgs' },
  ];

  return (
    <div>
      <svg className={styles.barChartSvg} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
        <text
          x={16}
          y={plotTop + (baseY - plotTop) / 2}
          className={styles.axisYLabel}
          transform={`rotate(-90 16 ${plotTop + (baseY - plotTop) / 2})`}
        >
          Count
        </text>
        {ticks.map((tv) => {
          const y = baseY - (tv / top) * (baseY - plotTop);
          return (
            <g key={tv}>
              <line x1={left} y1={y} x2={w - 4} y2={y} className={styles.svgGridLine} />
              <text x={28} y={y + 3} className={styles.svgTick}>
                {formatInt(tv)}
              </text>
            </g>
          );
        })}
        {summary.map((s, i) => {
          const gx = left + i * (groupW + groupGap);
          const vals = [
            Number(s.crm_total_calls || 0),
            Number(s.crm_scheduled_follow_ups || 0),
            Number(s.crm_calendar_meetings || 0),
          ];
          const cols = [COLORS.primary, COLORS.green, COLORS.purple];
          return (
            <g key={s.user_id}>
              {vals.map((v, j) => {
                const bh = top > 0 ? (v / top) * (baseY - plotTop) : 0;
                const x = gx + j * (innerBar + innerGap);
                const y = baseY - bh;
                return (
                  <rect key={j} x={x} y={y} width={innerBar} height={Math.max(bh, v > 0 ? 1 : 0)} rx="3" fill={cols[j]} opacity="0.92" />
                );
              })}
              <text
                x={gx + groupW / 2}
                y={baseY + 16}
                textAnchor="middle"
                className={styles.svgBarLabel}
                transform={`rotate(-24 ${gx + groupW / 2} ${baseY + 16})`}
              >
                <title>{s.user_name}</title>
                {shortLabel(s.user_name, n <= 5 ? 16 : 12)}
              </text>
            </g>
          );
        })}
        <line x1={left} y1={baseY} x2={w - 4} y2={baseY} className={styles.svgAxisBaseline} />
        <text x={w / 2} y={h - 8} textAnchor="middle" className={styles.axisXLabel}>
          Agent
        </text>
      </svg>
      <div className={styles.trendLegend} style={{ marginTop: 6 }}>
        {legend.map((L) => (
          <span key={L.t}>
            <i className={styles.lgSwatch} style={{ background: L.c }} /> {L.t}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Single-series column chart by clock hour (7am–7pm), like classic “dials per hour” dashboards. */
function DialsPerHourChart({ series, formatInt }) {
  const HOUR_START = 7;
  const HOUR_END = 19;
  const slots = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) slots.push(h);

  const map = new Map((series || []).map((r) => [Number(r.hour_of_day), Number(r.dials || 0)]));
  const maxC = Math.max(0, ...slots.map((h) => map.get(h) ?? 0));
  const { top, ticks } = countAxisTopAndTicks(maxC);

  const chartH = 200;
  const left = 52;
  const bottom = 74;
  const barW = 22;
  const gap = 11;
  const plotW = slots.length * (barW + gap) + 8;
  const w = left + plotW + 16;
  const h = chartH + bottom;
  const baseY = chartH;
  const plotTop = 12;

  return (
    <svg className={styles.dialsHourSvg} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMinYMid meet" aria-label="Dial attempts by hour">
      <title>Dial attempts by hour of day</title>
      <text
        x={20}
        y={plotTop + (baseY - plotTop) / 2}
        className={styles.axisYLabel}
        transform={`rotate(-90 20 ${plotTop + (baseY - plotTop) / 2})`}
      >
        Count
      </text>
      {ticks.map((tv) => {
        const y = baseY - (tv / top) * (baseY - plotTop);
        return (
          <g key={tv}>
            <line x1={left} y1={y} x2={w - 8} y2={y} className={styles.svgGridLine} />
            <text x={32} y={y + 3} className={styles.svgTick}>
              {formatInt(tv)}
            </text>
          </g>
        );
      })}
      {slots.map((hour, i) => {
        const c = map.get(hour) ?? 0;
        const bh = top > 0 ? (c / top) * (baseY - plotTop) : 0;
        const x = left + i * (barW + gap);
        const y = baseY - bh;
        const label = new Date(2000, 0, 1, hour, 0, 0).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        return (
          <g key={hour}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(bh, c > 0 ? 1.5 : 0)}
              rx="5"
              fill={DIALS_PER_HOUR_COLOR}
              opacity="0.92"
            />
            {c > 0 ? (
              <text x={x + barW / 2} y={y - 5} textAnchor="middle" className={styles.svgTick}>
                {formatInt(c)}
              </text>
            ) : null}
            <text
              x={x + barW / 2}
              y={baseY + 18}
              textAnchor="middle"
              className={styles.svgBarLabelHour}
              transform={`rotate(-32 ${x + barW / 2} ${baseY + 18})`}
            >
              {label}
            </text>
          </g>
        );
      })}
      <line x1={left} y1={baseY} x2={w - 8} y2={baseY} className={styles.svgAxisBaseline} />
      <text x={(left + w - 8) / 2} y={h - 10} textAnchor="middle" className={styles.axisXLabel}>
        Hour
      </text>
    </svg>
  );
}

function VerticalBarDeals({ dealRows, maxDeal, formatMoney }) {
  const n = dealRows.length;
  if (!n) return null;
  const maxY = maxDeal * 1.05;
  const chartH = 160;
  const left = 44;
  const bottom = 44;
  const barW = Math.min(34, Math.max(18, Math.floor(480 / n)));
  const gap = Math.max(10, 16);
  const plotW = n * (barW + gap) + 12;
  const w = Math.max(left + plotW + 8, MIN_BAR_CHART_VIEWBOX_W);
  const h = chartH + bottom;
  const baseY = chartH;

  return (
    <svg className={styles.barChartSvg} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map((t) => {
        const tv = maxY * t;
        const y = baseY - (tv / maxY) * (chartH - 12);
        return (
          <g key={t}>
            <line x1={left} y1={y} x2={w - 6} y2={y} className={styles.svgGridLine} />
            <text x={2} y={y + 3} className={styles.svgTick}>
              {formatMoney(tv)}
            </text>
          </g>
        );
      })}
      {dealRows.map((d, i) => {
        const v = Number(d.value || 0);
        const bh = (v / maxY) * (chartH - 12);
        const x = left + i * (barW + gap);
        const y = baseY - bh;
        return (
          <g key={d.name}>
            <rect x={x} y={y} width={barW} height={bh} rx="4" fill={COLORS.orange} opacity="0.9" />
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" className={styles.svgTick}>
              {formatMoney(v)}
            </text>
            <text
              x={x + barW / 2}
              y={baseY + 12}
              textAnchor="middle"
              className={styles.svgBarLabel}
              transform={`rotate(-28 ${x + barW / 2} ${baseY + 12})`}
            >
              {shortLabel(d.name, 12)}
            </text>
          </g>
        );
      })}
      <line x1={left} y1={baseY} x2={w - 6} y2={baseY} className={styles.svgAxisBaseline} />
    </svg>
  );
}

function WeeklyTrendSvg({ rows, completionFlat = false }) {
  const gradId = `trendGrad-${useId().replace(/:/g, '')}`;
  const w = 420;
  const h = 216;
  const padL = 40;
  const padR = 40;
  const padT = 14;
  const padB = 30;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  if (!rows.length) return null;

  const maxC = 100;
  const scores = rows.map((r) => Number(r.score || 0));
  const maxS = Math.max(1, ...scores, 1);

  const ptsC = rows.map((r, i) => {
    const x = padL + (innerW * (i / Math.max(1, rows.length - 1)));
    const y = padT + innerH * (1 - Math.min(100, Number(r.completion || 0)) / maxC);
    return { x, y };
  });
  const ptsS = rows.map((r, i) => {
    const x = padL + (innerW * (i / Math.max(1, rows.length - 1)));
    const y = padT + innerH * (1 - Number(r.score || 0) / maxS);
    return { x, y };
  });

  const lineC = ptsC.map((p) => `${p.x},${p.y}`).join(' ');
  const lineS = ptsS.map((p) => `${p.x},${p.y}`).join(' ');

  const baseY = padT + innerH;
  const areaD = [
    `M ${ptsC[0].x} ${baseY}`,
    ...ptsC.map((p) => `L ${p.x} ${p.y}`),
    `L ${ptsC[ptsC.length - 1].x} ${baseY}`,
    'Z',
  ].join(' ');

  const xLabels = rows.map((r, i) => {
    const x = padL + (innerW * (i / Math.max(1, rows.length - 1)));
    const label = String(r.week || '').slice(5);
    return (
      <text key={r.week} x={x} y={h - 8} textAnchor="middle" className={styles.svgTick}>
        {label}
      </text>
    );
  });

  return (
    <svg className={styles.trendSvg} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COLORS.primary} stopOpacity={completionFlat ? 0.08 : 0.35} />
          <stop offset="100%" stopColor={COLORS.primary} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((t) => {
        const y = padT + innerH * (1 - t);
        return <line key={t} x1={padL} y1={y} x2={padL + innerW} y2={y} className={styles.svgGridLine} />;
      })}
      <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} className={styles.svgAxisBaseline} />
      <line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} className={styles.svgAxisBaseline} />
      <text x={6} y={padT + 8} className={styles.svgTick}>
        100%
      </text>
      <text x={6} y={padT + innerH} className={styles.svgTick}>
        0
      </text>
      <text x={w - padR + 2} y={padT + 8} className={styles.svgTick}>
        {maxS.toFixed(0)}
      </text>
      <text x={w - padR + 2} y={padT + innerH} className={styles.svgTick}>
        0
      </text>
      <path d={areaD} fill={`url(#${gradId})`} />
      <polyline
        fill="none"
        stroke={completionFlat ? COLORS.slate : COLORS.primary}
        strokeWidth={completionFlat ? 2 : 2.5}
        strokeDasharray={completionFlat ? '5 4' : undefined}
        points={lineC}
        strokeLinejoin="round"
        opacity={completionFlat ? 0.9 : 1}
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        fill="none"
        stroke={COLORS.green}
        strokeWidth="2.5"
        points={lineS}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {rows.map((r, i) => (
        <g key={r.week}>
          <circle cx={ptsC[i].x} cy={ptsC[i].y} r={3.5} fill={COLORS.primary} stroke="var(--color-bg-elevated)" strokeWidth="1" />
          <circle cx={ptsS[i].x} cy={ptsS[i].y} r={3.5} fill={COLORS.green} stroke="var(--color-bg-elevated)" strokeWidth="1" />
        </g>
      ))}
      {xLabels}
    </svg>
  );
}

function DonutSvg({ slices }) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const rOut = 72;
  const rIn = 44;
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return null;

  let angle = -Math.PI / 2;
  const elements = [];
  slices.forEach((s, i) => {
    const frac = s.value / total;
    const a0 = angle;
    const a1 = angle + frac * 2 * Math.PI;
    angle = a1;

    const xo1 = cx + rOut * Math.cos(a0);
    const yo1 = cy + rOut * Math.sin(a0);
    const xo2 = cx + rOut * Math.cos(a1);
    const yo2 = cy + rOut * Math.sin(a1);
    const xi1 = cx + rIn * Math.cos(a0);
    const yi1 = cy + rIn * Math.sin(a0);
    const xi2 = cx + rIn * Math.cos(a1);
    const yi2 = cy + rIn * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;

    const d = [
      `M ${xo1} ${yo1}`,
      `A ${rOut} ${rOut} 0 ${large} 1 ${xo2} ${yo2}`,
      `L ${xi2} ${yi2}`,
      `A ${rIn} ${rIn} 0 ${large} 0 ${xi1} ${yi1}`,
      'Z',
    ].join(' ');

    elements.push(
      <path key={s.label} d={d} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="var(--color-bg-elevated)" strokeWidth="1" />
    );
  });

  return (
    <svg className={styles.donutSvg} viewBox={`0 0 ${size} ${size}`}>
      {elements}
    </svg>
  );
}

function CoachingVerticalBars({ coaching, formatInt }) {
  const n = coaching.length;
  if (!n) return null;
  const scores = coaching.map((c) => Number(c.avg_score || 0));
  const maxY = Math.max(5, ...scores) * 1.1;
  const chartH = 150;
  const left = 32;
  const bottom = 44;
  const barW = Math.min(32, Math.max(18, Math.floor(400 / n)));
  const gap = 12;
  const plotW = n * (barW + gap) + 8;
  const w = Math.max(left + plotW + 8, MIN_BAR_CHART_VIEWBOX_W);
  const h = chartH + bottom;
  const baseY = chartH;

  return (
    <svg className={styles.barChartSvg} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map((t) => {
        const tv = maxY * t;
        const y = baseY - (tv / maxY) * (chartH - 10);
        return <line key={t} x1={left} y1={y} x2={w - 4} y2={y} className={styles.svgGridLine} />;
      })}
      {coaching.map((c, i) => {
        const sc = Number(c.avg_score || 0);
        const bh = (sc / maxY) * (chartH - 10);
        const x = left + i * (barW + gap);
        const y = baseY - bh;
        return (
          <g key={c.user_id}>
            <rect x={x} y={y} width={barW} height={bh} rx="4" fill={COLORS.orange} opacity="0.9" />
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" className={styles.svgTick}>
              {sc.toFixed(1)}
            </text>
            <text
              x={x + barW / 2}
              y={baseY + 12}
              textAnchor="middle"
              className={styles.svgBarLabel}
              transform={`rotate(-28 ${x + barW / 2} ${baseY + 12})`}
            >
              {shortLabel(c.user_name, 11)}
            </text>
          </g>
        );
      })}
      <line x1={left} y1={baseY} x2={w - 4} y2={baseY} className={styles.svgAxisBaseline} />
    </svg>
  );
}

export function PerformanceReportsCharts({
  summary = [],
  trend = [],
  calendarSlices = [],
  dialsByHour = [],
  coaching = [],
  mode = 'full',
  formatInt = (n) => String(n),
  formatMoney = (n) => String(n),
}) {
  const trendRows = useMemo(
    () =>
      trend.map((t) => ({
        week: t.bucket,
        completion: Number(t.avg_completion || 0),
        score: Number(t.avg_score || 0),
      })),
    [trend]
  );

  const trendCompletionAllZero = useMemo(
    () => trendRows.length > 0 && trendRows.every((r) => Number(r.completion || 0) < 0.01),
    [trendRows]
  );

  const pieRows = useMemo(() => {
    const rows = (calendarSlices || [])
      .map((x) => ({
        label: x.label,
        value: Number(x.value || 0),
      }))
      .filter((x) => x.value > 0);
    return rows;
  }, [calendarSlices]);

  const dealRows = useMemo(
    () =>
      summary
        .map((s) => ({
          name: s.user_name,
          value: Number(s.crm_opportunities_amount || 0),
        }))
        .filter((r) => r.value > 0),
    [summary]
  );
  const maxDeal = useMemo(() => Math.max(1, ...dealRows.map((d) => d.value)), [dealRows]);

  const totalDeal = useMemo(
    () => summary.reduce((a, s) => a + Number(s.crm_opportunities_amount || 0), 0),
    [summary]
  );

  const pipelineTotals = useMemo(
    () =>
      summary.reduce(
        (acc, s) => ({
          dials: acc.dials + Number(s.crm_total_calls || 0),
          scheduledFollowUps: acc.scheduledFollowUps + Number(s.crm_scheduled_follow_ups || 0),
          meetings: acc.meetings + Number(s.crm_calendar_meetings || 0),
          opps: acc.opps + Number(s.crm_opportunities_count || 0),
        }),
        { dials: 0, scheduledFollowUps: 0, meetings: 0, opps: 0 }
      ),
    [summary]
  );

  const showScores = mode === 'full';
  const showActivity = mode === 'full';
  const showDeals = mode === 'full';
  const showTrend = mode === 'full' || mode === 'trendCalendar';
  const showCalendar = mode === 'full' || mode === 'trendCalendar';

  if (mode === 'coachingBars') {
    const maxCoach = Math.max(1, ...coaching.map((c) => Number(c.avg_score || 0)));
    return (
      <div className={styles.chartsGrid}>
        <ChartCard
          title="Coaching queue — bar diagram"
          subtitle="Each bar is average score for an agent who matched coaching rules this period."
        >
          {!coaching.length ? (
            <EmptyChart message="No agents in the coaching queue for these filters." />
          ) : (
            <div className={styles.chartScrollX}>
              <CoachingVerticalBars coaching={coaching} formatInt={formatInt} />
            </div>
          )}
        </ChartCard>
        <ChartCard title="Coaching queue — relative bars" subtitle="Same data: length relative to highest score in the list.">
          {!coaching.length ? (
            <EmptyChart message="No agents in the coaching queue for these filters." />
          ) : (
            <div className={styles.hList}>
              {coaching.map((c) => (
                <div key={c.user_id} className={styles.hAgentBlock}>
                  <div className={styles.hAgentName}>{c.user_name}</div>
                  <HorizontalMetricRow
                    label="Avg score"
                    value={Number(c.avg_score || 0)}
                    max={maxCoach}
                    color={COLORS.orange}
                  />
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    );
  }

  return (
    <div className={styles.dashboardRoot}>
      {showScores || showActivity ? (
        <DashboardSection
          kicker="Volume & rhythm"
          title="Outreach and calling patterns"
          lede="Team totals for the period, then when dial attempts happen during the day."
        >
          <div className={styles.dashStack}>
            <ChartCard
              title="Activity flow"
              subtitle="Stages sum everyone in this report—compare volume, not a strict funnel."
            >
              {!summary.length ? (
                <EmptyChart message="No agents in this report scope." />
              ) : (
                <>
                  <TeamPipelineFlowDiagram
                    dials={pipelineTotals.dials}
                    scheduledFollowUps={pipelineTotals.scheduledFollowUps}
                    meetings={pipelineTotals.meetings}
                    opps={pipelineTotals.opps}
                    formatInt={formatInt}
                  />
                  <p className={styles.pipelineCaption}>
                    Follow-ups and meetings can appear without new dials in the same window; treat each number as its own total.
                  </p>
                </>
              )}
            </ChartCard>
            <ChartCard
              title="Dial attempts by hour"
              subtitle="7 AM–7 PM server time, all selected days combined for agents in view."
            >
              <div className={styles.chartScrollX}>
                <DialsPerHourChart series={dialsByHour} formatInt={formatInt} />
              </div>
            </ChartCard>
          </div>
        </DashboardSection>
      ) : null}

      {showScores ? (
        <DashboardSection
          kicker="Performance"
          title="Scores and rankings"
          lede="Team averages and per-person weighted scores for the filtered period."
        >
          <div className={styles.dashRow2}>
            <ChartCard title="Team snapshot" subtitle="Average completion and score across agents in this view.">
              {!summary.length ? (
                <EmptyChart message="No agents in this report scope." />
              ) : (
                <TeamAverageGauges summary={summary} />
              )}
            </ChartCard>
            <ChartCard
              title="Score by agent"
              subtitle="Higher bars mean stronger average task score. Scroll sideways for large teams."
              tall
            >
              {!summary.length ? (
                <EmptyChart message="No agents in this report scope." />
              ) : (
                <div className={styles.chartScrollX}>
                  <VerticalBarChartScores summary={summary} formatInt={formatInt} />
                </div>
              )}
            </ChartCard>
          </div>
        </DashboardSection>
      ) : null}

      {showActivity || showTrend ? (
        <DashboardSection
          kicker="CRM & momentum"
          title="Activity and weekly trend"
          lede="CRM counts per person and how completion and score move week to week."
        >
          <div className={showActivity && showTrend ? styles.dashRow2 : styles.dashStack}>
            {showActivity ? (
              <ChartCard
                title="CRM activity by agent"
                subtitle="Dials, scheduled follow-ups, and meetings—counts only, scaled to your data."
                tall
              >
                {!summary.length ? (
                  <EmptyChart message="No agents in this report scope." />
                ) : (
                  <div className={styles.chartScrollX}>
                    <GroupedVerticalBarsActivity summary={summary} formatInt={formatInt} />
                  </div>
                )}
              </ChartCard>
            ) : null}
            {showTrend ? (
              <ChartCard
                title="Weekly trend"
                subtitle="Blue: task completion %. Green: average score. Dots mark each week."
                insight={
                  trendCompletionAllZero
                    ? 'Completion is 0% for every week shown, so the blue fill sits on the baseline—that is expected, not a rendering error.'
                    : undefined
                }
              >
                {!trendRows.length ? (
                  <EmptyChart message="No weekly trend data for this date range." />
                ) : (
                  <div className={styles.trendWrap}>
                    <WeeklyTrendSvg rows={trendRows} completionFlat={trendCompletionAllZero} />
                    <div className={styles.trendLegend}>
                      <span>
                        <i className={styles.lgSwatch} style={{ background: COLORS.primary }} /> Completion %
                      </span>
                      <span>
                        <i className={styles.lgSwatch} style={{ background: COLORS.green }} /> Avg score
                      </span>
                    </div>
                  </div>
                )}
              </ChartCard>
            ) : null}
          </div>
        </DashboardSection>
      ) : null}

      {showDeals || showCalendar ? (
        <DashboardSection
          kicker="Pipeline & calendar"
          title="Deals and month mix"
          lede="Opportunity value by agent and how days split across task statuses."
        >
          <div className={showDeals && showCalendar ? styles.dashRow2 : styles.dashStack}>
            {showDeals ? (
              <ChartCard
                title="Pipeline value"
                subtitle={`Open opportunity amount in range. Team total ${formatMoney(totalDeal)}.`}
              >
                {!summary.length ? (
                  <EmptyChart message="No agents in this report scope." />
                ) : !dealRows.length ? (
                  <EmptyChart message="No opportunity amounts in this period." />
                ) : (
                  <div className={styles.chartScrollX}>
                    <VerticalBarDeals dealRows={dealRows} maxDeal={maxDeal} formatMoney={formatMoney} />
                  </div>
                )}
              </ChartCard>
            ) : null}
            {showCalendar ? (
              <ChartCard title="Month status mix" subtitle="Share of logged task days in the selected month.">
                {!pieRows.length ? (
                  <EmptyChart message="No status breakdown for this month (or all counts are zero)." />
                ) : (
                  <div className={styles.pieRow}>
                    <DonutSvg slices={pieRows} />
                    <ul className={styles.pieLegend}>
                      {pieRows.map((p, i) => (
                        <li key={p.label}>
                          <i className={styles.lgSwatch} style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          {p.label}: <strong>{p.value}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </ChartCard>
            ) : null}
          </div>
        </DashboardSection>
      ) : null}
    </div>
  );
}
