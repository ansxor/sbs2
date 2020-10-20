$currdir = $pwd
if ($Args[0]) {
	if (-not (Test-Path $Args[0])) {
		$dest = New-Item $Args[0] -ItemType "directory" -Force
	}
	$dest = [System.IO.FileInfo]::new((Resolve-Path $Args[0]))
	Write-Host "Will output files to: $dest"
	Read-Host -Prompt "(Press Enter)"
}

Set-Location (Split-Path $PSCommandPath)
Write-Host "Building markup system"
./sbs2-markup/build.ps1

Set-Location (Split-Path $PSCommandPath)

Write-Host "creating _build.css"
Get-Content "resource/fonts.css","style.css","markup.css","code.css" | Set-Content resource/_build.css


Write-Host "creating _build.js"
Get-Content "fill.js","entity.js","request.js","sbs2-markup/_build.js","draw.js","view.js","scroller.js","sidebar.js","chat.js","settings.js","Views/settings.js","Views/page.js","Views/image.js","Views/editpage.js","Views/category.js","Views/user.js","Views/home.js","navigate.js","main.js"` | sc resource/_build.js

function unixtime($t) {
	return [int64](Get-Date $t -UFormat "%s")
}
function nocache($name) {
	return "$name`?$(unixtime (Get-Item $name).LastWriteTime)"
}

Write-Host "creating _build.html"
$f = (Get-Content ./index.html -Raw)
$start = $f.IndexOf("<!--START-->")
$end = $f.IndexOf("<!--END-->") + "<!--END-->".Length
$f.Remove($start,$end-$start).Insert($start,"<link rel=`"stylesheet`" href=`"$(nocache 'resource/_build.css')`"><script src=`"$(nocache 'resource/_build.js')`">") | sc _build.html

function isnewer([System.IO.FileInfo] $file) {
	$destfile = [System.IO.FileInfo]::new((Join-Path $dest $file.Name))
	if ($destfile.Exists) {
		return ((Compare-Object $file $destfile -IncludeEqual -Property LastWriteTime)[0].SideIndicator -eq "<=")
	}
	return $true
}

if ($Args[0]) {
	Write-Host "Copying files"
	ls resource | ?{isnewer($_)} | Copy-Item -Destination (Join-Path $dest $_.Name) -Force
	ls _build.html | ?{isnewer($_)} | Copy-Item -Destination (Join-Path $dest $_.Name) -Force
}

Set-Location $currdir