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
- Preserve the previous settings if startup setup is canceled or fails; do not
  clear the configured compiler path before trying the default. Guard callbacks
  when tools or the annotator are not initialized, clear the global pointer on
  shutdown, and prevent a settings-write exception from escaping destruction.
- Discover the current-user MiKTeX directory before trying an empty PATH-based
  compiler setting. Explorer can retain the PATH from before MiKTeX installation.

The UTF-8 decoding fix targets MiKTeX and curl output. Commands that emit a
different encoding may require additional handling.

## Source build

Use the upstream build instructions in the root README with the Illustrator
2022 SDK. The native source changes have not been compiled or tested against
the SDK in this environment because that SDK is unavailable.

## Compatibility tools for the existing release binary

### Recommended: patch the installed native binary

The earlier adapter and one-byte update patch did **not** apply the source fix
for unsaved documents. Consequently a localized untitled document could still
trigger the ASCII-path warning. Use `patch_runtime.py` to apply that fix to the
actual plugin, together with UTF-8 subprocess-output decoding and no-update:

```text
python scripts/windows_compat/patch_runtime.py ORIGINAL.aip LaTeX2AI.aip --latex-dir "C:\Users\YOUR_USER\AppData\Local\Programs\MiKTeX\miktex\bin\x64"
```

Use the **original upstream v0.0.10 Illustrator 2022 Windows binary**, not an
already patched file. The script checks its entire SHA-256 and all replaced
instructions and refuses in-place patching. Code edits keep their original
sizes and the exception/unwind tables remain unchanged. The optional
`--latex-dir` adds a non-executable, read-only `.l2acfg` data section containing
the local compiler directory. Close Illustrator, back up its installed plugin,
then copy the output into its Plug-ins directory. Keep the v0.0.10-compatible
`LaTeX2AIForms.exe` alongside it, including the paragraph-enabled build if used.

Set the compiler directory to the real MiKTeX `miktex\bin\x64` directory. The
adapter is unnecessary with this patch. The UTF-8 change targets MiKTeX; output
from other programs that use a different encoding is not covered.

Use `--latex-dir` with an existing ASCII directory containing `pdflatex.exe`.
The resulting binary is configured for that installation; regenerate it if
moving to another machine. Saved valid settings take precedence. If they are
empty or invalid, the plugin validates this registered absolute directory,
uses it for real compilation, and persists it after a successful session.
It does not accept a missing compiler or disable the version check.

The original release clears `path_latex_` before trying the empty-path fallback
and writes settings unconditionally during destruction. Canceling failed startup
can therefore persist an empty path and repeat the error on subsequent launches.
The runtime patch now skips settings serialization unless `is_setup_` is true,
while still destroying all members normally. Earlier runtime packages applied
neither this guard nor absolute-directory recovery; the source-only guard was
insufficient to fix the installed precompiled plugin.

Verified instruction changes (RVAs, **not file offsets**):

| RVA | Change |
| --- | --- |
| `0x62AC0` | Return immediately from the update check. |
| `0xCE8DC` | Redirect subprocess-output construction to a UTF-8 thunk. |
| `0xCE961` | Replace 11 bytes of unused executable alignment with `mov r8d, 1; jmp 0xA3110`. |
| `0xCF375` | For optional unsaved documents, branch to the existing return path instead of the character check. |
| `0x40652` | Check `is_setup_` before serializing settings; jump to member cleanup at `0x40689` after failed startup. |
| `0x44189` | With `--latex-dir`, point the fallback constructor at the registered absolute directory instead of an empty string. |
| `0x758E8` | NOP only the 7-byte informational placement-mismatch alert call; retain string cleanup and `SetPlacement` reconciliation. |

The thunk tail-calls the existing `UnicodeString(std::string const&,
AICharacterEncoding)` constructor using `kAIUTF8CharacterEncoding = 1`. It
changes no stack or nonvolatile registers and lies outside all PE exception
function ranges. The document-path branch still warns when a saved document
contains non-ASCII characters or an operation requires an unsaved document to
be saved. It skips only the inappropriate check on an optional untitled name.

Portable runtime patch without `--latex-dir`, SHA-256:
`9b9eff554df2557e01037856bad4a2ab2578d9c06bdd6bfcd41cc582b557d17f`.
The hash with a registered directory depends on that directory.

**Scope:** the binary now includes the failed-setup settings-write guard and,
with `--latex-dir`, compiler recovery. It does not include the source-only
callback guards, global-pointer clearing, or settings-write exception handler.
It also retains the original saved-file character check and warning text. Do
not describe the binary as a full build of this branch.

Flowing paragraphs use native `fill_to_boundary_box` placement (`kConform`),
because `keep_scale` (`kAsIs`) can distort linked PDF bounds after shear. Legacy
metadata migrates in the forms helper; saving applies the normal native placement
reconciliation. Only its redundant informational alert is suppressed. Tests
verify that the following destructor and reconciliation instructions are intact.

