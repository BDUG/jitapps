'use strict';
const data = require('./contracts-data.js');
const copy = value => JSON.parse(JSON.stringify(value));
const keywords = new Set(['type','properties','required','additionalProperties','items','minItems','maxItems','minLength','maxLength','minimum','maximum','enum','const','anyOf','description','title','default']);
function checkSchema(schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || depth > 32) throw Error('Invalid or excessively nested schema');
  for (const key of Object.keys(schema)) if (!keywords.has(key)) throw Error('Unsupported schema keyword: ' + key);
  if (schema.type !== undefined && !['object','array','string','integer','number','boolean','null'].includes(schema.type)) throw Error('Unsupported schema type');
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some(v => typeof v !== 'string'))) throw Error('Invalid required fields');
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') throw Error('additionalProperties must be boolean');
  if (schema.properties !== undefined) {
    if (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) throw Error('Invalid properties');
    for (const child of Object.values(schema.properties)) checkSchema(child, depth + 1);
  }
  if (schema.items !== undefined) checkSchema(schema.items, depth + 1);
  if (schema.anyOf !== undefined) {
    if (!Array.isArray(schema.anyOf) || !schema.anyOf.length) throw Error('Invalid anyOf');
    for (const child of schema.anyOf) checkSchema(child, depth + 1);
  }
  for (const key of ['minItems','maxItems','minLength','maxLength','minimum','maximum']) if (schema[key] !== undefined && (typeof schema[key] !== 'number' || !Number.isFinite(schema[key]))) throw Error('Invalid schema bound');
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length)) throw Error('Invalid enum');
  return true;
}
function validate(schema, value, path = '$', depth = 0) {
  if (depth > 64) throw Error(path + ': nesting limit');
  const same = (a,b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b,k) && same(a[k],b[k]));
  };
  if (schema.anyOf && !schema.anyOf.some(child => {try {validate(child,value,path,depth+1);return true;} catch {return false;}})) throw Error(path + ': no matching variant');
  if (Object.hasOwn(schema,'const') && !same(schema.const,value)) throw Error(path + ': unexpected constant');
  if (schema.enum && !schema.enum.some(item => same(item,value))) throw Error(path + ': invalid enum');
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type && !(schema.type === type || (schema.type === 'integer' && Number.isSafeInteger(value)))) throw Error(path + ': expected ' + schema.type);
  if (type === 'number' && !Number.isFinite(value)) throw Error(path + ': nonfinite number');
  if (type === 'object') {
    for (const key of schema.required || []) if (!Object.hasOwn(value,key)) throw Error(path + ': missing ' + key);
    for (const [key,item] of Object.entries(value)) {
      if (Object.hasOwn(schema.properties || {}, key)) validate(schema.properties[key],item,path+'.'+key,depth+1);
      else if (schema.additionalProperties === false) throw Error(path + ': unknown ' + key);
    }
  }
  if (type === 'array') {
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) throw Error(path + ': array bounds');
    if (schema.items) value.forEach((item,i) => validate(schema.items,item,path+'['+i+']',depth+1));
  }
  if (type === 'string' && ([...value].length < (schema.minLength ?? 0) || [...value].length > (schema.maxLength ?? Infinity))) throw Error(path + ': string bounds');
  if (type === 'number' && (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) throw Error(path + ': numeric bounds');
  return value;
}
function contract(name, value) {
  if (!Object.hasOwn(data.contracts,name)) throw Error('Unknown contract: '+name);
  validate(data.contracts[name], value);
  if (name === 'ModelResponse') {
    if (!value.plan.trim()) throw Error('Empty public plan');
    if (value.status === 'act' ? value.action === null : value.action !== null || !value[value.status === 'ask' ? 'question' : 'summary']?.trim()) throw Error('Invalid response status payload');
  }
  if (name === 'ToolResult' && (value.ok ? !Object.hasOwn(value,'result') || Object.hasOwn(value,'error') : !value.error || Object.hasOwn(value,'result'))) throw Error('Invalid result variant');
  return value;
}
module.exports = {protocol:data.protocol, schemas:copy(data.contracts), checkSchema, validate, contract};
