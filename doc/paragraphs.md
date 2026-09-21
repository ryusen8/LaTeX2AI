# Paragraphs containing formulas (Windows v0.0.10 compatibility build)

The item dialog accepts English paragraphs containing `$inline math$`,
`$$display math$$`, `\(...\)` and `\[...\]`.

1. Select the LaTeX2AI create/edit tool and click the desired insertion point.
2. Enable **Paragraph + math** and paste your paragraph.
3. Set **Width (mm)** and **Font (pt)**.
4. Leave **Editable AI text (Times New Roman)** enabled for native Illustrator
   text and editable LaTeX2AI formula objects. Press **Ctrl+Enter** or **OK**.
5. Use Illustrator's Type tool to edit the resulting text (enter the group or
   ungroup it if needed).

Enter inserts a newline; a blank line starts a paragraph. Single newlines are
joined as spaces. Write `\$` for a literal dollar sign. Plain prose such as
`5%`, `A & B` and `sample_1` needs no LaTeX escaping. Formula contents are LaTeX.
English/Latin prose and common typographic punctuation are supported.

The input is a **plain-text** multiline control. Pasting formatted content from
notes or browsers does not invoke RichEdit's rich-text/OLE import callbacks. This
fixes a captured hang where the forms UI thread stayed in the RichTextBox COM
callback while Illustrator synchronously waited for the form process to exit.
Preparation displays the current formula count. **Cancel**, **Escape**, or closing
the dialog stops preparation and terminates the active compiler process before
returning a normal cancellation to Illustrator. Illustrator itself still uses
the original synchronous native dialog protocol.

Formula source is preserved literally. Markdown-export escapes such as `p\_i`
and `\\|v\\|` are not automatically changed to `p_i` and `\|v\|`; correct these in
the source if subscripts and norm symbols were intended. References to equation
numbers in another document are not resolved by this standalone converter.

Example:

```text
The energy $E=mc^2$ increases by 5% & the label is sample_1.

The independent result is $$a^2+b^2=c^2.$$ More text follows.
```

## Editable output and limitations

The editable mode creates a group containing native **point-text frames** and
LaTeX2AI placed items. Text runs are split at line breaks and at formulas; they are
not a single threaded area-text frame. Spaces are retained. Initial layout
wraps to the requested width and aligns inline formulas to the text baseline.
Display formulas occupy a centered line. Prose starts in Times New Roman;
Illustrator can change its font, size, color and contents afterward.

Editing text does **not** move neighboring formulas or reflow the full paragraph.
Regenerate a paragraph for substantial content or width changes. Formulas remain
normal **LaTeX2AI linked PDF items**, with their original TeX fonts, LaTeX source,
and native placement settings. They are never embedded or converted to outlines.
Click a formula with the LaTeX2AI create/edit tool to edit and recompile it; if
Illustrator selects the outer group, enter the group or ungroup it first.
The formula editor includes a local font-size wrapper so recompilation preserves
its paragraph font size. The group's Note keeps the pasted paragraph source;
that original paragraph source does not track later text or formula edits.

Each item carries its PDF encoded contents and the Windows v0.0.10 native hash
from creation. Formula files are copied beside the native placeholder in the
document's normal `links` folder, just like regular LaTeX2AI items.
Keep the `links` folder when moving or sharing the AI file. Existing paragraphs
created by the earlier outlined-formula build must be regenerated from their
source to regain formula editing; changing the installed executable alone does
not convert previously outlined artwork.

Editable formulas use `standalone`, `amsmath` and `amssymb` with the LaTeX and
Ghostscript executables configured in LaTeX2AI Options. Custom document-header
macros are not imported into this mode. A formula or unbroken word wider than
the chosen width produces an error: increase the width or reduce the font size.
Up to 100 distinct formulas can be compiled in one conversion.
When recompiling individual formulas later through the native plugin, its
document header must load any required packages, for example `amssymb` for
`\mathbb`. Initial paragraph conversion does not depend on that header for math.

Uncheck **Editable AI text** to keep a whole paragraph as one conventional
LaTeX2AI linked PDF. That mode supports reopening its source and changing the
width/font together. Uncheck **Paragraph + math** for the original raw-LaTeX
workflow. Switching to raw mode shows generated TeX; manual raw-code edits are
not silently discarded when switching back.

## Failure behavior and data

Formula compilation runs before the form is submitted. Invalid delimiters or
compile failures keep the dialog open. In editable mode the native plugin first
places a preview built from the already compiled formula PDFs and escaped prose.
It no longer recompiles all pasted math under the document's potentially different
header. The wrapper stores the exact input/layout metadata and includes the
precompiled preview PDF. A separate worker then finds **only** the object
containing that job's unique marker, constructs the editable group, and removes
the temporary paragraph after construction succeeds. Failure before commit
leaves the normal paragraph intact and removes partial editable artwork.

Jobs, source copies, formula PDFs and diagnostic logs are local under
`%LOCALAPPDATA%\LaTeX2AI\paragraph-jobs`. Completed formula items link to copies in the document's normal `links` folder
and contain their own encoded PDF data; they do not depend on job files. The native plugin may also leave
its temporary paragraph PDF in the document's `links` directory. No paragraph
content is sent over the network.

## Build and validation

This feature changes the C# forms application; it does not require rebuilding
the Illustrator SDK native plugin. It targets the installed v0.0.10 protocol.
From the repository root, on Windows with .NET Framework MSBuild and Python:

```powershell
./scripts/windows_compat/build_forms.ps1 -OutputDirectory ./output/paragraph-forms -PythonExe python
./scripts/windows_compat/test_paragraphs.ps1
```

The forms build pins the handshake to upstream v0.0.10's commit
`b5c0db97017536b86b162bce2067a6fd8ba203df`; it does not disable validation.
`L2A_FORMS_PLUGIN_SHA` is an optional validated override in the header generator;
normal native builds still use their current Git SHA. The test script runs the
parser/metadata regression tests without Illustrator. With `-FormsExe <built
exe>` it also compiles real formula fixtures using the current user's configured
LaTeX/Ghostscript and records generated scripts and linked PDFs. It does not
change an open Illustrator document.

The desktop validation used Illustrator 2022 (26.0.1), MiKTeX and Ghostscript
10.08.0: a real plugin-window submission generated 8 native text frames and 3
native formula items; a formula was reopened with the plugin and recompiled; text contents were changed through Illustrator's text API;
saving and reopening retained the native text and editable formulas. Additional
fixtures cover display/inline math, punctuation, escaping, comments, invalid
input, widths, decimal locales and CRLF round trips. The local build resolves
.NET references from the installed runtime because the .NET 4 targeting pack
is absent (MSB3644); the resulting executable was exercised in the host.

The paste-hang regression adds 28 parser/metadata assertions, cancellation of an
actively running child compiler, and a plain-text-control check. The reported
paragraph compiles in about eight seconds locally. Its prepared PDF wrapper also
compiles with the upstream `amsmath`-only header. Host-script insertion, save and
reopen produced 21 native text frames and 14 linked LaTeX2AI formulas. The new
input dialog accepted the complete pasted text and displayed compilation progress.
An independent native default-header dialog prevented completing that particular
end-to-end UI insertion run; it is not counted as a successful UI insertion test.

Close any LaTeX2AI dialog before replacing `LaTeX2AIForms.exe` beside the installed
`LaTeX2AI.aip`. Preserve the compatibility-patched native plugin. The old forms
executable can be restored independently. This feature does not alter the
existing ASCII-path/startup/cancellation compatibility patches.
