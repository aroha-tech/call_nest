import React, { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '../../../app/hooks';
import { selectIsAuthenticated, selectIsImpersonation } from '../authSelectors';
import { axiosInstance } from '../../../services/axiosInstance';
import {
  endSupersededSession,
  isSessionSupersededPending,
  markSessionSupersededPending,
} from '../sessionEnded';
import { SessionSupersededModal } from './SessionSupersededModal';

const PULSE_INTERVAL_MS = 90_000;

/**
 * Detects when the account signed in elsewhere.
 * Shows modal on the current page; redirect to login only when user closes modal or taps Sign in again.
 */
export function SessionMonitor() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const isImpersonation = useAppSelector(selectIsImpersonation);
  const [supersededOpen, setSupersededOpen] = useState(
    () => isSessionSupersededPending() && Boolean(window.__authStore?.getState()?.auth?.isAuthenticated)
  );

  const showSupersededModal = useCallback(() => {
    markSessionSupersededPending();
    setSupersededOpen(true);
  }, []);

  useEffect(() => {
    if (isAuthenticated && isSessionSupersededPending()) {
      setSupersededOpen(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const handler = () => showSupersededModal();
    window.addEventListener('auth:session-superseded', handler);
    return () => window.removeEventListener('auth:session-superseded', handler);
  }, [showSupersededModal]);

  useEffect(() => {
    if (!isAuthenticated || isImpersonation) return undefined;

    const pulse = async () => {
      try {
        await axiosInstance.get('/api/auth/session-pulse');
      } catch (err) {
        if (err.response?.data?.code === 'TOKEN_VERSION_MISMATCH') {
          showSupersededModal();
        }
      }
    };

    void pulse();
    const intervalId = window.setInterval(pulse, PULSE_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void pulse();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isAuthenticated, isImpersonation, showSupersededModal]);

  return (
    <SessionSupersededModal
      isOpen={supersededOpen}
      onDismiss={endSupersededSession}
    />
  );
}
