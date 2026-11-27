# Counts how Claude Code sessions of matomezu used tokens (cache reads/writes, output per worktree, and tool result sizes by tool), from the transcripts under ~/.claude/projects.
# Per worktree it also gives the measures that do not depend on the size of the work, to compare sessions doing different work: the average cache read per call, the share of calls that use several tools at once, and the longest runs of calls that only read.
# Run: python3 -I scripts/context-usage.py [--days N | --since 2026-11-27T09:00] [--until ...] [--dir feat-work5]
import json,glob,os,time,collections,sys,argparse,datetime
ap=argparse.ArgumentParser()
ap.add_argument('--days',type=float,default=2,help='the last N days (by the time of each call)')
ap.add_argument('--since',help='local time, such as 2026-11-27T09:00 (instead of --days)')
ap.add_argument('--until',help='local time; calls after it are left out')
ap.add_argument('--dir',help='only the project folders whose name has this, such as feat-work5')
a=ap.parse_args()
def stamp(t): return datetime.datetime.fromisoformat(t).timestamp()
root=os.path.expanduser('~/.claude/projects')
since=stamp(a.since) if a.since else time.time()-a.days*86400
until=stamp(a.until) if a.until else float('inf')
files=[f for f in glob.glob(root+'/*matomezu*/**/*.jsonl',recursive=True) if os.path.getmtime(f)>since and (not a.dir or a.dir in f.split('/projects/')[1].split('/')[0])]
READS=('grep','sed -n','cat ','head','tail','ls','wc','git log','git show','git diff','git status','rg ','find ')
def only_reads(uses):
    for n,cmd in uses:
        if n in ('Read','Grep','Glob'): continue
        if n=='Bash' and not any(k in cmd for k in ('sed -i','>','bun ','go ','python','git commit','git merge')) and any(cmd.strip().startswith(k) or ' && '+k in cmd for k in READS): continue
        return False
    return bool(uses)
calls=collections.Counter(); multi=collections.Counter(); streaks=collections.defaultdict(list)
tot=collections.Counter(); per=collections.Counter(); tool_bytes=collections.Counter(); tool_n=collections.Counter()
turns=0
for f in files:
    seen=set(); idname={}; uses={}; order=[]
    proj=f.split('/projects/')[1].split('/')[0].replace('-home-umaxyon-wk-ws-','')
    sub='subagent' if '/subagents/' in f else 'main'
    for line in open(f,errors='ignore'):
        try: o=json.loads(line)
        except: continue
        m=o.get('message') or {}
        ts=o.get('timestamp')
        if ts and not since<=datetime.datetime.fromisoformat(ts.replace('Z','+00:00')).timestamp()<=until: continue
        if o.get('type')=='assistant':
            mid=m.get('id')
            if mid not in uses: uses[mid]=[]; order.append(mid)
            for c in m.get('content') or []:
                if isinstance(c,dict) and c.get('type')=='tool_use':
                    n=c.get('name','')
                    cmd=(c.get('input') or {}).get('command','') if n=='Bash' else ''
                    uses[mid].append((n,cmd))
                    if n=='Bash':
                        n='Bash:'+ ('test' if any(k in cmd for k in ['bun test','go test','playwright','e2e']) else 'git' if cmd.strip().startswith('git') or ' git ' in cmd else 'other')
                    idname[c.get('id')]=n
            if mid in seen: continue
            seen.add(mid)
            u=m.get('usage') or {}
            if not u: continue
            turns+=1
            for k in ['input_tokens','cache_creation_input_tokens','cache_read_input_tokens','output_tokens']:
                v=u.get(k) or 0; tot[k]+=v; per[(proj,sub,k)]+=v
        elif o.get('type')=='user':
            for c in (m.get('content') if isinstance(m.get('content'),list) else []):
                if isinstance(c,dict) and c.get('type')=='tool_result':
                    n=idname.get(c.get('tool_use_id'),'?')
                    s=len(json.dumps(c.get('content'),ensure_ascii=False))
                    tool_bytes[n]+=s; tool_n[n]+=1
    run=0
    for mid in order:
        calls[(proj,sub)]+=1
        if len(uses[mid])>1: multi[(proj,sub)]+=1
        if only_reads(uses[mid]): run+=1
        else:
            if run>=2: streaks[(proj,sub)].append(run)
            run=0
    if run>=2: streaks[(proj,sub)].append(run)
print('files',len(files),'api calls',turns)
for k,v in tot.items(): print(k, f'{v/1e6:.1f}M')
print('\n-- by worktree (cache_read M / cache_create M / output K)')
keys=sorted({(p,s) for p,s,k in per}, key=lambda x:-per[(x[0],x[1],'cache_read_input_tokens')])
for p,s in keys[:14]:
    print(f"{p:45s} {s:9s} {per[(p,s,'cache_read_input_tokens')]/1e6:7.1f} {per[(p,s,'cache_creation_input_tokens')]/1e6:6.1f} {per[(p,s,'output_tokens')]/1e3:7.0f}")
print('\n-- tool results (chars M, count)')
for n,v in tool_bytes.most_common(18): print(f'{n:55s} {v/1e6:6.2f} {tool_n[n]}')

print('\n-- per call (calls / cache_read K per call / several tools at once % / runs of 5+ read-only calls: count, calls)')
for p,s in keys[:14]:
    n=calls[(p,s)] or 1; long=[r for r in streaks[(p,s)] if r>=5]
    print(f"{p:45s} {s:9s} {calls[(p,s)]:6d} {per[(p,s,'cache_read_input_tokens')]/n/1e3:7.0f} {100*multi[(p,s)]/n:5.1f} {len(long):4d} {sum(long):5d}")
