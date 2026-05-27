$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-LauncherIcon([int]$size, [string]$outPath) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = 'AntiAlias'
    $g.PixelOffsetMode   = 'HighQuality'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.Clear([System.Drawing.Color]::Black)

    # Scale factor relative to the 40x40 reference design.
    $s = $size / 40.0

    # Green donut ring near the outer edge (pen 6 at size 40).
    $ringPen = New-Object System.Drawing.Pen(
        [System.Drawing.Color]::FromArgb(255, 0, 200, 0), [single](6 * $s))
    $ringPen.StartCap = 'Round'
    $ringPen.EndCap   = 'Round'
    $g.DrawEllipse($ringPen,
        [single](4 * $s), [single](4 * $s),
        [single](($size - 1) - 8 * $s), [single](($size - 1) - 8 * $s))

    $brushY = New-Object System.Drawing.SolidBrush(
        [System.Drawing.Color]::FromArgb(255, 255, 210, 0))
    $brushW = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $brushK = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)

    $cx = ($size - 1) / 2.0
    $cy = ($size - 1) / 2.0
    $bandR = (($size - 1) - 8 * $s) / 2.0 + 2 * $s
    $pi = [Math]::PI

    $dotR = 3 * $s
    # Dot positions are given in clock-face degrees: 0 = top, increasing
    # clockwise (90 = 3 o'clock, 180 = 6 o'clock, 270 = 9 o'clock).
    # White runner dot at 90 deg (3 o'clock), yellow pacer dot at 70 deg
    # (just before the white dot, i.e. behind on the donut path).
    $whiteDeg  = 90.0
    $yellowDeg = 70.0
    $thetaW = ($pi / 2) - ($whiteDeg  * $pi / 180.0)
    $thetaY = ($pi / 2) - ($yellowDeg * $pi / 180.0)

    # Yellow pacer dot.
    $yx = $cx + $bandR * [Math]::Cos($thetaY)
    $yy = $cy - $bandR * [Math]::Sin($thetaY)
    $g.FillEllipse($brushK,
        [single]($yx - $dotR - 1), [single]($yy - $dotR - 1),
        [single](($dotR + 1) * 2), [single](($dotR + 1) * 2))
    $g.FillEllipse($brushY,
        [single]($yx - $dotR), [single]($yy - $dotR),
        [single]($dotR * 2),   [single]($dotR * 2))

    # White runner dot.
    $wx = $cx + $bandR * [Math]::Cos($thetaW)
    $wy = $cy - $bandR * [Math]::Sin($thetaW)
    $g.FillEllipse($brushK,
        [single]($wx - $dotR - 1), [single]($wy - $dotR - 1),
        [single](($dotR + 1) * 2), [single](($dotR + 1) * 2))
    $g.FillEllipse($brushW,
        [single]($wx - $dotR), [single]($wy - $dotR),
        [single]($dotR * 2),   [single]($dotR * 2))

    # "TYT" text in the center, white, bold.
    $font = New-Object System.Drawing.Font('Arial', [single](11 * $s),
        [System.Drawing.FontStyle]::Bold,
        [System.Drawing.GraphicsUnit]::Pixel)
    $label = 'TYT'
    $textSize = $g.MeasureString($label, $font)
    $tx = $cx - $textSize.Width / 2.0
    $ty = $cy - $textSize.Height / 2.0 + 1 * $s
    $g.DrawString($label, $font, $brushW, [single]$tx, [single]$ty)
    $font.Dispose()

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Host "Wrote $outPath ($size x $size)"
}

$drawables = [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot '..\resources\drawables'))
New-LauncherIcon 40  (Join-Path $drawables 'launcher_icon.png')
New-LauncherIcon 512 (Join-Path $drawables 'launcher_icon_512.png')
