Set-StrictMode -Version Latest

function Get-MarkdownSection {
  param(
    [string]$Text,
    [string]$Heading
  )

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ""
  }

  $escapedHeading = [regex]::Escape($Heading)
  $match = [regex]::Match($Text, "(?s)^##\s+$escapedHeading\s*(.*?)(?=^##\s+|\z)", [System.Text.RegularExpressions.RegexOptions]::Multiline)
  if ($match.Success) {
    return $match.Groups[1].Value.Trim()
  }

  return ""
}

function Test-SectionHasActionableBullets {
  param([string]$Section)

  if ([string]::IsNullOrWhiteSpace($Section)) {
    return $false
  }

  $bullets = @($Section -split "\r?\n" | Where-Object { $_ -match "^\s*[-*+]\s+" })
  if ($bullets.Count -eq 0) {
    return $false
  }

  $nonEmpty = @($bullets | Where-Object { $_ -notmatch "(?i)none detected|none found|none reported" })
  return $nonEmpty.Count -gt 0
}

function ConvertTo-SafeBulletLine {
  param([Parameter(Mandatory = $true)][string]$Line)

  $trimmed = $Line.Trim()
  if ($trimmed -match "^[-*+]\s+") {
    return $trimmed
  }

  return "- $trimmed"
}