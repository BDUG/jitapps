/* Retry model transport only. Never use for runtime/tool/command delivery. */
(function(root){'use strict';
function abort(signal){if(signal?.aborted)throw signal.reason||new DOMException('Stopped','AbortError');}
function wait(ms,signal){return new Promise((resolve,reject)=>{abort(signal);const done=()=>{signal?.removeEventListener('abort',cancel);resolve();},timer=setTimeout(done,ms),cancel=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(signal.reason||new DOMException('Stopped','AbortError'));};signal?.addEventListener('abort',cancel,{once:true});});}
function retryAfter(value,now=Date.now()){if(value===null||value===undefined||!String(value).trim())return null;const seconds=Number(value);if(Number.isFinite(seconds))return seconds>=0?seconds*1000:null;const date=Date.parse(value);return Number.isFinite(date)?Math.max(0,date-now):null;}
async function run(transport,args,{retries=2,signal=args[1]?.signal,onRetry=()=>{},sleep=wait,random=Math.random}={}){
 if(!Number.isInteger(retries)||retries<0||retries>3)throw Error('Model retries must be between 0 and 3');
 for(let attempt=0;;attempt++){
  abort(signal);let response,error;
  try{response=await transport(...args);}catch(caught){abort(signal);if(caught.name!=='TypeError')throw caught;error=caught;}
  abort(signal);const transient=error||[408,429,500,502,503,504].includes(response.status);
  if(!transient||attempt>=retries){if(error)throw error;return response;}
  const requested=retryAfter(response?.headers.get('retry-after')),delay=requested??Math.round(1000*2**attempt+random()*250);
  // A long provider cooldown must not be shortened into another rejected call.
  if(delay>30000){if(error)throw error;return response;}
  await onRetry({attempt:attempt+1,maxRetries:retries,delayMs:delay,httpStatus:response?.status||null,error:error?.message||null});
  abort(signal);await sleep(delay,signal);
 }
}
const api={run,retryAfter};root.SuiteAgentModelTransport=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
