"""Attribute >200 ms renderer RunTasks in a Chrome trace to JS stacks (shader link vs relayout). Usage: python3 attrib.py trace.json"""
import json,collections,sys
d=json.load(open(sys.argv[1])); ev=d['traceEvents'] if isinstance(d,dict) else d
rt=[e for e in ev if e.get('ph')=='X' and e.get('name')=='RunTask' and e.get('dur',0)>200000]
profpids={e['pid'] for e in ev if e.get('name')=='Profile'}
mains=[(e['pid'],e['tid']) for e in ev if e.get('name')=='thread_name' and e['args']['name']=='CrRendererMain' and e['pid'] in profpids]
pid=max(mains,key=lambda m:sum(e.get('dur',0) for e in rt if (e['pid'],e['tid'])==m))
rt=[e for e in rt if (e['pid'],e['tid'])==pid]
prof=[e for e in ev if e.get('name')=='Profile' and e['pid']==pid[0]]
start=prof[0]['args']['data']['startTime']
nodes={};samples=[];deltas=[]
for e in ev:
  if e.get('name')=='ProfileChunk' and e['pid']==pid[0]:
    cp=e['args']['data'].get('cpuProfile',{})
    for n in cp.get('nodes',[]): nodes[n['id']]=n
    samples+=cp.get('samples',[]); deltas+=e['args']['data'].get('timeDeltas',[])
parent={n['id']:n.get('parent') for n in nodes.values()}
for b in rt:
  s,t=b['ts'],b['ts']+b['dur']; print('RunTask',round(b['dur']/1000),'ms')
  ts=start; stackc=collections.Counter(); tot=0
  for sm,dl in zip(samples,deltas):
    ts+=dl
    if s<=ts<t:
      tot+=1; x=sm; seen=set()
      while x in nodes and x not in seen:
        seen.add(x); stackc[nodes[x]['callFrame']['functionName']]+=1; x=parent.get(x)
  print(' samples',tot, [(k,v) for k,v in stackc.most_common(40) if k in ('_linkShaders','_initializeLayer','r$','computeLayout','_updateAttributes','getProgramParameter','compileShader','_compileAndLink','createShader','texImage2D','buildAtlas','_getModel','updateState','renderLayers','measureText')])
