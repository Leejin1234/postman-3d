# 体检线上资源：传输编码、实际下载体积、耗时
$base = 'https://leejin1234.github.io/postman-3d/'
$files = @('assets/city-lowpoly.fbx', 'assets/the-boy.fbx', 'assets/the-boy_basecolor.jpg', 'vendor/three.module.js', 'game.js')
foreach ($f in $files) {
  $u = $base + $f
  try {
    $req = [System.Net.HttpWebRequest]::Create($u)
    $req.Method = 'GET'
    $req.Headers.Add('Accept-Encoding', 'gzip, deflate, br')
    $req.Timeout = 120000
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $res = $req.GetResponse()
    $enc = $res.Headers['Content-Encoding']
    if (-not $enc) { $enc = 'none' }
    $len = $res.Headers['Content-Length']
    $stream = $res.GetResponseStream()
    $buf = New-Object byte[] 65536
    $total = 0
    while (($n = $stream.Read($buf, 0, $buf.Length)) -gt 0) { $total += $n }
    $sw.Stop()
    $res.Close()
    Write-Output ("{0,-30} 编码={1,-5} 线路传输={2,7:N0}KB 解压后={3,7:N0}KB {4,6:N1}s" -f `
      $f, $enc, ([int]$len / 1KB), ($total / 1KB), $sw.Elapsed.TotalSeconds)
  } catch {
    Write-Output ("{0,-30} ERR {1}" -f $f, $_.Exception.Message)
  }
}
