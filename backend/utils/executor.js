const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function escapePowerShellDoubleQuoted(value) {
  return String(value ?? '').replace(/`/g, '``').replace(/"/g, '`"');
}

function cleanPowerShellOutput(output) {
  if (!output) return '';
  let text = String(output).trim();
  if (text.includes('<Objs') || text.includes('<S S="Error">')) {
    const errorMatches = [...text.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)].map(m => m[1]);
    if (errorMatches.length) {
      return errorMatches.join(' ')
        .replace(/_x000D__x000A_/g, ' ')
        .replace(/_x000A_/g, ' ')
        .replace(/<[^>]+>/g, '')
        .trim();
    }
  }
  return text.replace(/^#< CLIXML\s*/i, '').trim();
}

function friendlyWinRmError(message, host) {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('the command line is too long')) {
    return 'PowerShell command line is too long. executor.js جدید باید اسکریپت را از فایل موقت اجرا کند؛ مسیر پروژه/فایل جایگزین‌شده را بررسی کنید.';
  }
  if (lower.includes('trustedhosts') || lower.includes('servernottrusted')) {
    return `WinRM: Server not trusted. در PowerShell ادمین اجرا کنید: Set-Item WSMan:\\localhost\\Client\\TrustedHosts -Value "${host}" -Force`;
  }
  if (lower.includes('access is denied') || lower.includes('unauthorized') || lower.includes('access denied')) {
    return 'Access denied. نام کاربری/رمز یا Permission کافی نیست. اگر با RDP از .\\user استفاده می‌کنید، Windows Computer Name مقصد را وارد کنید یا Username را ComputerName\\user بزنید.';
  }
  if (lower.includes('winrm') || lower.includes('wsman') || lower.includes('invoke-command')) {
    return `WinRM connection failed for ${host}. سرویس WinRM، Firewall، TrustedHosts و Credential را بررسی کنید. جزئیات: ${message}`;
  }
  return message;
}

function normalizeWinRmUsername(server) {
  const username = String(server.winrm?.username || '').trim();
  const computerName = String(server.winrm?.computerName || server.winrm?.hostName || '').trim();
  if (!username) return '';
  if ((username.startsWith('.\\') || username.startsWith('./')) && computerName) {
    return `${computerName}\\${username.slice(2)}`;
  }
  return username;
}

function makeWrapperScript(server, scriptBlock) {
  const authType = server.winrm?.authType || 'local';
  const isLocal = (server.host === 'localhost' || server.host === '127.0.0.1') || authType === 'local';
  const scriptB64 = Buffer.from(String(scriptBlock || ''), 'utf16le').toString('base64');
  const host = escapePowerShellDoubleQuoted(server.host || 'localhost');
  const username = escapePowerShellDoubleQuoted(normalizeWinRmUsername(server) || '');
  const password = escapePowerShellDoubleQuoted(server.winrm?.password || '');

  if (isLocal || authType === 'local') {
    return `
$ErrorActionPreference = 'Stop'
try {
  $scriptText = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${scriptB64}'))
  $block = [ScriptBlock]::Create($scriptText)
  & $block
} catch {
  Write-Error ($_.Exception.Message)
  exit 1
}
`;
  }

  if (authType === 'default') {
    return `
$ErrorActionPreference = 'Stop'
try {
  $scriptText = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${scriptB64}'))
  $block = [ScriptBlock]::Create($scriptText)
  Invoke-Command -ComputerName "${host}" -ScriptBlock $block -ErrorAction Stop
} catch {
  Write-Error ($_.Exception.Message)
  exit 1
}
`;
  }

  if (authType === 'credential') {
    return `
$ErrorActionPreference = 'Stop'
try {
  $securePass = ConvertTo-SecureString "${password}" -AsPlainText -Force
  $cred = New-Object System.Management.Automation.PSCredential("${username}", $securePass)
  $sessionOption = New-PSSessionOption -SkipCACheck -SkipCNCheck -SkipRevocationCheck
  $scriptText = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${scriptB64}'))
  $block = [ScriptBlock]::Create($scriptText)
  Invoke-Command -ComputerName "${host}" -Credential $cred -Authentication Negotiate -SessionOption $sessionOption -ScriptBlock $block -ErrorAction Stop
} catch {
  Write-Error ($_.Exception.Message)
  exit 1
}
`;
  }

  throw new Error(`Unknown authType: ${authType}`);
}

async function executeOnServer(server, scriptBlock) {
  const wrapperScript = makeWrapperScript(server, scriptBlock);
  const tempDir = path.join(os.tmpdir(), 'server-monitoring-ps');
  fs.mkdirSync(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, `monitor-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.ps1`);
  fs.writeFileSync(tempFile, wrapperScript, 'utf8');

  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-NonInteractive', '-NoProfile', '-File', tempFile], {
      maxBuffer: 30 * 1024 * 1024,
      timeout: 45000,
      windowsHide: true
    }, (err, stdout, stderr) => {
      try { fs.unlinkSync(tempFile); } catch {}
      const cleanedStdout = cleanPowerShellOutput(stdout);
      const cleanedStderr = cleanPowerShellOutput(stderr);
      if (err) {
        let errorMsg = cleanedStderr || cleanedStdout || err.message;
        if (err.killed && err.signal === 'SIGTERM') {
          errorMsg = `PowerShell command timeout after 45 seconds. ${errorMsg || ''}`.trim();
        }
        reject(new Error(friendlyWinRmError(errorMsg, server.host)));
      } else {
        resolve(cleanedStdout);
      }
    });
  });
}

module.exports = { executeOnServer, normalizeWinRmUsername };
