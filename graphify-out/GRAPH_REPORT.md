# Graph Report - .  (2026-07-17)

## Corpus Check
- Corpus is ~43,201 words - fits in a single context window. You may not need a graph.

## Summary
- 759 nodes · 1489 edges · 44 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]

## God Nodes (most connected - your core abstractions)
1. `apiFetch()` - 20 edges
2. `getServerById()` - 18 edges
3. `compilerOptions` - 18 edges
4. `cn()` - 17 edges
5. `isSqlEnabled()` - 16 edges
6. `collectAlertsForServer()` - 15 edges
7. `withSqlPool()` - 15 edges
8. `getCachedOrFresh()` - 14 edges
9. `Button` - 14 edges
10. `loadTab()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Operations Dashboard Shell` --semantically_similar_to--> `Server Pulse Application Shell`  [INFERRED] [semantically similar]
  frontend/index.html → frontend-new/index.html
- `Database and High Availability Panel` --implements--> `SQL Server Monitoring`  [EXTRACTED]
  frontend/index.html → README.md
- `Linked Server Connectivity Panel` --implements--> `SQL Server Monitoring`  [EXTRACTED]
  frontend/index.html → README.md
- `SQL Agent Jobs Panel` --implements--> `SQL Server Monitoring`  [EXTRACTED]
  frontend/index.html → README.md
- `CPU RAM and Uptime Metrics` --conceptually_related_to--> `Server-Sent Events`  [INFERRED]
  frontend/index.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Server Capability Gating** — frontend_index_add_server_workflow, frontend_index_feature_badges, frontend_index_feature_gated_navigation, frontend_index_iis_operations, frontend_index_sql_agent_jobs, frontend_index_credit_checks_console [EXTRACTED 1.00]
- **Agentless Monitoring Stack** — readme_serverpulse_monitor, readme_winrm_remote_management, readme_express_api, readme_sql_server_monitoring, readme_live_dashboard [EXTRACTED 1.00]

