const net = require('net');
const { executeOnServer } = require('./executor');
const { withSqlPool, sql } = require('./sqlClient');
const { normalizeError } = require('./errors');
const { isSqlEnabled, isIisEnabled } = require('./features');

function psString(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function safeJsonParse(text, fallback = []) {
  if (!text || !String(text).trim()) return fallback;
  const cleaned = String(text).trim();
  return JSON.parse(cleaned);
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function formatJobDuration(raw) {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const hours = Math.floor(n / 10000);
  const minutes = Math.floor((n % 10000) / 100);
  const seconds = n % 100;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function mapJobStatus(status) {
  const map = { 0: 'Failed', 1: 'Succeeded', 2: 'Retry', 3: 'Cancelled', 4: 'Running' };
  return map[Number(status)] || 'Unknown';
}

async function getMonitoredServices(server) {
  const monitored = server.monitoredServices || [];
  if (!monitored.length) return [];
  const namesPart = monitored.map(psString).join(',');
  const script = `
    $names = @(${namesPart})
    $out = @()
    foreach ($n in $names) {
      $svc = Get-Service -Name $n -ErrorAction SilentlyContinue
      if ($svc) {
        $out += [PSCustomObject]@{
          Name = $svc.Name
          DisplayName = $svc.DisplayName
          Status = $svc.Status.ToString()
        }
      } else {
        $out += [PSCustomObject]@{
          Name = $n
          DisplayName = 'Service not found'
          Status = 'NotFound'
        }
      }
    }
    $out | ConvertTo-Json -Depth 4
  `;
  const result = await executeOnServer(server, script);
  return asArray(safeJsonParse(result, []));
}

async function getDisks(server) {
  const script = `
    $ErrorActionPreference = 'Stop'
    $items = @()
    try {
      $driveTypeMap = @{ 2='Removable'; 3='Local Disk'; 4='Network'; 5='CD-ROM'; 6='RAM Disk' }
      $items = @(Get-CimInstance Win32_LogicalDisk -ErrorAction Stop | Where-Object { $_.Size -gt 0 } | Sort-Object DeviceID | ForEach-Object {
        $used = $_.Size - $_.FreeSpace
        $usedPercent = if ($_.Size -gt 0) { [math]::Round(($used / $_.Size) * 100, 1) } else { 0 }
        [PSCustomObject]@{
          Drive = $_.DeviceID
          VolumeName = if ($_.VolumeName) { $_.VolumeName } else { '-' }
          FileSystem = if ($_.FileSystem) { $_.FileSystem } else { '-' }
          DriveType = if ($driveTypeMap.ContainsKey([int]$_.DriveType)) { $driveTypeMap[[int]$_.DriveType] } else { [string]$_.DriveType }
          TotalGB = [math]::Round($_.Size / 1GB, 2)
          UsedGB = [math]::Round($used / 1GB, 2)
          FreeGB = [math]::Round($_.FreeSpace / 1GB, 2)
          UsedPercent = $usedPercent
          FreePercent = [math]::Round(100 - $usedPercent, 1)
          ProviderName = if ($_.ProviderName) { $_.ProviderName } else { '' }
          Status = if ($usedPercent -ge 95) { 'Critical' } elseif ($usedPercent -ge 85) { 'Warning' } else { 'Healthy' }
          Source = 'CIM'
        }
      })
    } catch {
      # Fallback for servers with broken WMI/CIM namespace. This is read-only and safe.
      $items = @(Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null -and $_.Free -ne $null } | Sort-Object Name | ForEach-Object {
        $total = [double]($_.Used + $_.Free)
        $usedPercent = if ($total -gt 0) { [math]::Round(($_.Used / $total) * 100, 1) } else { 0 }
        [PSCustomObject]@{
          Drive = ($_.Name + ':')
          VolumeName = if ($_.Description) { $_.Description } else { '-' }
          FileSystem = 'FileSystem'
          DriveType = 'Local/Filesystem'
          TotalGB = [math]::Round($total / 1GB, 2)
          UsedGB = [math]::Round($_.Used / 1GB, 2)
          FreeGB = [math]::Round($_.Free / 1GB, 2)
          UsedPercent = $usedPercent
          FreePercent = [math]::Round(100 - $usedPercent, 1)
          ProviderName = ''
          Status = if ($usedPercent -ge 95) { 'Critical' } elseif ($usedPercent -ge 85) { 'Warning' } else { 'Healthy' }
          Source = 'PSDriveFallback'
        }
      })
    }
    $items | ConvertTo-Json -Depth 5 -Compress
  `;
  const result = await executeOnServer(server, script);
  return asArray(safeJsonParse(result, []));
}

async function getSystemMetrics(server) {
  const script = `
    $ErrorActionPreference = 'Stop'
    $cpu = 0
    try {
      $cpuSample = (Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 1 -ErrorAction Stop).CounterSamples | Select-Object -First 1
      if ($cpuSample -and $null -ne $cpuSample.CookedValue) { $cpu = [math]::Round([double]$cpuSample.CookedValue, 1) }
    } catch {
      try { $cpu = [double]((Get-Counter '\\Processor Information(_Total)\\% Processor Utility' -SampleInterval 1 -MaxSamples 1 -ErrorAction Stop).CounterSamples | Select-Object -First 1).CookedValue } catch { $cpu = 0 }
    }

    $totalRAM = 0; $freeRAM = 0; $bootTime = $null; $source = 'CIM'
    try {
      $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
      $totalRAM = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
      $freeRAM = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
      $bootTime = $os.LastBootUpTime
    } catch {
      $source = 'Fallback'
      try { $freeRAM = [math]::Round(((Get-Counter '\\Memory\\Available MBytes' -ErrorAction Stop).CounterSamples | Select-Object -First 1).CookedValue / 1024, 2) } catch { $freeRAM = 0 }
      try { $totalRAM = [math]::Round([double]((Get-ItemProperty 'HKLM:\\HARDWARE\\RESOURCEMAP\\System Resources\\Physical Memory' -ErrorAction Stop).'.Translated') / 1GB, 2) } catch { $totalRAM = 0 }
      try { $bootTime = (Get-Date).AddMilliseconds(-[Environment]::TickCount64) } catch { $bootTime = (Get-Date) }
    }

    $usedRAM = [math]::Max(0, $totalRAM - $freeRAM)
    $ramPercent = if ($totalRAM -gt 0) { [math]::Round(($usedRAM / $totalRAM) * 100, 1) } else { 0 }
    if (-not $bootTime) { $bootTime = (Get-Date) }
    $uptime = (Get-Date) - $bootTime

    [PSCustomObject]@{
      cpuPercent = [math]::Round($cpu, 1)
      totalRAM_GB = $totalRAM
      usedRAM_GB = [math]::Round($usedRAM, 2)
      freeRAM_GB = [math]::Round($freeRAM, 2)
      ramPercent = $ramPercent
      uptimeDays = [int][math]::Floor($uptime.TotalDays)
      uptimeHours = [int]$uptime.Hours
      uptimeMinutes = [int]$uptime.Minutes
      uptimeSeconds = [int]$uptime.Seconds
      uptimeTotalMinutes = [int][math]::Floor($uptime.TotalMinutes)
      uptime = ('{0}d {1}h {2}m' -f [int][math]::Floor($uptime.TotalDays), [int]$uptime.Hours, [int]$uptime.Minutes)
      bootTime = $bootTime.ToString('yyyy-MM-dd HH:mm:ss')
      source = $source
    } | ConvertTo-Json -Compress
  `;
  const result = await executeOnServer(server, script);
  return safeJsonParse(result, {});
}

async function getSqlJobs(server) {
  return withSqlPool(server, 'msdb', async (pool) => {
    const result = await pool.request().query(`
      ;WITH last_history AS (
        SELECT h.*, ROW_NUMBER() OVER (PARTITION BY h.job_id ORDER BY h.instance_id DESC) AS rn
        FROM msdb.dbo.sysjobhistory h
        WHERE h.step_id = 0
      ), latest_session AS (
        SELECT MAX(session_id) AS session_id FROM msdb.dbo.syssessions
      )
      SELECT
        CONVERT(varchar(36), j.job_id) AS job_id,
        j.name,
        j.enabled,
        ISNULL(j.description, '') AS description,
        ISNULL(c.name, '-') AS category,
        SUSER_SNAME(j.owner_sid) AS owner_name,
        j.date_created,
        j.date_modified,
        CASE WHEN ja.start_execution_date IS NOT NULL AND ja.stop_execution_date IS NULL THEN 1 ELSE 0 END AS is_running,
        ja.start_execution_date AS running_since,
        ja.stop_execution_date,
        ja.last_executed_step_id,
        ja.last_executed_step_date,
        CASE lh.run_status
          WHEN 0 THEN 'Failed'
          WHEN 1 THEN 'Succeeded'
          WHEN 2 THEN 'Retry'
          WHEN 3 THEN 'Cancelled'
          WHEN 4 THEN 'Running'
          ELSE 'Never Run'
        END AS last_run_status,
        CASE WHEN lh.run_date IS NOT NULL AND lh.run_date > 0 THEN msdb.dbo.agent_datetime(lh.run_date, lh.run_time) END AS last_run_datetime,
        lh.run_duration AS last_run_duration_raw,
        lh.message AS last_message,
        CASE WHEN js.next_run_date IS NOT NULL AND js.next_run_date > 0 THEN msdb.dbo.agent_datetime(js.next_run_date, js.next_run_time) END AS next_run_datetime
      FROM msdb.dbo.sysjobs j
      LEFT JOIN msdb.dbo.syscategories c ON j.category_id = c.category_id
      LEFT JOIN latest_session ls ON 1 = 1
      LEFT JOIN msdb.dbo.sysjobactivity ja ON ja.job_id = j.job_id AND ja.session_id = ls.session_id
      LEFT JOIN last_history lh ON lh.job_id = j.job_id AND lh.rn = 1
      OUTER APPLY (
        SELECT TOP 1 s.next_run_date, s.next_run_time
        FROM msdb.dbo.sysjobschedules s
        WHERE s.job_id = j.job_id AND s.next_run_date > 0
        ORDER BY s.next_run_date, s.next_run_time
      ) js
      ORDER BY j.name;
    `);

    return result.recordset.map(row => ({
      ...row,
      enabled: Boolean(row.enabled),
      is_running: Boolean(row.is_running),
      execution_state: row.is_running ? 'Running' : (row.enabled ? 'Idle' : 'Disabled'),
      last_run_duration: formatJobDuration(row.last_run_duration_raw)
    }));
  });
}

async function getSqlJobHistory(server, jobName, top = 50) {
  return withSqlPool(server, 'msdb', async (pool) => {
    const result = await pool.request()
      .input('jobName', sql.NVarChar, jobName)
      .input('top', sql.Int, Math.max(1, Math.min(Number(top) || 50, 200)))
      .query(`
        SELECT TOP (@top)
          h.instance_id,
          h.step_id,
          h.step_name,
          h.run_status,
          CASE h.run_status
            WHEN 0 THEN 'Failed'
            WHEN 1 THEN 'Succeeded'
            WHEN 2 THEN 'Retry'
            WHEN 3 THEN 'Cancelled'
            WHEN 4 THEN 'Running'
            ELSE 'Unknown'
          END AS run_status_text,
          CASE WHEN h.run_date IS NOT NULL AND h.run_date > 0 THEN msdb.dbo.agent_datetime(h.run_date, h.run_time) END AS run_datetime,
          h.run_duration AS run_duration_raw,
          h.sql_severity,
          h.sql_message_id,
          h.retries_attempted,
          h.message
        FROM msdb.dbo.sysjobhistory h
        INNER JOIN msdb.dbo.sysjobs j ON h.job_id = j.job_id
        WHERE j.name = @jobName
        ORDER BY h.instance_id DESC;
      `);

    return result.recordset.map(row => ({
      ...row,
      run_duration: formatJobDuration(row.run_duration_raw)
    }));
  });
}

async function getSqlJobDetails(server, jobName) {
  return withSqlPool(server, 'msdb', async (pool) => {
    const meta = await pool.request()
      .input('jobName', sql.NVarChar, jobName)
      .query(`
        ;WITH last_history AS (
          SELECT h.*, ROW_NUMBER() OVER (PARTITION BY h.job_id ORDER BY h.instance_id DESC) AS rn
          FROM msdb.dbo.sysjobhistory h
          WHERE h.step_id = 0
        ), latest_session AS (
          SELECT MAX(session_id) AS session_id FROM msdb.dbo.syssessions
        )
        SELECT TOP 1
          CONVERT(varchar(36), j.job_id) AS job_id,
          j.name,
          j.enabled,
          ISNULL(j.description, '') AS description,
          ISNULL(c.name, '-') AS category,
          SUSER_SNAME(j.owner_sid) AS owner_name,
          j.date_created,
          j.date_modified,
          CASE WHEN ja.start_execution_date IS NOT NULL AND ja.stop_execution_date IS NULL THEN 1 ELSE 0 END AS is_running,
          ja.start_execution_date AS running_since,
          ja.stop_execution_date,
          ja.last_executed_step_id,
          ja.last_executed_step_date,
          CASE lh.run_status
            WHEN 0 THEN 'Failed'
            WHEN 1 THEN 'Succeeded'
            WHEN 2 THEN 'Retry'
            WHEN 3 THEN 'Cancelled'
            WHEN 4 THEN 'Running'
            ELSE 'Never Run'
          END AS last_run_status,
          CASE WHEN lh.run_date IS NOT NULL AND lh.run_date > 0 THEN msdb.dbo.agent_datetime(lh.run_date, lh.run_time) END AS last_run_datetime,
          lh.run_duration AS last_run_duration_raw,
          lh.message AS last_message
        FROM msdb.dbo.sysjobs j
        LEFT JOIN msdb.dbo.syscategories c ON j.category_id = c.category_id
        LEFT JOIN latest_session ls ON 1 = 1
        LEFT JOIN msdb.dbo.sysjobactivity ja ON ja.job_id = j.job_id AND ja.session_id = ls.session_id
        LEFT JOIN last_history lh ON lh.job_id = j.job_id AND lh.rn = 1
        WHERE j.name = @jobName;
      `);

    if (!meta.recordset.length) {
      const err = new Error(`SQL Agent Job "${jobName}" not found`);
      err.code = 'JOB_NOT_FOUND';
      throw err;
    }

    const steps = await pool.request()
      .input('jobName', sql.NVarChar, jobName)
      .query(`
        SELECT
          s.step_id,
          s.step_name,
          s.subsystem,
          s.database_name,
          s.command,
          s.on_success_action,
          s.on_fail_action,
          s.retry_attempts,
          s.retry_interval,
          s.last_run_outcome,
          CASE s.last_run_outcome
            WHEN 0 THEN 'Failed'
            WHEN 1 THEN 'Succeeded'
            WHEN 2 THEN 'Retry'
            WHEN 3 THEN 'Cancelled'
            WHEN 5 THEN 'Unknown'
            ELSE 'Never Run'
          END AS last_run_outcome_text,
          CASE WHEN s.last_run_date IS NOT NULL AND s.last_run_date > 0 THEN msdb.dbo.agent_datetime(s.last_run_date, s.last_run_time) END AS last_run_datetime,
          s.last_run_duration AS last_run_duration_raw,
          s.last_run_retries
        FROM msdb.dbo.sysjobsteps s
        INNER JOIN msdb.dbo.sysjobs j ON s.job_id = j.job_id
        WHERE j.name = @jobName
        ORDER BY s.step_id;
      `);

    const schedules = await pool.request()
      .input('jobName', sql.NVarChar, jobName)
      .query(`
        SELECT
          sch.name,
          sch.enabled,
          sch.freq_type,
          CASE sch.freq_type
            WHEN 1 THEN 'Once'
            WHEN 4 THEN 'Daily'
            WHEN 8 THEN 'Weekly'
            WHEN 16 THEN 'Monthly'
            WHEN 32 THEN 'Monthly Relative'
            WHEN 64 THEN 'SQL Agent Startup'
            WHEN 128 THEN 'Computer Idle'
            ELSE 'Other'
          END AS freq_type_text,
          sch.freq_interval,
          sch.freq_subday_type,
          sch.freq_subday_interval,
          sch.freq_relative_interval,
          sch.freq_recurrence_factor,
          sch.active_start_date,
          sch.active_end_date,
          sch.active_start_time,
          sch.active_end_time,
          CASE WHEN js.next_run_date IS NOT NULL AND js.next_run_date > 0 THEN msdb.dbo.agent_datetime(js.next_run_date, js.next_run_time) END AS next_run_datetime
        FROM msdb.dbo.sysjobs j
        INNER JOIN msdb.dbo.sysjobschedules js ON j.job_id = js.job_id
        INNER JOIN msdb.dbo.sysschedules sch ON js.schedule_id = sch.schedule_id
        WHERE j.name = @jobName
        ORDER BY sch.name;
      `);

    const history = await getSqlJobHistory(server, jobName, 120);
    const failures = history.filter(h => Number(h.run_status) === 0).slice(0, 30);
    const job = meta.recordset[0];

    return {
      job: {
        ...job,
        enabled: Boolean(job.enabled),
        is_running: Boolean(job.is_running),
        execution_state: job.is_running ? 'Running' : (job.enabled ? 'Idle' : 'Disabled'),
        last_run_duration: formatJobDuration(job.last_run_duration_raw)
      },
      steps: steps.recordset.map(row => ({
        ...row,
        last_run_duration: formatJobDuration(row.last_run_duration_raw)
      })),
      schedules: schedules.recordset.map(row => ({ ...row, enabled: Boolean(row.enabled) })),
      history,
      failures
    };
  });
}

async function getJobRuntimeState(pool, jobName) {
  const result = await pool.request()
    .input('jobName', sql.NVarChar, jobName)
    .query(`
      ;WITH latest_session AS (
        SELECT MAX(session_id) AS session_id FROM msdb.dbo.syssessions
      )
      SELECT TOP 1
        CONVERT(varchar(36), j.job_id) AS job_id,
        j.name,
        j.enabled,
        CASE WHEN ja.start_execution_date IS NOT NULL AND ja.stop_execution_date IS NULL THEN 1 ELSE 0 END AS is_running,
        ja.start_execution_date AS running_since
      FROM msdb.dbo.sysjobs j
      LEFT JOIN latest_session ls ON 1 = 1
      LEFT JOIN msdb.dbo.sysjobactivity ja ON ja.job_id = j.job_id AND ja.session_id = ls.session_id
      WHERE j.name = @jobName;
    `);

  return result.recordset[0] || null;
}

function normalizeSqlJobAction(action) {
  const raw = String(action || '').trim().toLowerCase();
  const map = {
    start: 'Start',
    run: 'Start',
    startjob: 'Start',
    runjob: 'Start',
    stop: 'Stop',
    stopjob: 'Stop',
    enable: 'Enable',
    enabled: 'Enable',
    disable: 'Disable',
    disabled: 'Disable'
  };
  return map[raw] || '';
}

async function runSqlJobAction(server, jobName, action) {
  const normalizedAction = normalizeSqlJobAction(action);
  if (!jobName || !normalizedAction) {
    const err = new Error('Invalid job or action');
    err.code = 'VALIDATION_ERROR';
    err.hint = 'jobName و action الزامی هستند. action باید Start، Stop، Enable یا Disable باشد.';
    throw err;
  }

  return withSqlPool(server, 'msdb', async (pool) => {
    const before = await getJobRuntimeState(pool, jobName);
    if (!before) {
      const err = new Error(`SQL Agent Job "${jobName}" not found`);
      err.code = 'JOB_NOT_FOUND';
      err.hint = 'نام Job با چیزی که در msdb.dbo.sysjobs ثبت شده یکی نیست.';
      throw err;
    }

    if (normalizedAction === 'Enable' || normalizedAction === 'Disable') {
      const enabled = normalizedAction === 'Enable' ? 1 : 0;
      await pool.request()
        .input('jobName', sql.NVarChar, jobName)
        .input('enabled', sql.Bit, enabled)
        .query('EXEC msdb.dbo.sp_update_job @job_name = @jobName, @enabled = @enabled;');

      const after = await getJobRuntimeState(pool, jobName);
      return {
        success: true,
        jobName,
        action: normalizedAction,
        enabled: Boolean(after?.enabled),
        is_running: Boolean(after?.is_running),
        message: normalizedAction === 'Enable' ? 'Job فعال شد.' : 'Job غیرفعال شد.'
      };
    }

    if (normalizedAction === 'Start') {
      if (!before.enabled) {
        const err = new Error('Job is disabled');
        err.code = 'JOB_DISABLED';
        err.hint = 'قبل از Run باید Job را Enable کنی.';
        throw err;
      }
      if (before.is_running) {
        return { success: true, jobName, action: normalizedAction, alreadyRunning: true, message: 'Job از قبل در حال اجراست.' };
      }

      await pool.request()
        .input('jobName', sql.NVarChar, jobName)
        .query('EXEC msdb.dbo.sp_start_job @job_name = @jobName;');
      return { success: true, jobName, action: normalizedAction, message: 'Job برای اجرا ارسال شد.' };
    }

    if (normalizedAction === 'Stop') {
      if (!before.is_running) {
        return { success: true, jobName, action: normalizedAction, alreadyStopped: true, message: 'Job در حال اجرا نبود.' };
      }

      await pool.request()
        .input('jobName', sql.NVarChar, jobName)
        .query('EXEC msdb.dbo.sp_stop_job @job_name = @jobName;');
      return { success: true, jobName, action: normalizedAction, message: 'دستور Stop برای Job ارسال شد.' };
    }

    const err = new Error('Invalid job action');
    err.code = 'VALIDATION_ERROR';
    err.hint = 'action باید Start، Stop، Enable یا Disable باشد.';
    throw err;
  });
}

async function getDatabases(server) {
  return withSqlPool(server, 'master', async (pool) => {
    const dbResult = await pool.request().query(`
      ;WITH db_size AS (
        SELECT database_id, CAST(SUM(size) * 8.0 / 1024 AS DECIMAL(18,2)) AS size_mb
        FROM sys.master_files
        GROUP BY database_id
      )
      SELECT
        d.database_id,
        d.name,
        d.state_desc AS status,
        d.user_access_desc,
        d.recovery_model_desc AS recovery_model,
        d.compatibility_level,
        d.create_date,
        ISNULL(ds.size_mb, 0) AS size_mb
      FROM sys.databases d
      LEFT JOIN db_size ds ON d.database_id = ds.database_id
      ORDER BY d.name;
    `);

    let haRows = [];
    try {
      const haResult = await pool.request().query(`
        SELECT
          DB_NAME(drs.database_id) AS database_name,
          ag.name AS availability_group,
          ar.replica_server_name,
          ars.role_desc AS replica_role,
          drs.synchronization_state_desc,
          drs.synchronization_health_desc,
          drs.database_state_desc,
          drs.is_local,
          drs.is_primary_replica,
          drs.suspend_reason_desc,
          drs.log_send_queue_size,
          drs.redo_queue_size,
          drs.last_commit_time
        FROM sys.dm_hadr_database_replica_states drs
        INNER JOIN sys.availability_replicas ar ON drs.replica_id = ar.replica_id
        INNER JOIN sys.availability_groups ag ON ar.group_id = ag.group_id
        LEFT JOIN sys.dm_hadr_availability_replica_states ars ON ar.replica_id = ars.replica_id
        WHERE DB_NAME(drs.database_id) IS NOT NULL;
      `);
      haRows = haResult.recordset;
    } catch {
      haRows = [];
    }

    const haByDb = new Map();
    for (const row of haRows) {
      const key = row.database_name;
      if (!haByDb.has(key)) haByDb.set(key, []);
      haByDb.get(key).push(row);
    }

    return dbResult.recordset.map(db => {
      const replicas = haByDb.get(db.name) || [];
      const localReplica = replicas.find(r => r.is_local) || replicas[0] || null;
      const unhealthy = replicas.some(r =>
        r.synchronization_health_desc && r.synchronization_health_desc !== 'HEALTHY'
      );
      const notSynced = replicas.some(r =>
        r.synchronization_state_desc && !['SYNCHRONIZED', 'SYNCHRONIZING'].includes(r.synchronization_state_desc)
      );
      const logQueue = replicas.reduce((sum, r) => sum + Number(r.log_send_queue_size || 0), 0);
      const redoQueue = replicas.reduce((sum, r) => sum + Number(r.redo_queue_size || 0), 0);

      return {
        ...db,
        ha_type: replicas.length ? 'Availability Group' : 'Standalone',
        availability_group: localReplica?.availability_group || null,
        local_role: localReplica?.replica_role || null,
        synchronization_state: localReplica?.synchronization_state_desc || null,
        synchronization_health: localReplica?.synchronization_health_desc || null,
        is_synchronized: replicas.length ? (!unhealthy && !notSynced) : null,
        log_send_queue_size: replicas.length ? logQueue : null,
        redo_queue_size: replicas.length ? redoQueue : null,
        suspend_reason: localReplica?.suspend_reason_desc || null,
        replica_summary: replicas.map(r => ({
          replica_server_name: r.replica_server_name,
          role: r.replica_role,
          sync_state: r.synchronization_state_desc,
          health: r.synchronization_health_desc,
          is_local: Boolean(r.is_local),
          is_primary: Boolean(r.is_primary_replica),
          log_send_queue_size: r.log_send_queue_size,
          redo_queue_size: r.redo_queue_size
        }))
      };
    });
  });
}

async function getDatabaseDetails(server, databaseName) {
  return withSqlPool(server, 'master', async (pool) => {
    const dbInfo = await pool.request()
      .input('databaseName', sql.NVarChar, databaseName)
      .query(`
        SELECT TOP 1
          d.database_id,
          d.name,
          d.state_desc AS status,
          d.user_access_desc,
          d.recovery_model_desc AS recovery_model,
          d.compatibility_level,
          d.collation_name,
          d.create_date,
          d.is_read_only,
          d.is_auto_close_on,
          d.is_auto_shrink_on,
          d.snapshot_isolation_state_desc,
          d.is_read_committed_snapshot_on,
          d.page_verify_option_desc,
          d.log_reuse_wait_desc,
          d.target_recovery_time_in_seconds,
          CONVERT(datetime, DATABASEPROPERTYEX(d.name, 'LastGoodCheckDbTime')) AS last_good_checkdb_time
        FROM sys.databases d
        WHERE d.name = @databaseName;
      `);

    if (!dbInfo.recordset.length) {
      const err = new Error(`Database "${databaseName}" not found`);
      err.code = 'DATABASE_NOT_FOUND';
      throw err;
    }

    const files = await pool.request()
      .input('databaseName', sql.NVarChar, databaseName)
      .query(`
        SELECT
          mf.name,
          mf.type_desc,
          mf.physical_name,
          mf.state_desc,
          CAST(mf.size * 8.0 / 1024 AS DECIMAL(18,2)) AS size_mb,
          CASE WHEN mf.max_size = -1 THEN -1 ELSE CAST(mf.max_size * 8.0 / 1024 AS DECIMAL(18,2)) END AS max_size_mb,
          mf.growth,
          mf.is_percent_growth
        FROM sys.master_files mf
        INNER JOIN sys.databases d ON mf.database_id = d.database_id
        WHERE d.name = @databaseName
        ORDER BY mf.type_desc, mf.name;
      `);

    const backups = await pool.request()
      .input('databaseName', sql.NVarChar, databaseName)
      .query(`
        SELECT TOP 20
          bs.backup_start_date,
          bs.backup_finish_date,
          CASE bs.type
            WHEN 'D' THEN 'Full'
            WHEN 'I' THEN 'Differential'
            WHEN 'L' THEN 'Log'
            ELSE bs.type
          END AS backup_type,
          CAST(bs.backup_size / 1024.0 / 1024 AS DECIMAL(18,2)) AS backup_size_mb,
          CAST(ISNULL(bs.compressed_backup_size, bs.backup_size) / 1024.0 / 1024 AS DECIMAL(18,2)) AS compressed_size_mb,
          bs.server_name,
          bs.user_name,
          bmf.physical_device_name
        FROM msdb.dbo.backupset bs
        LEFT JOIN msdb.dbo.backupmediafamily bmf ON bs.media_set_id = bmf.media_set_id
        WHERE bs.database_name = @databaseName
        ORDER BY bs.backup_finish_date DESC;
      `);

    let ha = [];
    try {
      const haResult = await pool.request()
        .input('databaseName', sql.NVarChar, databaseName)
        .query(`
          SELECT
            DB_NAME(drs.database_id) AS database_name,
            ag.name AS availability_group,
            ar.replica_server_name,
            ars.role_desc AS replica_role,
            drs.synchronization_state_desc,
            drs.synchronization_health_desc,
            drs.database_state_desc,
            drs.is_local,
            drs.is_primary_replica,
            drs.suspend_reason_desc,
            drs.log_send_queue_size,
            drs.redo_queue_size,
            drs.last_commit_time,
            drs.last_sent_time,
            drs.last_received_time,
            drs.last_hardened_time,
            drs.last_redone_time
          FROM sys.dm_hadr_database_replica_states drs
          INNER JOIN sys.availability_replicas ar ON drs.replica_id = ar.replica_id
          INNER JOIN sys.availability_groups ag ON ar.group_id = ag.group_id
          LEFT JOIN sys.dm_hadr_availability_replica_states ars ON ar.replica_id = ars.replica_id
          WHERE DB_NAME(drs.database_id) = @databaseName
          ORDER BY drs.is_local DESC, ar.replica_server_name;
        `);
      ha = haResult.recordset;
    } catch {
      ha = [];
    }

    const db = dbInfo.recordset[0];
    const totalSizeMb = files.recordset.reduce((sum, f) => sum + Number(f.size_mb || 0), 0);
    const dataSizeMb = files.recordset.filter(f => f.type_desc === 'ROWS').reduce((sum, f) => sum + Number(f.size_mb || 0), 0);
    const logSizeMb = files.recordset.filter(f => f.type_desc === 'LOG').reduce((sum, f) => sum + Number(f.size_mb || 0), 0);
    const unhealthy = ha.some(r => r.synchronization_health_desc && r.synchronization_health_desc !== 'HEALTHY');
    const notSynced = ha.some(r => r.synchronization_state_desc && !['SYNCHRONIZED', 'SYNCHRONIZING'].includes(r.synchronization_state_desc));

    return {
      database: {
        ...db,
        total_size_mb: Number(totalSizeMb.toFixed(2)),
        data_size_mb: Number(dataSizeMb.toFixed(2)),
        log_size_mb: Number(logSizeMb.toFixed(2)),
        ha_type: ha.length ? 'Availability Group' : 'Standalone',
        is_synchronized: ha.length ? (!unhealthy && !notSynced) : null
      },
      files: files.recordset,
      backups: backups.recordset,
      ha_replicas: ha
    };
  });
}

async function getLinkedServers(server) {
  return withSqlPool(server, 'master', async (pool) => {
    const result = await pool.request().query(`
      SELECT
        name,
        product,
        provider,
        data_source,
        catalog,
        provider_string,
        is_data_access_enabled,
        is_rpc_out_enabled,
        is_remote_login_enabled,
        modify_date
      FROM sys.servers
      WHERE is_linked = 1
      ORDER BY name;
    `);

    return result.recordset.map(row => ({
      ...row,
      server: row.name,
      linkedName: row.name,
      status: 'NotTested',
      connectionStatus: 'NotTested',
      finalVerdict: 'NotTested',
      message: 'هنوز تست معتبر انجام نشده است.',
      spTestStatus: 'NotTested',
      remoteQueryStatus: 'NotTested',
      tcpStatus: 'Skipped',
      tcpMessage: 'TCP معیار اتصال Linked Server نیست.',
      testedAt: null
    }));
  });
}

function quoteSqlNString(value) {
  return `N'${String(value ?? '').replace(/'/g, "''")}'`;
}

function quoteLinkedServerName(name) {
  return `[${String(name).replace(/]/g, ']]')}]`;
}


function linkedProviderKind(linked = {}) {
  const text = `${linked.provider || ''} ${linked.product || ''} ${linked.data_source || ''}`.toLowerCase();
  if (text.includes('oracle') || text.includes('oraoledb')) return 'oracle';
  if (text.includes('sqlncli') || text.includes('msoledbsql') || text.includes('sql server') || text.includes('sqloledb')) return 'sqlserver';
  return 'unknown';
}

function linkedRemoteProbeSql(linked = {}, cleanName) {
  const quoted = quoteLinkedServerName(cleanName);
  const kind = linkedProviderKind(linked);

  if (kind === 'oracle') {
    return {
      kind,
      sql: `
        SELECT TOP 1
          CONVERT(nvarchar(256), remote_value) AS remote_server_name,
          CONVERT(nvarchar(256), 'Oracle') AS remote_database_name,
          CONVERT(nvarchar(40), SYSDATETIMEOFFSET(), 126) AS remote_time
        FROM OPENQUERY(${quoted}, 'SELECT ''Oracle Linked Server OK'' AS remote_value FROM DUAL');
      `
    };
  }

  if (kind === 'sqlserver') {
    return {
      kind,
      sql: `
        SELECT TOP 1
          remote_server_name,
          remote_database_name,
          remote_time
        FROM OPENQUERY(${quoted},
          'SELECT
             CONVERT(nvarchar(256), @@SERVERNAME) AS remote_server_name,
             CONVERT(nvarchar(256), DB_NAME()) AS remote_database_name,
             CONVERT(nvarchar(40), SYSDATETIMEOFFSET(), 126) AS remote_time'
        );
      `
    };
  }

  return { kind, sql: '' };
}

function createLinkedRemoteQueryWarning(cleanName, linked, err) {
  const raw = rawSqlErrorText(err);
  const normalized = normalizeError(err, `linked server ${cleanName} remote query`);
  return createLinkedStatus(linked, {
    name: cleanName,
    linkedName: cleanName,
    server: cleanName,
    status: 'Connected',
    connectionStatus: 'Connected',
    finalVerdict: 'ConnectedRemoteQueryFailed',
    message: 'Linked Server وصل است؛ فقط تست Query تکمیلی ناموفق بود.',
    hint: 'معیار اتصال اصلی sp_testlinkedserver است و پاس شده. برای Oracle یا Providerهای غیر SQL Server ممکن است Query عمومی برنامه جواب ندهد؛ Query مناسب همان مقصد را جدا بررسی کن.',
    code: normalized.code || 'LINKED_REMOTE_QUERY_FAILED',
    details: normalized.details || raw,
    failedStage: 'remote_query',
    spTestStatus: 'Passed',
    spTestMessage: 'sp_testlinkedserver پاس شد؛ یعنی Test Connection در SSMS موفق است.',
    remoteQueryStatus: 'Failed',
    remoteQueryMessage: raw || normalized.error
  });
}

function linkedDisplayName(base = {}, patch = {}) {
  return String(
    patch.linkedName || patch.name || patch.server ||
    base.linkedName || base.server || base.name ||
    ''
  ).trim();
}

function createLinkedStatus(base, patch = {}) {
  const name = linkedDisplayName(base, patch);
  return {
    ...(base || {}),
    ...(patch.keepPatchFields ? patch : {}),
    name,
    server: name,
    linkedName: name,
    status: patch.status || 'NotTested',
    connectionStatus: patch.connectionStatus || patch.status || 'NotTested',
    finalVerdict: patch.finalVerdict || patch.status || 'NotTested',
    message: patch.message || '',
    error: patch.error || '',
    hint: patch.hint || '',
    code: patch.code || '',
    details: patch.details || '',
    failedStage: patch.failedStage || '',
    spTestStatus: patch.spTestStatus || 'NotTested',
    spTestMessage: patch.spTestMessage || '',
    remoteQueryStatus: patch.remoteQueryStatus || 'NotTested',
    remoteQueryMessage: patch.remoteQueryMessage || '',
    tcpStatus: 'Skipped',
    tcpMessage: 'TCP عمداً از نتیجه نهایی حذف شده است؛ معیار تست SQL است.',
    remoteServerName: patch.remoteServerName || null,
    remoteDatabaseName: patch.remoteDatabaseName || null,
    remoteTime: patch.remoteTime || null,
    testedAt: patch.testedAt || new Date().toISOString()
  };
}

function rawSqlErrorText(err) {
  if (!err) return 'Unknown linked server error';
  const messages = [];
  if (err.message) messages.push(err.message);
  if (err.originalError?.message) messages.push(err.originalError.message);
  if (Array.isArray(err.precedingErrors)) {
    for (const e of err.precedingErrors) if (e?.message) messages.push(e.message);
  }
  return [...new Set(messages)].join('\n') || String(err);
}

function normalizeLinkedFailure(linkedName, err, stage = 'sp_testlinkedserver', base = {}) {
  const normalized = normalizeError(err, `linked server ${linkedName} ${stage}`);
  const raw = rawSqlErrorText(err);

  let message = normalized.error;
  let hint = normalized.hint;

  if (/7303|Cannot initialize the data source object|Unable to complete login process|login process due to delay|OLE DB provider|MSOLEDBSQL|SQLNCLI/i.test(raw)) {
    message = 'تست اتصال Linked Server ناموفق است.';
    hint = 'این نتیجه معادل Fail شدن Test Connection در SSMS است. Provider، Data Source، Login Mapping، دسترسی شبکه و روشن بودن SQL مقصد را بررسی کن.';
  }

  if (/not found/i.test(raw) || stage === 'metadata') {
    message = 'Linked Server با این نام پیدا نشد.';
    hint = 'نامی که از UI ارسال می‌شود باید دقیقاً با sys.servers.name یکی باشد.';
  }

  return createLinkedStatus(base, {
    name: linkedName,
    linkedName,
    server: linkedName,
    status: 'Failed',
    connectionStatus: 'Failed',
    finalVerdict: 'Failed',
    message,
    error: message,
    hint,
    code: normalized.code || 'LINKED_SERVER_TEST_FAILED',
    details: normalized.details || raw,
    failedStage: stage,
    spTestStatus: stage === 'remote_query' ? 'Passed' : 'Failed',
    spTestMessage: stage === 'remote_query' ? 'sp_testlinkedserver پاس شد.' : raw,
    remoteQueryStatus: stage === 'remote_query' ? 'Failed' : 'NotTested',
    remoteQueryMessage: stage === 'remote_query' ? raw : ''
  });
}

async function readLinkedServerMeta(pool, linkedName) {
  const meta = await pool.request()
    .input('name', sql.NVarChar, linkedName)
    .query(`
      SELECT TOP 1
        name,
        product,
        provider,
        data_source,
        catalog,
        provider_string,
        is_data_access_enabled,
        is_rpc_out_enabled,
        is_remote_login_enabled,
        modify_date
      FROM sys.servers
      WHERE is_linked = 1 AND name = @name;
    `);

  return meta.recordset[0] || null;
}

async function testLinkedServer(server, linkedName) {
  const cleanName = String(linkedName || '').trim();
  if (!cleanName) {
    const err = new Error('Linked server name is required');
    err.linkedStage = 'metadata';
    throw err;
  }

  return withSqlPool(server, 'master', async (pool) => {
    const linked = await readLinkedServerMeta(pool, cleanName);
    if (!linked) {
      const err = new Error(`Linked Server "${cleanName}" not found`);
      err.linkedStage = 'metadata';
      throw err;
    }

    try {
      await pool.request().batch(`EXEC master.dbo.sp_testlinkedserver @servername = ${quoteSqlNString(cleanName)};`);
    } catch (err) {
      err.linkedStage = 'sp_testlinkedserver';
      throw err;
    }

    let remoteQueryStatus = 'Skipped';
    let remoteQueryMessage = 'Data Access غیرفعال است؛ sp_testlinkedserver پاس شد ولی Query گرفتن از مقصد تست نشد.';
    let remoteRow = null;

    if (linked.is_data_access_enabled) {
      const probe = linkedRemoteProbeSql(linked, cleanName);

      if (!probe.sql) {
        remoteQueryStatus = 'Skipped';
        remoteQueryMessage = 'Provider ناشناس است؛ sp_testlinkedserver پاس شد و Remote Query عمومی اجرا نشد.';
      } else {
        try {
          const remote = await pool.request().batch(probe.sql);
          remoteRow = remote.recordset && remote.recordset[0] ? remote.recordset[0] : null;
          if (!remoteRow || !remoteRow.remote_server_name) {
            const err = new Error('OPENQUERY did not return a valid remote identity row');
            err.linkedStage = 'remote_query';
            throw err;
          }
          remoteQueryStatus = 'Passed';
          remoteQueryMessage = probe.kind === 'oracle'
            ? 'Oracle Remote Query پاس شد؛ SELECT FROM DUAL جواب داد.'
            : 'Remote Query پاس شد و Identity مقصد خوانده شد.';
        } catch (err) {
          err.linkedStage = 'remote_query';
          return createLinkedRemoteQueryWarning(cleanName, linked, err);
        }
      }
    }

    const fullyUsable = remoteQueryStatus === 'Passed';
    const onlySsmsPassed = remoteQueryStatus === 'Skipped';

    return createLinkedStatus(linked, {
      name: cleanName,
      linkedName: cleanName,
      server: cleanName,
      status: 'Connected',
      connectionStatus: 'Connected',
      finalVerdict: fullyUsable ? 'Connected' : 'ConnectedRemoteQuerySkipped',
      message: fullyUsable
        ? 'Linked Server وصل است؛ sp_testlinkedserver و Remote Query هر دو پاس شدند.'
        : 'Linked Server وصل است؛ sp_testlinkedserver پاس شد و Remote Query تکمیلی اجرا نشد.',
      hint: onlySsmsPassed ? 'اگر Query واقعی از مقصد لازم داری، Data Access/Provider را جدا بررسی کن؛ ولی اتصال اصلی پاس شده است.' : '',
      failedStage: onlySsmsPassed ? 'remote_query_skipped' : '',
      spTestStatus: 'Passed',
      spTestMessage: 'sp_testlinkedserver پاس شد؛ این همان Test Connection در SSMS است.',
      remoteQueryStatus,
      remoteQueryMessage,
      remoteServerName: remoteRow?.remote_server_name || null,
      remoteDatabaseName: remoteRow?.remote_database_name || null,
      remoteTime: remoteRow?.remote_time || null
    });
  });
}

async function getLinkedServerStatus(server, linkedName) {
  const cleanName = String(linkedName || '').trim();
  try {
    return await testLinkedServer(server, cleanName);
  } catch (err) {
    let base = { name: cleanName, linkedName: cleanName, server: cleanName };
    try {
      await withSqlPool(server, 'master', async (pool) => {
        const meta = cleanName ? await readLinkedServerMeta(pool, cleanName) : null;
        if (meta) base = meta;
      });
    } catch {
      // خطای metadata نباید خطای اصلی تست را مخفی کند.
    }
    return normalizeLinkedFailure(cleanName, err, err.linkedStage || 'sp_testlinkedserver', base);
  }
}

async function getLinkedServersWithStatus(server) {
  const linked = await getLinkedServers(server);
  const out = [];

  for (const item of linked) {
    const name = item.name || item.linkedName || item.server;
    const live = await getLinkedServerStatus(server, name);
    out.push({
      ...item,
      ...live,
      name,
      server: name,
      linkedName: name,
      product: item.product,
      provider: item.provider,
      data_source: item.data_source,
      catalog: item.catalog,
      provider_string: item.provider_string,
      is_data_access_enabled: item.is_data_access_enabled,
      is_rpc_out_enabled: item.is_rpc_out_enabled,
      is_remote_login_enabled: item.is_remote_login_enabled,
      modify_date: item.modify_date
    });
  }

  return out;
}

async function collectAlertsForServer(server) {
  const alerts = [];
  const now = new Date().toISOString();
  const push = (alert) => alerts.push({
    id: `${server.id}-${alert.category}-${alert.key || alerts.length}-${Date.now()}`,
    serverId: server.id,
    serverName: server.name,
    timestamp: now,
    ...alert
  });

  try {
    const services = await getMonitoredServices(server);
    const serviceHealthy = new Set(['running', 'started', 'ok', 'healthy']);
    for (const svc of services) {
      const statusValue = String(svc.Status || '').trim().toLowerCase();
      if (!serviceHealthy.has(statusValue)) {
        push({
          category: 'services',
          severity: ['notfound', 'failed', 'stopped'].includes(statusValue) ? 'critical' : 'warning',
          title: `سرویس ${svc.Name} در وضعیت ${svc.Status} است`,
          message: svc.DisplayName || 'سرویس تحت نظارت متوقف یا در وضعیت غیرعادی است.',
          targetTab: 'services',
          actionLabel: 'رفتن به سرویس‌ها',
          key: svc.Name,
          raw: svc
        });
      }
    }
  } catch (err) {
    const e = normalizeError(err, 'services alert collector');
    push({ category: 'services', severity: 'critical', title: 'خطا در بررسی سرویس‌ها', message: `${e.error} - ${e.hint}`, targetTab: 'services', actionLabel: 'بررسی سرویس‌ها', key: 'services-error', raw: e });
  }

  try {
    const disks = await getDisks(server);
    for (const disk of disks) {
      if (Number(disk.UsedPercent) >= 85) {
        push({
          category: 'disk',
          severity: Number(disk.UsedPercent) >= 95 ? 'critical' : 'warning',
          title: `فضای درایو ${disk.Drive} رو به اتمام است`,
          message: `${disk.UsedPercent}% استفاده شده؛ ${disk.FreeGB}GB آزاد از ${disk.TotalGB}GB`,
          targetTab: 'disk',
          actionLabel: 'رفتن به دیسک',
          key: disk.Drive,
          raw: disk
        });
      }
    }
  } catch (err) {
    const e = normalizeError(err, 'disk alert collector');
    push({ category: 'disk', severity: 'critical', title: 'خطا در بررسی دیسک', message: `${e.error} - ${e.hint}`, targetTab: 'disk', actionLabel: 'بررسی دیسک', key: 'disk-error', raw: e });
  }

  if (isIisEnabled(server)) {
    try {
      const iisScript = `
        $result = @()
        try {
          Import-Module WebAdministration -ErrorAction Stop
          $result += @(Get-Website | Where-Object { @('Started','Running') -notcontains $_.State.ToString() } | ForEach-Object {
            [PSCustomObject]@{ Type='Site'; Name=$_.Name; State=$_.State.ToString() }
          })
          $result += @(Get-ChildItem IIS:\AppPools | Where-Object { @('Started','Running') -notcontains $_.State.ToString() } | ForEach-Object {
            [PSCustomObject]@{ Type='AppPool'; Name=$_.Name; State=$_.State.ToString() }
          })
        } catch { }
        $result | ConvertTo-Json -Depth 4 -Compress
      `;
      const iisRaw = await executeOnServer(server, iisScript);
      const iisItems = asArray(safeJsonParse(iisRaw, []));
      for (const item of iisItems) {
        if (item && item.Name) {
          push({
            category: 'iis',
            severity: 'critical',
            title: `${item.Type === 'AppPool' ? 'Application Pool' : 'Website'} ${item.Name} در وضعیت ${item.State} است`,
            message: 'IIS item Running/Started نیست و نیاز به بررسی دارد.',
            targetTab: 'iis',
            actionLabel: 'رفتن به IIS',
            key: `${item.Type}:${item.Name}`,
            raw: item
          });
        }
      }
    } catch (err) {
      const e = normalizeError(err, 'iis alert collector');
      push({ category: 'iis', severity: 'warning', title: 'خطا در بررسی IIS', message: `${e.error} - ${e.hint}`, targetTab: 'iis', actionLabel: 'بررسی IIS', key: 'iis-error', raw: e });
    }
  }

  if (isSqlEnabled(server)) {
    try {
      const jobs = await getSqlJobs(server);
      for (const job of jobs) {
        if (job.last_run_status === 'Failed') {
          push({
            category: 'jobs',
            severity: 'critical',
            title: `Job ${job.name} آخرین بار Failed شده`,
            message: job.last_message || 'برای دیدن History روی Job دابل‌کلیک کنید.',
            targetTab: 'jobs',
            actionLabel: 'رفتن به Jobs',
            key: job.name,
            raw: job
          });
        }
      }
    } catch (err) {
      const e = normalizeError(err, 'jobs alert collector');
      push({ category: 'jobs', severity: 'critical', title: 'خطا در بررسی Jobs', message: `${e.error} - ${e.hint}`, targetTab: 'jobs', actionLabel: 'بررسی Jobs', key: 'jobs-error', raw: e });
    }
  }

  if (isSqlEnabled(server)) {
    try {
      const dbs = await getDatabases(server);
      for (const db of dbs) {
        if (db.ha_type !== 'Standalone' && db.is_synchronized === false) {
          push({
            category: 'databases',
            severity: 'critical',
            title: `HA دیتابیس ${db.name} Sync نیست`,
            message: `AG: ${db.availability_group || '-'} | Role: ${db.local_role || '-'} | Health: ${db.synchronization_health || '-'} | State: ${db.synchronization_state || '-'}`,
            targetTab: 'databases',
            actionLabel: 'رفتن به دیتابیس',
            key: db.name,
            raw: db
          });
        }
      }
    } catch (err) {
      const e = normalizeError(err, 'database alert collector');
      push({ category: 'databases', severity: 'critical', title: 'خطا در بررسی دیتابیس‌ها', message: `${e.error} - ${e.hint}`, targetTab: 'databases', actionLabel: 'بررسی دیتابیس', key: 'db-error', raw: e });
    }
  }

  if (isSqlEnabled(server)) {
    try {
      const linked = await getLinkedServersWithStatus(server);
      for (const item of linked) {
        if (item.spTestStatus === 'Failed' || item.status === 'Failed') {
          push({
            category: 'connectivity',
            severity: 'critical',
            title: `Linked Server ${item.name} وصل نیست`,
            message: `${item.message || item.error || 'تست واقعی Linked Server ناموفق بود.'}${item.hint ? ' - ' + item.hint : ''}`,
            targetTab: 'connectivity',
            actionLabel: 'رفتن به Linked',
            key: item.name,
            raw: { linked: item }
          });
        }
      }
    } catch (err) {
      const e = normalizeError(err, 'linked server collector');
      push({ category: 'connectivity', severity: 'warning', title: 'خطا در بررسی Linked Serverها', message: `${e.error} - ${e.hint}`, targetTab: 'connectivity', actionLabel: 'بررسی Linked', key: 'linked-error', raw: e });
    }
  }

  return alerts;
}

module.exports = {
  psString,
  safeJsonParse,
  asArray,
  getMonitoredServices,
  getDisks,
  getSystemMetrics,
  getSqlJobs,
  getSqlJobHistory,
  getSqlJobDetails,
  runSqlJobAction,
  getDatabases,
  getDatabaseDetails,
  getLinkedServers,
  getLinkedServersWithStatus,
  getLinkedServerStatus,
  testLinkedServer,
  collectAlertsForServer,
  formatJobDuration,
  mapJobStatus
};
