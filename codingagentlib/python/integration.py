"""Named dynamic application context, without server or filesystem dependencies."""
import copy
import json
import re

class ContextRegistry:
    def __init__(self, *, base=None):
        self.base=json.loads(json.dumps(base,allow_nan=False));self.sources={};self.resolving=False

    def add(self,source_id,provide,*,description='',schema=None):
        if self.resolving:raise ValueError('Context resolution is active')
        if not isinstance(source_id,str) or not re.fullmatch(r'[A-Za-z][\w.-]{0,99}',source_id,re.ASCII) or source_id in self.sources or not callable(provide) or not isinstance(description,str) or schema is not None and not isinstance(schema,dict):raise ValueError('Provide a unique context source ID, callback and schema')
        self.sources[source_id]={'id':source_id,'provide':provide,'description':description,'schema':copy.deepcopy(schema or {})}
        return self

    def remove(self,source_id):
        if self.resolving:raise ValueError('Context resolution is active')
        if source_id not in self.sources:raise ValueError('Unknown context source')
        del self.sources[source_id]
        return self

    def list(self):return [{k:copy.deepcopy(v) for k,v in s.items() if k!='provide'} for s in self.sources.values()]

    def resolve(self,state,cancel_event=None):
        if self.resolving:raise ValueError('Context resolution is already active')
        self.resolving=True
        try:
            sources=[]
            for source in self.sources.values():
                if cancel_event is not None and cancel_event.is_set():raise ValueError('Context resolution cancelled')
                value=json.loads(json.dumps(source['provide'](copy.deepcopy(state),cancel_event),allow_nan=False))
                if not isinstance(value,dict) or not isinstance(value.get('revision'),str) or 'data' not in value:raise ValueError('Context source '+source['id']+' must return {revision:string,data:JSON}')
                sources.append({'id':source['id'],'description':source['description'],'schema':copy.deepcopy(source['schema']),'revision':value['revision'],'data':value['data']})
            return {'format':'codingagentlib/integration-context-v1','base':copy.deepcopy(self.base),'sources':sources}
        finally:self.resolving=False

    def provider(self):return self.resolve
