"""Verify the pinned runtime patch without Illustrator or third-party modules.

Usage: python test_runtime_patch.py ORIGINAL.aip
SPDX-License-Identifier: MIT
"""
import hashlib
from pathlib import Path
import struct
import sys
import tempfile

import patch_runtime as patch


def sections(data):
    nt = struct.unpack_from('<I', data, 0x3c)[0]
    count = struct.unpack_from('<H', data, nt + 6)[0]
    optional = nt + 24
    table = optional + struct.unpack_from('<H', data, nt + 20)[0]
    return optional, [struct.unpack_from('<8sIIIIIIHHI', data, table + 40*i) for i in range(count)]


def main(original):
    fixed = patch.patched_bytes(original)
    assert len(fixed) == len(original)
    allowed = {rva - 0xc00 + i for rva, before, after in patch.PATCHES for i in range(len(before))}
    assert all(i in allowed for i, pair in enumerate(zip(original, fixed)) if pair[0] != pair[1])
    # Unchanged destructor prologue and cleanup; the conditional jump skips both
    # the write and the string temporary, while preserving all member destructors.
    assert fixed[0x40640-0xc00:0x40652-0xc00] == original[0x40640-0xc00:0x40652-0xc00]
    assert fixed[0x40652-0xc00:0x40661-0xc00] == bytes.fromhex('8039007432c644242001488d542428')
    assert 0x40657 + fixed[0x40656-0xc00] == 0x40689
    assert fixed[0x40689-0xc00:0x40742-0xc00] == original[0x40689-0xc00:0x40742-0xc00]
    for invalid in (fixed, original[:100], original[:-1] + bytes([original[-1] ^ 1])):
        try: patch.patched_bytes(invalid)
        except ValueError: pass
        else: raise AssertionError('Unrecognized binary accepted')
    with tempfile.TemporaryDirectory(prefix='l2a-patch-') as temp:
        directory = Path(temp)
        (directory/'pdflatex.exe').write_bytes(b'MZ-test-fixture-not-executable')
        registered = patch.patched_bytes(original, directory)
        optional, old = sections(original)
        _, new = sections(registered)
        assert new[:-1] == old
        cfg = new[-1]
        assert cfg[0] == b'.l2acfg\0' and cfg[-1] == 0x40000040  # read-only, non-executable
        expected = str(directory).encode('ascii') + b'\0'
        assert registered[cfg[4]:cfg[4]+cfg[1]] == expected
        lea = patch.FALLBACK_LEA_RVA
        target = lea + 7 + struct.unpack_from('<i', registered, lea-0xc00+3)[0]
        assert target == cfg[2]
        assert struct.unpack_from('<I', registered, optional+56)[0] >= cfg[2]+cfg[1]
        for section in old:
            if section[0].startswith(b'.pdata'):
                assert registered[section[4]:section[4]+section[3]] == original[section[4]:section[4]+section[3]]
        path = directory/'original.aip'; path.write_bytes(original)
        try: patch.patch(path, path, directory)
        except ValueError: pass
        else: raise AssertionError('In-place modification accepted')
        assert path.read_bytes() == original
        for invalid in (directory/'missing', Path('relative-path')):
            try: patch.patched_bytes(original, invalid)
            except ValueError: pass
            else: raise AssertionError('Invalid compiler directory accepted')
    print('PASS exact binary, destructor guard/cleanup, read-only fallback, RIP target, unchanged unwind tables and rejection checks')
    print('Portable guard-only SHA256:', hashlib.sha256(fixed).hexdigest())


if __name__ == '__main__':
    main(Path(sys.argv[1]).read_bytes())
