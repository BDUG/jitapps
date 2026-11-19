export type MosaicRequest = {sessionId?:string;step?:number;events?:Array<{kind?:string;value?:unknown}>};
export type MosaicEvent = {call:number;role:string;model:string;sessionId?:string;step?:number};
export type MosaicModel<R extends MosaicRequest,T> = ((request:R,signal?:AbortSignal)=>Promise<T>) & {inspect():{format:'codingagentlib/model-mosaic-v1';calls:number;maxCalls:number;routes:Record<string,string>;history:MosaicEvent[]}};
export function createModelMosaic<R extends MosaicRequest,T>(options:{models:Record<string,(request:R,signal?:AbortSignal)=>T|Promise<T>>;routes:Record<string,string>;select?:(request:R)=>string|Promise<string>;maxCalls?:number;onEvent?:(event:MosaicEvent)=>void|Promise<void>}):MosaicModel<R,T>;
export function mosaicPhase(request:MosaicRequest):'plan'|'code'|'review';
