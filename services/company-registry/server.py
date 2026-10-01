import json, os, sqlite3
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
DB=os.environ.get('DATABASE_PATH','/data/companies.sqlite')
def now(): return datetime.now(timezone.utc).isoformat()
def conn():
 c=sqlite3.connect(DB); c.row_factory=sqlite3.Row
 c.execute('CREATE TABLE IF NOT EXISTS companies (company_id TEXT PRIMARY KEY, canonical_name TEXT NOT NULL, website TEXT, legal_identifier TEXT, lifecycle_status TEXT NOT NULL DEFAULT "FOUND", first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, campaigns TEXT NOT NULL DEFAULT "[]", record TEXT NOT NULL)')
 return c
class H(BaseHTTPRequestHandler):
 def send(self,status,body):
  raw=json.dumps(body).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)
 def do_GET(self):
  if self.path=='/health':
   c=conn(); n=c.execute('SELECT count(*) FROM companies').fetchone()[0]; c.close(); return self.send(200,{'status':'ok','company_count':n})
  return self.send(404,{'error':'Not found'})
 def do_POST(self):
  if self.path!='/v1/companies/upsert': return self.send(404,{'error':'Not found'})
  try:
   size=int(self.headers.get('Content-Length','0')); data=json.loads(self.rfile.read(size)); campaign=str(data['campaign_id']); companies=data['companies']; assert isinstance(companies,list)
   c=conn(); inserted=updated=0; items=[]
   for company in companies:
    cid=company['company_id']; existing=c.execute('SELECT lifecycle_status,campaigns FROM companies WHERE company_id=?',(cid,)).fetchone(); stamp=now()
    campaigns=[] if not existing else json.loads(existing['campaigns']); campaigns=sorted(set(campaigns+[campaign]))
    status='FOUND' if not existing else existing['lifecycle_status']
    c.execute('INSERT INTO companies VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET canonical_name=excluded.canonical_name,website=excluded.website,legal_identifier=excluded.legal_identifier,last_seen_at=excluded.last_seen_at,campaigns=excluded.campaigns,record=excluded.record',(cid,company.get('canonical_name',''),company.get('website'),company.get('legal_identifier'),status,stamp if not existing else c.execute('SELECT first_seen_at FROM companies WHERE company_id=?',(cid,)).fetchone()[0],stamp,json.dumps(campaigns),json.dumps(company)))
    inserted+=not bool(existing); updated+=bool(existing); items.append({'company_id':cid,'lifecycle_status':status,'already_known':bool(existing)})
   c.commit(); c.close(); self.send(200,{'campaign_id':campaign,'inserted':inserted,'updated':updated,'companies':items})
  except Exception as e:self.send(400,{'error':str(e)})
ThreadingHTTPServer(('0.0.0.0',int(os.environ.get('PORT','8090'))),H).serve_forever()
