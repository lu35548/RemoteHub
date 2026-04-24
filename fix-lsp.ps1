# Claude Code LSP Fix for Windows
$cliPath = "C:\Users\emm\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\cli.js"

# Create backup
$backupPath = "$cliPath.backup-" + (Get-Date -Format "yyyyMMdd-HHmmss")
Copy-Item $cliPath $backupPath
Write-Host "Backup created: $backupPath"

# Read file
$content = Get-Content $cliPath -Raw

# Check if already patched
if ($content -match 'async function G\(\)\{let\{servers:F\}=await v52\(\)') {
    Write-Host "Already patched!"
    exit 0
}

# Check if buggy pattern exists
if ($content -notmatch 'async function G\(\)\{return\}async function Z\(\)') {
    Write-Host "Buggy pattern not found"
    exit 1
}

Write-Host "Applying fix..."

# Apply fix
$oldPattern = 'async function G\(\)\{return\}async function Z\(\)'
$newCode = 'async function G(){let{servers:F}=await v52();for(let[E,z]of Object.entries(F)){let $=T52(E,z);A.set(E,$);for(let[L,N]of Object.entries(z.extensionToLanguage)){let M=Q.get(L)||[];M.push(E);Q.set(L,M)}}}async function Z()'
$content = $content -replace $oldPattern, $newCode

# Write fixed content
Set-Content -Path $cliPath -Value $content -NoNewline

# Verify
$newContent = Get-Content $cliPath -Raw
if ($newContent -match 'async function G\(\)\{let\{servers:F\}=await v52\(\)') {
    Write-Host "Fix applied successfully!"
    Write-Host "Please restart Claude Code"
} else {
    Write-Host "Fix verification failed, restoring backup..."
    Copy-Item $backupPath $cliPath
    exit 1
}
