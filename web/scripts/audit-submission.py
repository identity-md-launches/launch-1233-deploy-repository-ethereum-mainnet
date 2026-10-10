"""Read-only path/export check plus a small report; never changes Git configuration."""
from pathlib import Path
import datetime
import json
import re
import subprocess

root = Path(__file__).resolve().parents[2]
report_path = root / 'docs/website/submission-audit.json'
limit = 8388608

def git(*args):
    return subprocess.check_output(['git', *args], cwd=root)

files = set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').decode().split('\0')) - {''}
files = sorted(f for f in files if (root/f).is_file() and not f.startswith(('.imd/', 'test/scratch/', 'artifacts/')))
for name in files:
    parts = Path(name).parts
    assert not any(p in ('node_modules', '.npm', '.cache', '.playwright-mcp') for p in parts), name
    assert not name.endswith(('.tgz', '.tar.gz')), name
changes = git('diff', '--name-only', '-z').decode().split('\0')
blocked_exact = {'foundry.toml','foundry.lock','remappings.txt','.gitmodules','package.json','package-lock.json','.gitignore'}
for name in filter(None, changes):
    assert name not in blocked_exact and not name.startswith(('src/','lib/','.github/','.git/')), name
    assert not any(p == '.env' or p.startswith('.env.') for p in Path(name).parts), name
assert not any(line.startswith('160000 ') for line in git('ls-files', '--stage').decode().splitlines())

dist = root/'dist'
for url in re.findall(r'(?:src|href)="([^"]+)"', (dist/'index.html').read_text()):
    assert url.startswith('./') and (dist/url).is_file(), url
for sheet in (dist/'assets').glob('*.css'):
    for url in re.findall(r'url\(([^)]+)\)', sheet.read_text()):
        url = url.strip('\"\'')
        if url.startswith('data:'): continue
        assert not url.startswith(('/', 'http')) and (sheet.parent/url).is_file(), url
export_files = [p for p in dist.rglob('*') if p.is_file()]
report = {
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'method': 'Conservative sum of all current Git-eligible tracked and new regular files, including the original project; no Git internals modified.',
    'limitBytes': limit,
    'excludedInputsOrTransient': ['.git/', '.imd/', 'test/scratch/', 'artifacts/ delivery copies'],
    'protectedTrackedPathsUnchanged': True,
    'gitSubmodules': 0,
    'generatedDependenciesInSubmission': 0,
    'htmlAndCssAssetUrlsRelativeAndPresent': True,
    'exportFileCount': len(export_files),
    'exportBytes': sum(p.stat().st_size for p in export_files),
    'submissionFileCount': 0,
    'submissionUncompressedBytes': 0,
    'remainingBudgetBytes': 0,
    'files': files,
}
report_name = report_path.relative_to(root).as_posix()
if report_name not in files: files.append(report_name); files.sort()
report['submissionFileCount'] = len(files)
for _ in range(10):
    report_path.write_text(json.dumps(report, indent=2)+'\n')
    size = sum((root/f).stat().st_size for f in files)
    if size == report['submissionUncompressedBytes']: break
    report['submissionUncompressedBytes'] = size
    report['remainingBudgetBytes'] = limit-size
assert report['submissionUncompressedBytes'] <= limit
print(json.dumps({k:v for k,v in report.items() if k != 'files'}, indent=2))
