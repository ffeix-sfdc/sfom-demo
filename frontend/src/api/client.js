import axios from "axios";
import { addLog } from "../log/store";

// Dev: Vite runs on :5173 → proxy to :8000. Prod: same origin as FastAPI on :8000.
const baseURL = window.location.port === "5173" ? "http://localhost:8000" : "";

const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

// Skip logging for catalog/use-case lookup noise (optional: remove to log everything)
const SILENT = ["/catalogs", "/use-cases"];
const isSilent = (url) => SILENT.some((p) => url?.includes(p));

function pickHeaders(headers) {
  if (!headers) return undefined;
  const keys = ["x-org-alias", "x-salesforce-request-id", "x-sfdc-request-id", "content-type", "x-request-id"];
  const picked = {};
  for (const k of keys) {
    const v = headers[k] ?? headers[k.toLowerCase()];
    if (v) picked[k] = v;
  }
  return Object.keys(picked).length ? picked : undefined;
}

api.interceptors.request.use((config) => {
  if (!isSilent(config.url)) {
    config._reqTs = Date.now();
    const body = config.data
      ? (typeof config.data === "string" ? JSON.parse(config.data) : config.data)
      : undefined;
    addLog({
      type: "request",
      method: config.method?.toUpperCase(),
      url: config.url,
      params: config.params && Object.keys(config.params).length ? config.params : undefined,
      headers: pickHeaders(config.headers),
      body,
    });
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (!isSilent(response.config.url)) {
      addLog({
        type: "response",
        method: response.config.method?.toUpperCase(),
        url: response.config.url,
        status: response.status,
        duration: response.config._reqTs ? Date.now() - response.config._reqTs : undefined,
        headers: pickHeaders(response.headers),
        body: response.data,
      });
    }
    return response;
  },
  (error) => {
    if (!isSilent(error.config?.url)) {
      addLog({
        type: "error",
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
        status: error.response?.status,
        duration: error.config?._reqTs ? Date.now() - error.config._reqTs : undefined,
        headers: pickHeaders(error.response?.headers),
        body: error.response?.data ?? { message: error.message },
      });
    }
    return Promise.reject(error);
  }
);

export default api;
