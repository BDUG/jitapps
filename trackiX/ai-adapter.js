(function () {
  'use strict';
  const A = TrackixApp;
  window.SuiteAgentAdapter = {
    name: 'trackiX',
    contextLabel: 'issue tracker',
    placeholder: 'Triage unassigned bugs, plan Sprint 15, or break down an epic into stories…',
    instructions: 'You are an agile engineering partner editing a trackiX issue-tracking board (Jira-style epics, stories, tasks, bugs, subtasks, and sprints). Answer questions with proposal:null, or propose a COMPLETE validated project JSON object. Preserve unrelated issue IDs, keys, comments, and sprints. Use statuses backlog, todo, in_progress, in_review, done and priorities lowest, low, medium, high, highest. Never invent completed verification or test results. All proposed edits require user review and application.',
    schema: Trackix.schema,
    snapshot: A.snapshot,
    selection: A.selection,
    validate: A.validate,
    apply: A.apply,
    restore: A.restore,
    isBusy: A.isBusy,
  };
})();
