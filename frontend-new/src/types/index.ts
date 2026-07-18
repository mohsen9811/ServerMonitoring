export interface Server {
  id: string;
  name: string;
  host: string;
  winrm?: {
    auth?: 'local' | 'default' | 'credential';
    authType?: 'local' | 'default' | 'credential';
    computer?: string;
    computerName?: string;
    username?: string;
    password?: string;
  };
  iis?: { enabled: boolean };
  sql?: { enabled: boolean; auth?: 'windows' | 'sql'; authType?: 'windows' | 'sql'; user?: string; username?: string; password?: string; server?: string; port?: number } | null;
  credit?: { enabled: boolean };
  features?: { winrm?: boolean; sql?: boolean; iis?: boolean; credit?: boolean };
  paths?: { logs?: string[]; backups?: string[] };
  order?: number;
}

export interface ServerSummary {
  id: string;
  name: string;
  host: string;
  hasSql: boolean;
  hasIis: boolean;
  hasCredit: boolean;
  status?: 'online' | 'offline' | 'unknown';
}

export interface SystemMetrics {
  cpuPercent: number;
  ramPercent: number;
  ramUsedGB: number;
  ramTotalGB: number;
  uptimeSeconds: number;
  bootTime: string;
  logicalCores?: number;
  processorQueueLength?: number;
  diskBusyPercent?: number;
  networkRxMbps?: number;
  networkTxMbps?: number;
  processCount?: number;
  pendingReboot?: boolean;
  computerName?: string;
  osCaption?: string;
  osVersion?: string;
  updatedAt?: string;
  stale?: boolean;
  topProcesses?: ProcessMetric[];
}

export interface ProcessMetric {
  name: string;
  id: number;
  cpuSeconds: number;
  memoryMB: number;
  handles: number;
}

export interface MetricSample {
  timestamp: string;
  cpu: number;
  ram: number;
  diskBusy: number;
  networkRxMbps: number;
  networkTxMbps: number;
  processQueue: number;
}

export interface OperationalOverview {
  server: {
    id: string;
    name: string;
    host: string;
    features: { sql: boolean; iis: boolean; winrm: boolean };
  };
  health: {
    score: number;
    state: 'healthy' | 'degraded' | 'critical' | 'offline';
    failures: { section: string; code?: string; message: string }[];
  };
  system: SystemMetrics;
  disks: DiskInfo[];
  services: ServiceInfo[];
  jobs: SQLJob[];
  databases: DatabaseInfo[];
  alerts: Alert[];
  history: MetricSample[];
  updatedAt: string;
}

export interface RuntimeHealth {
  status: string;
  uptimeSeconds: number;
  memory: { rssMB: number; heapUsedMB: number; heapTotalMB: number };
  requests: { total: number; errors: number; errorRate: number; p50Ms: number; p95Ms: number; p99Ms: number };
  timestamp: string;
}

export interface DiskInfo {
  Drive: string;
  VolumeName?: string;
  FileSystem?: string;
  DriveType?: string;
  TotalGB: number;
  UsedGB: number;
  FreeGB: number;
  UsedPercent: number;
  Status: 'Healthy' | 'Warning' | 'Critical';
  ProviderName?: string;
  TotalBytes?: number;
  UsedBytes?: number;
  FreeBytes?: number;
  FreePercent?: number;
  Source?: 'CIM' | 'PSDriveFallback';
}

export interface ServiceInfo {
  Name: string;
  DisplayName: string;
  Status: 'Running' | 'Stopped' | 'Paused' | 'StartPending' | 'StopPending' | 'ContinuePending' | 'PausePending' | 'NotFound';
  StartType?: string;
  CanStop?: boolean;
  CanPauseAndContinue?: boolean;
  ServiceType?: string;
}

export interface IISWebsite {
  name: string;
  state: 'Started' | 'Stopped' | 'Unknown';
  bindings: string;
  physicalPath: string;
  applications?: string;
}

export interface IISAppPool {
  name: string;
  state: 'Started' | 'Stopped' | 'Unknown';
  managedRuntimeVersion: string;
  managedPipelineMode: string;
}

export interface SQLJob {
  name: string;
  enabled: boolean;
  category: string;
  owner_name: string;
  last_run_status: string;
  last_run_datetime: string;
  next_run_datetime: string;
  last_run_duration: string;
  is_running: boolean;
  execution_state?: 'Running' | 'Idle' | 'Disabled';
  running_since?: string;
  description?: string;
  last_message?: string;
}

export interface DatabaseInfo {
  name: string;
  status: string;
  recovery_model: string;
  size_mb: number;
  data_size_mb?: number;
  log_size_mb?: number;
  ha_type: string;
  availability_group?: string;
  local_role?: string;
  is_synchronized?: boolean;
  synchronization_state?: string;
  synchronization_health?: string;
  log_send_queue_size?: number;
  redo_queue_size?: number;
  compatibility_level?: number;
  collation_name?: string;
  user_access_desc?: string;
  page_verify_option_desc?: string;
  snapshot_isolation_state_desc?: string;
  is_read_committed_snapshot_on?: boolean;
  is_read_only?: boolean;
  is_auto_close_on?: boolean;
  is_auto_shrink_on?: boolean;
  create_date?: string;
  last_good_checkdb_time?: string;
  log_reuse_wait_desc?: string;
  replica_summary?: { replica_server_name: string; role: string; sync_state: string; health: string }[];
}

export interface LinkedServer {
  name: string;
  provider: string;
  product?: string;
  data_source?: string;
  location?: string;
  provider_string?: string;
  catalog?: string;
  connect_timeout?: number;
  query_timeout?: number;
  status?: 'connected' | 'failed' | 'warning' | 'nottested';
  last_test?: string;
  test_message?: string;
}

export interface Alert {
  id: string;
  serverId: string;
  serverName: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  targetTab: string;
  key: string;
  timestamp: string;
  acknowledged: boolean;
}

export interface CreditOperation {
  id: string;
  title: string;
  database: string;
  procedure: string;
  description?: string;
  testMode: boolean;
  params: CreditParam[];
}

export interface CreditParam {
  name: string;
  label: string;
  type: string;
  required: boolean;
  default?: string;
}

export interface CreditResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
  timestamp: string;
}

export interface CreditHistory {
  id: string;
  operationId: string;
  operationTitle: string;
  status: 'success' | 'failed';
  serverId: string;
  serverName: string;
  database: string;
  procedure: string;
  duration: number;
  timestamp: string;
  error?: string;
}

export interface FileInfo {
  name: string;
  sizeMB: number;
  lastModified: string;
  path: string;
}

export interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  hint?: string;
}
