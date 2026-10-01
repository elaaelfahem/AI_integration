#!/usr/bin/env python3
from __future__ import annotations
import copy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'flowise'/'query_composer_agent Chatflow.json'
OUTPUT=ROOT/'flowise'/'offer_recommender_agent Chatflow.json'
prompt=(ROOT/'agents'/'offer-recommender'/'system-prompt.md').read_text(encoding='utf-8')+"\n\nValidated input:\n{question}"
graph=copy.deepcopy(json.loads(SOURCE.read_text(encoding='utf-8-sig')))
graph['nodes']=[n for n in graph['nodes'] if n['id']!='structuredOutputParser_0']
graph['edges']=[e for e in graph['edges'] if e['source']!='structuredOutputParser_0' and e['target']!='structuredOutputParser_0']
nodes={n['id']:n for n in graph['nodes']}
model=nodes['chatOllama_0']['data']['inputs']; model.update({'temperature':'0','jsonMode':True,'streaming':False,'numCtx':'4096'})
nodes['llmChain_0']['data']['inputs']['outputParser']=''
nodes['llmChain_0']['data']['inputs']['chainName']='DME Offer Recommendation Explainer v1'
nodes['promptTemplate_0']['data']['inputs']['template']=prompt
OUTPUT.write_text(json.dumps(graph,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); print(OUTPUT)
