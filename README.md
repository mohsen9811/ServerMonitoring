# ServerPulse Monitor

A comprehensive **Windows Server & SQL Server monitoring dashboard** built with Node.js, WinRM, and SQL Server. Provides real-time insights into server health, services, databases, disk usage, IIS, SQL Agent jobs, and custom alerts.

## ✨ Features

### 🖥️ Server Monitoring
- **Multi-server support** - Monitor multiple Windows servers from a single dashboard
- **WinRM integration** - Remote command execution and data collection
- **Real-time metrics** - CPU, RAM, disk usage, and uptime tracking

### 🗄️ SQL Server Monitoring
- **Database health** - Status, size, recovery model, compatibility level
- **SQL Agent jobs** - Live job execution status, history, schedules
- **High Availability** - Always On AGs, replication, mirroring status
- **Linked servers** - Connection tests and latency monitoring
- **Custom stored procedures** - Credit checks, business logic validation

### 🌐 IIS Monitoring
- **Application pools** - Status, CPU/memory limits, recycling
- **Sites & applications** - Binding info, physical paths, status
- **Worker processes** - Request counts, memory usage

### ⚙️ Windows Services
- **Service monitoring** - Start/stop/restart, startup type, status
- **Custom service lists** - Per-server monitored services configuration

### 💾 Disk & File Monitoring
- **Disk space** - Free/used space, thresholds, alerts
- **Log & backup folders** - Configurable path monitoring
- **File age/size checks** - Automated cleanup validation

### 🔔 Alerting System
- **Backup alerts** - Full/log backup age thresholds
- **Service down alerts** - Critical service monitoring
- **Disk space warnings** - Configurable percentage thresholds
- **Job failure notifications** - SQL Agent job failure detection
- **Preference persistence** - Per-user alert settings

### 📊 Dashboard & UI
- **Live auto-refresh** - Configurable intervals (5s - 5min)
- **Responsive design** - Works on desktop and mobile
- **Dark/Light theme** - User preference saved
- **Persian (RTL) support** - Full RTL layout and translations

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js, Express.js |
| **Database** | Microsoft SQL Server (mssql driver) |
| **Remote Mgmt** | WinRM (Windows Remote Management) |
| **Frontend** | Vanilla JavaScript (ES6+), CSS3, HTML5 |
| **Real-time** | Server-Sent Events (SSE) |
| **Dev Tools** | Nodemon, ESLint |

## 📋 Prerequisites

- **Node.js** 18+
- **Windows Server** with WinRM enabled (target servers)
- **SQL Server** 2016+ (target instances)
- **Network access** - WinRM (5985/5986), SQL (1433) ports open

### Target Server Setup (WinRM)

```powershell
# Enable WinRM and configure trusted hosts
Enable-PSRemoting -Force
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force
Restart-Service WinRM

# For domain environments
Set-Item WSMan:\localhost\Service\Auth\Basic -Value $true
```

### SQL Server Permissions

Create a monitoring login with minimal permissions:
```sql
CREATE LOGIN [monitor_user] WITH PASSWORD = 'StrongPassword!';
GRANT VIEW SERVER STATE TO [monitor_user];
GRANT VIEW ANY DEFINITION TO [monitor_user];
-- For job monitoring:
USE msdb; CREATE USER [monitor_user] FOR LOGIN [monitor_user];
EXEC sp_addrolemember 'SQLAgentReaderRole', 'monitor_user';
```

## 🚀 Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/serverpulse-monitor.git
cd serverpulse-monitor

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure your servers (see Configuration below)
# Edit backend/config/servers.json

# Start development server
npm run dev

