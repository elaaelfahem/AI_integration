#!/usr/bin/env python3
from __future__ import annotations
import copy,json
from pathlib import Path
R=Path(__file__).resolve().parents[1];S=R/'flowise'/'query_composer_agent Chatflow.json';O=R/'flowise'/'risk_detector_agent Chatflow.json';p=(R/'agents'/'risk-detector'/'system-prompt.md').read_text()+'\n\nAssessment:\n{question}'
g=copy.deepcopy(json.loads(S.read_text(encoding='utf-8-sig')));g['nodes']=[n for n in g['nodes'] if n['id']!='structuredOutputParser_0'];g['edges']=[e for e in g['edges'] if e['source']!='structuredOutputParser_0' and e['target']!='structuredOutputParser_0'];n={x['id']:x for x in g['nodes']};n['chatOllama_0']['data']['inputs'].update({'temperature':'0','jsonMode':True,'streaming':False,'numCtx':'4096'});n['llmChain_0']['data']['inputs']['outputParser']='';n['llmChain_0']['data']['inputs']['chainName']='DME Risk Summary v1';n['promptTemplate_0']['data']['inputs']['template']=p;O.write_text(json.dumps(g,ensure_ascii=False,indent=2)+'\n');print(O)
