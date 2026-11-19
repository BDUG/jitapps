for (const connection of api.connections.all()) {
  const source = api.connections.source(connection.id);
  const target = api.connections.target(connection.id);
  if (source && target && source.name !== target.name) {
    api.report({severity:'error', message:'Connected data points must have the same name: ' + source.name + ' ≠ ' + target.name,
      connectionId:connection.id, nodeId:connection.source.instanceId, portId:connection.source.portId, blocksConnection:true});
  }
}
