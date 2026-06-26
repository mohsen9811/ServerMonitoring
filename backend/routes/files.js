const express = require('express');
const router = express.Router();
const { asyncRoute } = require('../utils/errors');
const { getServerById } = require('../utils/servers');
const { executeOnServer } = require('../utils/executor');

router.get('/:serverId', asyncRoute(async (req, res) => {
  const server = getServerById(req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const path = req.query.path;
  if (!path) return res.status(400).json({ error: 'path required' });

  const allowedPaths = [...(server.paths?.logs || []), ...(server.paths?.backups || [])];
  if (!allowedPaths.length) {
    return res.status(403).json({ error: 'No allowed paths configured. Add paths in server settings.' });
  }
  if (!allowedPaths.some(allowed => path.toLowerCase().startsWith(allowed.toLowerCase()))) {
    return res.status(403).json({ error: 'Path not allowed. Allowed roots: ' + allowedPaths.join(', ') });
  }

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
}, 'list files'));

module.exports = router;
