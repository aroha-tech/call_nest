import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
  },
});

// Expose store for axios interceptor (token refresh / logout)
if (typeof window !== 'undefined') {
  window.__authStore = store;
}
