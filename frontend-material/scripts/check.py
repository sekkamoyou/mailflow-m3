#!/usr/bin/env python3
"""Run one local check with a deadline and a process-tree RSS ceiling (macOS/Linux)."""
import argparse
import os
import resource
import signal
import subprocess
import time
from pathlib import Path


def tree_rss(rows, root):
    members = {root}
    while True:
        children = {pid for pid, parent, _ in rows if parent in members}
        if children <= members:
            return sum(rss for pid, _, rss in rows if pid in members)
        members |= children


def run(command, log, seconds, rss_mib):
    def no_core():
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

    Path(log).parent.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'}
    peak = 0
    started = time.monotonic()
    with open(log, 'w') as output:
        child = subprocess.Popen(command, stdout=output, stderr=subprocess.STDOUT,
                                 env=env, start_new_session=True, preexec_fn=no_core)
        reason = None
        try:
            while child.poll() is None:
                rows = [tuple(map(int, line.split())) for line in
                        subprocess.check_output(['ps', '-axo', 'pid=,ppid=,rss='], text=True).splitlines()]
                peak = max(peak, tree_rss(rows, child.pid))
                if peak > rss_mib * 1024:
                    reason = 'RSS ceiling exceeded'
                    break
                if time.monotonic() - started > seconds:
                    reason = 'deadline exceeded'
                    break
                time.sleep(.05)
        finally:
            # Terminate the whole check, including grandchildren left by a failed runner.
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()
    code = 124 if reason else child.returncode
    print(f'exit={code} peak_RSS={peak / 1024:.1f}MiB elapsed={time.monotonic()-started:.1f}s'
          f' reason={reason or "completed"} log={log}', flush=True)
    return code


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seconds', type=int, default=60)
    parser.add_argument('--rss-mib', type=int, default=768)
    parser.add_argument('--log', required=True)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command:
        parser.error('a command is required after --')
    raise SystemExit(run(command, args.log, args.seconds, args.rss_mib))
