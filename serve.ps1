param(
  [int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 8130 }),
  [switch]$Lan
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8';
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.png' = 'image/png';
  '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.svg' = 'image/svg+xml';
  '.webmanifest' = 'application/manifest+json'; '.ico' = 'image/x-icon';
  '.fbx' = 'application/octet-stream'; '.glb' = 'model/gltf-binary'; '.bin' = 'application/octet-stream';
  '.mp3' = 'audio/mpeg'; '.ogg' = 'audio/ogg'
}

$listener = New-Object System.Net.HttpListener
if ($Lan) { $listener.Prefixes.Add("http://+:$Port/") } else { $listener.Prefixes.Add("http://localhost:$Port/") }

try { $listener.Start() } catch {
  Write-Host "Start failed: $($_.Exception.Message)"
  if ($Lan) {
    Write-Host "LAN mode needs Administrator PowerShell:  .\serve.ps1 -Lan"
    Write-Host "or run once: netsh http add urlacl url=http://+:$Port/ user=Everyone"
  } else {
    Write-Host "Try another port: .\serve.ps1 -Port 8200"
  }
  exit 1
}

Write-Host "root: $root   (Ctrl+C to stop)"
Write-Host "PC   : http://localhost:$Port/"
if ($Lan) {
  Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
    ForEach-Object { Write-Host "Phone: http://$($_.IPAddress):$Port/  (same WiFi)" }
} else {
  Write-Host "For phone access run as Administrator: .\serve.ps1 -Lan"
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
    $path = Join-Path $root $rel
    $ctx.Response.Headers.Add('Cache-Control', 'no-cache')
    if (Test-Path $path -PathType Leaf) {
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes = [IO.File]::ReadAllBytes($path)
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $b = [Text.Encoding]::UTF8.GetBytes('404 ' + $rel)
      $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    }
    $ctx.Response.OutputStream.Close()
  } catch { }
}
