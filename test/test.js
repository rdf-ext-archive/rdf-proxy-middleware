/* global describe, it */

var Promise = require('bluebird')
var assert = require('assert')
var nock = require('nock')
var proxy = require('..')
var rdf = require('rdf-ext')

describe('rdf-proxy-middleware', function () {
  describe('.patchTerm', function () {
    it('should forward the term if it\'s not a NamedNode', function () {
      var term = {interfaceName: 'BlankNode', nominalValue: 'b1'}
      var from = 'http://example.org/'
      var to = 'http://example.com/'

      var patched = proxy.patchTerm(term, from, to)

      assert.equal(patched.nominalValue, term.nominalValue)
    })

    it('should forward the term if it doesn\'t match from', function () {
      var term = {interfaceName: 'NamedNode', nominalValue: 'http://test.com'}
      var from = 'http://example.org/'
      var to = 'http://example.com/'

      var patched = proxy.patchTerm(term, from, to)

      assert.equal(patched.nominalValue, term.nominalValue)
    })

    it('should replace the from part with to part if it\'s a NamedNode and from matches', function () {
      var term = {interfaceName: 'NamedNode', nominalValue: 'http://example.org/test'}
      var from = 'http://example.org/'
      var to = 'http://example.com/'

      var patched = proxy.patchTerm(term, from, to)

      assert.equal(patched.nominalValue, 'http://example.com/test')
    })
  })

  describe('.patchGraph', function () {
    it('should do nothing of the graph is not true', function () {
      var graph = false

      var patched = proxy.patchGraph(graph)

      assert.equal(patched, graph)
    })

    it('should patch subject, predicate and object', function () {
      var graph = rdf.createGraph([
        rdf.createTriple(
          rdf.createNamedNode('http://example.org/subject'),
          rdf.createNamedNode('http://example.org/predicate'),
          rdf.createNamedNode('http://example.org/object')
        )
      ])
      var from = 'http://example.org/'
      var to = 'http://example.com/'

      var patched = proxy.patchGraph(graph, from, to)
      var patchedTriple = patched.toArray().shift()

      assert.equal(patchedTriple.subject.nominalValue, 'http://example.com/subject')
      assert.equal(patchedTriple.predicate.nominalValue, 'http://example.com/predicate')
      assert.equal(patchedTriple.object.nominalValue, 'http://example.com/object')
    })
  })

  describe('.fetch', function () {
    it('should make a request to the patched URL', function () {
      var reqUrl = 'http://example.org/proxy/patched-url'

      var req = {
        absoluteUrl: function () {
          return reqUrl
        },
        headers: {},
        method: 'GET'
      }

      var endpointUrl = {
        host: 'example.com:8080',
        pathname: '/'
      }

      var proxyUrl = {
        pathname: '/proxy/'
      }

      var options = {}

      nock('http://example.com:8080')
        .get('/patched-url')
        .reply(function (url) {
          return [200, '', {'Content-Type': 'application/n-triples'}]
        })

      return proxy.fetch(req, endpointUrl, proxyUrl, options)
    })

    it('should not modify the request headers object', function () {
      var reqUrl = 'http://example.org/proxy/clone-headers'

      var req = {
        absoluteUrl: function () {
          return reqUrl
        },
        headers: {
          host: 'untouched'
        },
        method: 'GET'
      }

      var endpointUrl = {
        host: 'example.com:8080',
        pathname: '/'
      }

      var proxyUrl = {
        pathname: '/proxy/'
      }

      var options = {}

      nock('http://example.com:8080')
        .get('/clone-headers')
        .reply(function (url) {
          assert.equal(req.headers.host, 'untouched')

          return [200, '', {'Content-Type': 'application/n-triples'}]
        })

      return proxy.fetch(req, endpointUrl, proxyUrl, options)
    })

    it('should send the accept header with the given media type', function () {
      var reqUrl = 'http://example.org/proxy/access-header'

      var req = {
        absoluteUrl: function () {
          return reqUrl
        },
        headers: {},
        method: 'GET'
      }

      var endpointUrl = {
        host: 'example.com:8080',
        pathname: '/'
      }

      var proxyUrl = {
        pathname: '/proxy/'
      }

      var options = {
        mediaType: 'application/n-triples'
      }

      nock('http://example.com:8080')
        .get('/access-header')
        .reply(function (url) {
          assert.equal(this.req.headers.accept, 'application/n-triples')

          return [200, '', {'Content-Type': 'application/n-triples'}]
        })

      return proxy.fetch(req, endpointUrl, proxyUrl, options)
    })

    it('should send the patched graph serialized with the given media type', function () {
      var reqUrl = 'http://example.org/proxy/send-graph'

      var req = {
        absoluteUrl: function () {
          return reqUrl
        },
        graph: rdf.createGraph([
          rdf.createTriple(
            rdf.createNamedNode('http://example.org/subject'),
            rdf.createNamedNode('http://example.org/predicate'),
            rdf.createNamedNode('http://example.org/object')
          )
        ]),
        headers: {},
        method: 'POST'
      }

      var endpointUrl = {
        host: 'example.com:8080',
        pathname: '/'
      }

      var proxyUrl = {
        pathname: '/proxy/'
      }

      var options = {
        mediaType: 'application/n-triples'
      }

      nock('http://example.com:8080')
        .post('/send-graph')
        .reply(function (url, body) {
          assert.equal(this.req.headers['content-type'], 'application/n-triples')
          assert.equal(body, '<http://example.org/subject> <http://example.org/predicate> <http://example.org/object> .\n')

          return [200, '', {'Content-Type': 'application/n-triples'}]
        })

      return proxy.fetch(req, endpointUrl, proxyUrl, options)
    })
  })

  describe('.send', function () {
    it('should send the status code of result', function () {
      var statusCode = null

      var res = {
        end: function (callback) {
          callback()
        },
        status: function (code) {
          statusCode = code
        }
      }

      var endpointUrl = {}

      var proxyUrl = {}

      var result = {
        status: 200
      }

      return proxy.send(res, endpointUrl, proxyUrl, result).then(function () {
        assert.equal(statusCode, 200)
      })
    })

    it('should send the given graph', function () {
      var sentGraph = null
      var sentMediaType = null

      var res = {
        req: {
          headers: {
            accept: 'testMediaType'
          }
        },
        sendGraph: function (graph, mediaType) {
          sentGraph = graph
          sentMediaType = mediaType

          return Promise.resolve()
        },
        status: function () {}
      }

      var endpointUrl = {
        protocol: 'http:',
        host: 'example.com:8080',
        pathname: '/'
      }

      var proxyUrl = {
        protocol: 'http:',
        host: 'example.org',
        pathname: '/proxy/'
      }

      var graph = rdf.createGraph([
        rdf.createTriple(
          rdf.createNamedNode('http://example.com:8080/subject'),
          rdf.createNamedNode('http://example.com:8080/predicate'),
          rdf.createNamedNode('http://example.com:8080/object')
        )
      ])

      var patchedGraph = rdf.createGraph([
        rdf.createTriple(
          rdf.createNamedNode('http://example.org/proxy/subject'),
          rdf.createNamedNode('http://example.org/proxy/predicate'),
          rdf.createNamedNode('http://example.org/proxy/object')
        )
      ])

      var result = {
        graph: graph,
        status: 200
      }

      return proxy.send(res, endpointUrl, proxyUrl, result).then(function () {
        assert.equal(sentGraph.equals(patchedGraph), true)
        assert.equal(sentMediaType, 'testMediaType')
      })
    })
  })

  describe('proxy', function () {
    it('should forward the request to the mapped URL and translate the graphs', function (done) {
      var endpoint = 'http://example.com:8080/'
      var pathname = '/proxy/'
      var options = {
        mediaType: 'application/n-triples'
      }

      var req = {
        app: {
          get: function () {
            return false
          }
        },
        accepts: function (mediaType) {
          return mediaType
        },
        body: '<http://example.org/proxy/subject> <http://example.org/proxy/predicate> <http://example.org/proxy/object> .\n',
        headers: {
          accept: 'text/turtle',
          'content-type': 'text/turtle'
        },
        hostname: 'example.org',
        method: 'POST',
        protocol: 'http',
        socket: {
          address: function () {
            return {
              port: 80
            }
          }
        },
        url: '/proxy/proxy'
      }

      var res = {
        end: function (data, callback) {
          this.body = data

          callback()
        },
        headers: {},
        req: req,
        setHeader: function (key, value) {
          this.headers[key] = value
        },
        status: function (statusCode) {
          this.statusCode = statusCode
        }
      }

      var validate = function () {
        Promise.resolve().then(function () {
          assert.equal(res.headers['Content-Type'], 'text/turtle')
          assert.notEqual(res.body.indexOf('<http://example.org/proxy/subject> <http://example.org/proxy/predicate> <http://example.org/proxy/object>.'), -1)
        }).asCallback(done)
      }

      nock('http://example.com:8080')
        .post('/proxy')
        .reply(function (url, body) {
          assert.equal(this.req.headers['content-type'], 'application/n-triples')
          assert.equal(body, '<http://example.com:8080/subject> <http://example.com:8080/predicate> <http://example.com:8080/object> .\n')

          setTimeout(validate, 100)

          return [
            200,
            '<http://example.com:8080/subject> <http://example.com:8080/predicate> <http://example.com:8080/object> .\n',
            {'Content-Type': 'application/n-triples'}
          ]
        })

      proxy(endpoint, pathname, options)(req, res)
    })
  })
})
