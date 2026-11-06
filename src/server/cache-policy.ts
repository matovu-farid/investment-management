/** Session-sensitive dynamic responses must not be retained by shared or browser caches. */
export function secureDynamicResponse(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'private, no-store')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
