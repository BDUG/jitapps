'use strict';
const fs=require('node:fs'),path=require('node:path'),catalog=require('./schema-catalog.cjs');
fs.mkdirSync(path.join(__dirname,'schemas'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'workspace.schema.json'),JSON.stringify(catalog.schemas.workspace,null,2)+'\n');
for(const schema of Object.values(catalog.schemas)){const name=new URL(schema.$id).pathname.split('/').at(-1);fs.writeFileSync(path.join(__dirname,'schemas',name),JSON.stringify(schema,null,2)+'\n');}
fs.writeFileSync(path.join(__dirname,'schemas/catalog.json'),JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'schema-bundle.js'),'window.ArchitexSchemaCatalog='+JSON.stringify(catalog)+';\n');
console.log('Generated '+Object.keys(catalog.schemas).length+' schemas and interchange catalogue.');
