import axios from "axios";

// In dev with the standalone proxy (frontend/dev-proxy.js), /api requests are
// proxied to the backend so cookies stay same-origin (avoids Firefox SameSite
// cookie blocking). We therefore use a relative baseURL by default so the
// proxy works without extra env vars. Set REACT_APP_BACKEND_URL to override
// (e.g. for pointing at a remote backend in production builds).
const API_URL = process.env.REACT_APP_BACKEND_URL || "";

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes("/auth/")) {
      originalRequest._retry = true;
      try {
        await axios.post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true });
        return api(originalRequest);
      } catch {
        window.location.href = "/login";
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export function formatApiError(detail) {
  if (detail == null) return "Algo salió mal. Intente de nuevo.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e?.msg ? e.msg : JSON.stringify(e))).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}

export default api;
