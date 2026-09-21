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
using System.Collections.Generic;
using System.Text;

namespace L2A.UTIL
{
    /// <summary>Plain English prose with explicitly delimited LaTeX math.</summary>
    public static class Paragraph
    {
        private const string Marker = "%L2A-PARAGRAPH-V1:";

        public static string Encode(string text, decimal widthMm, decimal fontPt)
        {
            if (widthMm < 10 || widthMm > 400 || fontPt < 6 || fontPt > 72)
                throw new FormatException("Use a width of 10-400 mm and a font size of 6-72 pt.");
            if (String.IsNullOrWhiteSpace(text)) throw new FormatException("Paste a paragraph first.");
            string body = ConvertBody(text);
            // Preserve the original input inside the existing native latex property, so
            // save/reopen, edit, redo and duplicate need no new Illustrator SDK fields.
            string metadata = Marker + widthMm.ToString(CultureInfo.InvariantCulture) + ":" +
                fontPt.ToString(CultureInfo.InvariantCulture) + ":" + Convert.ToBase64String(Encoding.UTF8.GetBytes(text));
            return metadata + "\n\\begin{minipage}[t]{" + widthMm.ToString(CultureInfo.InvariantCulture) + "mm}\n" +
                "\\raggedright\\setlength{\\parindent}{0pt}\\setlength{\\parskip}{0.5\\baselineskip}\n" +
                "\\fontsize{" + fontPt.ToString(CultureInfo.InvariantCulture) + "}{" +
                (fontPt * 1.25m).ToString(CultureInfo.InvariantCulture) + "}\\selectfont\n" +
                body + "\n\\end{minipage}";
        }

        public static bool TryDecode(string latex, out string text, out decimal widthMm, out decimal fontPt)
        {
            if (latex != null) {
                latex = latex.Replace("\r\n", "\n");
                int job = latex.LastIndexOf("\n%L2A-EDITABLE-JOB:", StringComparison.Ordinal);
                if (job >= 0) latex = latex.Substring(0, job);
            }
            text = latex; widthMm = 90; fontPt = 11;
            if (latex == null || !latex.StartsWith(Marker, StringComparison.Ordinal)) return false;
            int newline = latex.IndexOf('\n');
            if (newline < 0) return false;
            string[] fields = latex.Substring(Marker.Length, newline - Marker.Length).TrimEnd('\r').Split(':');
            decimal width, font;
            if (fields.Length != 3 ||
                !Decimal.TryParse(fields[0], NumberStyles.Number, CultureInfo.InvariantCulture, out width) ||
                !Decimal.TryParse(fields[1], NumberStyles.Number, CultureInfo.InvariantCulture, out font)) return false;
            try
            {
                string source = new UTF8Encoding(false, true).GetString(Convert.FromBase64String(fields[2]));
                // Do not silently discard edits made to the generated code in raw mode.
                string expected = Encode(source, width, font);
                if (expected != latex.Replace("\r\n", "\n")) return false;
                text = source; widthMm = width; fontPt = font;
                return true;
            }
            catch (FormatException) { return false; }
            catch (DecoderFallbackException) { return false; }
        }

        public static string ConvertBody(string source)
        {
            string text = source.Replace("\r\n", "\n").Replace('\r', '\n');
            var result = new StringBuilder();
            for (int i = 0; i < text.Length;)
            {
                char c = text[i];
                if (c == '$')
                {
                    bool display = i + 1 < text.Length && text[i + 1] == '$';
                    AppendMath(result, text, ref i, display ? "$$" : "$", display ? "$$" : "$", display);
                }
                else if (c == '\\' && i + 1 < text.Length && (text[i + 1] == '(' || text[i + 1] == '['))
                {
                    bool display = text[i + 1] == '[';
                    AppendMath(result, text, ref i, display ? @"\[" : @"\(", display ? @"\]" : @"\)", display);
                }
                else if (c == '\\' && i + 1 < text.Length && (text[i + 1] == ')' || text[i + 1] == ']'))
                    throw new FormatException("Closing math delimiter without an opening delimiter at character " + (i + 1) + ".");
                else if (c == '\\' && i + 1 < text.Length && "$%#&_{}\\".IndexOf(text[i + 1]) >= 0)
                {
                    AppendText(result, text[i + 1]); i += 2;
                }
                else if (c == '\n')
                {
                    int lines = 0;
                    while (i < text.Length && Char.IsWhiteSpace(text[i]))
                    {
                        if (text[i] == '\n') lines++;
                        i++;
                    }
                    result.Append(lines > 1 ? "\n\\par\n" : " ");
                }
                else { AppendText(result, c); i++; }
            }
            return result.ToString();
        }

