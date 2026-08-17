# Construction Calculator stress test — mirrors js/construction-calculator.js logic
$ErrorActionPreference = "Stop"

$METERS_PER_INTL_FOOT = 0.3048
$METERS_PER_INCH = $METERS_PER_INTL_FOOT / 12
$M2_PER_SQ_FT = [math]::Pow($METERS_PER_INTL_FOOT, 2)
$M3_PER_CU_FT = [math]::Pow($METERS_PER_INTL_FOOT, 3)
$PRECISION = 16

function Test-Finite($value) {
    return ($null -ne $value) -and -not [double]::IsNaN($value) -and -not [double]::IsInfinity($value)
}

function Parse-Fraction($token) {
    $parts = $token -split "/"
    if ($parts.Count -ne 2) { return $null }
    $num = [double]$parts[0]
    $den = [double]$parts[1]
    if ($den -eq 0) { return $null }
    return $num / $den
}

function Parse-InchesWithAmpersand($working) {
    if ($working -notmatch "^(-?\d+(?:\.\d+)?)?&(.+)$") {
        return @{ error = "Invalid feet-inch value." }
    }
    $inches = 0.0
    if ($Matches[1]) { $inches = [double]$Matches[1] }
    $fracPart = $Matches[2].Trim()

    if ($fracPart -match "^(\d+/\d+)$") {
        $frac = Parse-Fraction $Matches[1]
        if ($null -eq $frac) { return @{ error = "Invalid fraction." } }
        return @{ inches = ($inches + $frac) }
    }
    if ($fracPart -match "^(\d+)\s+(\d+/\d+)$") {
        $frac = Parse-Fraction $Matches[2]
        if ($null -eq $frac) { return @{ error = "Invalid fraction." } }
        return @{ inches = ($inches + [double]$Matches[1] + $frac) }
    }
    if ($fracPart -match "^-?\d+(?:\.\d+)?$") {
        return @{ inches = ($inches + [double]$fracPart) }
    }
    return @{ error = "Invalid fraction after &." }
}

function Parse-FeetInchesFraction($text) {
    $trimmed = $text.Trim()
    if (-not $trimmed) { return @{ empty = $true } }

    $working = $trimmed -replace '["""]', '"' -replace "[''′]", "'" -replace "\s+", " "
    $working = $working.Trim()

    if ($working -match "^-?\d+(\.\d+)?$") {
        return @{ meters = ([double]$working * $METERS_PER_INTL_FOOT) }
    }

    $feet = 0.0
    $inches = 0.0
    $inchesOnly = $false

    if ($working -match "^(-?\d+)\s*-\s*(.+)$" -and $working -notmatch "'" -and $working -notmatch "\bft\b") {
        $feet = [double]$Matches[1]
        $working = $Matches[2]
    }

    if ($working -match "^(-?\d+(?:\.\d+)?)\s*'") {
        $feet = [double]$Matches[1]
        $working = $working.Substring($Matches[0].Length).Trim()
    }
    elseif ($working -match "^(-?\d+(?:\.\d+)?)\s*ft\b") {
        $feet = [double]$Matches[1]
        $working = $working.Substring($Matches[0].Length).Trim()
    }

    if ($working -match "^(-?\d|.*`")" -and $feet -eq 0 -and $working -notmatch "'") {
        $inchesOnly = ($working -match "^\d") -and ($working -match '"' -or $working -match "\bin\b" -or $working -match "&")
    }

    $working = $working -replace "\s*in(?:ches)?\.?\s*$", "" -replace '"\s*$', ""
    $working = $working.Trim()

    if (-not $working -and $feet -ne 0) {
        return @{ meters = ($feet * $METERS_PER_INTL_FOOT) }
    }

    if ($working -and $working -match "&") {
        $parsed = Parse-InchesWithAmpersand $working
        if ($parsed.error) { return $parsed }
        $inches = $parsed.inches
    }
    elseif ($working) {
        if ($working -match "^(-?\d+(?:\.\d+)?)(?:\s+(\d+/\d+))?$") {
            $inches = [double]$Matches[1]
            if ($Matches[2]) {
                $frac = Parse-Fraction $Matches[2]
                if ($null -eq $frac) { return @{ error = "Invalid fraction." } }
                $inches += $frac
            }
        }
        elseif ($working -match "^(\d+/\d+)$") {
            $frac = Parse-Fraction $Matches[1]
            if ($null -eq $frac) { return @{ error = "Invalid fraction." } }
            $inches = $frac
        }
        else {
            return @{ error = "Invalid feet-inch value." }
        }
    }

    if ($inchesOnly -and $feet -eq 0) {
        return @{ meters = ($inches * $METERS_PER_INCH) }
    }

    $totalFeet = $feet + ($inches / 12)
    return @{ meters = ($totalFeet * $METERS_PER_INTL_FOOT) }
}

