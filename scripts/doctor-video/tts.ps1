# Synthesises narration lines to WAV with a Windows OneCore voice.
#
# Usage:  powershell -ExecutionPolicy Bypass -File tts.ps1 -Lines lines.json -OutDir out -Voice Heera
# lines.json: [{ "id": "s01", "text": "..." }, ...]  ->  out\s01.wav, ...
#
# OneCore voices (e.g. "Microsoft Heera"/"Microsoft Ravi", English-India) are only
# reachable through the WinRT SpeechSynthesizer, not System.Speech, hence the
# AsTask() plumbing below. Install a Hindi voice (Settings > Time & language >
# Speech > Add voices > Hindi) to narrate a Hindi version with -Voice Kalpana.
param(
  [Parameter(Mandatory = $true)][string]$Lines,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$Voice = 'Heera',
  [string]$Rate = '-4%'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await($op, [Type]$resultType) {
  $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  return $task.Result
}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$chosen = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -like "*$Voice*" } | Select-Object -First 1
if (-not $chosen) { throw "Voice '$Voice' is not installed." }
$synth.Voice = $chosen
Write-Output "Voice: $($chosen.DisplayName) ($($chosen.Language))"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$items = Get-Content -Raw -Encoding UTF8 $Lines | ConvertFrom-Json

foreach ($item in $items) {
  $escaped = [System.Security.SecurityElement]::Escape($item.text)
  $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='$($chosen.Language)'><prosody rate='$Rate'>$escaped</prosody></speak>"
  $stream = Await ($synth.SynthesizeSsmlToStreamAsync($ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $null = Await ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
  $bytes = New-Object byte[] $stream.Size
  $reader.ReadBytes($bytes)
  $path = Join-Path $OutDir ("{0}.wav" -f $item.id)
  [System.IO.File]::WriteAllBytes($path, $bytes)
  Write-Output ("{0}  {1} bytes" -f $item.id, $bytes.Length)
}
