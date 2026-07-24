export function deriveResource(controllerClass: Function): string {
  const name = controllerClass.name;
  const withoutSuffix = name.replace(/Controller$/i, '');
  return withoutSuffix.toLowerCase();
}

export function deriveAction(method: string, path: string): string {
  const segments = path.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1]?.toLowerCase();

  if (lastSegment === 'update') return 'update';
  if (lastSegment === 'delete') return 'delete';

  const actionMap: Record<string, string> = {
    GET: 'read',
    POST: 'create',
    PATCH: 'update',
    PUT: 'update',
    DELETE: 'delete',
  };

  return actionMap[method] || 'read';
}

export function derivePermission(
  controllerClass: Function,
  method: string,
  path: string,
): string {
  const resource = deriveResource(controllerClass);
  const action = deriveAction(method, path);
  return `${action}:${resource}`;
}
