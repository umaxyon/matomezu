# Counts how Claude Code sessions of matomezu used tokens over the last 2 days (cache reads/writes, output per worktree, and tool result sizes by tool), from the transcripts under ~/.claude/projects. Run: python3 -I scripts/context-usage.py
import json,glob,os,time,collections,sys
root=os.path.expanduser('~/.claude/projects')
since=time.time()-2*86400
files=[f for f in glob.glob(root+'/*matomezu*/**/*.jsonl',recursive=True) if os.path.getmtime(f)>since]
tot=collections.Counter(); per=collections.Counter(); tool_bytes=collections.Counter(); tool_n=collections.Counter()
turns=0
for f in files:
    seen=set(); idname={}
    proj=f.split('/projects/')[1].split('/')[0].replace('-home-umaxyon-wk-ws-','')
    sub='subagent' if '/subagents/' in f else 'main'
    for line in open(f,errors='ignore'):
        try: o=json.loads(line)
        except: continue
        m=o.get('message') or {}
        if o.get('type')=='assistant':
            mid=m.get('id')
            for c in m.get('content') or []:
                if isinstance(c,dict) and c.get('type')=='tool_use':
                    n=c.get('name','')
                    if n=='Bash':
                        cmd=(c.get('input') or {}).get('command','')
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
print('files',len(files),'api calls',turns)
for k,v in tot.items(): print(k, f'{v/1e6:.1f}M')
print('\n-- by worktree (cache_read M / cache_create M / output K)')
keys=sorted({(p,s) for p,s,k in per}, key=lambda x:-per[(x[0],x[1],'cache_read_input_tokens')])
for p,s in keys[:14]:
    print(f"{p:45s} {s:9s} {per[(p,s,'cache_read_input_tokens')]/1e6:7.1f} {per[(p,s,'cache_creation_input_tokens')]/1e6:6.1f} {per[(p,s,'output_tokens')]/1e3:7.0f}")
print('\n-- tool results (chars M, count)')
for n,v in tool_bytes.most_common(18): print(f'{n:55s} {v/1e6:6.2f} {tool_n[n]}')
