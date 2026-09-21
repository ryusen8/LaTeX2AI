"""Apply runtime fixes to the exact v0.0.10 Illustrator 2022 Windows release.

Usage: python patch_runtime.py ORIGINAL.aip OUTPUT.aip [--latex-dir DIRECTORY]
Always use the unmodified upstream release as input. See doc/WINDOWS_COMPATIBILITY.md.
SPDX-License-Identifier: MIT
"""
import hashlib
import argparse
from pathlib import Path
import struct

from patch_no_update import ORIGINAL_SHA256


def relative_branch(opcode, source_rva, target_rva):
    return bytes([opcode]) + struct.pack('<i', target_rva - source_rva - 5)


# The verified release maps .text RVAs to file offsets by subtracting 0xC00.
# Keep all code edits the same size; optional fallback data gets its own section.
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
    # Global destructor: rcx still holds `this` after the unchanged prologue.
    # Replace the redundant reload of rcx with a setup-state check. On failure,
    # skip serialization and its temporary's destruction, but keep every member
    # destructor. No stack/prologue/unwind changes or new executable code.
    (0x40652, bytes.fromhex('c644242001488d542428488b4c2450'),
     bytes.fromhex('8039007432c644242001488d542428')),
)

FALLBACK_LEA_RVA = 0x44189
FALLBACK_LEA_ORIGINAL = bytes.fromhex('488d15404e1a00')


def add_compiler_fallback(result, latex_directory):
    """Register an installation-specific fallback; keep all native validation.

    A read-only data section avoids reusing padding or overwriting live strings.
    The instruction still constructs the same UnicodeString/FilePath objects.
    Only its constant changes from the empty string to the verified directory.
    """
    directory = str(latex_directory).rstrip('\\/')
    if not directory or not Path(directory).is_absolute():
        raise ValueError('The compiler directory must be absolute.')
    try:
        payload = directory.encode('ascii') + b'\0'
    except UnicodeEncodeError:
        raise ValueError('This legacy runtime fallback requires an ASCII compiler directory.') from None
    if len(payload) > 240 or any(c in directory for c in '"\r\n\0'):
        raise ValueError('Unsupported compiler directory.')
    if not (Path(directory) / 'pdflatex.exe').is_file():
        raise ValueError('The fallback directory must contain pdflatex.exe.')
    nt = struct.unpack_from('<I', result, 0x3c)[0]
    sections = struct.unpack_from('<H', result, nt + 6)[0]
    optional_size = struct.unpack_from('<H', result, nt + 20)[0]
    optional = nt + 24
    table = optional + optional_size
    section_alignment, file_alignment = struct.unpack_from('<II', result, optional + 32)
    headers = struct.unpack_from('<I', result, optional + 60)[0]
    slot = table + sections * 40
    if slot + 40 > headers or any(result[slot:slot + 40]):
        raise ValueError('No empty PE section-header slot.')
    align = lambda n, a: (n + a - 1) // a * a
    virtual_end = raw_end = 0
    for index in range(sections):
        size, rva, raw_size, raw = struct.unpack_from('<IIII', result, table + index * 40 + 8)
        virtual_end = max(virtual_end, rva + max(size, raw_size))
        raw_end = max(raw_end, raw + raw_size)
    if raw_end != len(result):
        raise ValueError('Unexpected PE overlay; no fallback added.')
    data_rva, data_raw = align(virtual_end, section_alignment), align(raw_end, file_alignment)
    data_size = align(len(payload), file_alignment)
    result.extend(b'\0' * (data_raw + data_size - len(result)))
    result[data_raw:data_raw + len(payload)] = payload
    struct.pack_into('<8sIIIIIIHHI', result, slot, b'.l2acfg\0', len(payload), data_rva,
                     data_size, data_raw, 0, 0, 0, 0, 0x40000040)
    struct.pack_into('<H', result, nt + 6, sections + 1)
    initialized = struct.unpack_from('<I', result, optional + 8)[0]
    struct.pack_into('<I', result, optional + 8, initialized + data_size)
    struct.pack_into('<I', result, optional + 56, align(data_rva + len(payload), section_alignment))
    struct.pack_into('<I', result, optional + 64, 0)  # optional user-mode image checksum
    offset = FALLBACK_LEA_RVA - 0xc00
    if result[offset:offset + 7] != FALLBACK_LEA_ORIGINAL:
        raise ValueError('Unexpected startup fallback instruction.')
    result[offset:offset + 7] = b'\x48\x8d\x15' + struct.pack('<i', data_rva - (FALLBACK_LEA_RVA + 7))


def patched_bytes(original, latex_directory=None):
    if hashlib.sha256(original).hexdigest() != ORIGINAL_SHA256:
        raise ValueError('Unrecognized plugin build; no patch applied.')
    result = bytearray(original)
    for rva, before, after in PATCHES:
        offset = rva - 0xC00
        if len(before) != len(after) or original[offset:offset + len(before)] != before:
            raise ValueError('Unexpected instructions at RVA 0x%x; no patch applied.' % rva)
        result[offset:offset + len(before)] = after
    if latex_directory is not None:
        add_compiler_fallback(result, latex_directory)
    return bytes(result)


def patch(source, destination, latex_directory=None):
    if source.resolve() == destination.resolve():
        raise ValueError('Use a separate output file; preserve the original.')
    result = patched_bytes(source.read_bytes(), latex_directory)
    destination.write_bytes(result)
    print('Patched SHA-256:', hashlib.sha256(result).hexdigest())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--latex-dir', type=Path, help='Verified local compiler directory used if saved settings fail')
    args = parser.parse_args()
    patch(args.source, args.destination, args.latex_dir)
