import React from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { selectUser, selectTenant } from '../features/auth/authSelectors';
import { logout } from '../features/auth/authSlice';
import { logoutAPI } from '../features/auth/authAPI';
import { Button } from '../components/ui/Button';
import styles from './HomePage.module.scss';

export function HomePage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const tenant = useAppSelector(selectTenant);

  const handleLogout = async () => {
    const state = window.__authStore?.getState();
    const refreshToken = state?.auth?.refreshToken;
    try {
      if (refreshToken) await logoutAPI(refreshToken);
    } finally {
      dispatch(logout());
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>Welcome</h1>
        <p className={styles.text}>
          {user?.email}
          {tenant?.id != null && ` · Tenant ID: ${tenant.id}`}
        </p>
        <Button variant="secondary" onClick={handleLogout}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
