#!/usr/bin/env python3
"""Publish small browser demos from a pinned cadence-demos commit.

The public demo repository remains the source. Read committed blobs only:
uncommitted experiments, checkpoints and README edits cannot enter the site.
The iframe documents receive website metadata, presentation copy and a shared
visual/touch adapter; original application scripts, audio, models, the emulator
and the game ROMs are unchanged. The arcade publishes only its runtime files, not
its parity fixtures, receipts, tools or emulator build directory.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

SITE = Path(__file__).resolve().parents[1]
COMMIT = "192a099bcab7df2b9fa3ed3c505fa9c87b410215"
REPOSITORY = "https://github.com/muellerberndt/cadence-demos"
ARCADE_RUNTIME = ('index.html', 'arcade.js', 'cadence.js', 'emulator.js', 'brain_worker.js', 'emulator_worker.js',
                  'roms/freeway.bin', 'roms/atlantis.bin')


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args])


def wrapper_metadata(content, demo):
    # These two original pages have one metadata tag per line. Their old social
    # cards and favicon must never reintroduce the retired website URLs/mark.
    text = content.decode()
    text = re.sub(r'^<(?:meta [^>]*(?:name="(?:theme-color|twitter:[^"]+)"|property="og:[^"]+")[^>]*|link rel="(?:icon|canonical)"[^>]*)>\s*\n', '', text, flags=re.M)
    if demo == 'amen':
        text = text.replace('Nothing here is recorded: the trained brain computes a track in your browser, from silence, while you watch it think. Then it plays.', 'The trained brain generates a new arrangement from silence, then a supplied instrument renders it for playback.')
        text = text.replace('<b>Still training</b><span>This brain is a work in progress. It is still learning from more tracks, and the dubs will get more varied as it does. Every checkpoint in the selector can be trained further.</span>', '<b>Classic brain</b><span>This archived record-memory checkpoint generates new arrangements in your browser. Its parameters stay fixed here; the visualization replays its generation trace.</span>')
        text = text.replace('Nothing is recorded. The page loads', 'Each arrangement is generated here. The page loads')
    metadata = (f'<meta name="robots" content="noindex">\n'
                f'<meta name="theme-color" content="#191d1c">\n'
                f'<link rel="canonical" href="https://floatingpragma.io/demos/{demo}/">\n'
                '<link rel="icon" href="/favicon.svg?v=6" type="image/svg+xml">\n'
                '<link rel="stylesheet" href="/assets/demo-runtime.css?v=4">\n'
                '<base target="_top">\n')
    # Last stylesheet wins over the archived application's own CSS.
    text = text.replace('<html lang="en">', f'<html lang="en" data-demo="{demo}">', 1)
    text = text.replace('</head>', metadata + '</head>', 1)
    text = text.replace('</body>', '<script src="/assets/demo-runtime.js?v=2"></script>\n</body>', 1)
    return text.encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SITE.parents[1] / 'cadence-demos')
    args = parser.parse_args()
    paths = git(args.source, 'ls-tree', '-r', '--name-only', COMMIT,
                'amen/web', 'patch-world/index.html', 'atari-arcade/web').decode().splitlines()
    expected = [p for p in paths if p != 'amen/web/card.png'
                and (not p.startswith('atari-arcade/web/') or p.removeprefix('atari-arcade/web/') in ARCADE_RUNTIME)]
    arcade = [p for p in expected if p.startswith('atari-arcade/web/')]
    if not expected or 'patch-world/index.html' not in expected or len(arcade) != len(ARCADE_RUNTIME):
        raise SystemExit('Pinned commit does not contain all three browser demos')
    output = SITE / 'demos/runtime'
    entries = []
    for path in expected:
        original = git(args.source, 'show', f'{COMMIT}:{path}')
        relative = path.replace('amen/web/', 'amen/', 1).replace('atari-arcade/web/', 'atari-arcade/', 1)
        content = wrapper_metadata(original, relative.split('/')[0]) if path.endswith('.html') else original
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
        entries.append({'source': path, 'path': relative,
                        'source_sha256': hashlib.sha256(original).hexdigest(),
                        'published_sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content)})
    manifest = {'repository': REPOSITORY, 'commit': COMMIT,
                'adaptation': 'HTML metadata, archive presentation copy, shared CSS and a separate touch/camera presentation adapter; original application scripts, model, audio, emulator and ROM bytes unchanged.',
                'files': entries}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Synced {len(entries)} files ({sum(f["bytes"] for f in entries):,} bytes) from {COMMIT}')


if __name__ == '__main__':
    main()
