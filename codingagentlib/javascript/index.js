/* Canonical headless browser/Node core; transports, provider calls and UI are injected. */
const spec=require('./spec.js'),checks=require('./checks.js'),acceptance=require('./acceptance.js'),context=require('./context.js'),planning=require('./planning.js'),independentReview=require('./independent-review.js'),loop=require('./loop.js');
module.exports={toolRouting:require('./tool-routing.js'),ContextRegistry:require('./integration.js').ContextRegistry,EmbeddedAgent:require('./embedded.js').EmbeddedAgent,spec,checks,acceptance,context,planning,independentReview,loop};
Object.defineProperty(module.exports,'LocalRuntime',{enumerable:true,get:()=>require('./local.js').LocalRuntime});
