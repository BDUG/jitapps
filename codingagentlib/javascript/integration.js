'use strict';
const copy=value=>JSON.parse(JSON.stringify(value));
/** Named, live host context. Providers return {revision:string,data:JSON}. */
class ContextRegistry {
 constructor({base=null}={}){this.base=copy(base);this.sources=new Map();this.resolving=false;}
 add(id,provide,{description='',schema={}}={}){if(this.resolving)throw Error('Context resolution is active');if(typeof id!=='string'||!/^[A-Za-z][\w.-]{0,99}$/.test(id)||this.sources.has(id)||typeof provide!=='function'||typeof description!=='string'||!schema||typeof schema!=='object'||Array.isArray(schema))throw Error('Provide a unique context source ID, callback and schema');this.sources.set(id,{id,provide,description,schema:copy(schema)});return this;}
 remove(id){if(this.resolving)throw Error('Context resolution is active');if(!this.sources.delete(id))throw Error('Unknown context source');return this;}
 list(){return [...this.sources.values()].map(({provide,...source})=>copy(source));}
 async resolve(state,signal){if(this.resolving)throw Error('Context resolution is already active');this.resolving=true;try{const sources=[];for(const source of this.sources.values()){if(signal?.aborted)throw Error('Context resolution cancelled');const result=copy(await source.provide(copy(state),signal));if(!result||typeof result.revision!=='string'||!Object.prototype.hasOwnProperty.call(result,'data'))throw Error('Context source '+source.id+' must return {revision:string,data:JSON}');sources.push({id:source.id,description:source.description,schema:copy(source.schema),revision:result.revision,data:result.data});}return {format:'codingagentlib/integration-context-v1',base:copy(this.base),sources};}finally{this.resolving=false;}}
 provider(){return (state,signal)=>this.resolve(state,signal);}
}
if(typeof module==='object'&&module.exports)module.exports={ContextRegistry};else globalThis.SuiteContextRegistry=ContextRegistry;
