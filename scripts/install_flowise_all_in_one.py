#!/usr/bin/env python3
"""Install a separate private Agentflow; preserve every existing flow."""
import sqlite3,json,datetime
from pathlib import Path
root=Path(__file__).resolve().parents[1]
flow=(root/'flowise/all-in-one/DME_All_In_One_Agentflow.json').read_text()
json.loads(flow)
ident='d4e6f820-0924-4b20-8a10-202609240001'
path=Path.home()/'.flowise/database.sqlite'
c=sqlite3.connect(path)
backup=Path('/tmp')/('b2b-flowise-before-agentflow-'+datetime.datetime.now().strftime('%Y%m%d%H%M%S')+'.sqlite')
with sqlite3.connect(backup) as b:c.backup(b)
source=c.execute('SELECT workspaceId FROM chat_flow WHERE id=?',('7d3c481a-01ad-49ec-918b-1d7cfcb85a70',)).fetchone()
if not source:raise SystemExit('Expected workspace source missing; no changes made')
c.execute("INSERT INTO chat_flow (id,name,flowData,type,isPublic,deployed,workspaceId) VALUES (?,?,?,'AGENTFLOW',0,0,?) ON CONFLICT(id) DO UPDATE SET flowData=excluded.flowData, updatedDate=datetime('now')",(ident,'DME — All in One (Flowise)',flow,source[0]))
c.commit();c.close()
print('Installed '+ident+'; database backup: '+str(backup))