function Format-FeetInchesFraction($meters, $precisionDenominator) {
    if (-not (Test-Finite $meters)) { return "0" }

    $sign = if ($meters -lt 0) { -1 } else { 1 }
    $totalInches = ([math]::Abs($meters) / $METERS_PER_INCH) * $precisionDenominator
    $totalInches = [math]::Round($totalInches)

    $feet = [math]::Floor($totalInches / (12 * $precisionDenominator))
    $inchUnits = $totalInches - ($feet * 12 * $precisionDenominator)

    if ($inchUnits -eq (12 * $precisionDenominator)) {
        $feet += 1
        $inchUnits = 0
    }

    $wholeInches = [math]::Floor($inchUnits / $precisionDenominator)
    $fracUnits = $inchUnits % $precisionDenominator

    $result = $(if ($sign -lt 0) { "-" } else { "" }) + "$feet'"

    if ($wholeInches -gt 0 -or $fracUnits -gt 0) {
        if ($fracUnits -gt 0) {
            function Gcd($a, $b) { if ($b -eq 0) { return $a }; return Gcd $b ($a % $b) }
            $g = Gcd $fracUnits $precisionDenominator
            $num = $fracUnits / $g
            $den = $precisionDenominator / $g
            if ($wholeInches -gt 0) { $result += "$wholeInches" }
            $result += "&$num/$den`""
        }
        else {
            $result += "$wholeInches`""
        }
    }

    return $result
}

function Format-Decimal($value, $maxDecimals = 8) {
    if (-not (Test-Finite $value)) { return "" }
    return ([string][double]::Parse($value.ToString("F$maxDecimals")))
}

function Parse-Buffer($buffer, $inputSystem, $mode, $operator, $shouldScalar) {
    $trimmed = $buffer.Trim()
    if (-not $trimmed) { return @{ error = "empty" } }

    if ($inputSystem -eq "standard") {
        if ($trimmed -notmatch "^-?\d+(?:\.\d+)?$") { return @{ error = "invalid" } }
        return @{ value = [double]$trimmed }
    }

    if ($shouldScalar) {
        return @{ scalar = [double]$trimmed }
    }

    if ($inputSystem -eq "metric") {
        if ($trimmed -notmatch "^-?\d+(?:\.\d+)?$") { return @{ error = "invalid" } }
        return @{ meters = [double]$trimmed }
    }

    $parsed = Parse-FeetInchesFraction $trimmed
    if ($parsed.error) { return $parsed }
    return @{ meters = $parsed.meters }
}

function Should-ParseAsScalar($buffer, $inputSystem, $mode, $operator) {
    if ($inputSystem -eq "standard") { return $false }
    return ($mode -eq "length" -and ($operator -eq "×" -or $operator -eq "÷") -and ($buffer.Trim() -match "^-?\d+(?:\.\d+)?$"))
}

