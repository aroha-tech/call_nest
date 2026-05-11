/**
 * Arohva Global corporate site (e.g. arohva.com).
 * Product marketing: separate project in /website (Call X Time).
 */
export const siteConfig = {
  siteBrandName: 'Arohva Global',
  saasProductName: 'Call X Time',
  tagline:
    'We build software for serious call teams. Our flagship product is Call X Time — operations, contacts, and workflows in one place.',
  companyLegalName: 'Arohva Global',
  addressLines: [
    '[Street / building — update in src/siteConfig.js]',
    '[City, State — PIN]',
    'India',
  ],
  contactEmail: 'contact@arohva.com',
  supportEmail: 'contact@arohva.com',
  phone: '+91-00000-00000',
  gstin: '24EOLPP8190F1ZH',
  pan: 'EOLPP8190F',
  websiteUrl: 'https://arohva.com',
  companySiteUrl: 'https://arohva.com',
  productSiteUrl: 'https://callxtime.com',
  metaDescription:
    'Arohva Global — technology company behind Call X Time. Company details, GST registration, privacy policy, and terms of service.',
  documentTitle: 'Arohva Global',
  jurisdictionCity: 'Gujarat, India',
  lastUpdatedPrivacy: '2026-05-10',
  lastUpdatedTerms: '2026-05-10',
};

export function publicSiteHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
