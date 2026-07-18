import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  serversApi, systemApi, diskApi, servicesApi, iisApi, jobsApi, databasesApi,
  connectivityApi, filesApi, alertsApi, creditApi, overviewApi, runtimeApi
} from '../services/api';
import type { Server } from '../types';
import { useServerStore } from '../stores/serverStore';

export function useServers() {
  return useQuery({
    queryKey: ['servers'],
    queryFn: () => serversApi.list().then(res => res.data),
    staleTime: 30000,
  });
}

export function useServer(id: string | null) {
  return useQuery({
    queryKey: ['server', id],
    queryFn: () => serversApi.get(id!).then(res => res.data),
    enabled: !!id,
    staleTime: 60000,
  });
}

export function useSystemMetrics(serverId: string | null) {
  return useQuery({
    queryKey: ['system', serverId],
    queryFn: () => systemApi.get(serverId!).then(res => res.data),
    enabled: !!serverId,
    refetchInterval: 5000,
    staleTime: 3000,
  });
}

export function useOperationalOverview(serverId: string | null) {
  return useQuery({
    queryKey: ['overview', serverId],
    queryFn: () => overviewApi.get(serverId!).then(res => res.data),
    enabled: !!serverId,
    refetchInterval: 5000,
    staleTime: 3000,
  });
}

export function useRuntimeHealth() {
  return useQuery({
    queryKey: ['runtime-health'],
    queryFn: () => runtimeApi.health().then(res => res.data),
    refetchInterval: 15000,
    staleTime: 10000,
  });
}

export function useDiskInfo(serverId: string | null) {
  return useQuery({
    queryKey: ['disk', serverId],
    queryFn: () => diskApi.get(serverId!).then(res => res.data),
    enabled: !!serverId,
    staleTime: 10000,
    refetchInterval: 15000,
  });
}

export function useServices(serverId: string | null) {
  return useQuery({
    queryKey: ['services', serverId],
    queryFn: () => servicesApi.list(serverId!).then(res => res.data),
    enabled: !!serverId,
    staleTime: 3000,
    refetchInterval: 5000,
  });
}

export function useAllServices(serverId: string | null) {
  return useQuery({
    queryKey: ['services', 'all', serverId],
    queryFn: () => servicesApi.listAll(serverId!).then(res => res.data),
    enabled: !!serverId,
    staleTime: 60000,
  });
}

export function useIIS(serverId: string | null) {
  return useQuery({
    queryKey: ['iis', serverId],
    queryFn: () => iisApi.get(serverId!).then(res => res.data),
    enabled: !!serverId,
    staleTime: 30000,
  });
}

export function useJobs(serverId: string | null) {
  return useQuery({
    queryKey: ['jobs', serverId],
    queryFn: () => jobsApi.list(serverId!).then(res => res.data),
    enabled: !!serverId,
    staleTime: 3000,
    refetchInterval: 5000,
  });
}

export function useDatabases(serverId: string | null) {
  return useQuery({
    queryKey: ['databases', serverId],
    queryFn: () => databasesApi.list(serverId!).then(res => res.data),
    enabled: !!serverId,
    staleTime: 30000,
  });
}

export function useLinkedServers(serverId: string | null) {
  return useQuery({
    queryKey: ['connectivity', serverId],
    queryFn: () => connectivityApi.list(serverId!).then(res => res.data),
    enabled: !!serverId,
    staleTime: 30000,
  });
}

export function useFiles(serverId: string | null, path: string | null) {
  return useQuery({
    queryKey: ['files', serverId, path],
    queryFn: () => filesApi.list(serverId!, path!).then(res => res.data),
    enabled: !!serverId && !!path,
    staleTime: 30000,
  });
}

export function useAlerts(serverId?: string, allServers = false) {
  return useQuery({
    queryKey: ['alerts', serverId, allServers],
    queryFn: async () => {
      const res = await alertsApi.list(serverId, allServers);
      return res.data;
    },
    refetchInterval: 10000,
    staleTime: 5000,
    enabled: !!serverId,
  });
}

