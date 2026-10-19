#!/usr/bin/env python3
"""Static checks over the site's own code (not vendor/): run from the repo root, `python3 tools/audit/static.py`.
1. syntax (node --check), 2. a trailing // comment swallowing code (six statements were lost this way), 3. new THREE.*
objects made inside per-frame functions, 4. exports nothing else imports, 5. leftover console.log / debugger / TODO."""
import re, subprocess, collections
files = [f for f in subprocess.check_output(['git', 'ls-files', '*.js', '*.mjs', '*.html']).decode().split() if not f.startswith(('vendor/', 'tools/'))]
src = {f: open(f, encoding='utf8').read() for f in files}
bad = 0
def out(kind, msg):
    global bad; bad += 1; print(f'[{kind}] {msg}')

# 1. syntax
for f in files:
    if f.endswith('.js'):
        r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
        if r.returncode: out('syntax', f + ': ' + r.stderr.strip().splitlines()[-1])

# 2. code after a // comment on the same line (strings blanked first; prose that merely mentions code is a false positive)
code_after = re.compile(r';\s*(const |let |this\.|[A-Za-z_$][\w$.]*\s*\(|[A-Za-z_$][\w$.]*\s*=[^=>]|if\s*\(|return\b|\})')
for f in files:
    for i, l in enumerate(src[f].splitlines(), 1):
        s = re.sub(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|`(?:\\.|[^`\\])*`", '""', l)
        k = s.find('//')
        while k > 0 and s[k - 1] == ':': k = s.find('//', k + 2)   # a URL
        c = s[k + 2:].rstrip() if k >= 0 else ''
        # only where code comes first and the comment ends like a statement (a full-line comment swallows nothing)
        if k > 0 and s[:k].strip() and code_after.search(c) and c.endswith((';', '}', ')')): out('comment', f'{f}:{i}: {l.strip()[:160]}')

# 3. allocations in per-frame functions (a few a frame is fine; flag so new ones get a second look)
FRAME = {'hub/station.js': ['render', '_walkFrame', '_driveFrame', '_endDoors', '_copFrame', '_introFrame', '_head', '_trip', '_flyby', 'crewTags', 'copTag', 'listenerTag', 'driveButtons', 'boardRect', '_adapt'],
         'hub/crowd.js': ['update'], 'hub/scenery.js': ['updatePeople'], 'hub/city.js': ['updateCity'], 'hub/people.js': ['update', 'aim', 'hand', 'tip'],
         'hub/scenes.js': ['frame', 'after', 'update'], 'hub/eventride.js': ['update', 'render'], 'hub/biomes.js': ['update'],
         'hub/hub.js': ['loop', 'placeTags', 'placeCopTag', 'placeDrive', 'placeSound', 'syncScene', 'placeBillboard']}
for f, names in FRAME.items():
    s = src.get(f, '')
    for n in names:
        for m in re.finditer(r'\b' + re.escape(n) + r'\s*\([^)]*\)\s*\{|\b' + re.escape(n) + r'\s*[:=]\s*\([^)]*\)\s*=>\s*\{', s):
            i = j = m.end(); d = 1
            while d and j < len(s): d += {'{': 1, '}': -1}.get(s[j], 0); j += 1
            news = collections.Counter(re.findall(r'new THREE\.(\w+)', s[i:j]))
            if news: print(f'[per-frame] {f} {n}() line {s[:m.start()].count(chr(10)) + 1}: {dict(news)}')

# 4. exports nothing else uses
for f in files:
    if not f.endswith('.js'): continue
    for m in re.finditer(r'export (?:async )?(?:function\*? |const |let |class )(\w+)', src[f]):
        n = m.group(1)
        if not any(re.search(r'\b' + n + r'\b', s) for g, s in src.items() if g != f):
            if len(re.findall(r'\b' + n + r'\b', src[f])) == 1: out('unused', f'{f}: {n} is used nowhere')

# 5. debug leftovers
for f in files:
    for i, l in enumerate(src[f].splitlines(), 1):
        if re.search(r'console\.(log|debug)\(|\bdebugger\b|TODO|FIXME', l): out('debug', f'{f}:{i}: {l.strip()[:120]}')

print('static checks:', 'clean' if not bad else f'{bad} finding(s)', '([per-frame] lines are for review, not failures)')
