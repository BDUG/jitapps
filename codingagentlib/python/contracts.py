"""Strict, bounded JSON schema subset shared with the portable SDK."""
import math
from .contracts_data import SCHEMAS

PROTOCOL = SCHEMAS['protocol']
KEYWORDS = set('type properties required additionalProperties items minItems maxItems minLength maxLength minimum maximum enum const anyOf description title default'.split())


def check_schema(schema, depth=0):
    if not isinstance(schema, dict) or depth > 32:
        raise ValueError('Invalid or excessively nested schema')
    if set(schema) - KEYWORDS:
        raise ValueError('Unsupported schema keywords: ' + ', '.join(sorted(set(schema) - KEYWORDS)))
    if 'type' in schema and schema['type'] not in ('object','array','string','integer','number','boolean','null'):
        raise ValueError('Unsupported schema type')
    if 'required' in schema and (not isinstance(schema['required'], list) or any(not isinstance(v, str) for v in schema['required'])):
        raise ValueError('Invalid required fields')
    if 'additionalProperties' in schema and type(schema['additionalProperties']) is not bool:
        raise ValueError('additionalProperties must be boolean')
    if 'properties' in schema:
        if not isinstance(schema['properties'], dict):
            raise ValueError('Invalid properties')
        for child in schema['properties'].values():
            check_schema(child, depth+1)
    if 'items' in schema:
        check_schema(schema['items'], depth+1)
    if 'anyOf' in schema:
        if not isinstance(schema['anyOf'], list) or not schema['anyOf']:
            raise ValueError('Invalid anyOf')
        for child in schema['anyOf']:
            check_schema(child, depth+1)
    for key in ('minItems','maxItems','minLength','maxLength','minimum','maximum'):
        if key in schema and (type(schema[key]) not in (int,float) or not math.isfinite(schema[key])):
            raise ValueError('Invalid schema bound')
    if 'enum' in schema and (not isinstance(schema['enum'], list) or not schema['enum']):
        raise ValueError('Invalid enum')
    return True


def equal(a, b):
    if isinstance(a, bool) != isinstance(b, bool):
        return False
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(equal(v, b[k]) for k,v in a.items())
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(equal(x,y) for x,y in zip(a,b))
    return a == b


def validate(schema, value, path='$', depth=0):
    if depth > 64:
        raise ValueError(path + ': nesting limit')
    if 'anyOf' in schema:
        for child in schema['anyOf']:
            try:
                validate(child, value, path, depth+1)
                break
            except ValueError:
                pass
        else:
            raise ValueError(path + ': no matching variant')
    if 'const' in schema and not equal(schema['const'], value):
        raise ValueError(path + ': unexpected constant')
    if 'enum' in schema and not any(equal(v,value) for v in schema['enum']):
        raise ValueError(path + ': invalid enum')
    kind = 'null' if value is None else 'boolean' if type(value) is bool else 'number' if type(value) in (int,float) else 'string' if isinstance(value,str) else 'array' if isinstance(value,list) else 'object' if isinstance(value,dict) else 'invalid'
    if 'type' in schema and not (schema['type'] == kind or schema['type'] == 'integer' and type(value) in (int,float) and math.isfinite(value) and value == int(value) and abs(value) <= 9007199254740991):
        raise ValueError(path + ': expected ' + schema['type'])
    if kind == 'number' and not math.isfinite(value):
        raise ValueError(path + ': nonfinite number')
    if kind == 'object':
        for key in schema.get('required', []):
            if key not in value:
                raise ValueError(path + ': missing ' + key)
        for key,item in value.items():
            if key in schema.get('properties', {}):
                validate(schema['properties'][key], item, path+'.'+key, depth+1)
            elif schema.get('additionalProperties') is False:
                raise ValueError(path + ': unknown ' + key)
    if kind == 'array':
        if not schema.get('minItems',0) <= len(value) <= schema.get('maxItems',math.inf):
            raise ValueError(path + ': array bounds')
        if 'items' in schema:
            for i,item in enumerate(value):
                validate(schema['items'], item, path+f'[{i}]', depth+1)
    if kind == 'string' and not schema.get('minLength',0) <= len(value) <= schema.get('maxLength',math.inf):
        raise ValueError(path + ': string bounds')
    if kind == 'number' and not schema.get('minimum',-math.inf) <= value <= schema.get('maximum',math.inf):
        raise ValueError(path + ': numeric bounds')
    return value


def contract(name, value):
    validate(SCHEMAS['contracts'][name], value)
    if name == 'ModelResponse':
        if not value['plan'].strip() or (value['action'] is None if value['status'] == 'act' else value['action'] is not None or not value.get('question' if value['status'] == 'ask' else 'summary', '').strip()):
            raise ValueError('Invalid response status payload')
    if name == 'ToolResult' and ('result' not in value or 'error' in value if value['ok'] else 'error' not in value or 'result' in value):
        raise ValueError('Invalid result variant')
    return value
