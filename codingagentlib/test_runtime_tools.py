"""Tests for Portable SDK v1 script/program tool adapters, tool_schemas, and script_run workflows."""
import asyncio
import json
import sys
import tempfile
import unittest
from pathlib import Path

from codingagentlib import (
    Runtime,
    TOOLS,
    create_agent,
    program_tools,
    runtime_tools,
    script_library_tools,
    script_tools,
)
from codingagentlib.python import agent_workflows
from codingagentlib.python.providers import tool_schemas


class RuntimeToolsTest(unittest.TestCase):
    def test_core_agent_with_script_and_program_tools(self):
        with tempfile.TemporaryDirectory() as tmp:
            runtime = Runtime(tmp, commands=[sys.executable])
            try:
                tools = script_tools(runtime, allow_edits=True, allow_commands=True) + [
                    t for t in program_tools(runtime, allow_edits=True, allow_commands=True)
                    if t['name'] in {'run_command', 'read_command_output'}
                ]
                names = {t['name'] for t in tools}
                self.assertIn('script_run', names)
                self.assertIn('script_library', names)
                self.assertIn('write_script', names)
                self.assertIn('run_script', names)
                self.assertIn('run_command', names)

                def model(req):
                    obs = [e['value'] for e in req['events'] if e['kind'] == 'tool_result']
                    if not obs:
                        return {
                            'sessionId': req['sessionId'],
                            'step': req['step'],
                            'status': 'act',
                            'plan': 'Run inline script via script_run',
                            'action': {
                                'tool': 'script_run',
                                'args': {
                                    'filename': 'calc_helper.py',
                                    'source': 'import agent_io\nagent_io.emit({"sum": 2 + 3})\n',
                                    'save': {'id': 'calc-helper', 'description': 'Add numbers', 'tags': ['math']},
                                },
                            },
                        }
                    if len(obs) == 1:
                        self.assertTrue(obs[0]['ok'], obs[0])
                        self.assertEqual(obs[0]['result']['structuredResult'], {'sum': 5})
                        return {
                            'sessionId': req['sessionId'],
                            'step': req['step'],
                            'status': 'act',
                            'plan': 'Run allowlisted python command',
                            'action': {
                                'tool': 'run_command',
                                'args': {'command': sys.executable, 'args': ['-c', 'print("prog-ok")']},
                            },
                        }
                    if len(obs) == 2:
                        self.assertTrue(obs[1]['ok'], obs[1])
                        self.assertEqual(obs[1]['result']['stdout'].strip(), 'prog-ok')
                        return {
                            'sessionId': req['sessionId'],
                            'step': req['step'],
                            'status': 'act',
                            'plan': 'List saved scripts in script_library',
                            'action': {
                                'tool': 'script_library',
                                'args': {'action': 'list'},
                            },
                        }
                    self.assertTrue(obs[2]['ok'], obs[2])
                    ids = [item['id'] for item in obs[2]['result']['scripts']]
                    self.assertIn('calc-helper', ids)
                    return {
                        'sessionId': req['sessionId'],
                        'step': req['step'],
                        'status': 'done',
                        'plan': 'Done',
                        'action': None,
                        'summary': 'Executed generated script and program via CoreAgent tools',
                    }

                agent = create_agent(model=model, tools=tools)
                result = agent.run('Run generated script and program', allow_edits=True, allow_commands=True)
                self.assertEqual(result['status'], 'complete')
            finally:
                runtime.close()

    def test_standalone_script_library_tools(self):
        with tempfile.TemporaryDirectory() as tmp:
            runtime = Runtime(tmp, commands=[sys.executable])
            try:
                tools = script_library_tools(runtime.script_library, pyenvs=runtime.pyenvs, allow_edits=True)
                self.assertEqual([t['name'] for t in tools], ['script_library', 'python_env'])

                def model(req):
                    obs = [e['value'] for e in req['events'] if e['kind'] == 'tool_result']
                    if not obs:
                        return {
                            'sessionId': req['sessionId'],
                            'step': req['step'],
                            'status': 'act',
                            'plan': 'Save a script',
                            'action': {
                                'tool': 'script_library',
                                'args': {
                                    'action': 'save',
                                    'id': 'hello-tool',
                                    'filename': 'hello.py',
                                    'source': 'print("hello")',
                                    'description': 'Hello script',
                                    'expectedRevision': 0,
                                },
                            },
                        }
                    self.assertTrue(obs[0]['ok'], obs[0])
                    return {
                        'sessionId': req['sessionId'],
                        'step': req['step'],
                        'status': 'done',
                        'plan': 'Saved',
                        'action': None,
                        'summary': 'Saved script to standalone ScriptLibrary',
                    }

                agent = create_agent(model=model, tools=tools)
                self.assertEqual(agent.run('Save script', allow_edits=True)['status'], 'complete')
            finally:
                runtime.close()

    def test_tool_schemas_converts_runtime_arguments(self):
        openai_tools = tool_schemas(TOOLS, provider='openai')
        by_name = {t['function']['name']: t['function']['parameters'] for t in openai_tools}
        self.assertIn('source', by_name['script_run']['properties'])
        self.assertIn('command', by_name['run_command']['properties'])
        self.assertEqual(by_name['run_command']['properties']['args']['type'], 'array')

        gemini_tools = tool_schemas(TOOLS, provider='gemini')
        decls = {d['name']: d['parameters'] for d in gemini_tools[0]['functionDeclarations']}
        self.assertIn('libraryId', decls['script_run']['properties'])

    def test_workflow_allows_script_run_step(self):
        definition = {
            'format': 'suite-tool-workflow/v1',
            'name': 'Run generated script',
            'description': 'Execute an inline script via script_run',
            'inputs': {},
            'steps': [
                {
                    'id': 'run',
                    'tool': 'script_run',
                    'args': {'filename': 'wf.py', 'source': 'import agent_io\nagent_io.emit({"wf": True})\n'},
                }
            ],
        }
        validated = agent_workflows.validate(definition)
        self.assertEqual(validated['steps'][0]['tool'], 'script_run')
        with tempfile.TemporaryDirectory() as tmp:
            runtime = Runtime(tmp, commands=[sys.executable])
            try:
                sid = runtime.start({'goal': 'wf test', 'allowEdits': True, 'allowCommands': True})['id']
                s = runtime.get(sid)
                report = agent_workflows.preflight(runtime, s, {'definition': definition, 'inputs': {}})
                self.assertTrue(report['permissionsReady'])
            finally:
                runtime.close()

    def test_async_core_agent_and_command_wrapper(self):
        wrapped_calls = []

        def wrapper(argv, cwd, env):
            wrapped_calls.append(list(argv))
            return argv

        with tempfile.TemporaryDirectory() as tmp:
            runtime = Runtime(tmp, commands=[sys.executable], command_wrapper=wrapper)
            try:
                self.assertEqual(runtime.health()['commandIsolation'], 'custom command_wrapper')
                tools = program_tools(runtime, allow_edits=True, allow_commands=True)

                async def async_model(req):
                    obs = [e['value'] for e in req['events'] if e['kind'] == 'tool_result']
                    if not obs:
                        async def stream():
                            yield json.dumps({
                                'sessionId': req['sessionId'],
                                'step': req['step'],
                                'status': 'act',
                                'plan': 'Run wrapped command',
                                'action': {'tool': 'run_command', 'args': {'command': sys.executable, 'args': ['-c', 'print("wrapped")']}},
                            })
                        return stream()
                    self.assertTrue(obs[0]['ok'], obs[0])
                    self.assertEqual(obs[0]['result']['stdout'].strip(), 'wrapped')
                    return {
                        'sessionId': req['sessionId'],
                        'step': req['step'],
                        'status': 'done',
                        'plan': 'Done',
                        'action': None,
                        'summary': 'Async CoreAgent completed with command_wrapper',
                    }

                agent = create_agent(model=async_model, tools=tools)
                res = asyncio.run(agent.async_run('Run wrapped command', allow_edits=True, allow_commands=True))
                self.assertEqual(res['status'], 'complete')
                self.assertEqual(len(wrapped_calls), 1)
                self.assertEqual(wrapped_calls[0][-2:], ['-c', 'print("wrapped")'])
            finally:
                runtime.close()

    def test_read_files_paging_and_batch_budget(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'a.txt').write_text('A' * 35000, encoding='utf-8')
            (Path(tmp) / 'b.txt').write_text('B' * 35000, encoding='utf-8')
            (Path(tmp) / 'c.txt').write_text('C' * 100, encoding='utf-8')
            runtime = Runtime(tmp)
            try:
                sess = runtime.dispatch({'op': 'start', 'goal': 'Read multiple files'})
                res = runtime.dispatch({
                    'op': 'tool',
                    'session': sess['id'],
                    'callId': 'read-files-1',
                    'tool': 'read_files',
                    'args': {'files': [{'path': 'a.txt', 'limit': 35000}, {'path': 'b.txt', 'limit': 35000}, {'path': 'c.txt'}]},
                })
                obs = res['result']
                self.assertEqual(obs['truncated'], True)
                self.assertEqual(obs['totalCharacters'], 64000)
                self.assertEqual(len(obs['files'][0]['text']), 35000)
                self.assertEqual(len(obs['files'][1]['text']), 29000)
                self.assertEqual(obs['files'][1]['done'], False)
                self.assertEqual(obs['files'][2]['skipped'], True)
            finally:
                runtime.close()


if __name__ == '__main__':
    unittest.main()
