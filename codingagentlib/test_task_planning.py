import json
import unittest
from pathlib import Path
from codingagentlib.python import agent_planning

class TaskPlanningTests(unittest.TestCase):
    def test_shared_native_javascript_python_contract(self):
        cases=json.loads((Path(__file__).parent/'rust'/'tests'/'fixtures'/'task-planning.json').read_text())
        for case in cases:
            with self.subTest(case=case['name']):
                if not case['valid']:
                    with self.assertRaises(ValueError):agent_planning.validate(case['tasks'])
                    continue
                agent_planning.validate(case['tasks'])
                for row in case.get('actions',[]):
                    if row['valid']:agent_planning.action(case['tasks'],row['action'].get('taskId'))
                    else:
                        with self.assertRaises(ValueError):agent_planning.action(case['tasks'],row['action'].get('taskId'))
