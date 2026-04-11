/**
 * One-off generator: node samples/csv-import/generate-1000-demo-leads.mjs
 * Writes 22-demo-1000-leads-with-custom-fields.csv (UTF-8, comma-separated).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '22-demo-1000-leads-with-custom-fields.csv');

const firstNames = [
  'Raj', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Ananya', 'Karan', 'Meera', 'Rohit', 'Divya',
  'Arjun', 'Neha', 'Suresh', 'Kavita', 'Manish', 'Pooja', 'Deepak', 'Swati', 'Nikhil', 'Ritu',
];
const lastNames = [
  'Sharma', 'Patel', 'Kumar', 'Singh', 'Reddy', 'Iyer', 'Verma', 'Gupta', 'Joshi', 'Nair',
  'Kapoor', 'Malhotra', 'Desai', 'Mehta', 'Chopra', 'Agarwal', 'Rao', 'Menon', 'Kulkarni', 'Shah',
];
const cities = [
  'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Pune', 'Ahmedabad', 'Chennai', 'Kolkata', 'Jaipur', 'Surat',
];
const states = ['MH', 'KA', 'DL', 'GJ', 'TN', 'WB', 'RJ', 'TS'];
const propertyTypes = ['2 BHK', '3 BHK', 'Plot', 'Villa', 'Commercial', 'Studio'];
const projects = [
  'Skyline Towers', 'Green Valley Phase 2', 'Metro Homes', 'Urban Nest', 'Capital Heights',
  'Lakeview Residency', 'Sunrise Arcade', 'Elite Enclave',
];
const sources = ['Website', 'Facebook Lead', 'Google Ads', 'Referral', 'IndiaMART', 'Walk-in', 'WhatsApp'];
const callSlots = ['10:00–12:00', '14:00–17:00', '18:00–20:00', 'Weekend only', 'Anytime'];

function pick(arr, i) {
  return arr[i % arr.length];
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const header = [
  'full_name',
  'mobile',
  'email',
  'city',
  'state',
  'source',
  'status',
  'budget_lakhs',
  'property_type',
  'project_interest',
  'lead_score',
  'preferred_call_time',
  'remarks',
  'utm_campaign',
  'possession_timeline_months',
];

const lines = [header.join(',')];

for (let i = 1; i <= 1000; i++) {
  const fn = pick(firstNames, i);
  const ln = pick(lastNames, i * 7);
  const fullName = `${fn} ${ln}`;
  const mobile = `9${String(100000000 + ((i * 73856093) % 899999999)).padStart(9, '0')}`;
  const email = `demo.lead.${i}@example-test.local`;
  const city = pick(cities, i * 3);
  const state = pick(states, i * 11);
  const source = pick(sources, i * 13);
  const status = i % 6 === 0 ? 'Qualified' : i % 7 === 0 ? 'Follow up' : 'New';
  const budgetLakhs = 25 + (i % 175);
  const propertyType = pick(propertyTypes, i * 17);
  const projectInterest = pick(projects, i * 19);
  const leadScore = 1 + (i % 10);
  const preferredCallTime = pick(callSlots, i * 23);
  const remarks = `Demo import row ${i} — interested in ${propertyType}.`;
  const utm = `import_demo_${(i % 24) + 1}`;
  const possessionMonths = 3 + (i % 36);

  const row = [
    csvCell(fullName),
    csvCell(mobile),
    csvCell(email),
    csvCell(city),
    csvCell(state),
    csvCell(source),
    csvCell(status),
    csvCell(budgetLakhs),
    csvCell(propertyType),
    csvCell(projectInterest),
    csvCell(leadScore),
    csvCell(preferredCallTime),
    csvCell(remarks),
    csvCell(utm),
    csvCell(possessionMonths),
  ];
  lines.push(row.join(','));
}

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log('Wrote', OUT, '(' + (lines.length - 1) + ' data rows)');
