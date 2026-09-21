// -----------------------------------------------------------------------------
// MIT License
//
// Copyright (c) 2020 Ivo Steinbrecher
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
// -----------------------------------------------------------------------------

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Xml;

namespace L2A.UTIL
{
    // The forms process cannot call Illustrator while the native plugin is waiting
    // for it. A separate, bounded worker runs only after that process has exited.
    public static class EditableParagraph
    {
        public static string Quote(string value)
        {
            var s = new StringBuilder("\"");
            foreach (char c in value) {
                if (c == '"' || c == '\\') s.Append('\\').Append(c);
                else if (c < 32 || c > 126) s.Append("\\u").Append(((int)c).ToString("x4"));
                else s.Append(c);
            }
            return s.Append('"').ToString();
        }
        private static string Number(decimal value) { return value.ToString(CultureInfo.InvariantCulture); }
        public static string ResolveCompiler(string directory, string command)
        {
            string name = command + ".exe";
            if (!String.IsNullOrWhiteSpace(directory)) {
                string configured = Path.Combine(directory, name);
                if (File.Exists(configured)) return Path.GetFullPath(configured);
            }
            // Native startup recovery is persisted on shutdown. The forms process
            // can therefore see stale/empty on-disk settings during that session.
            string miktex = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                @"Programs\MiKTeX\miktex\bin\x64", name);
            if (File.Exists(miktex)) return miktex;
            foreach (string entry in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator)) {
                if (String.IsNullOrWhiteSpace(entry)) continue;
                try {
                    string candidate = Path.Combine(entry.Trim().Trim('"'), name);
                    if (Path.IsPathRooted(candidate) && File.Exists(candidate)) return candidate;
                } catch (ArgumentException) { }
            }
            throw new FormatException("Could not find " + name + ". Set the compiler directory in LaTeX2AI Options.");
        }
        public static string Prepare(string source, decimal width, decimal font)
        {
            return Prepare(source, width, font, CancellationToken.None, null);
        }
        public static string Prepare(string source, decimal width, decimal font, CancellationToken cancellation, Action<string> progress)
        {
            cancellation.ThrowIfCancellationRequested();
            Paragraph.Encode(source, width, font);
            var segments = Paragraph.Parse(source);
            string id = Guid.NewGuid().ToString("N");
            string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LaTeX2AI", "paragraph-jobs", id);
            Directory.CreateDirectory(folder);
            File.WriteAllText(Path.Combine(folder, "source.txt"), source, Encoding.UTF8);
            var data = new StringBuilder("var job={id:" + Quote(id) + ",done:" + Quote(Path.Combine(folder, "completed.txt").Replace('\\', '/')) + ",source:" + Quote(source) + ",width:" + Number(width * 72m / 25.4m) + ",font:" + Number(font) + ",segments:[");
            var settings = new XmlDocument();
            settings.Load(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Adobe\Illustrator\LaTeX2AI\LaTeX2AI_application_data.xml"));
            var root = settings.DocumentElement;
            string latex = ResolveCompiler(root.GetAttribute("path_latex"), root.GetAttribute("command_latex"));
            string gs = root.GetAttribute("command_gs");
            var unique = new HashSet<string>();
            foreach (var s in segments) if (s.Kind == "math" || s.Kind == "display") unique.Add(s.Kind + ":" + s.Text);
            if (unique.Count > 100) throw new FormatException("Use at most 100 distinct formulas per paragraph.");
            var cache = new Dictionary<string, string>();
            var previewCache = new Dictionary<string, string>();
            var preview = new StringBuilder();
            int count = 0;
            foreach (var segment in segments)
            {
                cancellation.ThrowIfCancellationRequested();
                if (count++ > 0) data.Append(',');
                if (segment.Kind == "text" || segment.Kind == "break") {
                    data.Append("{kind:").Append(Quote(segment.Kind)).Append(",text:").Append(Quote(segment.Text)).Append('}');
                    preview.Append(segment.Kind == "break" ? "\n\\par\n" : Paragraph.EscapeText(segment.Text));
                    continue;
                }
                string key = segment.Kind + ":" + segment.Text;
                string result;
                if (!cache.TryGetValue(key, out result)) {
                    if (progress != null) progress("Preparing formula " + (cache.Count + 1) + " of " + unique.Count + ". Cancel stops this insertion.");
                    string stem = "formula" + cache.Count;
                    string tex = "\\documentclass[border=1pt]{standalone}\n\\usepackage{amsmath,amssymb}\n\\newwrite\\metrics\n\\begin{document}\n" +
                        "\\fontsize{" + Number(font * 72.27m / 72m) + "}{" + Number(font * 1.25m) + "}\\selectfont%\n" +
                        "\\setbox0=\\hbox{$" + (segment.Kind == "display" ? "\\displaystyle " : "") + segment.Text + "\n$}%\n" +
                        "\\immediate\\openout\\metrics=" + stem + ".metrics%\n\\immediate\\write\\metrics{\\the\\wd0,\\the\\ht0,\\the\\dp0}%\n\\immediate\\closeout\\metrics%\n\\box0%\n\\end{document}\n";
                    File.WriteAllText(Path.Combine(folder, stem + ".tex"), tex, new UTF8Encoding(false));
                    Run(latex, "-interaction=nonstopmode -halt-on-error -no-shell-escape " + stem + ".tex", folder, stem + "-latex.log", cancellation);
                    Run(gs, "-q -dBATCH -dNOPAUSE -dSAFER -sDEVICE=pdfwrite -sOutputFile=" + stem + "-linked.pdf " + stem + ".pdf", folder, stem + "-gs.log", cancellation);
                    string[] metrics = File.ReadAllText(Path.Combine(folder, stem + ".metrics")).Trim().Split(',');
                    if (metrics.Length != 3) throw new FormatException("Unexpected formula dimensions.");
                    decimal w = Dimension(metrics[0]), h = Dimension(metrics[1]), d = Dimension(metrics[2]);
                    if (w > width * 72m / 25.4m) throw new FormatException("A formula is wider than the paragraph. Increase Width (mm) or reduce Font (pt).");
                    // Preserve the native v0.0.10 PDF payload and placement schema.
                    string formulaCode = "{\\fontsize{" + Number(font * 72.27m / 72m) + "}{" + Number(font * 1.25m) +
                        "}\\selectfont $" + (segment.Kind == "display" ? "\\displaystyle " : "") + segment.Text + "\n$}";
                    byte[] pdfBytes = File.ReadAllBytes(Path.Combine(folder, stem + "-linked.pdf"));
                    string pdfHash = NativeHash(Convert.ToBase64String(pdfBytes));
                    string note = CreateFormulaNote(formulaCode, pdfBytes);
                    result = "{kind:" + Quote(segment.Kind) + ",text:" + Quote(segment.Text) + ",note:" + Quote(note) + ",hash:" + Quote(pdfHash) + ",file:" + Quote(Path.Combine(folder, stem + "-linked.pdf").Replace('\\', '/')) + ",w:" + Number(w) + ",h:" + Number(h) + ",d:" + Number(d) + "}";
                    cache.Add(key, result);
                    previewCache.Add(key, "\\raisebox{-" + Number(d) + "bp}{\\includegraphics[trim=1pt 1pt 1pt 1pt,clip]{" + stem + "-linked.pdf}}");
                }
                data.Append(result);
                if (segment.Kind == "display") preview.Append("\n\\par\\begin{center}").Append(previewCache[key]).Append("\\end{center}\n");
                else preview.Append(previewCache[key]);
            }
            if (progress != null) progress("Preparing paragraph preview. Cancel stops this insertion.");
            File.WriteAllText(Path.Combine(folder, "paragraph.tex"),
                "\\documentclass[border=1pt]{standalone}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T1]{fontenc}\n" +
                "\\usepackage{graphicx}\n\\begin{document}\n\\begin{minipage}{" + Number(width) + "mm}\n" +
                "\\raggedright\\setlength{\\parindent}{0pt}\\fontsize{" + Number(font) + "}{" + Number(font * 1.25m) + "}\\selectfont\n" +
                preview + "\n\\end{minipage}\n\\end{document}\n", new UTF8Encoding(false));
            Run(latex, "-interaction=nonstopmode -halt-on-error -no-shell-escape paragraph.tex", folder, "paragraph-latex.log", cancellation);
            cancellation.ThrowIfCancellationRequested();
            data.Append("]};\n");
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("L2A.EditableParagraph.jsx"))
            using (var reader = new StreamReader(stream)) data.Append(reader.ReadToEnd());
            File.WriteAllText(Path.Combine(folder, "insert.jsx"), data.ToString(), new UTF8Encoding(false));
            return folder;
        }
        public static string CreateFormulaNote(string formulaCode, byte[] pdfBytes)
        {
            var xml = new XmlDocument();
            var root = xml.CreateElement("LaTeX2AI_item");
            xml.AppendChild(root);
            root.SetAttribute("placed_option", "keep_scale");
            root.SetAttribute("text_align_horizontal", "left");
            root.SetAttribute("text_align_vertical", "top");
            var latex = xml.CreateElement("latex");
            latex.SetAttribute("cursor_position", "0");
            latex.InnerText = formulaCode;
            root.AppendChild(latex);
            string encoded = Convert.ToBase64String(pdfBytes);
            var pdf = xml.CreateElement("pdf_file_contents");
            pdf.SetAttribute("hash", NativeHash(encoded));
            pdf.InnerText = encoded;
            root.AppendChild(pdf);
            return xml.OuterXml;
        }
        public static string NativeHash(string encoded)
        {
            // std::hash<std::string> in the pinned Windows x64 MSVC v0.0.10 build.
            // Its input is ASCII base64, not PDF bytes or UTF-16 code units.
            ulong hash = 14695981039346656037UL;
            unchecked { foreach (char c in encoded) hash = (hash ^ (byte)c) * 1099511628211UL; }
            return hash.ToString("x", CultureInfo.InvariantCulture);
        }
        private static decimal Dimension(string text) {
            return Decimal.Parse(text.Trim().Replace("pt", ""), CultureInfo.InvariantCulture) * 72m / 72.27m;
        }
        private static void Run(string executable, string arguments, string folder, string log, CancellationToken cancellation)
        {
            var start = new ProcessStartInfo(executable, arguments) { WorkingDirectory = folder, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            var output = new StringBuilder();
            using (var p = new Process { StartInfo = start }) {
                p.OutputDataReceived += (s, e) => { if (e.Data != null) lock (output) output.AppendLine(e.Data); };
                p.ErrorDataReceived += (s, e) => { if (e.Data != null) lock (output) output.AppendLine(e.Data); };
                cancellation.ThrowIfCancellationRequested();
                p.Start(); p.BeginOutputReadLine(); p.BeginErrorReadLine();
                var watch = Stopwatch.StartNew();
                while (!p.WaitForExit(100)) {
                    if (cancellation.IsCancellationRequested || watch.ElapsedMilliseconds >= 90000) {
                        try { p.Kill(); } catch (InvalidOperationException) { }
                        cancellation.ThrowIfCancellationRequested();
                        throw new FormatException("Formula compilation timed out. Check the LaTeX installation.");
                    }
                }
                p.WaitForExit();
                File.WriteAllText(Path.Combine(folder, log), output.ToString());
                cancellation.ThrowIfCancellationRequested();
                if (p.ExitCode != 0) throw new FormatException("Formula compilation failed. Check the formula syntax. Details: " + Path.Combine(folder, log));
            }
        }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct StartupInfo
        {
            public int cb; public string reserved, desktop, title;
            public int x, y, width, height, xChars, yChars, fill, flags;
            public short show, reservedBytes; public IntPtr reservedPointer, stdin, stdout, stderr;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct ProcessInfo { public IntPtr process, thread; public int processId, threadId; }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CreateProcess(string application, StringBuilder command, IntPtr processSecurity,
            IntPtr threadSecurity, bool inheritHandles, uint flags, IntPtr environment, string directory,
            ref StartupInfo startup, out ProcessInfo process);
        [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
        public static void Launch(string folder)
        {
            // Never inherit the native plugin's stdout pipe: Illustrator reads that
            // pipe to EOF after the form exits, before it can service a COM request.
            var command = new StringBuilder("\"" + Application.ExecutablePath + "\" --editable-job \"" + folder + "\" " + Process.GetCurrentProcess().Id);
            var startup = new StartupInfo(); startup.cb = Marshal.SizeOf(startup);
            ProcessInfo process;
            if (!CreateProcess(Application.ExecutablePath, command, IntPtr.Zero, IntPtr.Zero, false,
                0x08000000, IntPtr.Zero, null, ref startup, out process))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            CloseHandle(process.process); CloseHandle(process.thread);
        }
        public static void Worker(string folder, int parentId)
        {
            try {
                try { using (var parent = Process.GetProcessById(parentId)) if (!parent.WaitForExit(120000)) return; }
                catch (ArgumentException) { }
                string script = File.ReadAllText(Path.Combine(folder, "insert.jsx"));
                var end = DateTime.UtcNow.AddMinutes(2);
                while (DateTime.UtcNow < end) {
                    object app = null;
                    try {
                        app = Marshal.GetActiveObject("Illustrator.Application");
                        string result = Convert.ToString(app.GetType().InvokeMember("DoJavaScript", BindingFlags.InvokeMethod, null, app, new object[] { script }));
                        if (result == "WAIT") { Thread.Sleep(500); continue; }
                        File.WriteAllText(Path.Combine(folder, "result.txt"), result);
                        if (!result.StartsWith("OK:", StringComparison.Ordinal)) throw new InvalidOperationException(result);
                        return;
                    }
                    catch (COMException error) {
                        if (error.ErrorCode != unchecked((int)0x80010001) && error.ErrorCode != unchecked((int)0x8001010A)) throw;
                    }
                    catch (TargetInvocationException error) {
                        var com = error.InnerException as COMException;
                        if (com == null || (com.ErrorCode != unchecked((int)0x80010001) && com.ErrorCode != unchecked((int)0x8001010A))) throw;
                    }
                    finally { if (app != null && Marshal.IsComObject(app)) Marshal.ReleaseComObject(app); }
                    Thread.Sleep(500);
                }
                throw new TimeoutException("Illustrator did not create the paragraph placeholder. Check any native plugin error or cancellation.");
            }
            catch (Exception error) {
                File.WriteAllText(Path.Combine(folder, "error.txt"), error.ToString());
                MessageBox.Show("Could not finish the editable paragraph. Any existing placeholder was left unchanged. Your pasted source is saved in source.txt.\n\n" + error.Message + "\n\nDetails: " + folder, "LaTeX2AI editable paragraph", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }
}
