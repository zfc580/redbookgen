$chromePath = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
$debugPort = 9222
$userDataDir = "$PSScriptRoot\chrome_debug_profile"

# Check if Chrome is listening on port 9222
$netstat = Get-NetTCPConnection -LocalPort $debugPort -ErrorAction SilentlyContinue

if ($null -eq $netstat) {
    Write-Host "⚠️  Chrome Debug Instance NOT found on port $debugPort." -ForegroundColor Yellow
    Write-Host "🚀 Launching Chrome in Remote Debugging Mode..." -ForegroundColor Green
    
    Start-Process -FilePath $chromePath -ArgumentList "--remote-debugging-port=$debugPort", "--user-data-dir=`"$userDataDir`""
    
    Write-Host "✅ Chrome Launched!"
    Write-Host "👉 Please Scan QR Code to Login if needed."
    Write-Host "👉 KEEP THIS CHROME WINDOW OPEN."
    
    Start-Sleep -Seconds 5
}
else {
    Write-Host "✅ Found existing Chrome Debug Instance." -ForegroundColor Green
}

Write-Host "Starting Publisher Script..." -ForegroundColor Cyan
node xiaohongshu-publisher/index.js --draft "workspace/test_task/02_draft.json" --images "workspace/test_task/images/"

Write-Host "Done. Press Enter to exit."
Read-Host
