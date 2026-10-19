window.ArchitexRuleExamples=[
  {
    "id": "same-data-point-name",
    "name": "Only connect data points with the same name",
    "enabled": false,
    "source": "for (const connection of api.connections.all()) {\n  const source = api.connections.source(connection.id);\n  const target = api.connections.target(connection.id);\n  if (source && target && source.name !== target.name) {\n    api.report({severity:'error', message:'Connected data points must have the same name: ' + source.name + ' ≠ ' + target.name,\n      connectionId:connection.id, nodeId:connection.source.instanceId, portId:connection.source.portId, blocksConnection:true});\n  }\n}"
  },
  {
    "id": "highlight-unconnected-data-points",
    "name": "Highlight unconnected data points in red",
    "enabled": false,
    "source": "for (const instance of api.instances.all()) {\n  for (const point of api.instances.ports(instance.id)) {\n    if (!api.instances.connected(instance.id, point.id)) {\n      api.highlightPort(instance.id, point.id, 'red', instance.name + ' → ' + point.name + ': unconnected data point');\n    }\n  }\n}"
  }
];
