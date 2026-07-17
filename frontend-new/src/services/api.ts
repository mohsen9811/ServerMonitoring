import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { Server, SystemMetrics, DiskInfo, ServiceInfo, IISWebsite, IISAppPool, SQLJob, DatabaseInfo, LinkedServer, FileInfo, Alert, CreditOperation, CreditHistory, OperationalOverview, RuntimeHealth, MetricSample } from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => config);

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string; message?: string; hint?: string }>) => {
    const message = error.response?.data?.error || error.response?.data?.message || error.message;
    const hint = error.response?.data?.hint;
    const fullMessage = hint ? `${message}\nراهنما: ${hint}` : message;
    return Promise.reject(new Error(fullMessage));
  }
);

export const serversApi = {
  list: () => api.get<Server[]>('/servers'),
  get: (id: string) => api.get<Server>(`/servers/${id}`),
  create: (data: Partial<Server>) => api.post('/servers', data),
  update: (id: string, data: Partial<Server>) => api.put(`/servers/${id}`, data),
  delete: (id: string) => api.delete(`/servers/${id}`),
  reorder: (order: string[]) => api.post('/servers/reorder', { order }),
  testConnection: (data: Partial<Server>) => api.post('/servers/test-connection-temp', data),
  addAllowedPath: (id: string, path: string, type: 'logs' | 'backups') =>
    api.post(`/servers/${id}/allowed-paths`, { path, type }),
};

export const systemApi = {
  get: (serverId: string) => api.get<SystemMetrics>(`/system/${serverId}`),
  history: (serverId: string, minutes = 60) => api.get<{ samples: MetricSample[] }>(`/system/${serverId}/history`, { params: { minutes } }),
};

export const overviewApi = {
  get: (serverId: string, force = false) => api.get<OperationalOverview>(`/overview/${serverId}`, { params: force ? { force: 1 } : undefined }),
};

export const runtimeApi = {
  health: () => api.get<RuntimeHealth>('/health'),
};

export const diskApi = {
  get: (serverId: string) => api.get<DiskInfo[]>(`/disk/${serverId}`),
};

export const servicesApi = {
  list: (serverId: string) => api.get<ServiceInfo[]>(`/services/${serverId}`),
  listAll: (serverId: string) => api.get<ServiceInfo[]>(`/services/all/${serverId}`),
  action: (serverId: string, service: string, action: string, force = false) =>
    api.post(`/services/${serverId}/action`, { service, action, force }),
  add: (serverId: string, serviceName: string) =>
    api.post(`/services/${serverId}/monitor`, { serviceName }),
  remove: (serverId: string, serviceName: string) =>
    api.delete(`/services/${serverId}/monitor/${encodeURIComponent(serviceName)}`),
};

export const iisApi = {
  get: (serverId: string) => api.get<{ sites: IISWebsite[]; pools: IISAppPool[] }>(`/iis/${serverId}`),
  action: (serverId: string, type: 'site' | 'pool', name: string, action: string) =>
    api.post(`/iis/${serverId}/${type}/${encodeURIComponent(name)}/${action}`),
};

export const jobsApi = {
  list: (serverId: string) => api.get<SQLJob[]>(`/jobs/${serverId}`),
  action: (serverId: string, jobName: string, action: string) =>
    api.post(`/jobs/${serverId}/action`, { jobName, action }),
  details: (serverId: string, jobName: string) =>
    api.get(`/jobs/${serverId}/details/${encodeURIComponent(jobName)}`),
  history: (serverId: string, jobName: string, top = 120) =>
    api.get(`/jobs/${serverId}/history/${encodeURIComponent(jobName)}?top=${top}`),
};

export const databasesApi = {
  list: (serverId: string) => api.get<DatabaseInfo[]>(`/databases/${serverId}`),
  details: (serverId: string, dbName: string) =>
    api.get(`/databases/${serverId}/details/${encodeURIComponent(dbName)}`),
};

export const connectivityApi = {
  list: (serverId: string) => api.get<LinkedServer[]>(`/connectivity/${serverId}`),
  test: (serverId: string, name: string) =>
    api.post(`/connectivity/${serverId}/test/${encodeURIComponent(name)}`),
  testAll: (serverId: string) => api.post(`/connectivity/${serverId}/test-all`),
};

export const filesApi = {
  list: (serverId: string, path: string) =>
    api.get<FileInfo[]>(`/files/${serverId}`, { params: { path } }),
};

export const alertsApi = {
  list: (serverId?: string, allServers = false) =>
    api.get<Alert[]>(`/alerts/${serverId || 'all'}`, { params: { all: allServers } }),
};

export const creditApi = {
  list: (serverId: string) => api.get<CreditOperation[]>(`/credit/${serverId}`),
  run: (serverId: string, operationId: string, params: Record<string, string>) =>
    api.post(`/credit/${serverId}/run/${operationId}`, { params }),
  history: (serverId: string) => api.get<CreditHistory[]>(`/credit/${serverId}/history`),
  create: (serverId: string, data: Omit<CreditOperation, 'id'>) =>
    api.post(`/credit/${serverId}`, data),
  update: (serverId: string, operationId: string, data: Partial<CreditOperation>) =>
    api.put(`/credit/${serverId}/${operationId}`, data),
  delete: (serverId: string, operationId: string) =>
    api.delete(`/credit/${serverId}/${operationId}`),
};

export default api;
