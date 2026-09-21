"""Apply runtime fixes to the exact v0.0.10 Illustrator 2022 Windows release.

Usage: python patch_runtime.py ORIGINAL.aip OUTPUT.aip
Always use the unmodified upstream release as input. See doc/WINDOWS_COMPATIBILITY.md.
SPDX-License-Identifier: MIT
"""
import hashlib
from pathlib import Path
import struct
import sys

from patch_no_update import ORIGINAL_SHA256


def relative_branch(opcode, source_rva, target_rva):
    return bytes([opcode]) + struct.pack('<i', target_rva - source_rva - 5)


# The verified release maps .text RVAs to file offsets by subtracting 0xC00.
# Keep all changes the same size: section layout and exception tables stay intact.
PATCHES = (
    # CheckGithubVersion: return before allocating a stack frame.
    (0x62AC0, bytes.fromhex('48'), bytes.fromhex('c3')),
    # ExecuteCommandLineNoErrors: redirect only the output-decoding constructor.
    (0xCE8DC, bytes.fromhex('e8fbdbf3ff'), relative_branch(0xE8, 0xCE8DC, 0xCE961)),
    # Eleven bytes of INT3 alignment outside all RUNTIME_FUNCTION ranges.
    # Leaf thunk: r8d = kAIUTF8CharacterEncoding (1), then tail-call the existing
    # UnicodeString(std::string const&, AICharacterEncoding) constructor.
    # No stack changes, nonvolatile-register changes, or extra unwind entry.
    (0xCE961, b'\xcc' * 11,
     bytes.fromhex('41b801000000') + relative_branch(0xE9, 0xCE967, 0xA3110)),
    # GetDocumentPath: for a nonexistent/unsaved document when failure is optional,
    # jump to the existing return path, BEFORE constructing path-check temporaries.
    # Saved files still undergo the original character check; required unsaved
    # documents still raise the existing "document is not saved" warning.
    (0xCF375, bytes.fromhex('7465'), bytes.fromhex('7460')),
)


def patched_bytes(original):
    if hashlib.sha256(original).hexdigest() != ORIGINAL_SHA256:
        raise ValueError('Unrecognized plugin build; no patch applied.')
    result = bytearray(original)
    for rva, before, after in PATCHES:
        offset = rva - 0xC00
        if len(before) != len(after) or original[offset:offset + len(before)] != before:
            raise ValueError('Unexpected instructions at RVA 0x%x; no patch applied.' % rva)
        result[offset:offset + len(before)] = after
    return bytes(result)


def patch(source, destination):
    if source.resolve() == destination.resolve():
        raise ValueError('Use a separate output file; preserve the original.')
    result = patched_bytes(source.read_bytes())
    destination.write_bytes(result)
    print('Patched SHA-256:', hashlib.sha256(result).hexdigest())


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    patch(Path(sys.argv[1]), Path(sys.argv[2]))