# Or production
npm start
```

Server runs at: **http://localhost:3000**

## ⚙️ Configuration

### Environment Variables (`.env`)

```env
PORT=3000
NODE_ENV=development
```

### Server Configuration (`backend/config/servers.json`)

Copy `servers.example.json` to `servers.json` and customize:

```json
{
  "servers": [
    {
      "id": "unique-server-id",
      "name": "Display Name",
      "host": "192.168.1.100",
      "features": {
        "winrm": true,
        "sql": true,
        "iis": true,
        "credit": false
      },
      "winrm": {
        "authType": "credential",
        "computerName": "SERVERNAME",
        "username": "domain\\user",
        "password": "your-password"
      },
      "sql": {
        "enabled": true,
        "authType": "sql",
        "server": "192.168.1.100",
        "port": 1433,
        "username": "monitor_user",
        "password": "sql-password"
      },
      "iis": { "enabled": true },
      "paths": {
        "logs": ["C:\\Logs", "D:\\AppLogs"],
        "backups": ["E:\\Backups"]
      },
      "monitoredServices": ["MSSQLSERVER", "W3SVC", "CustomService"],
      "alertRules": {
        "backup": { "fullHours": 26, "logHours": 12, "includeSystem": true }
      }
    }
  ]
}
```

#### Configuration Options

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique identifier (alphanumeric, hyphen, underscore) |
| `name` | ✅ | Display name in dashboard |
| `host` | ✅ | IP or hostname for connections |
| `features.winrm` | | Enable WinRM monitoring |
| `features.sql` | | Enable SQL Server monitoring |
| `features.iis` | | Enable IIS monitoring |
| `features.credit` | | Enable custom credit SP tests |
| `winrm.authType` | | `local` or `credential` |
| `winrm.computerName` | | Target computer name (for credential auth) |
| `sql.authType` | | `sql` (SQL auth) or `windows` (integrated) |
| `paths.logs` | | Array of log folder paths to monitor |
| `paths.backups` | | Array of backup folder paths |
| `monitoredServices` | | Windows service names to track |
| `alertRules.backup` | | Backup age thresholds in hours |

## 📡 API Endpoints

### Servers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers` | List all servers (public summary) |
| GET | `/api/servers/:id` | Get server details |
| POST | `/api/servers` | Add new server |
| PUT | `/api/servers/:id` | Update server |
| DELETE | `/api/servers/:id` | Delete server |
| POST | `/api/servers/reorder` | Reorder server list |
| POST | `/api/servers/test-connection-temp` | Test connection without saving |

### Monitoring
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/services/:serverId` | Windows services |
| GET | `/api/jobs/:serverId` | SQL Agent jobs |
| GET | `/api/databases/:serverId` | SQL databases |
| GET | `/api/disk/:serverId` | Disk space info |
| GET | `/api/files/:serverId` | Log/backup file status |
| GET | `/api/connectivity/:serverId` | Connection tests |
| GET | `/api/system/:serverId` | System info (CPU, RAM, OS) |
| GET | `/api/iis/:serverId` | IIS app pools & sites |
| GET | `/api/live/:serverId` | SSE live metrics stream |
| GET | `/api/alerts/:serverId` | Alert evaluation |
| GET | `/api/credit/:serverId` | Custom credit SP tests |

## 📁 Project Structure

```
serverpulse-monitor/
├── backend/
│   ├── config/
│   │   ├── servers.json          # Server definitions (gitignored)
│   │   ├── servers.example.json  # Template configuration
│   │   ├── creditChecks.json     # Credit SP definitions
│   │   └── creditProcedures.json # SP metadata
│   ├── routes/                   # API route handlers
│   │   ├── alerts.js
│   │   ├── connectivity.js
│   │   ├── credit.js
│   │   ├── databases.js
│   │   ├── disk.js
│   │   ├── files.js
│   │   ├── iis.js
│   │   ├── jobs.js
│   │   ├── live.js
│   │   ├── services.js
│   │   └── system.js
│   ├── utils/                    # Shared utilities
│   │   ├── alertPreferences.js
│   │   ├── configStore.js
│   │   ├── env.js
│   │   ├── errors.js
│   │   ├── executor.js
│   │   ├── features.js
│   │   ├── monitorCache.js
│   │   ├── servers.js
│   │   └── sqlClient.js
│   └── server.js                 # Express app entry point
├── frontend/
│   ├── index.html                # Main dashboard
│   ├── app.js                    # Frontend application logic
│   └── style.css                 # Styling (RTL, dark/light themes)
├── .env.example                  # Environment template
├── .gitignore
├── package.json
└── README.md
```

## 🔒 Security Considerations

- **Never commit** `servers.json`, `.env`, or any file with real credentials
- **Use `.gitignore`** - Already configured for sensitive files
- **Rotate passwords** regularly for monitoring accounts
- **Limit permissions** - Use least-privilege SQL/Windows accounts
- **Network segmentation** - Restrict WinRM/SQL access to monitoring host only
- **HTTPS in production** - Use reverse proxy (nginx/IIS) with TLS

### Files Excluded from Git
```
node_modules/
.env
.env.*
backend/config/servers.json
backend/config/*.local.json
logs/
*.log
.vs/
```

## 📝 Development

```bash
# Run with auto-reload
npm run dev

# The frontend is served statically from /frontend
# API available under /api/*
```

### Adding New Monitoring Features

1. Create route in `backend/routes/`
2. Register in `backend/server.js`
3. Add frontend handlers in `frontend/app.js`
4. Update `servers.example.json` with new config options

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built for Windows Server & SQL Server environments
- Inspired by the need for lightweight, agentless monitoring
- Persian localization for Iranian enterprise environments

---

**⚠️ Disclaimer**: This tool is for authorized monitoring only. Ensure you have permission to monitor target servers. The authors are not responsible for misuse.#   S e r v e r M o n i t o r i n g  
 