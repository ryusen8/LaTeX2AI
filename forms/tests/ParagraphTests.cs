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
using System.Globalization;
using System.IO;
using System.Text;
using L2A.UTIL;

internal static class ParagraphTests
{
    private static int assertions;
    private static void Check(bool value, string message)
    {
        assertions++;
        if (!value) throw new Exception(message);
    }
    private static void Invalid(string text)
    {
        try { Paragraph.Encode(text, 90, 11); }
        catch (FormatException) { assertions++; return; }
        throw new Exception("Invalid input accepted: " + text);
    }
    public static int Main(string[] args)
    {
        try
        {
            string mixed = "The energy $E=mc^2$ increases by 5% & the label is sample_1.\r\n" +
                "A wrapped line continues here.\r\n\r\n" +
                "The independent result is $$a^2+b^2=c^2.$$\r\n" +
                "We also accept \\(x_i\\) and \\[\\sum_{i=1}^{n}x_i=0.\\]";
            string encoded = Paragraph.Encode(mixed, 85.5m, 12);
            Check(encoded.Contains(@"\begin{minipage}[t]{85.5mm}"), "Width was not applied");
            Check(encoded.Contains(@"\fontsize{12}{15.00}"), "Font size/leading was not applied");
            Check(encoded.Contains(@"5\% \&"), "Plain-text reserved characters must be escaped");
            Check(encoded.Contains(@"sample\_1"), "Underscores in prose must be literal");
            Check(encoded.Contains("\\par\n"), "Blank lines must preserve paragraph breaks");
            Check(encoded.Contains("A wrapped line continues here."), "Text was lost");
            string source; decimal width, font;
            Check(Paragraph.TryDecode(encoded, out source, out width, out font) && source == mixed && width == 85.5m && font == 12,
                "Editing must recover the exact pasted text and layout");
            Check(Paragraph.TryDecode(encoded.Replace("\n", "\r\n"), out source, out width, out font), "Windows line endings must round-trip");
            Check(!Paragraph.TryDecode(encoded + "manual edit", out source, out width, out font), "Manual edits must not be discarded");
            Check(!Paragraph.TryDecode("$x$", out source, out width, out font), "Old raw formulas must remain raw");
            Check(!Paragraph.TryDecode("%L2A-PARAGRAPH-V1:90:11:???\n", out source, out width, out font), "Malformed metadata must remain raw");
            Check(Paragraph.ConvertBody(@"Price \$5; C:\tmp; {x} ~ ^ #").Contains(@"Price \$5; C:\textbackslash{}tmp; \{x\} \textasciitilde{} \textasciicircum{} \#"), "Literal characters changed");
            Check(Paragraph.ConvertBody("x\ny\n \nz") == "x y\n\\par\nz", "Line joining/blank-line handling failed");
            Check(Paragraph.ConvertBody("$x% ignore $\n+y$").Contains("% ignore $\n+y"), "Math comments/delimiters changed");
            Check(Paragraph.ConvertBody(@"$a+\$b$").Contains(@"a+\$b"), "Escaped dollar closed math");
            Invalid("missing $x"); Invalid(@"missing \[x"); Invalid("bad $x$$"); Invalid(@"unexpected \)"); Invalid("$$$$"); Invalid("   ");
            Check(Paragraph.TryDecode((encoded + "\n%L2A-EDITABLE-JOB:abc\n").Replace("\n", "\r\n"), out source, out width, out font) && source == mixed,
                "Native XML CRLF plus worker marker must reopen as a paragraph");
            var segments = Paragraph.Parse("Cost \\$5 & sample_1. $x_i$\n\nResult \\[a=b\\]");
            Check(segments.Count == 5 && segments[0].Text == "Cost $5 & sample_1. " && segments[1].Kind == "math" && segments[1].Text == "x_i" && segments[2].Kind == "break" && segments[4].Kind == "display", "Editable mode must separate literal prose and formulas");
            Check(Paragraph.Parse("$x% $ in comment\n+y$")[0].Text == "x% $ in comment\n+y", "Editable mode must share math comment parsing");
            var oldCulture = CultureInfo.CurrentCulture;
            System.Threading.Thread.CurrentThread.CurrentCulture = CultureInfo.GetCultureInfo("de-DE");
            Check(Paragraph.Encode("Hello $x$", 85.5m, 11.5m).Contains("{85.5mm}"), "Locale produced a comma in a TeX dimension");
            System.Threading.Thread.CurrentThread.CurrentCulture = oldCulture;
            if (args.Length == 1)
            {
                Directory.CreateDirectory(args[0]);
                File.WriteAllText(Path.Combine(args[0], "mixed.txt"), encoded, new UTF8Encoding(false));
                File.WriteAllText(Path.Combine(args[0], "typography.txt"), Paragraph.Encode("The model’s “energy” grows by 5%—not 10%. Use \\$5 & sample_1.\n\nThe result \\(E=mc^2\\) holds; see $$\\begin{aligned}a&=b+c\\\\d&=e+f\\end{aligned}$$", 90, 11), new UTF8Encoding(false));
                File.WriteAllText(Path.Combine(args[0], "wide.txt"), Paragraph.Encode(mixed, 140, 12), new UTF8Encoding(false));
            }
            Console.WriteLine("PASS: " + assertions + " paragraph assertions");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
