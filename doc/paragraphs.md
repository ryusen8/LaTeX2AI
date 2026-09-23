# Flowing English paragraphs with native formulas

The Windows v0.0.10 compatibility build accepts prose containing `$inline math$`,
`$$display math$$`, `\(...\)` and `\[...\]`.

1. Click the insertion point with the LaTeX2AI create/edit tool.
2. Enable **Paragraph + math** and **Flowing AI text + formulas**.
3. Paste the paragraph and choose **Font (pt)** and Left/Center/Right/Justify.
4. Leave **Auto width** enabled to use the space from the insertion point to the
   active artboard's right margin. Alternatively enter **Width (pt)**.
5. Press **OK** or **Ctrl+Enter**. Enter creates a newline.
6. Use Illustrator's Type tool to edit the prose. Select all text inside the
   frame to change its type size, or use the native Paragraph panel for alignment.
7. Resize the **area-text boundary** to change wrapping. Do not scale the outer
   group when you intend to change column width. Keep the group together.
   If resize handles are missing, enable **View > Show Bounding Box**
   (**Ctrl+Shift+B**) and use the Selection tool.
8. To change line spacing, select the text with the Type tool and set **Leading**
   in Illustrator's **Character** panel (**Ctrl+T**). Use a point value or Auto.
   Select all characters in the frame (including the invisible formula anchors)
   for uniform spacing; individual text ranges can retain different values.

The output is one native area-text frame plus linked LaTeX2AI PDF formula objects.
Illustrator composes lines and paragraph alignment. Invisible anchor characters
reserve space; a local helper positions the formulas after editing pauses
(typically 1–2 seconds). This emulates inline artwork; Illustrator's scripting
API does not expose native inline image anchors. Height initially grows with the content.
Once you manually change the frame height, that height is respected; use the
native overset indicator and enlarge the frame to reveal overflowing content.
An individual formula wider than the column is proportionally reduced to fit.

Formula size tracks the anchor's type size and matches the capital height of
neighboring prose. The default prose font is Times New Roman; math keeps its TeX
fonts. Initially the helper reserves space above and below tall formulas. Once
you change leading, that frame uses Illustrator's native leading settings;
the helper no longer writes line spacing. Fixed leading, Auto and the native
auto-leading percentage are preserved through typing, width changes, font-size
edits, transforms and save/reopen. Formulas follow the resulting baselines.
Deliberately tight spacing is allowed, so tall formulas can overlap adjacent
lines if the chosen value is too small. RGB and CMYK documents are supported.

## Editing and practical limits

- Keep formulas and the text frame in the generated group. Select text with the
  Type tool or enter the group; do not ungroup it for normal editing.
- A formula's invisible anchor behaves as a character. Deleting it hides that
  formula. Restoring the character restores its formula.
- Formulas are linked PDFs with native LaTeX source and encoded PDF data.
  Actual prose and formulas are never outlined. Only disposable measurement
  copies of the text are outlined, then immediately removed.
- Original pasted source is retained in the group's Note; Illustrator edits do
  not rewrite that source. Earlier fragmented paragraphs must be regenerated.
- Select the whole generated group to move, scale (including nonuniform scale),
  rotate or shear it. These affine transforms are preserved, including when you
  subsequently edit prose. Change the area-text boundary instead when you want
  to rewrap the column without scaling its contents.
- Rectangular, single-column text is supported. Threading frames, perspective or
  envelope distortion, arbitrary shape text, copying an anchor alone to another
  paragraph, or changing formula TeX dimensions after insertion are not supported
  for automatic reflow. Regenerate after changing formula source.
- Edit prose with the **Type tool (T)**; use the LaTeX2AI tool for actual formulas.
  Older flowing paragraphs migrate automatically to tagged metadata and a text
  frame name that the native plugin cannot mistake for a formula. Save once after
  migration to apply the native PDF placement settings needed for shear. Install
  both the updated forms and runtime-patched AIP for silent reconciliation.
- Synchronization is a separate scripting operation and can add an Undo step.
  It runs for the active document and skips locked/hidden frames. Allow it to
  finish before saving/exporting.
- The helper starts during plugin startup and after insertion, and exits when
  Illustrator closes. Files remain readable without it, but formulas will not
  follow subsequent edits on a computer without this build. Keep the document's
  links directory when sharing.

## Input and compilation

Prose is plain text: `5%`, `A & B`, and `sample_1` need no LaTeX escaping.
Single newlines join as spaces; blank lines separate paragraphs. Use `\$` for a
literal dollar sign. Formula source is preserved literally: Markdown-export
escapes such as `p\_i` and `\\|v\\|` are not silently rewritten. External `eqref`
numbers cannot be resolved by this standalone converter.

```text
The region $\mathbb{R}^2$ contains $x_i$. This text remains editable.

The average is $$\frac{1}{n}\sum_{i=1}^{n}x_i.$$ More text follows.
```

Compilation uses the configured LaTeX and Ghostscript executables and
standalone, fix-cm, amsmath and amssymb. Custom document-header macros are not
imported. Up to 100 formula occurrences are supported per flowing paragraph.
Each unique formula is compiled once; the preview reuses those PDFs. Invalid
LaTeX is reported before insertion. Preparation shows progress; Cancel/Escape
stops the active compiler. The plain multiline TextBox avoids the previous
RichEdit/OLE paste hang.

Uncheck **Flowing AI text + formulas** to retain one conventional LaTeX2AI PDF
with editable paragraph source. Uncheck **Paragraph + math** for raw LaTeX.

## Recovery and validation

Insertion is transactional: the native preview is removed only after text and
formulas are ready. Failed insertion leaves the preview and source intact.
Jobs and logs are local in `%LOCALAPPDATA%\LaTeX2AI\paragraph-jobs`; flow errors
are in `%LOCALAPPDATA%\LaTeX2AI\flow-layout.log`. Nothing is uploaded.

Run `scripts/windows_compat/test_paragraphs.ps1` for parser, cancellation and
compiler tests. With Illustrator open, use Windows PowerShell to run
`forms/tests/TestFlowHost.ps1 -FormsExe <exe> -OutputDirectory <scratch path>
-NativeTemplate <AI file with a native LaTeX2AI item>`. The template supplies
native placement settings unavailable through scripting; the test never saves
changes to it. Host tests cover RGB/CMYK layout, width, type size, alignment,
anchor deletion/restoration and saved-document behavior, plus nonuniform scale,
rotation, shear, editing after transforms, manual height and metadata migration.
Leading tests also cover fixed and mixed values, tight spacing, native automatic
leading, percentage changes, subsequent edits and persistence after reopening.