        private static bool At(string text, int index, string token)
        {
            return index + token.Length <= text.Length && String.CompareOrdinal(text, index, token, 0, token.Length) == 0;
        }

        private static void AppendMath(StringBuilder result, string text, ref int index, string open, string close, bool display)
        {
            string math = ReadMath(text, ref index, open, close);
            result.Append(display ? "\\[\n" : "\\(").Append(math).Append(display ? "\n\\]" : "\n\\)");
        }

        private static string ReadMath(string text, ref int index, string open, string close)
        {
            int start = index, bodyStart = index + open.Length, end = bodyStart;
            bool comment = false;
            while (end < text.Length)
            {
                if (comment)
                {
                    if (text[end] == '\n') comment = false;
                    end++; continue;
                }
                if (At(text, end, close))
                {
                    if (close == "$" && At(text, end, "$$"))
                        throw new FormatException("Use matching $...$ or $$...$$ delimiters at character " + (end + 1) + ".");
                    string math = text.Substring(bodyStart, end - bodyStart);
                    if (String.IsNullOrWhiteSpace(math)) throw new FormatException("An empty formula was found at character " + (start + 1) + ".");
                    index = end + close.Length;
                    return math;
                }
                if (text[end] == '%') { comment = true; end++; }
                else if (text[end] == '\\' && end + 1 < text.Length) end += 2;
                else end++;
            }
            throw new FormatException("Missing closing " + close + " for the formula at character " + (start + 1) +
                ". For a literal dollar sign, write \\$.");
        }


        public class Segment
        {
            public string Kind, Text;
            public Segment(string kind, string text) { Kind = kind; Text = text; }
        }

        public static List<Segment> Parse(string source)
        {
            // Use the same validation and delimiter reader as the PDF paragraph mode.
            ConvertBody(source);
            string text = source.Replace("\r\n", "\n").Replace('\r', '\n');
            var segments = new List<Segment>();
            var prose = new StringBuilder();
            for (int i = 0; i < text.Length;)
            {
                bool dollar = text[i] == '$';
                bool slash = text[i] == '\\' && i + 1 < text.Length && (text[i + 1] == '(' || text[i + 1] == '[');
                if (dollar || slash)
                {
                    if (prose.Length > 0) { segments.Add(new Segment("text", prose.ToString())); prose.Length = 0; }
                    bool display = dollar ? At(text, i, "$$") : text[i + 1] == '[';
                    string open = dollar ? (display ? "$$" : "$") : (display ? @"\[" : @"\(");
                    string close = dollar ? open : (display ? @"\]" : @"\)");
                    segments.Add(new Segment(display ? "display" : "math", ReadMath(text, ref i, open, close)));
                }
                else if (text[i] == '\\' && i + 1 < text.Length && "$%#&_{}\\".IndexOf(text[i + 1]) >= 0)
                { prose.Append(text[i + 1]); i += 2; }
                else if (text[i] == '\n')
                {
                    int lines = 0;
                    while (i < text.Length && Char.IsWhiteSpace(text[i])) { if (text[i] == '\n') lines++; i++; }
                    if (lines > 1)
                    {
                        if (prose.Length > 0) { segments.Add(new Segment("text", prose.ToString())); prose.Length = 0; }
                        segments.Add(new Segment("break", ""));
                    }
                    else prose.Append(' ');
                }
                else { prose.Append(text[i] == '\t' ? ' ' : text[i]); i++; }
            }
            if (prose.Length > 0) segments.Add(new Segment("text", prose.ToString()));
            return segments;
        }

        private static void AppendText(StringBuilder result, char c)
        {
            switch (c)
            {
                case '\\': result.Append(@"\textbackslash{}"); break;
                case '$': case '%': case '&': case '#': case '_': case '{': case '}': result.Append('\\').Append(c); break;
                case '~': result.Append(@"\textasciitilde{}"); break;
                case '^': result.Append(@"\textasciicircum{}"); break;
                case '\t': result.Append(' '); break;
                case '\u2018': case '\u2019': result.Append('\''); break;
                case '\u201c': result.Append("``"); break;
                case '\u201d': result.Append("''"); break;
                case '\u2013': result.Append("--"); break;
                case '\u2014': result.Append("---"); break;
                case '\u2026': result.Append(@"\ldots{}"); break;
                case '\u00a0': result.Append('~'); break;
                default:
                    if (Char.IsControl(c)) throw new FormatException("Remove the control character U+" + ((int)c).ToString("X4") + ".");
                    // Keep Latin text, including accented letters, for inputenc.
                    if (c > '\u024f') throw new FormatException("Paragraph mode supports English/Latin text. Put mathematical symbols in $...$ using LaTeX commands.");
                    result.Append(c); break;
            }
        }
    }
}
