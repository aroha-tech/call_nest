import axios from 'axios';

const baseURL =
  (import.meta.env.VITE_API_BASE_URL ?? '') ||
  (typeof window !== 'undefined' ? window.location.origin : '');

/** No auth cookies required; same-origin in production. */
export async function fetchWorkspaceHostStatus() {
  const res = await axios.get(`${baseURL}/api/public/workspace-host-status`, {
    withCredentials: false,
  });
  return res.data;
}

export async function lookupWorkspacesByEmail(email) {
  const res = await axios.post(
    `${baseURL}/api/public/workspace-lookup`,
    { email },
    { withCredentials: false, headers: { 'Content-Type': 'application/json' } }
  );
  return res.data;
}
