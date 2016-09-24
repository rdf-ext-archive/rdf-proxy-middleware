var Promise = require('bluebird')
var absoluteUrl = require('absolute-url')
var bodyParser = require('rdf-body-parser')
var clone = require('lodash/clone')
var formats = require('rdf-formats-common')()
var hijackResponse = require('hijackresponse')
var rdf = require('rdf-ext')
var rdfFetch = require('rdf-fetch')
var url = require('url')

function proxy (endpoint, pathname, options) {
  options = options || {}

  options.formats = options.formats || formats

  var endpointUrl = url.parse(endpoint)

  return function (req, res, next) {
    pathname = pathname || req.baseUrl

    absoluteUrl.attach(req)

    return bodyParser.attach(req, res).then(function () {
      var proxyUrl = url.parse(req.absoluteUrl())

      proxyUrl.pathname = pathname

      return proxy.fetch(req, endpointUrl, proxyUrl, options).then(function (result) {
        return proxy.send(res, endpointUrl, proxyUrl, result)
      })
    }).catch(function (err) {
      next(err)
    })
  }
}

proxy.forward = function (from, to) {
  return function (req, res, next) {
    hijackResponse(res, function (err, res) {
      var data

      res.on('data', function (chunk) {
        data = data ? data + chunk : chunk
      })

      res.on('end', function () {
        var mediaType = res.req.accepts(formats.parsers.list())

        formats.parsers.parse(mediaType, data.toString()).then(function (graph) {
          graph = proxy.patchGraph(graph, from, to)

          return formats.serializers.serialize(mediaType, graph).then(function (serialized) {
            delete res._headers['content-length']
            res.end(serialized)
          })
        }).catch(function (err) {
          res.unhijack()
          next(err)
        })
      })

      res.on('error', function (err) {
        res.unhijack()
        next(err)
      })
    })

    next()
  }
}

proxy.patchTerm = function (term, from, to) {
  if (term.interfaceName === 'NamedNode' && term.nominalValue.indexOf(from) === 0) {
    return rdf.createNamedNode(to + term.nominalValue.slice(from.length))
  }

  return term
}

proxy.patchGraph = function (graph, from, to) {
  if (!graph) {
    return graph
  }

  return rdf.createGraph(graph.map(function (triple) {
    return rdf.createTriple(
      proxy.patchTerm(triple.subject, from, to),
      proxy.patchTerm(triple.predicate, from, to),
      proxy.patchTerm(triple.object, from, to))
  }))
}

proxy.fetch = function (req, endpointUrl, proxyUrl, options) {
  var requestUrl = url.parse(req.absoluteUrl())

  requestUrl.host = endpointUrl.host
  requestUrl.pathname = requestUrl.pathname.replace(proxyUrl.pathname, endpointUrl.pathname)

  var headers = clone(req.headers)

  headers.host = requestUrl.host

  if (options.mediaType) {
    headers['accept'] = options.mediaType

    if (req.graph) {
      headers['content-type'] = options.mediaType
    }
  }

  req.graph = proxy.patchGraph(req.graph, url.format(proxyUrl), url.format(endpointUrl))

  return rdfFetch(url.format(requestUrl), {method: req.method.toLowerCase(), headers: headers, body: req.graph})
}

proxy.send = function (res, endpointUrl, proxyUrl, result) {
  res.status(result.status)

  if (result.graph) {
    return res.sendGraph(proxy.patchGraph(result.graph, url.format(endpointUrl), url.format(proxyUrl)), res.req.headers.accept)
  } else {
    return Promise.promisify(res.end, {context: res})()
  }
}

module.exports = proxy