The native source also restricts formula detection to placed art. This type
guard is **source-only and unbuilt** without the SDK. The installed fix instead
renames flowing text frames to `Flow paragraph text` and stores their XML in the
`L2AFlowMetadata` tag, outside the native formula name/note convention. This
prevents the native editor from interpreting paragraph XML as formula XML.

### Earlier adapter-only workaround

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

The adapter and `patch_no_update.py` alone do not apply the native document-path
changes. No prebuilt binaries, local settings, or personal documents are tracked
in this branch.

## Compiler works in the installation terminal but fails from Explorer

The native warning also covers a compiler that starts successfully but exits
with an error. A correct executable directory alone does not establish a working
MiKTeX installation. In the affected setup, a process launched by Explorer returned:

```text
It seems that this is a fresh TeX installation.
Please finish the setup before proceeding.
```

`initexmf --report` in that same desktop context reported `SetupDate: not yet`
and an incorrect default user installation under `Roaming\MiKTeX\2.9`.
The `Core\UserInstall` registration was absent. Running the same commands from
the installation terminal instead found a complete MiKTeX 25.12 installation.
Generated configuration, font maps and formats were found in the installation
app's private `LocalCache\Roaming\MiKTeX` and `LocalCache\Local\MiKTeX` trees.
This registry/filesystem view difference persisted even when the executable,
working directory and ordinary environment variables matched.

Repair the actual desktop user's MiKTeX setup outside that private installation
context. Prefer completing setup through the MiKTeX installer/console launched
from Explorer. For this already completed local installation, the missing
per-user registration was restored and missing generated configuration, font
maps and formats were copied from its completed private setup into the real
user trees. Existing files were preserved and affected registry values were
recorded before repair. Package-manager authentication values were not copied.
The machine-specific recovery helper and configuration are not distributed.

Verify `pdflatex -version`, the installation roots in `initexmf --report`, and
real formula compilation from an independently Explorer-launched process. Then
**double-click** both the Illustrator shortcut and an AI document in Explorer,
checking that the Illustrator parent process is Explorer. Calling `Start-Process`
on a shortcut or file from the installation terminal can retain the terminal's
private context and is not equivalent to this test.

On the affected machine, the desktop-side report now identifies MiKTeX 25.12
with its actual installation/configuration/data roots, the version probe exits
successfully, and a `standalone` formula using `amsmath` and `amssymb` compiles
with automatic package installation disabled. Real Explorer double-clicks of
both the desktop shortcut and the existing AI document start Illustrator without
the compiler-path warning. This repair changes the MiKTeX installation state;
it requires no additional changes to the native `.aip` binary.

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

Additional runtime-patch checks:

- The patched plugin starts with the **real MiKTeX directory**, without the
  adapter, and loads the LaTeX2AI toolbar.
- Creating a localized untitled document and opening LaTeX2AI Options shows
  `Current document not saved`, without the former ASCII-path warning.
- Canceling that Options dialog returns control to the same Illustrator
  process; its window remains responsive. Saving a blank test document to an
  ASCII path succeeds.
- In the saved test document, the real plugin compiles `$a^2+b^2=c^2$`, imports
  the resulting PDF as a placed item, and remains responsive.
- After saving and closing the test document, Illustrator exits normally and
  starts again without either startup prompt. The real compiler directory
  remains in its settings file.
- Disassembly verifies the constructor argument, tail-call, document return
  target, executable section, and absence of overlapping exception ranges.
- Wrong, truncated, and already-patched inputs are rejected; the original file
  is preserved. `test_runtime_patch.py` checks the documented code changes,
  failed-setup cleanup branch, read-only fallback section, RIP-relative target,
  and unchanged exception/unwind tables.
- With an empty saved compiler path and a child PATH containing only Windows
  directories, Illustrator starts without a compiler-path dialog and saves the
  recovered absolute directory after normal shutdown.
- Launching the desktop shortcut with an invalid saved directory, and opening
  an ASCII-path AI file with an empty saved directory, both recovered when
  invoked from the installation terminal. These earlier checks did not cover
  real Explorer double-clicks; see the separate desktop-context repair above.
- In that first recovered session, a plugin-window paragraph submission using
  `\mathbb{R}^2` and `x_i` completes with 3 native text frames and 2 linked native
  formulas. Save/reopen retains both. Normal shutdown persists the real path;
  reopening the original document through file association succeeds again.

The paragraph forms process reads settings from disk before native recovery is
persisted on shutdown. It therefore resolves the configured compiler, then the
current-user MiKTeX installation, then absolute PATH entries. Real compilation
fixtures check empty/invalid settings with MiKTeX removed from the test PATH.

These checks do not establish that every reported Illustrator exit is fixed.
The available Windows report records an application hang, not a diagnosed
native exception; the additional source-only callback and exception-handling
safeguards remain unbuilt.

Run the adapter's four environment-specific integration checks after installing
MiKTeX and the adapter:

```text
python scripts/windows_compat/verify_fix.py
```

The real-version regression test intentionally targets the MiKTeX version banner
and code-page combination described above; it is not a portable SDK test suite.
