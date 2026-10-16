Add-Type -AssemblyName System.Drawing

$srcPath = "D:\app\brawlIA\frontend\src\assets\app-icon.jpg"
$srcImg = [System.Drawing.Image]::FromFile($srcPath)

function Save-ResizedImage([System.Drawing.Image]$img, [int]$width, [int]$height, [string]$outPath) {
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $width, $height)
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

$sizes = @(
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\mipmap-mdpi\ic_launcher.png"; Size = 48 },
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\mipmap-mdpi\ic_launcher_round.png"; Size = 48 },
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\mipmap-mdpi\ic_launcher_foreground.png"; Size = 48 },
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\mipmap-hdpi\ic_launcher.png"; Size = 72 },
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\mipmap-hdpi\ic_launcher_round.png"; Size = 72 },
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\mipmap-hdpi\ic_launcher_foreground.png"; Size = 72 },
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\mipmap-xhdpi\ic_launcher.png"; Size = 96 },
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\mipmap-xhdpi\ic_launcher_round.png"; Size = 96 },
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\mipmap-xhdpi\ic_launcher_foreground.png"; Size = 96 },
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\mipmap-xxhdpi\ic_launcher.png"; Size = 144 },
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\mipmap-xxhdpi\ic_launcher_round.png"; Size = 144 },
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\mipmap-xxhdpi\ic_launcher_foreground.png"; Size = 144 },
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\mipmap-xxxhdpi\ic_launcher.png"; Size = 192 },
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\mipmap-xxxhdpi\ic_launcher_round.png"; Size = 192 },
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\mipmap-xxxhdpi\ic_launcher_foreground.png"; Size = 192 },
    @{ Path = "D:\app\brawlIA\frontend\android\app\src\main\res\drawable\splash.png"; Size = 512 },
    @{ Path = "D:\app\brawlIA\frontend\public\app-icon.png"; Size = 512 }
)

foreach ($item in $sizes) {
    Save-ResizedImage $srcImg $item.Size $item.Size $item.Path
}

$srcImg.Dispose()
Write-Host "All Android icons generated successfully!"
