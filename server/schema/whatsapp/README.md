# WhatsApp (Business API) schema

WhatsApp Business API module: accounts, templates, template components, messages, and API logs.

- **whatsapp_accounts** — API credentials per tenant
- **whatsapp_business_templates** — Meta-approved templates (template_name, provider_template_id, category, language); separate from templates.whatsapp_templates
- **whatsapp_template_components** — HEADER / BODY / FOOTER per template
- **whatsapp_messages** — Sent message log
- **whatsapp_api_logs** — API request/response logs

Note: The `templates` domain has a separate table `whatsapp_templates` (message_body/code for disposition flows). If you already created that table, rename it to `whatsapp_message_templates` before running this schema, or run this on a database that does not have it.
