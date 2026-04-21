import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { Select } from '../../../../components/ui/Select';
import { Alert } from '../../../../components/ui/Alert';
import { Spinner } from '../../../../components/ui/Spinner';
import { useIndustries } from '../../hooks/useMasterData';
import { IndustryFieldDefinitionsView } from './IndustryFieldDefinitionsPage';
import styles from './IndustryLeadFieldsHubPage.module.scss';

export function IndustryLeadFieldsHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const industryId = (searchParams.get('industry') || '').trim();

  const { industries, loading } = useIndustries({
    search: '',
    includeInactive: true,
    page: 1,
    limit: 500,
  });

  const industryOptions = useMemo(() => {
    const rows = Array.isArray(industries) ? industries : [];
    return [
      { value: '', label: '— Select industry —' },
      ...rows.map((i) => ({
        value: String(i.id),
        label: `${i.name || i.code || '—'}${i.is_active === 0 || i.is_active === false ? ' (inactive)' : ''}`,
      })),
    ];
  }, [industries]);

  const onIndustryChange = (e) => {
    const v = String(e.target.value || '').trim();
    if (v) {
      setSearchParams({ industry: v }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Industry lead fields"
        description="Define lead and contact fields per industry. Tenants see fields for their industry (optional packs in Company settings)."
        actions={
          <Link className={styles.topLink} to="/admin/masters/industries">
            Industries list
          </Link>
        }
      />

      <div className={styles.filterCard}>
        {loading ? (
          <Spinner />
        ) : (
          <Select
            label="Industry"
            value={industryId}
            onChange={onIndustryChange}
            options={industryOptions}
          />
        )}
      </div>

      {!industryId ? (
        <Alert variant="info">Select an industry above to view and edit its fields.</Alert>
      ) : (
        <IndustryFieldDefinitionsView industryId={industryId} />
      )}
    </div>
  );
}
