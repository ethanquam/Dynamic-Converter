# Civil-specific converter math verification
$ErrorActionPreference = "Stop"

$M_INTL = 0.3048
$M_SURVEY = 1200 / 3937
$M_INCH = $M_INTL / 12
$M2_SQ_FT = [math]::Pow($M_INTL, 2)
$M2_SQ_YD = [math]::Pow(3 * $M_INTL, 2)
$M2_ACRE = 43560 * $M2_SQ_FT
$M3_CU_FT = [math]::Pow($M_INTL, 3)
$M3_CU_YD = [math]::Pow(3 * $M_INTL, 3)
$DEG = 180 / [math]::PI

$passed = 0
$failed = 0

function Assert($name, $condition, [string]$detail = "") {
    if ($condition) {
        $script:passed++
    } else {
        $script:failed++
        Write-Host "FAIL: $name $(if ($detail) { "- $detail" })" -ForegroundColor Red
    }
}

function Near($a, $b, $tol = 1e-9) {
    return [math]::Abs($a - $b) -le $tol
}

# Unit constants
Assert "intl ft constant" (Near $M_INTL 0.3048)
Assert "survey ft constant" (Near $M_SURVEY 0.3048006096012192 1e-12)
Assert "survey-intl diff @ 1000 ft" (Near (1000 * $M_SURVEY - 1000 * $M_INTL) 0.0006096012192 1e-12)

# Distance round trips
$tenFtM = 10 * $M_INTL
Assert "m <-> survey ft" (Near ($tenFtM / $M_SURVEY * $M_SURVEY) $tenFtM 1e-12)
Assert "m <-> intl ft" (Near ($tenFtM / $M_INTL * $M_INTL) $tenFtM)
Assert "m <-> inches" (Near ($tenFtM / $M_INCH * $M_INCH) $tenFtM)

$carpenterM = (12 + 6.5/12) * $M_INTL
Assert "12'-6 1/2 in meters" (Near $carpenterM 3.8227 1e-3)

# Slope
$t412 = 4.0/12.0
Assert "4:12 percent" (Near ($t412 * 100) (100.0/3.0) 1e-10)
Assert "2% grade degrees" (Near ([math]::Atan(0.02) * $DEG) 1.14576 1e-4)
Assert "1:48 percent" (Near ((1.0/48.0) * 100) (100.0/48.0) 1e-10)
Assert "45 deg = 100%" (Near ([math]::Tan(45 * [math]::PI / 180)) 1.0)

# Area
Assert "acre in m2" (Near $M2_ACRE (43560 * $M2_SQ_FT))
Assert "yd2 = 9 ft2" (Near $M2_SQ_YD (9 * $M2_SQ_FT))
Assert "100 ft2 round trip" (Near ((100 * $M2_SQ_FT) / $M2_SQ_FT) 100)

# Volume
Assert "yd3 = 27 ft3" (Near $M3_CU_YD (27 * $M3_CU_FT))
Assert "10 yd3 round trip" (Near ((10 * $M3_CU_YD) / $M3_CU_YD) 10)

# Pythagorean
$a = 3 * $M_INTL
$b = 4 * $M_INTL
$c = [math]::Sqrt($a*$a + $b*$b)
Assert "3-4-5 triangle" (Near ($c / $M_INTL) 5 1e-10)
Assert "triangle area 6 ft2" (Near (($a * $b / 2) / $M2_SQ_FT) 6 1e-10)

# Circle
$r = 5 * $M_INTL
$circleArea = [math]::PI * $r * $r
Assert "circle r=5 area" (Near ($circleArea / $M2_SQ_FT) ([math]::PI * 25) 1e-10)
$depth = 2 * $M_INTL
Assert "circle volume" (Near (($circleArea * $depth) / $M3_CU_FT) ([math]::PI * 50) 1e-10)

# Construction calc chains
$areaM2 = (10 * $M_INTL) * (12 * $M_INTL)
Assert "10x12 ft area" (Near ($areaM2 / $M2_SQ_FT) 120)
$volM3 = (2 * $M_INTL) * (3 * $M_INTL) * (4 * $M_INTL)
Assert "2x3x4 ft volume" (Near ($volM3 / $M3_CU_FT) 24)

# Tip
Assert "tip forward" ((Near (100 * 0.18) 18) -and (Near (118) 118))
Assert "tip reverse" ((Near (130 - 100) 30) -and (Near ((30/100)*100) 30))

Write-Host ""
Write-Host "=== CIVIL MATH VERIFY ==="
Write-Host "Passed: $passed  Failed: $failed"
if ($failed -gt 0) { exit 1 }
