function handler(event) {
  var request = event.request;
  var uri = request.uri || '/';

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
