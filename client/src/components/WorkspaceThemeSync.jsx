import { useEffect, useMemo } from 'react';
import { useAppSelector } from '../app/hooks';
import { selectTenant, selectUser } from '../features/auth/authSelectors';
import { applyWorkspaceTheme, clearWorkspaceTheme } from '../utils/applyWorkspaceTheme';

function themeSignature(theme) {
  if (!theme || typeof theme !== 'object') return '';
  try {
    return JSON.stringify(theme);
  } catch {
    return '';
  }
}

/**
 * Applies tenant JWT theme to document CSS variables; platform admins use defaults.
 */
export function WorkspaceThemeSync() {
  const tenant = useAppSelector(selectTenant);
  const user = useAppSelector(selectUser);
  const isPlatform = Boolean(user?.isPlatformAdmin);
  const sig = useMemo(() => themeSignature(tenant?.theme ?? null), [tenant?.theme]);

  useEffect(() => {
    if (isPlatform) {
      clearWorkspaceTheme();
      return undefined;
    }
    applyWorkspaceTheme(tenant?.theme ?? null);
    return () => clearWorkspaceTheme();
  }, [isPlatform, sig]);

  return null;
}
