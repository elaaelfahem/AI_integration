const r=$json;if(!r.company_id||!r.answer||!Array.isArray(r.key_facts)||!Array.isArray(r.discovery_questions)||!Array.isArray(r.warnings))throw Error('Invalid DME assistant response');return{json:r};
