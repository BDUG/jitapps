for (const instance of api.instances.all()) {
  for (const point of api.instances.ports(instance.id)) {
    if (!api.instances.connected(instance.id, point.id)) {
      api.highlightPort(instance.id, point.id, 'red', instance.name + ' → ' + point.name + ': unconnected data point');
    }
  }
}