function Operand-ToMeters($operand, $inputSystem) {
    if ($null -ne $operand.scalar) {
        if ($inputSystem -eq "metric") { return $operand.scalar }
        return $operand.scalar * $METERS_PER_INTL_FOOT
    }
    return $operand.meters
}

function Apply-LengthOperator($a, $operand, $opSymbol, $inputSystem) {
    if ($null -ne $operand.scalar) {
        $scalar = $operand.scalar
        switch ($opSymbol) {
            "+" { return $a + (Operand-ToMeters $operand $inputSystem) }
            "−" { return $a - (Operand-ToMeters $operand $inputSystem) }
            "×" { return $a * $scalar }
            "÷" { if ($scalar -eq 0) { return [double]::NaN }; return $a / $scalar }
        }
    }
    $b = $operand.meters
    switch ($opSymbol) {
        "+" { return $a + $b }
        "−" { return $a - $b }
        "×" { return $a * $b }
        "÷" { if ($b -eq 0) { return [double]::NaN }; return $a / $b }
    }
}

function Apply-StandardOperator($a, $b, $opSymbol) {
    switch ($opSymbol) {
        "+" { return $a + $b }
        "−" { return $a - $b }
        "×" { return $a * $b }
        "÷" { if ($b -eq 0) { return [double]::NaN }; return $a / $b }
    }
}

function Format-Result($result, $inputSystem) {
    if ($result.mode -eq "standard") {
        return (Format-Decimal $result.base)
    }
    $metric = ($inputSystem -eq "metric")
    if ($result.mode -eq "length") {
        if ($metric) { return "$(Format-Decimal $result.base 6) m" }
        return (Format-FeetInchesFraction $result.base $PRECISION)
    }
    if ($result.mode -eq "area") {
        if ($metric) { return "$(Format-Decimal $result.base) m²" }
        return "$(Format-Decimal ($result.base / $M2_PER_SQ_FT)) sq ft"
    }
    if ($metric) { return "$(Format-Decimal $result.base) m³" }
    return "$(Format-Decimal ($result.base / $M3_PER_CU_FT)) ft³"
}

