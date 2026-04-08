import { randomUUID } from 'crypto';

/**
 * Dummy telephony provider: no external call, returns a simulated completed call.
 * Useful for wiring UI + reporting before Exotel/Twilio integration.
 */
export const dummyProvider = {
  code: 'dummy',

  /**
   * @param {{ to: string, from?: string, metadata?: object }} params
   * @returns {Promise<{ provider_call_id: string, status: string }>}
   */
  async startOutboundCall({ to }) {
    if (!to) {
      const err = new Error('Missing destination number');
      err.status = 400;
      throw err;
    }
    return {
      provider_call_id: `dummy_${randomUUID()}`,
      status: 'completed',
    };
  },
};

