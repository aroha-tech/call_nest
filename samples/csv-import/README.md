# Sample CSVs — full import testing matrix

Use these under **Import Leads** / **Import Contacts** (max **2000 rows**, **5 MB** per upload).

## All files (21 scenarios)

| # | File | Scenario |
|---|------|----------|
| 01 | `01-meta-google-leads.csv` | Meta / Google: `full_name`, UTM, WhatsApp |
| 02 | `02-indiamart-b2b.csv` | IndiaMART B2B: `contact_person`, `company_name`, `product` |
| 03 | `03-real-estate-portal.csv` | Real estate: `customer_name`, `budget_range`, `bhk`, `locality` |
| 04 | `04-justdial-sulekha.csv` | JustDial / Sulekha: `enquiry_name`, `contact_number`, `alternate_mobile` |
| 05 | `05-generic-excel-export.csv` | Excel: **First Name**, **Last Name** (spaces in headers) |
| 06 | `06-education-coaching.csv` | Education: `student_name`, course, city, `stage` |
| 07 | `07-insurance-finance.csv` | Insurance: `applicant_name`, `premium_range`, `disposition` |
| 08 | `08-healthcare-clinic.csv` | Healthcare: `patient_name`, `contact_no`, `speciality`, `sub_status` |
| 09 | `09-automotive-dealer.csv` | Automotive: `buyer_name`, model, test drive, portals |
| 10 | `10-multiple-phones.csv` | Extra numbers: `phone_2`, `landline`, `office_phone` |
| 11 | `11-labeled-phone-columns.csv` | `phone:work`, `phone:home` (labelled phones) |
| 12 | `12-cf-prefix-columns.csv` | **`cf:batch_code`**, **`cf:notes`** — create matching custom fields or map in Step 3 |
| 13 | `13-unicode-names.csv` | UTF-8: Devanagari + Tamil + apostrophe in name |
| 14 | `14-email-only-leads.csv` | No name column; **email + mobile** only |
| 15 | `15-mixed-valid-invalid-rows.csv` | **1 invalid row** (no name, no email) → expect **failed** count |
| 16 | `16-duplicate-same-phone.csv` | **Same mobile twice** → test **Skip** vs **Update** duplicate mode |
| 17 | `17-utm-campaign-heavy.csv` | Google Ads style: many `utm_*`, `ad_name`, `lead_stage` |
| 18 | `18-display-name-explicit.csv` | `display_name` + `first_name` + `last_name` together |
| 19 | `19-minimal-name-mobile.csv` | Minimal: only **`name`** + **`mobile`** |
| 20 | `20-b2b-saas.csv` | B2B SaaS: `client_name`, `company`, `job_title`, `region` |
| 21 | `21-state-region-budget.csv` | `state`, `region`, `budget_range`, `property_interest` (auto CF aliases) |

## Recommended test order

1. **Happy path:** `01`, `03`, `05`, `19`  
2. **Phones:** `10`, `11`, `04`  
3. **Sources / UTM:** `01`, `17`  
4. **Edge / errors:** `15` (expect failures), `16` (skip/update)  
5. **Unicode:** `13`  
6. **Custom `cf:`:** `12` (add fields `batch_code`, `notes` in CRM first, or map manually)  
7. **Industries:** `06`–`09`, `20`, `21`

## Checklist

- [ ] Industries: RE, B2B, education, insurance, health, auto, SaaS  
- [ ] Name styles: full name, first+last, `display_name`, minimal `name`  
- [ ] Phones: single, WhatsApp, multiple columns, `phone:label`  
- [ ] Source/status: `lead_source`, UTM, `stage`, `disposition`, `lead_stage`  
- [ ] Property/budget/city/state style columns (`21`)  
- [ ] Invalid row (`15`) shows in **Result** + **import history** error sample  
- [ ] Duplicate phone (`16`) with **Skip** → 1 created, 1 skipped  

## Notes

- Phone numbers are **fake** (testing only).  
- **`cf:`** columns only save if a custom field with that **name** exists (or map in Step 3).  
- **`CSV_IMPORT_MAX_FILE_BYTES`** / **`VITE_CSV_IMPORT_MAX_MB`** control size limits.  