function Invoke-CalcSequence($steps, $mode, $inputSystem) {
    $values = @()
    $operator = $null
    $buffer = ""
    $lastResult = $null

    foreach ($step in $steps) {
        switch ($step.type) {
            "buffer" { $buffer = $step.value }
            "op" {
                $shouldScalar = Should-ParseAsScalar $buffer $inputSystem $mode $step.value
                $parsed = Parse-Buffer $buffer $inputSystem $mode $operator $shouldScalar
                if ($parsed.error) { return @{ error = "parse: $($step.value) on '$buffer'" } }

                if ($inputSystem -eq "standard") {
                    $val = $parsed.value
                    if ($values.Count -eq 0) { $values = @($val) }
                    elseif ($operator) { $values[0] = Apply-StandardOperator $values[0] $val $operator }
                    else { $values[0] = $val }
                }
                elseif ($mode -eq "length") {
                    $m = if ($parsed.scalar -ne $null) { $parsed.scalar * $(if ($inputSystem -eq "metric") { 1 } else { $METERS_PER_INTL_FOOT }) } else { $parsed.meters }
                    if ($values.Count -eq 0) { $values = @($m) }
                    elseif ($operator) {
                        $op = @{ meters = $parsed.meters; scalar = $parsed.scalar }
                        $values[0] = Apply-LengthOperator $values[0] $op $operator $inputSystem
                    }
                    else { $values[0] = $m }
                }
                else {
                    if ($step.value -ne "×") { return @{ error = "area/volume only supports × between dims" } }
                    $values += (Operand-ToMeters $parsed $inputSystem)
                }
                $operator = $step.value
                $buffer = ""
            }
            "equals" {
                if ($inputSystem -eq "standard") {
                    $val = $null
                    if ($buffer) {
                        $parsed = Parse-Buffer $buffer $inputSystem $mode $operator $false
                        if ($parsed.error) { return @{ error = "parse equals '$buffer'" } }
                        $val = $parsed.value
                    }
                    if ($values.Count -eq 0 -and $null -eq $val) { return @{ error = "nothing to evaluate" } }
                    $result = if ($operator -and $null -ne $val) { Apply-StandardOperator $values[0] $val $operator }
                              elseif ($null -ne $val) { $val }
                              else { $values[0] }
                    if (-not (Test-Finite $result)) { return @{ error = "divide by zero" } }
                    return @{ result = @{ mode = "standard"; base = $result }; display = (Format-Result @{ mode = "standard"; base = $result } $inputSystem) }
                }

                if ($mode -eq "length") {
                    $val = $null
                    if ($buffer) {
                        $shouldScalar = Should-ParseAsScalar $buffer $inputSystem $mode $operator
                        $parsed = Parse-Buffer $buffer $inputSystem $mode $operator $shouldScalar
                        if ($parsed.error) { return @{ error = "parse equals '$buffer'" } }
                        $val = $parsed
                    }
                    if ($values.Count -eq 0 -and $null -eq $val) { return @{ error = "nothing to evaluate" } }
                    $resultMeters = if ($operator -and $null -ne $val) { Apply-LengthOperator $values[0] $val $operator $inputSystem }
                                    elseif ($null -ne $val) { if ($val.scalar -ne $null) { Operand-ToMeters $val $inputSystem } else { $val.meters } }
                                    else { $values[0] }
                    if (-not (Test-Finite $resultMeters)) { return @{ error = "divide by zero" } }
                    return @{ result = @{ mode = "length"; base = $resultMeters }; display = (Format-Result @{ mode = "length"; base = $resultMeters } $inputSystem) }
                }

                if ($buffer) {
                    $parsed = Parse-Buffer $buffer $inputSystem $mode $operator $false
                    if ($parsed.error) { return @{ error = "parse equals '$buffer'" } }
                    $values += (Operand-ToMeters $parsed $inputSystem)
                }
                $needed = if ($mode -eq "area") { 2 } else { 3 }
                if ($values.Count -lt $needed) { return @{ error = "need $needed dimensions, got $($values.Count)" } }
                $dims = $values[0..($needed - 1)]
                if ($mode -eq "area") {
                    $base = $dims[0] * $dims[1]
                    return @{ result = @{ mode = "area"; base = $base }; display = (Format-Result @{ mode = "area"; base = $base } $inputSystem) }
                }
                $base = $dims[0] * $dims[1] * $dims[2]
                return @{ result = @{ mode = "volume"; base = $base }; display = (Format-Result @{ mode = "volume"; base = $base } $inputSystem) }
            }
        }
    }
    return @{ error = "no equals step" }
}

function Test-Calc($name, $steps, $mode, $inputSystem, $expected) {
    $out = Invoke-CalcSequence $steps $mode $inputSystem
    if ($out.error) {
        return [pscustomobject]@{ Name = $name; Pass = $false; Expected = $expected; Actual = "ERROR: $($out.error)" }
    }
    $pass = ($out.display -eq $expected)
    return [pscustomobject]@{ Name = $name; Pass = $pass; Expected = $expected; Actual = $out.display }
}

