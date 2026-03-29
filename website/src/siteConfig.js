/**
 * Public site copy for arohva.com
 *
 * Product name vs domain:
 * - They do not have to match. You can use any marketing name.
 * - If your domain is arohva, calling the product "Arohva" is natural and keeps OAuth / app
 *   listings aligned with your URL. Use `tagline` (or extra copy on pages) for a longer descriptor.
 *
 * Update this file with your real business details for:
 * OAuth app listings, payment gateways, tax details, and general public contact info.
 */
export const siteConfig = {
  /** Primary brand / product name shown across the site */
  productName: 'Arohva',
  /** One line under the name — what you "do" in plain language */
  tagline: 'Call operations, contacts, and team workflows in one place.',

  /** Your registered legal entity name (can differ from product name) */
  companyLegalName: '[Your registered legal entity name]',
  addressLines: ['[Street / building]', '[City, State — PIN]', 'India'],

  /**
   * Public contact emails shown on the website.
   * If you don't have business email yet, keep these as neutral placeholders and update later.
   */
  contactEmail: 'contact@example.com',
  supportEmail: 'support@example.com',
  phone: '+91-00000-00000',

  /**
   * India GST identification (15 characters), e.g. 27AAAAA0000A1Z5.
   * Keep `null` until you are GST-registered — the site will say so on About / legal pages.
   */
  gstin: null,

  websiteUrl: 'https://arohva.com',

  /** Courts for dispute resolution — set after legal review. */
  jurisdictionCity: '[e.g. Bengaluru]',

  lastUpdatedPrivacy: '2026-03-29',
  lastUpdatedTerms: '2026-03-29',
};
