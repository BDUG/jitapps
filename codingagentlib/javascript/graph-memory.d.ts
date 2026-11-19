export type GraphNode={id:string;type:string;label:string;source:Record<string,unknown>;properties:Record<string,unknown>;origin?:string};
export type GraphEdge={id?:string;source:string;target:string;type:string;origin?:string};
export type Ontology={format:'codingagentlib/project-ontology-v1';version:1;classes:Array<{id:string;label:string;origin?:string}>;relations:Array<{id:string;label:string}>};
export type ProjectGraph={format:'codingagentlib/project-knowledge-v1';version:1;project:string;ontology:Ontology;nodes:GraphNode[];edges:GraphEdge[];complete:boolean;warnings:string[];revision?:string;annotations?:Record<string,{text:string;status?:string}>;memoryHistory?:unknown[]};
export type StoredProjectGraph=ProjectGraph & {revision:string};
export type GraphQuery={query?:string;nodeIds?:string[];hops?:number;limit?:number;direction?:'in'|'out'|'both';relations?:string[];fallback?:'inventory'|'empty'};
export type GraphResult={project:string;revision?:string;nodes:GraphNode[];edges:GraphEdge[];seeds:string[];fallbackUsed:boolean;annotations:NonNullable<ProjectGraph['annotations']>;complete:boolean;warnings:string[];truncated:boolean;note:string};
export function validateGraph(graph:unknown):ProjectGraph;
export function validateOntology(ontology:unknown):Ontology;
export function queryGraph(graph:ProjectGraph,options?:GraphQuery):GraphResult;
export function buildProjectGraph(options:{project:string;files:Array<{path:string;content:string}>}):Promise<ProjectGraph>;
export class ProjectGraphMemory{
 constructor(store?:{load:(project:string)=>StoredProjectGraph|null|undefined|Promise<StoredProjectGraph|null|undefined>;save:(project:string,graph:StoredProjectGraph,expectedRevision:string)=>void|Promise<void>}|{load?:undefined;save?:undefined});
 export(project:string):Promise<StoredProjectGraph>;
 import(project:string,graph:ProjectGraph,expectedRevision:string):Promise<StoredProjectGraph>;
 ontology(project:string):Promise<Ontology & {project:string;revision:string}>;
 importOntology(project:string,ontology:Ontology,expectedRevision:string):Promise<StoredProjectGraph>;
 history(project:string):Promise<unknown[]>;
 refresh(project:string,files:Array<{path:string;content:string}>):Promise<StoredProjectGraph>;
 query(project:string,options?:GraphQuery):Promise<GraphResult>;
 manage(project:string,options:{action:'annotate'|'forget'|'relate';nodeId:string;text?:string;target?:string;relation?:string;expectedRevision:string}):Promise<StoredProjectGraph>;
 contextProvider(project:string,options?:GraphQuery):(state:{goal?:string})=>Promise<{projectKnowledge:GraphResult}>;
}
