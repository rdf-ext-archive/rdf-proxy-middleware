# rdf-proxy-middleware

`rdf-proxy-middleware` is a reverse proxy middleware for RDF data with media type translation.
Any named nodes matching the proxy interface will be translated.
The middleware can be used to host RDF data with an alternative URLs.
The media type translation can be useful to add support for more formats to applications with very limited media type support.
Use cases are legacy applications or devices for the Web of Things.

## Usage

This example creates a reverse proxy to `http://192.168.1.1/` under the path `/device`.
The media type 'application/n-triples' will be used for all requests to the endpoint.

    var proxy = require('rdf-proxy-middleware')

    var app = express()

    var device = proxy('http://192.168.1.1/', '/device', {
      mediaType: 'application/n-triples'
    })

    app.use('/device', device)
