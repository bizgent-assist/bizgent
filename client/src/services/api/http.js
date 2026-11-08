import axios from 'axios';
import { config } from '../../config/env.js';

export const http = axios.create({
  baseURL: config.apiUrl,
  withCredentials: true,
  timeout: 45000,
  headers: { 'x-requested-with': 'bizgent' }, // CSRF guard header required by the API
});

/** Normalised error: { status, code, message, details } */
export class ApiRequestError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const listeners = new Set();
export const onSessionExpired = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

http.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err.response?.status ?? 0;
    const body = err.response?.data?.error;
    const e = new ApiRequestError({
      status,
      code: body?.code || (status === 0 ? 'NETWORK_ERROR' : 'ERROR'),
      message: body?.message || (status === 0 ? 'Cannot reach the Bizgent API. Check your connection and try again.' : 'Request failed'),
      details: body?.details,
    });
    const isMe = err.config?.url?.endsWith('/auth/me');
    if (status === 401 && !isMe) listeners.forEach((fn) => fn(e));
    return Promise.reject(e);
  },
);

export const newIdempotencyKey = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9-]/g, '');
