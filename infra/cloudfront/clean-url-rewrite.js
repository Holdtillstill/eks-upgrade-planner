function handler(event) {
  var request = event.request;
  var uri = request.uri || '/';

  if (uri === '/api' || uri.indexOf('/api/') === 0) {
    return {
      statusCode: 404,
      statusDescription: 'Not Found',
      headers: {
        'cache-control': { value: 'no-store' },
        'content-type': { value: 'application/json; charset=utf-8' },
        'x-content-type-options': { value: 'nosniff' },
        'x-robots-tag': { value: 'noindex, nofollow' },
      },
      body: '{"status":"not_found","message":"No EKS Upgrade Planner API route exists at this URL."}',
    };
  }

  if (uri === '/') {
    request.uri = '/index.html';
    return request;
  }

  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
    return request;
  }

  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') === -1) {
    request.uri = uri + '/index.html';
  }

  return request;
}
