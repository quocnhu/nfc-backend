/**
 * ApiResponse — Standard API response shape used across all endpoints.
 * All controllers return this format for consistency.
 */
export interface ApiResponse<T = any> {
  statusCode: number;
  success: boolean;
  message: string;
  data?: T;
}

/**
 * responseOk — Create a 200 OK response.
 * Used for successful reads, updates, and general operations.
 */
export function responseOk<T>(message: string, data?: T): ApiResponse<T> {
  return { statusCode: 200, success: true, message, data };
}

/**
 * responseCreated — Create a 201 Created response.
 * Used for successful resource creation (user, content, avatar).
 */
export function responseCreated<T>(message: string, data?: T): ApiResponse<T> {
  return { statusCode: 201, success: true, message, data };
}

/**
 * responseNoContent — Create a 204 No Content response.
 * Used for successful deletions with no response body.
 */
export function responseNoContent(message: string): ApiResponse {
  return { statusCode: 204, success: true, message };
}
