# Master Data Seeds

Platform-wide master reference data managed by Super Admin.

## Files

| File | Description | Records |
|------|-------------|---------|
| `01_industries.sql` | Industry definitions | 25 |
| `02_dispo_types.sql` | Disposition type categories | 10 |
| `03_dispo_actions.sql` | Disposition actions | 12 |
| `04_contact_statuses.sql` | Contact lifecycle stages | 11 |
| `05_contact_temperatures.sql` | Lead temperature levels | 4 |

## Usage

```sql
-- Run in order from MySQL CLI
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/01_industries.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/02_dispo_types.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/03_dispo_actions.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/04_contact_statuses.sql;
SOURCE D:/own_software/call_nest/server/schema/seeds/03_master/05_contact_temperatures.sql;
```

## Master Data Overview

### Industries (25 records)
Real Estate, Insurance, Banking, Education, Healthcare, Automobile, Travel, E-commerce, Retail, SaaS, IT Services, Recruitment, NBFC, DSA, Telecom, Marketing, BPO, Logistics, Manufacturing, Fitness, Hospitality, NGO, Franchise, Generic Sales, EdTech

### Disposition Types (10 records)
Connected, Not Connected, Callback, Not Interested, Converted, DNC, Wrong Number, Voicemail, Busy, No Answer

### Disposition Actions (12 records)
Schedule Callback, Send Email, Send SMS, Send WhatsApp, Create Task, Assign to Agent, Move to Campaign, Add to DNC, Update Status, Mark Converted, Schedule Meeting, Send Proposal

### Contact Statuses (11 records)
New, Contacted, Qualified, Unqualified, Nurturing, Proposal Sent, Negotiation, Converted, Lost, On Hold, Do Not Contact

### Contact Temperatures (4 records)
Hot (1), Warm (2), Cold (3), Dead (4)

## Notes

- All master data uses UUID for primary keys
- Super Admin can add/edit/delete through the UI
- Soft delete supported (is_deleted, deleted_at)
- Code field is unique and cannot be changed after creation
