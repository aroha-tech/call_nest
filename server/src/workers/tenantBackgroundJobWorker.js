import { env } from '../config/env.js';
import {
  acquireBackgroundJobSlot,
  isRedisAvailable,
  releaseBackgroundJobSlot,
} from '../config/redis.js';
import { claimNextPendingJob } from '../services/tenant/tenantBackgroundJobService.js';
import { runTenantBackgroundJobRow } from '../services/tenant/tenantBackgroundJobHandlers.js';

let activeJobCount = 0;
let tickRunning = false;

/**
 * Polls for pending jobs and runs up to BACKGROUND_JOB_MAX_CONCURRENT in parallel per process.
 * When Redis is up and BACKGROUND_JOB_REDIS_MAX_CONCURRENT > 0, a Lua-backed counter caps total * running jobs cluster-wide so several API instances can share work safely.
 */
export function startTenantBackgroundJobWorker() {
  const localMax = env.backgroundJobMaxConcurrent;
  const redisGlobalMax = env.backgroundJobRedisMaxConcurrent;
  const useRedisSlots = redisGlobalMax > 0 && isRedisAvailable();

  if (redisGlobalMax > 0 && !isRedisAvailable()) {
    console.warn(
      '[background-jobs] BACKGROUND_JOB_REDIS_MAX_CONCURRENT is set but Redis is not connected; using per-process concurrency only.'
    );
  }

  const tick = async () => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      while (activeJobCount < localMax) {
        let redisAcquired = false;
        if (useRedisSlots) {
          const ok = await acquireBackgroundJobSlot(redisGlobalMax);
          if (!ok) break;
          redisAcquired = true;
        }

        let job;
        try {
          job = await claimNextPendingJob();
        } catch (e) {
          console.warn('[background-jobs] claim failed (DB may have been idle during sleep):', e?.code || e?.message || e);
          if (redisAcquired) await releaseBackgroundJobSlot();
          break;
        }
        if (!job) {
          if (redisAcquired) await releaseBackgroundJobSlot();
          break;
        }

        activeJobCount++;
        const releaseRedis = redisAcquired;
        void (async () => {
          try {
            await runTenantBackgroundJobRow(job);
          } catch (e) {
            console.error('[background-jobs] job error', job?.id, e?.message || e);
          } finally {
            activeJobCount--;
            if (releaseRedis) await releaseBackgroundJobSlot();
          }
        })();
      }
    } finally {
      tickRunning = false;
    }
  };

  const ms = env.backgroundJobPollMs;
  const id = setInterval(() => {
    void tick();
  }, ms);
  if (typeof id.unref === 'function') id.unref();
  void tick();
}
