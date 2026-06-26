const express = require('express');
const router = express.Router();
const { executeOnServer } = require('../utils/executor');

router.get('/:serverId', async (req, res) => {
  const servers = require('../config/servers.json').servers;
  const server = servers.find(s => s.id === req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'path required' });

  // بررسی مسیر مجاز (از تنظیمات سرور)
  const allowedPaths = [...(server.paths?.logs || []), ...(server.paths?.backups || [])];
  if (!allowedPaths.some(allowed => path.toLowerCase().startsWith(allowed.toLowerCase()))) {
    return res.status(403).json({ error: 'Path not allowed. Allowed roots: ' + allowedPaths.join(', ') });
  }

  try {
    // اسکریپت اصلاح شده: استفاده از متغیر برای جمع‌آوری نتایج
    const script = `
      $path = "${path}"
      $result = @()
      if (Test-Path $path) {
        $result = Get-ChildItem -Path $path -File | Sort-Object LastWriteTime -Descending | Select-Object -First 50 | ForEach-Object {
          [PSCustomObject]@{
            Name = $_.Name
            SizeMB = [math]::Round($_.Length / 1MB, 2)
            LastModified = $_.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
            Extension = $_.Extension
          }
        }
      }
      $result | ConvertTo-Json -Depth 3
    `;
    const result = await executeOnServer(server, script);
    const data = result ? JSON.parse(result) : [];
    res.json(Array.isArray(data) ? data : [data]);
  } catch (err) {
    console.error('Files error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;