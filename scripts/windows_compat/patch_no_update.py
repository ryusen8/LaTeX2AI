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

"""Disable only CheckGithubVersion in the verified v0.0.10 Illustrator 2022 build.

Usage: python patch_no_update.py ORIGINAL.aip OUTPUT.aip
The input SHA-256 and original function prologue must both match.
"""
import hashlib
from pathlib import Path
import sys

ORIGINAL_SHA256 = '2172aa71412e492770ad31ab4975a416c2d608525407f9977a04036b766f1e1d'
OFFSET = 0x61EC0
PROLOGUE = bytes.fromhex('4881ec98030000')


def patch(source, destination):
    if source.resolve() == destination.resolve():
        raise ValueError('Use a separate output file; preserve the original.')
    original = source.read_bytes()
    if hashlib.sha256(original).hexdigest() != ORIGINAL_SHA256:
        raise ValueError('Unrecognized plugin build; no patch applied.')
    if original[OFFSET:OFFSET + len(PROLOGUE)] != PROLOGUE:
        raise ValueError('Unexpected function prologue; no patch applied.')
    result = bytearray(original)
    # x64 RET before the function allocates its stack frame. The function is void.
    result[OFFSET] = 0xC3
    assert sum(a != b for a, b in zip(original, result)) == 1
    destination.write_bytes(result)
    print('Patched SHA-256:', hashlib.sha256(result).hexdigest())


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    patch(Path(sys.argv[1]), Path(sys.argv[2]))
