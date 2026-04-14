/**
 * Maps tenant `industries.code` to a public sample CSV under `client/public/import-samples/`.
 * Unlisted codes fall back to minimal template only (see ContactImportPage).
 */

const MINIMAL = { filename: 'sample-leads-minimal.csv', defaultLabel: 'Minimal template (name + email + mobile)' };

/** @type {Record<string, { filename: string, defaultLabel: string }>} */
const BY_CODE = {
  real_estate: {
    filename: 'sample-industry-real-estate.csv',
    defaultLabel: 'Real estate sample',
  },
  insurance: {
    filename: 'sample-industry-insurance.csv',
    defaultLabel: 'Insurance sample',
  },
  bfs: {
    filename: 'sample-industry-insurance.csv',
    defaultLabel: 'Banking & financial services sample',
  },
  nbfc: {
    filename: 'sample-industry-insurance.csv',
    defaultLabel: 'NBFC sample',
  },
  dsa: {
    filename: 'sample-industry-insurance.csv',
    defaultLabel: 'DSA / loan agency sample',
  },
  education: {
    filename: 'sample-industry-education.csv',
    defaultLabel: 'Education sample',
  },
  edtech: {
    filename: 'sample-industry-education.csv',
    defaultLabel: 'EdTech sample',
  },
  healthcare: {
    filename: 'sample-industry-healthcare.csv',
    defaultLabel: 'Healthcare sample',
  },
  saas: {
    filename: 'sample-industry-b2b-saas.csv',
    defaultLabel: 'SaaS / software sample',
  },
  it_services: {
    filename: 'sample-industry-b2b-saas.csv',
    defaultLabel: 'IT services sample',
  },
  automobile: {
    filename: 'sample-industry-automotive.csv',
    defaultLabel: 'Automotive sample',
  },
  ecommerce: {
    filename: 'sample-industry-b2b-saas.csv',
    defaultLabel: 'E-commerce sample',
  },
  retail: {
    filename: 'sample-industry-b2b-saas.csv',
    defaultLabel: 'Retail sample',
  },
  recruitment: {
    filename: 'sample-industry-b2b-saas.csv',
    defaultLabel: 'Recruitment sample',
  },
  telecom: {
    filename: 'sample-industry-b2b-saas.csv',
    defaultLabel: 'Telecom sample',
  },
  marketing_agency: {
    filename: 'sample-industry-b2b-saas.csv',
    defaultLabel: 'Marketing agency sample',
  },
  bpo: {
    filename: 'sample-industry-b2b-saas.csv',
    defaultLabel: 'BPO sample',
  },
  logistics: {
    filename: 'sample-industry-b2b-saas.csv',
    defaultLabel: 'Logistics sample',
  },
  manufacturing: {
    filename: 'sample-industry-b2b-saas.csv',
    defaultLabel: 'Manufacturing sample',
  },
  travel: {
    filename: 'sample-industry-b2b-saas.csv',
    defaultLabel: 'Travel & tourism sample',
  },
  fitness: {
    filename: 'sample-industry-healthcare.csv',
    defaultLabel: 'Fitness & wellness sample',
  },
  hospitality: {
    filename: 'sample-industry-real-estate.csv',
    defaultLabel: 'Hospitality sample',
  },
  ngo: {
    filename: 'sample-industry-b2b-saas.csv',
    defaultLabel: 'NGO sample',
  },
  franchise: {
    filename: 'sample-industry-b2b-saas.csv',
    defaultLabel: 'Franchise sample',
  },
  generic_sales: {
    filename: 'sample-industry-b2b-saas.csv',
    defaultLabel: 'Sales organization sample',
  },
};

/**
 * @param {{ industryCode?: string | null, industryName?: string | null }} tenantIndustry
 * @returns {{ tailored: { filename: string, label: string } | null, minimal: { filename: string, label: string } }}
 */
export function resolveImportSamplesForTenantIndustry(tenantIndustry) {
  const code = tenantIndustry?.industryCode ? String(tenantIndustry.industryCode).trim().toLowerCase() : '';
  const name = tenantIndustry?.industryName ? String(tenantIndustry.industryName).trim() : '';

  const entry = code ? BY_CODE[code] : null;
  const tailored = entry
    ? {
        filename: entry.filename,
        label: name ? `Sample CSV — ${name}` : entry.defaultLabel,
      }
    : null;

  return {
    tailored,
    minimal: {
      filename: MINIMAL.filename,
      label: MINIMAL.defaultLabel,
    },
  };
}
