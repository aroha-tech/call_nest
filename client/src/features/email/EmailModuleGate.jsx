import React from 'react';
import { Navigate } from 'react-router-dom';
import { Spinner } from '../../components/ui/Spinner';
import { useEmailModuleEnabled } from '../../hooks/useEmailModuleEnabled';

/**
 * Renders children only when the email module is enabled; otherwise redirects home.
 * Must sit *inside* AppShellLayout so loading does not unmount the app chrome.
 */
export function EmailModuleGate({ children }) {
  const { emailModuleEnabled, loading } = useEmailModuleEnabled();
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '12rem',
        }}
      >
        <Spinner size="md" />
      </div>
    );
  }
  if (!emailModuleEnabled) return <Navigate to="/" replace />;
  return children;
}
