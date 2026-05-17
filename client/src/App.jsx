import { Routes, Route, Navigate } from 'react-router-dom';
import { AppRoutes } from './routes/AppRoutes';
import { DevTenantBanner } from './components/dev/DevTenantBanner';
import { WorkspaceThemeSync } from './components/WorkspaceThemeSync';
import { SessionMonitor } from './features/auth/components/SessionMonitor';

function App() {
  return (
    <>
      <WorkspaceThemeSync />
      <SessionMonitor />
      <DevTenantBanner />
      <Routes>
        <Route path="/*" element={<AppRoutes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
