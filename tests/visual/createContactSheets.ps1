param(
  [string]$ScreenshotDirectory = (Join-Path $PSScriptRoot "__screenshots__"),
  [string]$OutputDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) "output\playwright")
)

Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

function New-ContactSheet {
  param(
    [string]$Name,
    [string[]]$Files,
    [int]$Columns
  )

  $cellWidth = 260
  $cellHeight = 380
  $rows = [Math]::Ceiling($Files.Count / $Columns)
  $bitmap = [System.Drawing.Bitmap]::new($cellWidth * $Columns, $cellHeight * $rows)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $font = [System.Drawing.Font]::new("Arial", 10)
  $labelBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $borderPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(80, 255, 255, 255))

  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(24, 24, 27))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    for ($index = 0; $index -lt $Files.Count; $index += 1) {
      $path = Join-Path $ScreenshotDirectory $Files[$index]
      $image = [System.Drawing.Image]::FromFile($path)
      try {
        $column = $index % $Columns
        $row = [Math]::Floor($index / $Columns)
        $scale = [Math]::Min(240 / $image.Width, 330 / $image.Height)
        $width = [Math]::Round($image.Width * $scale)
        $height = [Math]::Round($image.Height * $scale)
        $x = $column * $cellWidth + [Math]::Round(($cellWidth - $width) / 2)
        $y = $row * $cellHeight + 8

        $graphics.DrawImage($image, $x, $y, $width, $height)
        $graphics.DrawRectangle($borderPen, $x, $y, $width, $height)
        $graphics.DrawString($Files[$index], $font, $labelBrush, $column * $cellWidth + 8, $row * $cellHeight + 350)
      } finally {
        $image.Dispose()
      }
    }

    $outputPath = Join-Path $OutputDirectory $Name
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output $outputPath
  } finally {
    $borderPen.Dispose()
    $labelBrush.Dispose()
    $font.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

New-ContactSheet -Name "contact-themes.png" -Columns 5 -Files @(
  "theme-graphite-lime-360x520.png",
  "theme-citic-red-360x520.png",
  "theme-frost-blue-360x520.png",
  "theme-jade-forest-360x520.png",
  "theme-ink-gold-360x520.png"
)

New-ContactSheet -Name "contact-layout-states.png" -Columns 4 -Files @(
  "shell-300x280-normal.png",
  "shell-300x280-compact.png",
  "shell-480x720.png",
  "typography-font-12px.png",
  "typography-font-20px.png",
  "opacity-10-percent.png",
  "opacity-40-percent.png",
  "opacity-90-percent.png",
  "forced-colors-standard.png",
  "state-empty.png",
  "state-stress-24-tasks.png",
  "state-completed-collapsed.png"
)

New-ContactSheet -Name "contact-overlays.png" -Columns 3 -Files @(
  "overlay-calendar.png",
  "overlay-search.png",
  "overlay-settings.png",
  "overlay-recurrence.png",
  "overlay-delete-recurring.png",
  "state-inline-subtask-entry.png"
)

New-ContactSheet -Name "contact-popup-themes.png" -Columns 5 -Files @(
  "popup-settings-graphite-lime.png",
  "popup-settings-citic-red.png",
  "popup-settings-frost-blue.png",
  "popup-settings-jade-forest.png",
  "popup-settings-ink-gold.png"
)