export function useCreditOperations(serverId: string | null) {
  return useQuery({
    queryKey: ['credit', serverId],
    queryFn: () => creditApi.list(serverId!).then(res => res.data),
    enabled: !!serverId,
    staleTime: 30000,
  });
}

export function useCreditHistory(serverId: string | null) {
  return useQuery({
    queryKey: ['credit', 'history', serverId],
    queryFn: () => creditApi.history(serverId!).then(res => res.data),
    enabled: !!serverId,
    staleTime: 30000,
  });
}

// Mutations
export function useCreateServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Server>) => serversApi.create(data).then(res => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['servers'] }),
  });
}

export function useUpdateServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Server> }) =>
      serversApi.update(id, data).then(res => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['servers'] }),
  });
}

export function useDeleteServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => serversApi.delete(id).then(res => res.data),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      const currentId = useServerStore.getState().currentServerId;
      if (currentId === id) useServerStore.getState().setCurrentServer(null);
    },
  });
}

export function useReorderServers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (order: string[]) => serversApi.reorder(order).then(res => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['servers'] }),
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (data: Partial<Server>) => serversApi.testConnection(data).then(res => res.data),
  });
}

export function useServiceAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, service, action, force }: { serverId: string; service: string; action: string; force?: boolean }) =>
      servicesApi.action(serverId, service, action, force).then(res => res.data),
    onSuccess: (_, { serverId }) => {
      queryClient.invalidateQueries({ queryKey: ['services', serverId] });
      queryClient.invalidateQueries({ queryKey: ['system', serverId] });
    },
  });
}

export function useAddService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, serviceName }: { serverId: string; serviceName: string }) =>
      servicesApi.add(serverId, serviceName, true).then(res => res.data),
    onSuccess: (_, { serverId }) => queryClient.invalidateQueries({ queryKey: ['services', serverId] }),
  });
}

export function useRemoveService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, serviceName }: { serverId: string; serviceName: string }) =>
      servicesApi.remove(serverId, serviceName).then(res => res.data),
    onSuccess: (_, { serverId }) => queryClient.invalidateQueries({ queryKey: ['services', serverId] }),
  });
}

export function useIISAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, type, name, action }: { serverId: string; type: 'site' | 'pool'; name: string; action: string }) =>
      iisApi.action(serverId, type, name, action).then(res => res.data),
    onSuccess: (_, { serverId }) => queryClient.invalidateQueries({ queryKey: ['iis', serverId] }),
  });
}

export function useJobAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, jobName, action }: { serverId: string; jobName: string; action: string }) =>
      jobsApi.action(serverId, jobName, action).then(res => res.data),
    onSuccess: (_, { serverId }) => queryClient.invalidateQueries({ queryKey: ['jobs', serverId] }),
  });
}

export function useTestLinkedServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, name }: { serverId: string; name: string }) =>
      connectivityApi.test(serverId, name).then(res => res.data),
    onSuccess: (_, { serverId }) => queryClient.invalidateQueries({ queryKey: ['connectivity', serverId] }),
  });
}

export function useTestAllLinkedServers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serverId: string) => connectivityApi.testAll(serverId).then(res => res.data),
    onSuccess: (_, serverId) => queryClient.invalidateQueries({ queryKey: ['connectivity', serverId] }),
  });
}

export function useRunCreditOperation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, operationId, params }: { serverId: string; operationId: string; params: Record<string, string> }) =>
      creditApi.run(serverId, operationId, params).then(res => res.data),
    onSuccess: (_, { serverId }) => queryClient.invalidateQueries({ queryKey: ['credit', 'history', serverId] }),
  });
}

export function useCreateCreditOperation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, data }: { serverId: string; data: any }) =>
      creditApi.create(serverId, data).then(res => res.data),
    onSuccess: (_, { serverId }) => queryClient.invalidateQueries({ queryKey: ['credit', serverId] }),
  });
}

export function useDeleteCreditOperation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, operationId }: { serverId: string; operationId: string }) =>
      creditApi.delete(serverId, operationId).then(res => res.data),
    onSuccess: (_, { serverId }) => queryClient.invalidateQueries({ queryKey: ['credit', serverId] }),
  });
}
