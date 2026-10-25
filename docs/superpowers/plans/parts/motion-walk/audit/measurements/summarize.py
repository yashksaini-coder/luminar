import json, sys, collections
files = sys.argv[1:]
rows = []
for f in files:
    rows += json.load(open(f))
def key(r): return f"{r['route']} {r['vp']} {r['scenario']}"
print("== hscroll / overflowers / clipped / errors")
for r in rows:
    if r.get('error'): print(key(r), 'ERROR', r['error']); continue
    if r['hscroll'] or r['overflowers'] or r['clipped'] or r.get('stepErr'):
        print(key(r), 'hscroll' if r['hscroll'] else '', f"sw={r['sw']}", 'STEP:'+str(r.get('stepErr')) if r.get('stepErr') else '')
        for o in r['overflowers'][:8]: print('   over', o)
        for c in r['clipped'][:8]: print('   clip', c)
print("\n== overlaps (fixed/abs pairs)")
seen = set()
for r in rows:
    for o in r.get('overlaps', []):
        k = (r['route'][:5], r['scenario'], o['a'][:40], o['b'][:40])
        if k in seen: continue
        seen.add(k); print(key(r), o)
print("\n== small targets (phone/tablet only, deduped by selector; w×h)")
small = collections.OrderedDict()
for r in rows:
    w = int(r['vp'].split('x')[0])
    if w > 1024: continue
    for s in r.get('small', []):
        k = (r['route'].split('-')[0], s['sel'][:48])
        small.setdefault(k, (f"{s['w']}x{s['h']}", key(r)))
for k, v in small.items(): print(k[0], '|', k[1], '|', v[0], '|', v[1])
print("\n== gaps < 8px (phone/tablet, deduped)")
gaps = collections.OrderedDict()
for r in rows:
    w = int(r['vp'].split('x')[0])
    if w > 1024: continue
    for g in r.get('gaps', []):
        k = (r['route'].split('-')[0], g['a'][:30], g['b'][:30])
        gaps.setdefault(k, (g['gap'], key(r)))
for k, v in list(gaps.items())[:60]: print(k[0], '|', k[1], '→', k[2], '|', v[0], '|', v[1])
print("\n== small text at 390 (deduped)")
txt = collections.OrderedDict()
for r in rows:
    if not r['vp'].startswith('390'): continue
    for t in r.get('text', []):
        k = (r['route'].split('-')[0], t['sel'][:40], t['fs'])
        txt.setdefault(k, (t['body'], t['font'], r['scenario']))
for k, v in txt.items(): print(k[0], '|', k[1], '|', k[2], 'px', '| body' if v[0] else '', '|', v[1], '|', v[2])
print("\n== rects")
for r in rows:
    rc = r.get('rects', {})
    keep = {k: v for k, v in rc.items() if k in ('strip', 'toolbar', 'inspector', 'ticker', 'faultBtn', 'speed10', 'canvasCol', 'menu', 'legend', 'narrator', 'modes', 'logBtn', 'main', 'h1')}
    print(key(r), json.dumps(keep), 'active=', r.get('active'))
