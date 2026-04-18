import { broadcastSocketToTenant } from './tenantRealtimeSocket.js';

/**
 * Publish a tenant-scoped realtime event to browsers (Socket.IO).
 * With `@socket.io/redis-adapter` (when Redis is up), one emit reaches all API nodes.
 * Without the adapter, only this process’s connected clients receive the event.
 *
 * @param {number} tenantId
 * @param {string} eventType - e.g. `background_job`, `call_updated`
 * @param {unknown} data
 */
export async function publishTenantRealtimeEvent(tenantId, eventType, data) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return;
  broadcastSocketToTenant(tid, eventType, data);
}
