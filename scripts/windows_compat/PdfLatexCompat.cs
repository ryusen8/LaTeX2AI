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

// MIT License. Compatibility adapter for LaTeX2AI v0.0.10 on Chinese Windows.
// Only the version probe is converted to ASCII. Compilation uses real MiKTeX.
using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;

internal static class PdfLatexCompat
{
    private static string Quote(string value)
    {
        var result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value)
        {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') result.Append('\\', slashes * 2 + 1);
            else result.Append('\\', slashes);
            result.Append(c);
            slashes = 0;
        }
        result.Append('\\', slashes * 2);
        return result.Append('"').ToString();
    }

    public static int Main(string[] args)
    {
        try
        {
            string executable = Path.Combine(Environment.GetFolderPath(
                Environment.SpecialFolder.LocalApplicationData),
                @"Programs\MiKTeX\miktex\bin\x64\pdflatex.exe");
            bool probe = args.Length == 1 && (args[0] == "-version" ||
                args[0] == "--version" || args[0] == "-v");
            var start = new ProcessStartInfo(executable,
                String.Join(" ", Array.ConvertAll(args, Quote)));
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.WorkingDirectory = Environment.CurrentDirectory;
            if (probe)
            {
                start.RedirectStandardOutput = true;
                start.RedirectStandardError = true;
                start.StandardOutputEncoding = Encoding.UTF8;
                start.StandardErrorEncoding = Encoding.UTF8;
            }
            using (var process = Process.Start(start))
            {
                if (probe)
                {
                    Task<string> stdout = process.StandardOutput.ReadToEndAsync();
                    Task<string> stderr = process.StandardError.ReadToEndAsync();
                    process.WaitForExit();
                    string output = stdout.Result + stderr.Result;
                    // Keep the legacy plugin's small output pipe from filling.
                    if (output.Length > 3500) output = output.Substring(0, 3500);
                    Console.OutputEncoding = Encoding.ASCII;
                    Console.Write(Encoding.ASCII.GetString(Encoding.ASCII.GetBytes(output)));
                }
                else process.WaitForExit();
                return process.ExitCode;
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("MiKTeX compatibility adapter failed: " + error.GetType().Name);
            return 1;
        }
    }
}
