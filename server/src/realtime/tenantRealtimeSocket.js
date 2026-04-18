import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { redis, isRedisAvailable } from '../config/redis.js';

const LOG = '[tenant-socket]';

/** Room name for all browsers of one tenant (numeric id). */
export function tenantRealtimeRoom(tenantId) {
  return `tenant:${Number(tenantId)}`;
}

let ioRef = null;

export function broadcastSocketToTenant(tenantId, eventType, data) {
  if (!ioRef) return;
  const room = tenantRealtimeRoom(tenantId);
  ioRef.to(room).emit(eventType, data);
}

function socketCorsAllowed(origin) {
  if (!env.isProduction) return true;
  if (!origin) return true;
  if (env.corsOrigins.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    const hostLower = hostname.toLowerCase();
    if (env.bootstrapHosts.length && env.bootstrapHosts.includes(hostLower)) return true;
    if (env.corsOriginSuffix && hostLower.endsWith(env.corsOriginSuffix)) return true;
  } catch {
    return false;
  }
  if (env.frontendUrl && origin === env.frontendUrl) return true;
  return false;
}

function userFromHandshakeToken(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  const userId = payload.user_id ?? payload.sub;
  const tenantIdRaw =
    payload.tenant_id !== undefined ? payload.tenant_id : payload.tenantId !== undefined ? payload.tenantId : null;
  return {
    id: userId,
    email: payload.email,
    tenantId: tenantIdRaw != null ? Number(tenantIdRaw) : null,
    role: payload.role,
    isPlatformAdmin: Boolean(payload.is_platform_admin),
    permissions: payload.permissions || [],
  };
}

/**
 * Attach Socket.IO to the same HTTP server as Express.
 * Auth: handshake.auth.token (JWT). Same tenant + permission bar as former GET /realtime/stream.
 */
export async function initTenantRealtimeSocket(httpServer) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    cors: {
      origin: (origin, callback) => {
        if (socketCorsAllowed(origin)) callback(null, true);
        else callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  if (isRedisAvailable()) {
    try {
      const pubClient = redis.duplicate();
      const subClient = redis.duplicate();
      if (!pubClient.isOpen) await pubClient.connect();
      if (!subClient.isOpen) await subClient.connect();
      io.adapter(createAdapter(pubClient, subClient));
      console.info(LOG, 'Redis adapter enabled for multi-node fan-out');
    } catch (e) {
      console.warn(LOG, 'Redis adapter failed (single-node sockets only):', e?.message || e);
    }
  }

  const realtimePermissions = ['contacts.read', 'leads.read'];

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token || typeof token !== 'string') {
        return next(new Error('Authentication required'));
      }
      const user = userFromHandshakeToken(token);
      if (user.isPlatformAdmin) {
        return next(new Error('Tenant realtime is for tenant users only'));
      }
      if (user.tenantId == null || !Number.isFinite(user.tenantId) || user.tenantId < 1) {
        return next(new Error('Tenant context required'));
      }
      const ok = realtimePermissions.some((code) => (user.permissions || []).includes(code));
      if (!ok) {
        return next(new Error('Permission denied'));
      }
      socket.data.tenantId = user.tenantId;
      socket.data.userId = user.id;
      return next();
    } catch (e) {
      const msg =
        e?.name === 'TokenExpiredError'
          ? 'Token expired'
          : e?.name === 'JsonWebTokenError'
            ? 'Invalid token'
            : e?.message || 'Unauthorized';
      return next(new Error(msg));
    }
  });

  io.on('connection', (socket) => {
    const tid = socket.data.tenantId;
    const room = tenantRealtimeRoom(tid);
    socket.join(room);
    console.info(LOG, 'connected', { tenantId: tid, userId: socket.data.userId, sid: socket.id });

    socket.on('disconnect', (reason) => {
      console.info(LOG, 'disconnected', { tenantId: tid, reason, sid: socket.id });
    });
  });

  ioRef = io;
  console.info(LOG, 'listening on path /socket.io');
}