## Communities (44 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (81): addAllowedPath(), allServicesList, apiFetch(), applyServerFeatureVisibility(), bindStaticUi(), buildServerPayloadFromForm(), clampPercent(), closeAddServerModal() (+73 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (43): Add Server Workflow, Alert Center, frontend/app.js, Credit Stored Procedure Console, Credit Operation Configuration, Operations Dashboard Shell, Database and High Availability Panel, Disk Monitoring Panel (+35 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (32): allowedOrigins, app, compression, cors, crypto, { executeOnServer }, express, fs (+24 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (29): executeOnServer(), asArray(), collectAlertsForServer(), createLinkedRemoteQueryWarning(), createLinkedStatus(), { executeOnServer }, getDatabases(), getDisks() (+21 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (22): useServices(), cn(), filesApi, servicesApi, FilesTabProps, ServicesTab(), ServicesTabProps, Badge() (+14 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (18): UsageAreaChart(), useOperationalOverview(), useRuntimeHealth(), formatDate(), formatNumber(), formatPercent(), formatRelativeTime(), formatUptime() (+10 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (23): { asyncRoute, normalizeError }, express, { getCachedOrFresh }, { getServerById }, {
  getSystemMetrics,
  getDisks,
  getMonitoredServices,
  getSqlJobs,
  getDatabases,
  collectAlertsForServer
}, { isSqlEnabled, isIisEnabled }, { recordMetric, getMetricHistory }, router (+15 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (27): dependencies, axios, framer-motion, lucide-react, react, react-dom, recharts, @tanstack/react-query (+19 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (21): useAlerts(), useServers(), AlertsTab, ConnectivityTab, CreditTab, DashboardLayout(), DatabasesTab, DiskTab (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (24): api, creditApi, databasesApi, diskApi, jobsApi, overviewApi, runtimeApi, ApiResponse (+16 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx, lib, module, moduleDetection (+13 more)

### Community 11 - "Community 11"
Cohesion: 0.10
Nodes (19): dependencies, compression, cors, express, express-rate-limit, helmet, mssql, description (+11 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (16): { asyncRoute, normalizeError }, { collectAlertsForServer }, enrichAlert(), express, { getCachedOrFresh }, { getServers, getServerById }, router, worker() (+8 more)

### Community 13 - "Community 13"
Cohesion: 0.12
Nodes (13): { asyncRoute }, configPath, ensureConfig(), express, fs, { getServers, getServerById }, history, { isSqlEnabled, isCreditEnabled } (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.16
Nodes (17): { asyncRoute, sendError }, express, { getCachedOrFresh, clearCache }, { getServerById }, { getSqlJobs, getSqlJobHistory, getSqlJobDetails, runSqlJobAction }, handleJobAction(), { isSqlEnabled, sqlDisabledResponse }, normalizeJobAction() (+9 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (12): { asyncRoute, sendError }, configPath, crypto, defaultStore(), ensureStore(), express, { getServerById, getServers }, { isSqlEnabled, sqlDisabledResponse } (+4 more)

### Community 16 - "Community 16"
Cohesion: 0.15
Nodes (15): { asyncRoute }, DISK_TTL_MS, express, { getCachedOrFresh }, { getDisks }, { getServerById }, { isSqlEnabled }, router (+7 more)

### Community 17 - "Community 17"
Cohesion: 0.14
Nodes (12): ChartSeries, ChartTooltipProps, DiskBarChart(), DiskBarChartProps, SimpleBarChartProps, Sparkline(), SparklineProps, StatusPieChartProps (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.20
Nodes (13): useJobAction(), useJobs(), useLinkedServers(), useTestAllLinkedServers(), useTestLinkedServer(), ConnectivityTab(), ConnectivityTabProps, JobsTab() (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.15
Nodes (13): getCreditServers(), { collectAlertsForServer }, collectAllAlerts(), express, { getCachedOrFresh }, getLiveSnapshot(), { getServers }, { normalizeError } (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.21
Nodes (13): saveStore(), ensureJsonFile(), fs, path, projectRoot(), readJsonFile(), resolveProjectPath(), writeJsonFile() (+5 more)

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (13): { asyncRoute }, { executeOnServer }, express, { getCachedOrFresh, clearCache }, { getServerById }, IIS_TTL_MS, { isIisEnabled, iisDisabledResponse }, readIis() (+5 more)

### Community 22 - "Community 22"
Cohesion: 0.18
Nodes (12): SimpleBarChart(), useIIS(), iisApi, IisTab(), IisTabProps, colors, icons, Toast (+4 more)

### Community 23 - "Community 23"
Cohesion: 0.15
Nodes (3): alertsApi, connectivityApi, serversApi

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (7): useCreateServer(), useDeleteServer(), useServer(), useTestConnection(), useUpdateServer(), SettingsTab(), SettingsTabProps

### Community 25 - "Community 25"
Cohesion: 0.17
Nodes (12): requireServer(), { asyncRoute }, express, { getCachedOrFresh }, { getDatabases, getDatabaseDetails }, { getServerById }, { isSqlEnabled, sqlDisabledResponse }, requireServer() (+4 more)

### Community 26 - "Community 26"
Cohesion: 0.28
Nodes (12): enrichAlert(), ensureAlertPreferencesFile(), filterMutedAlerts(), fs, getAlertSignature(), listMutedAlerts(), muteAlert(), path (+4 more)

### Community 27 - "Community 27"
Cohesion: 0.21
Nodes (5): useDatabases(), getStatusBadgeClass(), getStatusVariant(), DatabasesTab(), DatabasesTabProps

### Community 28 - "Community 28"
Cohesion: 0.22
Nodes (9): { asyncRoute, sendError }, { executeOnServer }, express, findServer(), { getCachedOrFresh, clearCache }, { getMonitoredServices }, { getServers, getRawServers, saveServers }, router (+1 more)

### Community 29 - "Community 29"
Cohesion: 0.22
Nodes (8): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, strict, include

### Community 30 - "Community 30"
Cohesion: 0.36
Nodes (7): useReorderServers(), Sidebar(), SidebarProps, ServerState, useServerStore, Server, ServerSummary

### Community 31 - "Community 31"
Cohesion: 0.25
Nodes (8): { asyncRoute }, express, getLinkedNameFromRequest(), { getLinkedServers, getLinkedServersWithStatus, getLinkedServerStatus }, { getServerById }, { isSqlEnabled, sqlDisabledResponse }, requireLinkedName(), router

### Community 32 - "Community 32"
Cohesion: 0.29
Nodes (4): Toast, ToastContext, ToastContextType, cn()

### Community 33 - "Community 33"
Cohesion: 0.36
Nodes (7): isSqlEnabled(), buildSqlConfig(), configKey(), getPool(), { isSqlEnabled }, poolCache, sql

### Community 34 - "Community 34"
Cohesion: 0.29
Nodes (3): ModalConfig, ModalContext, ModalContextType

### Community 35 - "Community 35"
Cohesion: 0.53
Nodes (5): useCreditHistory(), useCreditOperations(), useRunCreditOperation(), CreditTab(), CreditTabProps

### Community 36 - "Community 36"
Cohesion: 0.33
Nodes (5): ButtonProps, ButtonSize, ButtonVariant, sizes, variants

### Community 37 - "Community 37"
Cohesion: 0.40
Nodes (5): fs, loadEnvFile(), parseEnvLine(), path, resolveEnvRefs()

### Community 38 - "Community 38"
Cohesion: 0.50
Nodes (3): App(), queryClient, ToastProvider()

### Community 39 - "Community 39"
Cohesion: 0.67
Nodes (3): CreditState, useCreditStore, CreditOperation

## Knowledge Gaps
- **295 isolated node(s):** `express`, `router`, `{ asyncRoute, normalizeError }`, `{ getServers, getServerById }`, `{ collectAlertsForServer }` (+290 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getServerById()` connect `Community 25` to `Community 2`, `Community 6`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 19`, `Community 20`, `Community 21`, `Community 31`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `isSqlEnabled()` connect `Community 33` to `Community 2`, `Community 3`, `Community 6`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 21`, `Community 25`, `Community 31`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `asyncRoute()` connect `Community 12` to `Community 6`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 21`, `Community 25`, `Community 28`, `Community 31`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `express`, `router`, `{ asyncRoute, normalizeError }` to the rest of the system?**
  _296 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05542283803153368 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0664451827242525 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05641025641025641 - nodes in this community are weakly interconnected._