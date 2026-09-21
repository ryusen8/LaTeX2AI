# -*- coding: utf-8 -*-
# -----------------------------------------------------------------------------
# MIT License
#
# Copyright (c) 2020 Ivo Steinbrecher
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
# -----------------------------------------------------------------------------

"""Integration checks for the installed MiKTeX compatibility adapter."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

PROGRAMS = Path(os.environ['LOCALAPPDATA']) / 'Programs'
REAL = PROGRAMS / 'MiKTeX/miktex/bin/x64/pdflatex.exe'
COMPAT = PROGRAMS / 'LaTeX2AI-Compat/pdflatex.exe'


class CompatibilityTests(unittest.TestCase):
    def test_real_version_reproduces_chinese_windows_encoding_failure(self):
        result = subprocess.run([REAL, '-version'], capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0)
        data = result.stdout + result.stderr
        self.assertIn('pdfTeX', data.decode('utf-8'))
        with self.assertRaises(UnicodeDecodeError):
            data.decode('gbk')

    def test_compatible_version_passes_legacy_detection(self):
        result = subprocess.run([COMPAT, '-version'], capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0)
        data = result.stdout + result.stderr
        self.assertIn('pdfTeX', data.decode('gbk'))
        self.assertTrue(data.isascii())

    def test_real_formula_compilation_with_spaces(self):
        with tempfile.TemporaryDirectory(prefix='latex2ai test ') as folder:
            source = Path(folder) / 'formula with spaces.tex'
            source.write_text(r'\documentclass{article}\begin{document}$E=mc^2$\end{document}')
            result = subprocess.run([COMPAT, '-interaction=nonstopmode', '-halt-on-error',
                                     str(source)], cwd=folder, capture_output=True, timeout=60)
            self.assertEqual(result.returncode, 0)
            pdf = source.with_suffix('.pdf')
            self.assertTrue(pdf.read_bytes().startswith(b'%PDF-'))
            self.assertIn('Output written on', source.with_suffix('.log').read_text())

    def test_compilation_failure_is_not_reported_as_success(self):
        with tempfile.TemporaryDirectory(prefix='latex2ai invalid ') as folder:
            source = Path(folder) / 'invalid.tex'
            source.write_text(r'\documentclass{article}\begin{document}\UndefinedCommandXYZ\end{document}')
            result = subprocess.run([COMPAT, '-interaction=nonstopmode', '-halt-on-error',
                                     str(source)], cwd=folder, capture_output=True, timeout=60)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(source.with_suffix('.pdf').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
