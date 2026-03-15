import React, { useState } from 'react';
import { Input } from '../../../components/ui/Input';
import styles from './PasswordField.module.scss';

/**
 * Password input with show/hide toggle.
 */
export function PasswordField({ showStrength = false, ...props }) {
  const [visible, setVisible] = useState(false);
  const toggle = (
    <button
      type="button"
      className={styles.toggle}
      onClick={() => setVisible((v) => !v)}
      aria-label={visible ? 'Hide password' : 'Show password'}
      tabIndex={-1}
    >
      {visible ? 'Hide' : 'Show'}
    </button>
  );
  return (
    <Input
      type={visible ? 'text' : 'password'}
      autoComplete={props.autoComplete ?? 'current-password'}
      suffix={toggle}
      {...props}
    />
  );
}
