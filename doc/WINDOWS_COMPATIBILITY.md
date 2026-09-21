# Windows compatibility fixes based on v0.0.10

This branch starts at upstream tag `v0.0.10`
(`b5c0db97017536b86b162bce2067a6fd8ba203df`). It keeps the legacy Illustrator
2022 implementation and includes the following fixes:

- Disable the startup GitHub release check and update notification. Newer
  upstream release binaries failed to load in the tested Illustrator 26.0.1
  installation, so prompting to update on every launch is not useful here.
- Decode subprocess output explicitly as UTF-8. MiKTeX's version banner contains
  accented author names; decoding it using Windows code page 936 can throw,
  causing `CheckLatexCommand` to incorrectly reject a valid compiler directory.
- Skip document-path validation for unsaved documents when saving is optional.
  A localized untitled document name is not a filesystem path.
- Detect actual non-ASCII path bytes directly and include the offending path
  in the corrected warning. This does **not** add Unicode document-path support
  to the legacy implementation.

The UTF-8 decoding fix targets MiKTeX and curl output. Commands that emit a
different encoding may require additional handling.

## Source build

Use the upstream build instructions in the root README with the Illustrator
2022 SDK. The native source changes have not been compiled or tested against
the SDK in this environment because that SDK is unavailable.

## Compatibility tools for the existing release binary

`scripts/windows_compat/` preserves the independently tested workaround for
users who cannot build the native plugin:

1. `PdfLatexCompat.cs` forwards compilation to the current-user MiKTeX install
   at `%LOCALAPPDATA%\Programs\MiKTeX\miktex\bin\x64\pdflatex.exe`. It only
   converts version-probe output to ASCII, preserving `pdfTeX` and the real
   exit code. Normal compilation retains its arguments and working directory.
2. `patch_no_update.py` produces a copy of the official v0.0.10 Illustrator 2022
   Windows `.aip` with its `CheckGithubVersion` entry changed to an immediate
   return. It refuses any input whose full SHA-256 or function prologue does
   not match the verified release. It changes exactly one byte and does not
   modify the input file.

To build the adapter, run from `scripts/windows_compat` in PowerShell:

```powershell
& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /optimize+ /target:exe /out:pdflatex.exe .\PdfLatexCompat.cs
$compatDir = Join-Path $env:LOCALAPPDATA 'Programs\LaTeX2AI-Compat'
New-Item -ItemType Directory -Force $compatDir | Out-Null
Copy-Item .\pdflatex.exe $compatDir
```

Select that directory as the LaTeX executable directory in LaTeX2AI options.
Alternatively, **while Illustrator is closed**, set the `path_latex` attribute
in `%LOCALAPPDATA%\Adobe\Illustrator\LaTeX2AI\LaTeX2AI_application_data.xml`.
This adapter only supplies `pdflatex`, not XeLaTeX or LuaLaTeX.

To disable the notification in the prebuilt plugin:

```text
python scripts/windows_compat/patch_no_update.py ORIGINAL.aip LaTeX2AI.aip
```

Back up the installed plugin, close Illustrator, then install the output.
Original SHA-256:
`2172aa71412e492770ad31ab4975a416c2d608525407f9977a04036b766f1e1d`.
Patched SHA-256:
`9dff66b9360df310d1cab2ed55551b4932d66ac519a50ace74a3d79c89b5e111`.
Function RVA: `0x62AC0`; file offset: `0x61EC0`; replacement: `48` to `C3`.
The function was identified using PE function boundaries and references to
both the release-query command and the update-dialog strings.

These tools do not apply the native document-path changes to the existing
binary. No prebuilt binaries, local settings, or personal documents are tracked
in this branch.

## Validation

On Chinese Windows (ANSI code page 936), Illustrator 2022 version 26.0.1,
MiKTeX 25.12 and Ghostscript 10.08.0:

- The original version output reproduces the UTF-8/GBK mismatch.
- The adapter version probe decodes successfully using GBK and contains pdfTeX.
- A real formula compiles to PDF with spaces in the directory and filename.
- Invalid LaTeX returns a nonzero exit code and does not produce a PDF.
- The binary patch is limited to the single verified function-entry byte.
- Illustrator starts without the update notification or compiler-path error,
  and the LaTeX2AI tools load. The compiler setting survives normal shutdown.

Run the adapter's four environment-specific integration checks after installing
MiKTeX and the adapter:

```text
python scripts/windows_compat/verify_fix.py
```

The real-version regression test intentionally targets the MiKTeX version banner
and code-page combination described above; it is not a portable SDK test suite.
