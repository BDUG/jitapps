'use strict';
const {LocalRuntime:LegacyRuntime}=require('./local.js');
class LocalRuntime extends LegacyRuntime {constructor(options){super({...options,exclusiveWorkspace:true});}}
module.exports={LocalRuntime,protocol:require('./spec.js')};
