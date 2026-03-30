import React from 'react';
import { useAppSelector } from '../app/hooks';
import { selectUser, selectTenant } from '../features/auth/authSelectors';
import { useLogout } from '../hooks/useLogout';
import { Button } from '../components/ui/Button';
import styles from './HomePage.module.scss';

export function HomePage() {
  const user = useAppSelector(selectUser);
  const tenant = useAppSelector(selectTenant);
  const handleLogout = useLogout();

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
