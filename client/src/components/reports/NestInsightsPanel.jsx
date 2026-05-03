import React from 'react';
import styles from './NestInsightsPanel.module.scss';

const SEVERITY_CLASS = {
  action: styles.sevAction,
  watch: styles.sevWatch,
  info: styles.sevInfo,
};

export function NestInsightsPanel({ bundle, loading, error }) {
  const insights = bundle?.nest_insights?.insights || [];

  if (loading) {
    return (
      <div className={styles.panel}>
        <h3 className={styles.title}>Nest Insights</h3>
        <p className={styles.muted}>Analyzing your workspace signals…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.panel}>
        <h3 className={styles.title}>Nest Insights</h3>
        <p className={styles.error}>{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <h3 className={styles.title}>Nest Insights</h3>
        <span className={styles.badge} title="On-server intelligence — no third-party AI">
          AI
        </span>
      </div>
      <p className={styles.sub}>
        Guidance from Call Nest using your metrics, trends, and peer context. Explanations stay on your servers.
      </p>
      {insights.length === 0 ? (
        <p className={styles.muted}>No prioritized insights for this range — keep logging activity for richer guidance.</p>
      ) : (
        <ul className={styles.list}>
          {insights.map((item) => (
            <li key={item.id} className={`${styles.card} ${SEVERITY_CLASS[item.severity] || ''}`}>
              <div className={styles.cardTop}>
                <span className={styles.cardTitle}>{item.title}</span>
                <span className={styles.confidence}>{Math.round((item.confidence || 0) * 100)}% confidence</span>
              </div>
              <p className={styles.summary}>{item.summary}</p>
              {item.suggested_actions?.length ? (
                <ol className={styles.actions}>
                  {item.suggested_actions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ol>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
