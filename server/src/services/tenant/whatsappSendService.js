import { sendWhatsappMessage, sendWhatsappTextMessage } from '../whatsapp/sendWhatsappMessage.js';

/**
 * Send WhatsApp template message via provider adapter layer.
 */
export async function sendTemplateMessage(tenantId, payload, createdBy) {
  return sendWhatsappMessage(tenantId, payload, createdBy);
}

/**
 * Send free-form text message (no template). Allowed in 24h session; provider may reject otherwise.
 */
export async function sendTextMessage(tenantId, payload, createdBy) {
  return sendWhatsappTextMessage(tenantId, payload, createdBy);
}
