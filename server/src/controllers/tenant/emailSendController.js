import * as sendEmailService from '../../services/email/sendEmailService.js';

export async function send(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const message = await sendEmailService.sendEmail(tenantId, req.body, req.user.id);
    res.status(201).json({ data: message, message: 'Email sent' });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Send failed' });
  }
}
