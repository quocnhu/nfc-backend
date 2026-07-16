import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { HistoryService } from '../../history/history.service';

/**
 * METHOD_ACTION_MAP — Maps HTTP methods to CRUD action names.
 */
const METHOD_ACTION_MAP: Record<string, string> = {
  POST: 'create',
  PATCH: 'update',
  PUT: 'update',
  DELETE: 'delete',
  GET: 'read',
};

/**
 * Friendly resource names for display.
 */
const RESOURCE_NAMES: Record<string, string> = {
  'user': 'User',
  'role': 'Role',
  'permission': 'Permission',
  'sharing-content': 'Sharing Content',
  'auth': 'Auth',
  'dashboard': 'Dashboard',
  'history': 'History',
};

/**
 * HistoryInterceptor — Automatically logs detailed history for write operations.
 *
 * Records:
 *   - Which user performed the action
 *   - What action was taken (create/update/delete)
 *   - What resource was affected (user, role, sharing-content)
 *   - What fields were changed (for updates)
 *   - The entity name/label for easy identification
 */
@Injectable()
export class HistoryInterceptor implements NestInterceptor {
  constructor(private historyService: HistoryService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const rawPath = request.route?.path || '';
    const cleanPath = rawPath.replace(/^\/api\//, '/');
    const segments = cleanPath.split('/').filter(Boolean);
    const resource = segments[0] || 'unknown';
    // Detect action from route path (this project uses POST for all mutations)
    const lastSegment = segments[segments.length - 1] || '';
    let action = METHOD_ACTION_MAP[request.method] || request.method;
    if (lastSegment === 'delete') action = 'delete';
    else if (lastSegment === 'update') action = 'update';
    else if (lastSegment === 'assign-permissions') action = 'update';
    else if (lastSegment === 'change-password' || lastSegment === 'admin-change-password') action = 'update';
    const body = request.body;
    const params = request.params;

    // Store request body before handler runs so we can capture old values for updates
    const requestBody = body ? { ...body } : null;

    return next.handle().pipe(
      tap(async (response) => {
        if (!user?.sub || action === 'read') return;

        const httpMethod = request.method;
        const routePath = request.route?.path || '';

        const details = this.buildDetails({
          action,
          resource,
          params,
          requestBody,
          responseBody: response?.data,
          httpMethod,
          routePath,
        });

        await this.historyService.log(
          user.sub,
          `${action}:${resource}`,
          params?.id || response?.data?.id || null,
          resource,
          details,
        );
      }),
    );
  }

  /**
   * Build a human-readable details string describing what happened.
   */
  private buildDetails(opts: {
    action: string;
    resource: string;
    params: any;
    requestBody: any;
    responseBody: any;
    httpMethod: string;
    routePath: string;
  }): string {
    const { action, resource, params, requestBody, responseBody, httpMethod, routePath } = opts;
    const resourceName = RESOURCE_NAMES[resource] || resource;
    const route = `${httpMethod} ${routePath}`;

    // Extract a label/name from body or response for display
    const name = requestBody?.fullname
      || requestBody?.name
      || requestBody?.email
      || requestBody?.title
      || requestBody?.url
      || null;

    switch (action) {
      case 'create': {
        const label = name || this.extractNameFromResponse(responseBody);
        return `${route} | Created ${resourceName}${label ? ` "${label}"` : ''}`;
      }
      case 'update': {
        const label = name || requestBody?.id || params?.id || null;
        const changedFields = requestBody
          ? Object.keys(requestBody).filter(k => k !== 'id' && k !== 'createdAt')
          : [];
        const fieldsStr = changedFields.length > 0 ? changedFields.join(', ') : 'unknown fields';
        return `${route} | Updated ${resourceName}${label ? ` "${label}"` : ''} — changed: ${fieldsStr}`;
      }
      case 'delete': {
        const label = params?.id || requestBody?.id || null;
        return `${route} | Deleted ${resourceName}${label ? ` (${label})` : ''}`;
      }
      default:
        return `${route} | ${action} ${resourceName}`;
    }
  }

  /**
   * Try to extract a display name from the response body.
   */
  private extractNameFromResponse(data: any): string | null {
    if (!data) return null;
    return data.fullname || data.name || data.email || data.title || data.id || null;
  }
}
