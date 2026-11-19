/* Canonical headless browser/Node core; transports, provider calls and UI are injected. */
const spec=require('./spec.js'),checks=require('./checks.js'),acceptance=require('./acceptance.js'),context=require('./context.js'),planning=require('./planning.js'),independentReview=require('./independent-review.js'),loop=require('./loop.js');
module.exports={...require('./mosaic.js'),...require('./graph-memory.js'),...require('./core.js'),...require('./adapters.js'),extensions:require('./extensions.js'),adapters:require('./adapters.js'),contracts:require('./contracts.js'),toolRouting:require('./tool-routing.js'),ContextRegistry:require('./integration.js').ContextRegistry,EmbeddedAgent:require('./embedded.js').EmbeddedAgent,spec,checks,acceptance,context,planning,independentReview,loop};
Object.defineProperty(module.exports,'LocalRuntime',{enumerable:true,get:()=>require('./local.js').LocalRuntime});
Object.defineProperty(module.exports,'providers',{enumerable:true,get:()=>require('./providers.js')});
Object.defineProperty(module.exports,'StateGraph',{enumerable:true,get:()=>require('./state-machine.js').StateGraph});
Object.defineProperty(module.exports,'END',{enumerable:true,get:()=>require('./state-machine.js').END});
Object.defineProperty(module.exports,'treeSearch',{enumerable:true,get:()=>require('./tree-search.js').treeSearch});
Object.defineProperty(module.exports,'beyondReact',{enumerable:true,get:()=>require('./beyond-react.js')});

Object.defineProperty(module.exports,'mcpTransports',{enumerable:true,get:()=>require('./mcp-transports.js')});
