"""Build the headless mGBA library used by the upstream ROM extraction scripts on Linux."""
import json
import os
from pathlib import Path
import shlex
import subprocess

ROOT = Path(__file__).resolve().parents[1] / 'upstream/buus-fury'
MGBA = ROOT / 'tools/mgba'
REVISION = '9fcaa882f25de40258f9578480854e590db12699'
BUILD = ROOT / 'work/mgba-linux'


def run(*args):
    subprocess.run(args, check=True)


def main():
    if not MGBA.exists():
        run('git', 'init', '-q', MGBA)
        run('git', '-C', MGBA, 'fetch', '--depth=1', 'https://github.com/mgba-emu/mgba.git', REVISION)
        run('git', '-C', MGBA, 'checkout', '--detach', 'FETCH_HEAD')
    if subprocess.check_output(['git', '-C', MGBA, 'rev-parse', 'HEAD'], text=True).strip() != REVISION:
        raise SystemExit(f'Expected mGBA {REVISION} in {MGBA}')
    run('cmake', '-S', MGBA, '-B', BUILD, '-G', 'Ninja', '-DCMAKE_POLICY_VERSION_MINIMUM=3.5',
        '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON', '-DBUILD_QT=OFF',
        '-DBUILD_SDL=OFF', '-DBUILD_GL=OFF', '-DBUILD_GLES2=OFF', '-DBUILD_GLES3=OFF',
        '-DUSE_FFMPEG=OFF', '-DUSE_LUA=OFF', '-DUSE_ELF=OFF', '-DM_CORE_GB=OFF',
        '-DBUILD_SHARED=ON', '-DBUILD_STATIC=OFF', '-DENABLE_DEBUGGERS=ON')
    run('cmake', '--build', BUILD, '--target', 'mgba', '-j4')
    commands = json.loads((BUILD/'compile_commands.json').read_text())
    core = next(cmd for cmd in commands if cmd['file'].endswith('/gba/core.c'))
    compiler, *flags = shlex.split(core['command'])
    # Core structures used by the shim change layout with the mGBA feature flags.
    abi = [flag for flag in flags if flag.startswith(('-D', '-I'))]
    output = ROOT/'tools/emu/libemu.dylib'  # Name expected by upstream ctypes on every OS.
    temporary = output.with_suffix(f'.{os.getpid()}.tmp')
    try:
        run(compiler, *abi, '-shared', '-fPIC', '-O2', '-Wl,-z,defs', ROOT/'tools/emu/shim.c',
            '-L', BUILD, '-lmgba', '-Wl,-rpath,$ORIGIN/../../work/mgba-linux', '-o', temporary)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