$tests = @(
    # LENGTH — Imperial (10)
    @{ Name = "L1: 1 ft × 2"; Mode = "length"; Input = "imperial"; Steps = @(@{type="buffer";value="1'"}, @{type="op";value="×"}, @{type="buffer";value="2"}, @{type="equals"}); Expected = "2'" },
    @{ Name = "L2: 4 ft + 2 ft"; Mode = "length"; Input = "imperial"; Steps = @(@{type="buffer";value="4'"}, @{type="op";value="+"}, @{type="buffer";value="2'"}, @{type="equals"}); Expected = "6'" },
    @{ Name = "L3: 10 ft − 3 ft"; Mode = "length"; Input = "imperial"; Steps = @(@{type="buffer";value="10'"}, @{type="op";value="−"}, @{type="buffer";value="3'"}, @{type="equals"}); Expected = "7'" },
    @{ Name = "L4: 12 ft ÷ 4"; Mode = "length"; Input = "imperial"; Steps = @(@{type="buffer";value="12'"}, @{type="op";value="÷"}, @{type="buffer";value="4"}, @{type="equals"}); Expected = "3'" },
    @{ Name = "L5: 4'6`" + 14'3`""; Mode = "length"; Input = "imperial"; Steps = @(@{type="buffer";value="4'6`""}, @{type="op";value="+"}, @{type="buffer";value="14'3`""}, @{type="equals"}); Expected = "18'9`"" },
    @{ Name = "L6: 1'3&1/4`" + 2'"; Mode = "length"; Input = "imperial"; Steps = @(@{type="buffer";value="1'3&1/4`""}, @{type="op";value="+"}, @{type="buffer";value="2'"}, @{type="equals"}); Expected = "3'3&1/4`"" },
    @{ Name = "L7: 6`" + 6`""; Mode = "length"; Input = "imperial"; Steps = @(@{type="buffer";value="6`""}, @{type="op";value="+"}, @{type="buffer";value="6`""}, @{type="equals"}); Expected = "1'" },
    @{ Name = "L8: 5 ft × 3"; Mode = "length"; Input = "imperial"; Steps = @(@{type="buffer";value="5'"}, @{type="op";value="×"}, @{type="buffer";value="3"}, @{type="equals"}); Expected = "15'" },
    @{ Name = "L9: 20 ft ÷ 2"; Mode = "length"; Input = "imperial"; Steps = @(@{type="buffer";value="20'"}, @{type="op";value="÷"}, @{type="buffer";value="2"}, @{type="equals"}); Expected = "10'" },
    @{ Name = "L10: 2 ft + 3 ft × 2"; Mode = "length"; Input = "imperial"; Steps = @(@{type="buffer";value="2'"}, @{type="op";value="+"}, @{type="buffer";value="3'"}, @{type="op";value="×"}, @{type="buffer";value="2"}, @{type="equals"}); Expected = "10'" },

    # AREA — Imperial (10)
    @{ Name = "A1: 10 ft × 12 ft"; Mode = "area"; Input = "imperial"; Steps = @(@{type="buffer";value="10'"}, @{type="op";value="×"}, @{type="buffer";value="12'"}, @{type="equals"}); Expected = "120 sq ft" },
    @{ Name = "A2: 5 ft × 5 ft"; Mode = "area"; Input = "imperial"; Steps = @(@{type="buffer";value="5'"}, @{type="op";value="×"}, @{type="buffer";value="5'"}, @{type="equals"}); Expected = "25 sq ft" },
    @{ Name = "A3: 3 ft × 4 ft"; Mode = "area"; Input = "imperial"; Steps = @(@{type="buffer";value="3'"}, @{type="op";value="×"}, @{type="buffer";value="4'"}, @{type="equals"}); Expected = "12 sq ft" },
    @{ Name = "A4: 10 ft × 10 ft"; Mode = "area"; Input = "imperial"; Steps = @(@{type="buffer";value="10'"}, @{type="op";value="×"}, @{type="buffer";value="10'"}, @{type="equals"}); Expected = "100 sq ft" },
    @{ Name = "A5: 2.5 ft × 4 ft"; Mode = "area"; Input = "imperial"; Steps = @(@{type="buffer";value="2.5'"}, @{type="op";value="×"}, @{type="buffer";value="4'"}, @{type="equals"}); Expected = "10 sq ft" },
    @{ Name = "A6: 6 ft × 8 ft"; Mode = "area"; Input = "imperial"; Steps = @(@{type="buffer";value="6'"}, @{type="op";value="×"}, @{type="buffer";value="8'"}, @{type="equals"}); Expected = "48 sq ft" },
    @{ Name = "A7: 20 ft × 5 ft"; Mode = "area"; Input = "imperial"; Steps = @(@{type="buffer";value="20'"}, @{type="op";value="×"}, @{type="buffer";value="5'"}, @{type="equals"}); Expected = "100 sq ft" },
    @{ Name = "A8: 4'6`" × 10 ft"; Mode = "area"; Input = "imperial"; Steps = @(@{type="buffer";value="4'6`""}, @{type="op";value="×"}, @{type="buffer";value="10'"}, @{type="equals"}); Expected = "45 sq ft" },
    @{ Name = "A9: 1 ft × 144 ft"; Mode = "area"; Input = "imperial"; Steps = @(@{type="buffer";value="1'"}, @{type="op";value="×"}, @{type="buffer";value="144'"}, @{type="equals"}); Expected = "144 sq ft" },
    @{ Name = "A10: 7 ft × 3 ft"; Mode = "area"; Input = "imperial"; Steps = @(@{type="buffer";value="7'"}, @{type="op";value="×"}, @{type="buffer";value="3'"}, @{type="equals"}); Expected = "21 sq ft" },

    # VOLUME — Imperial (10)
    @{ Name = "V1: 10×12×8 ft"; Mode = "volume"; Input = "imperial"; Steps = @(@{type="buffer";value="10'"}, @{type="op";value="×"}, @{type="buffer";value="12'"}, @{type="op";value="×"}, @{type="buffer";value="8'"}, @{type="equals"}); Expected = "960 ft³" },
    @{ Name = "V2: 5×5×5 ft"; Mode = "volume"; Input = "imperial"; Steps = @(@{type="buffer";value="5'"}, @{type="op";value="×"}, @{type="buffer";value="5'"}, @{type="op";value="×"}, @{type="buffer";value="5'"}, @{type="equals"}); Expected = "125 ft³" },
    @{ Name = "V3: 2×3×4 ft"; Mode = "volume"; Input = "imperial"; Steps = @(@{type="buffer";value="2'"}, @{type="op";value="×"}, @{type="buffer";value="3'"}, @{type="op";value="×"}, @{type="buffer";value="4'"}, @{type="equals"}); Expected = "24 ft³" },
    @{ Name = "V4: 1×1×1 ft"; Mode = "volume"; Input = "imperial"; Steps = @(@{type="buffer";value="1'"}, @{type="op";value="×"}, @{type="buffer";value="1'"}, @{type="op";value="×"}, @{type="buffer";value="1'"}, @{type="equals"}); Expected = "1 ft³" },
    @{ Name = "V5: 10×10×1 ft"; Mode = "volume"; Input = "imperial"; Steps = @(@{type="buffer";value="10'"}, @{type="op";value="×"}, @{type="buffer";value="10'"}, @{type="op";value="×"}, @{type="buffer";value="1'"}, @{type="equals"}); Expected = "100 ft³" },
    @{ Name = "V6: 3×4×5 ft"; Mode = "volume"; Input = "imperial"; Steps = @(@{type="buffer";value="3'"}, @{type="op";value="×"}, @{type="buffer";value="4'"}, @{type="op";value="×"}, @{type="buffer";value="5'"}, @{type="equals"}); Expected = "60 ft³" },
    @{ Name = "V7: 2×2×2 ft"; Mode = "volume"; Input = "imperial"; Steps = @(@{type="buffer";value="2'"}, @{type="op";value="×"}, @{type="buffer";value="2'"}, @{type="op";value="×"}, @{type="buffer";value="2'"}, @{type="equals"}); Expected = "8 ft³" },
    @{ Name = "V8: 4×3×2 ft"; Mode = "volume"; Input = "imperial"; Steps = @(@{type="buffer";value="4'"}, @{type="op";value="×"}, @{type="buffer";value="3'"}, @{type="op";value="×"}, @{type="buffer";value="2'"}, @{type="equals"}); Expected = "24 ft³" },
    @{ Name = "V9: 6×6×6 ft"; Mode = "volume"; Input = "imperial"; Steps = @(@{type="buffer";value="6'"}, @{type="op";value="×"}, @{type="buffer";value="6'"}, @{type="op";value="×"}, @{type="buffer";value="6'"}, @{type="equals"}); Expected = "216 ft³" },
    @{ Name = "V10: 12×1×1 ft"; Mode = "volume"; Input = "imperial"; Steps = @(@{type="buffer";value="12'"}, @{type="op";value="×"}, @{type="buffer";value="1'"}, @{type="op";value="×"}, @{type="buffer";value="1'"}, @{type="equals"}); Expected = "12 ft³" },

    # LENGTH — Metric (10)
    @{ Name = "ML1: 1.5 + 2.5 m"; Mode = "length"; Input = "metric"; Steps = @(@{type="buffer";value="1.5"}, @{type="op";value="+"}, @{type="buffer";value="2.5"}, @{type="equals"}); Expected = "4 m" },
    @{ Name = "ML2: 10 − 3 m"; Mode = "length"; Input = "metric"; Steps = @(@{type="buffer";value="10"}, @{type="op";value="−"}, @{type="buffer";value="3"}, @{type="equals"}); Expected = "7 m" },
    @{ Name = "ML3: 2.4 × 2 m"; Mode = "length"; Input = "metric"; Steps = @(@{type="buffer";value="2.4"}, @{type="op";value="×"}, @{type="buffer";value="2"}, @{type="equals"}); Expected = "4.8 m" },
    @{ Name = "ML4: 9 ÷ 3 m"; Mode = "length"; Input = "metric"; Steps = @(@{type="buffer";value="9"}, @{type="op";value="÷"}, @{type="buffer";value="3"}, @{type="equals"}); Expected = "3 m" },
    @{ Name = "ML5: 0.3048 + 0.3048"; Mode = "length"; Input = "metric"; Steps = @(@{type="buffer";value="0.3048"}, @{type="op";value="+"}, @{type="buffer";value="0.3048"}, @{type="equals"}); Expected = "0.6096 m" },
    @{ Name = "ML6: 5 × 3 m"; Mode = "length"; Input = "metric"; Steps = @(@{type="buffer";value="5"}, @{type="op";value="×"}, @{type="buffer";value="3"}, @{type="equals"}); Expected = "15 m" },
    @{ Name = "ML7: 100 ÷ 4 m"; Mode = "length"; Input = "metric"; Steps = @(@{type="buffer";value="100"}, @{type="op";value="÷"}, @{type="buffer";value="4"}, @{type="equals"}); Expected = "25 m" },
    @{ Name = "ML8: 1.25 + 0.75 m"; Mode = "length"; Input = "metric"; Steps = @(@{type="buffer";value="1.25"}, @{type="op";value="+"}, @{type="buffer";value="0.75"}, @{type="equals"}); Expected = "2 m" },
    @{ Name = "ML9: 3.048 × 2 m"; Mode = "length"; Input = "metric"; Steps = @(@{type="buffer";value="3.048"}, @{type="op";value="×"}, @{type="buffer";value="2"}, @{type="equals"}); Expected = "6.096 m" },
    @{ Name = "ML10: 10 + 5 × 2 m"; Mode = "length"; Input = "metric"; Steps = @(@{type="buffer";value="10"}, @{type="op";value="+"}, @{type="buffer";value="5"}, @{type="op";value="×"}, @{type="buffer";value="2"}, @{type="equals"}); Expected = "30 m" },

    # STANDARD (10)
    @{ Name = "S1: 7 + 3"; Mode = "length"; Input = "standard"; Steps = @(@{type="buffer";value="7"}, @{type="op";value="+"}, @{type="buffer";value="3"}, @{type="equals"}); Expected = "10" },
    @{ Name = "S2: 15 − 8"; Mode = "length"; Input = "standard"; Steps = @(@{type="buffer";value="15"}, @{type="op";value="−"}, @{type="buffer";value="8"}, @{type="equals"}); Expected = "7" },
    @{ Name = "S3: 6 × 7"; Mode = "length"; Input = "standard"; Steps = @(@{type="buffer";value="6"}, @{type="op";value="×"}, @{type="buffer";value="7"}, @{type="equals"}); Expected = "42" },
    @{ Name = "S4: 100 ÷ 4"; Mode = "length"; Input = "standard"; Steps = @(@{type="buffer";value="100"}, @{type="op";value="÷"}, @{type="buffer";value="4"}, @{type="equals"}); Expected = "25" },
    @{ Name = "S5: 2.5 + 1.5"; Mode = "length"; Input = "standard"; Steps = @(@{type="buffer";value="2.5"}, @{type="op";value="+"}, @{type="buffer";value="1.5"}, @{type="equals"}); Expected = "4" },
    @{ Name = "S6: 9 × 9"; Mode = "length"; Input = "standard"; Steps = @(@{type="buffer";value="9"}, @{type="op";value="×"}, @{type="buffer";value="9"}, @{type="equals"}); Expected = "81" },
    @{ Name = "S7: 1 ÷ 8"; Mode = "length"; Input = "standard"; Steps = @(@{type="buffer";value="1"}, @{type="op";value="÷"}, @{type="buffer";value="8"}, @{type="equals"}); Expected = "0.125" },
    @{ Name = "S8: 50 − 17"; Mode = "length"; Input = "standard"; Steps = @(@{type="buffer";value="50"}, @{type="op";value="−"}, @{type="buffer";value="17"}, @{type="equals"}); Expected = "33" },
    @{ Name = "S9: 3 + 4 × 2"; Mode = "length"; Input = "standard"; Steps = @(@{type="buffer";value="3"}, @{type="op";value="+"}, @{type="buffer";value="4"}, @{type="op";value="×"}, @{type="buffer";value="2"}, @{type="equals"}); Expected = "14" },
    @{ Name = "S10: 0.1 + 0.2"; Mode = "length"; Input = "standard"; Steps = @(@{type="buffer";value="0.1"}, @{type="op";value="+"}, @{type="buffer";value="0.2"}, @{type="equals"}); Expected = "0.3" }
)

$results = foreach ($t in $tests) {
    Test-Calc $t.Name $t.Steps $t.Mode $t.Input $t.Expected
}

$passed = @($results | Where-Object { $_.Pass }).Count
$failed = @($results | Where-Object { -not $_.Pass }).Count

Write-Output ""
Write-Output "=== CONSTRUCTION CALCULATOR STRESS TEST ==="
Write-Output "Total: $($results.Count)  Passed: $passed  Failed: $failed"
Write-Output ""

foreach ($group in @("L", "A", "V", "ML", "S")) {
    $groupResults = $results | Where-Object { $_.Name -match "^$group\d" }
    if ($groupResults.Count -eq 0) { continue }
    $label = switch ($group) {
        "L" { "LENGTH (Imperial)" }
        "A" { "AREA (Imperial)" }
        "V" { "VOLUME (Imperial)" }
        "ML" { "LENGTH (Metric)" }
        "S" { "STANDARD" }
    }
    Write-Output "--- $label ---"
    foreach ($r in $groupResults) {
        $status = if ($r.Pass) { "PASS" } else { "FAIL" }
        Write-Output "  [$status] $($r.Name)"
        if (-not $r.Pass) {
            Write-Output "         Expected: $($r.Expected)"
            Write-Output "         Actual:   $($r.Actual)"
        }
    }
    Write-Output ""
}

if ($failed -gt 0) { exit 1 }
