process.env.NO_DEPRECATION = 'morgan'

var assert = require('assert');
var http = require('http');
var morgan = require('..');
var request = require('supertest');
var MongoClient = require('mongodb');
var MONGODB_URL = 'mongodb://mongodb/mongo-morgan-test';
var COLLECTION = 'request';
var mongoCollection = null
var lastLogLine;

if (!MONGODB_URL) {
  console.log('no db connection string');
  process.exit(1)
}

function saveLastLogLine(line) {
  lastLogLine = line;
}

function getLastLog(next, count) {
  if (!count) count = 0

  if (mongoCollection)
    mongoCollection.findOne({}, function(error, log) {
      if (error)
        return next(error)
      if (!log)
        if (count < 1000)
          return getLastLog(next, count + 1)
        else
          return next('no log')
      return next(null, log.request || log)
    })
  else
    return next('no mongo collection')
}

function createLogger(format, opts) {
  var args = Array.prototype.slice.call(arguments)
  var i = Number(typeof args[0] !== 'object')
  var options = args[i] || {}

  if (typeof options === 'object' && !options.stream) {
    options.stream = {
      'write': saveLastLogLine
    }
    lastLogLine = null
    args[i] = options
  }

  var mongoArgs = [MONGODB_URL]
  if (args[0])
    mongoArgs.push(args[0])
  if (args[1])
    mongoArgs.push(args[1])

  return morgan.apply(null, mongoArgs)
}

function createServer(format, opts, fn, fn1) {
  var logger = createLogger(format, opts)
  var middle = fn || noopMiddleware
  return http.createServer(function onRequest(req, res) {
    // prior alterations
    if (fn1) {
      fn1(req, res)
    }
    logger(req, res, function onNext(err) {
      // allow req, res alterations
      middle(req, res, function onDone() {
        if (err) {
          res.statusCode = 500
          res.end(err.message)
        }

        res.setHeader('X-Sent', 'true')
        res.end((req.connection && req.connection.remoteAddress) || '-')
      })
    })
  })
}

function noopMiddleware(req, res, next) {
  next()
}


describe('logger()', function() {
  this.timeout(50000)

  beforeEach(function(done) {
    function onConnect(error, mongoDb) {
      if (error) {
        return done(error)
      }
      mongoCollection = mongoDb.collection(COLLECTION)
      removeAllLogs(done)
    }

    function removeAllLogs(next) {
      if (mongoCollection) {
        mongoCollection.remove({}, next)
      } else {
        next('mongoCollection is null')
      }
    }

    if (!mongoCollection)
      MongoClient.connect(MONGODB_URL, onConnect)
    else
      removeAllLogs(done)
  })

  describe('arguments', function() {
    it('should use default format', function(done) {
      request(createServer())
        .get('/')
        .end(function(err, res) {
          if (err) return done(err, res)
          assert(res.text.length > 0)
          getLastLog(function(error, lastLogLine) {
            if (error)
              return done(error)
            assert.equal(lastLogLine.substr(0, res.text.length), res.text)
            return done()
          })
        })
    })

    describe('format', function() {
      it('should accept format as format name', function(done) {
        request(createServer('tiny'))
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert(/^GET \/ 200 - - \d+\.\d{3} ms$/.test(lastLogLine))
              return done()
            })
          })
      })

      it('should accept format as format string', function(done) {
        request(createServer(':method :url'))
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, 'GET /')
              return done()
            })
          })
      })

      it('should accept format as function', function(done) {
        var line;
        var server = createServer(function(tokens, req, res) {
          line = [req.method, req.url, res.statusCode].join(' ') + ''
        })

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            assert.equal(line, 'GET / 200')
            done()
          })
      })

      it('should accept format in options for back-compat', function(done) {
        request(createServer({
            format: ':method :url'
          }))
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, 'GET /')
              return done()
            })
          })
      })

      it('should reject format as bool', function() {
        assert.throws(createServer.bind(null, true), /argument format/)
      })
    })
  })

  describe('tokens', function() {
    describe(':date', function() {
      it('should get current date in "web" format by default', function(done) {
        var server = createServer(':date')

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert(/^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/m.test(lastLogLine))
              return done()
            })
          })
      })

      it('should get current date in "clf" format', function(done) {
        var server = createServer(':date[clf]')

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert(/^\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2} \+0000$/m.test(lastLogLine))
              return done()
            })
          })
      })

      it('should get current date in "iso" format', function(done) {
        var server = createServer(':date[iso]')

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/m.test(lastLogLine))
              return done()
            })
          })
      })

      it('should get current date in "web" format', function(done) {
        var server = createServer(':date[web]')

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert(/^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/m.test(lastLogLine))
              return done()
            })
          })
      })

      it('should be blank for unknown format', function(done) {
        var server = createServer(':date[bogus]')

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, '-')
              return done()
            })
          })
      })
    })

    describe(':req', function() {
      it('should get request properties', function(done) {
        var server = createServer(':req[x-from-string]')

        request(server)
          .get('/')
          .set('x-from-string', 'me')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, 'me')
              return done()
            })
          })
      })
    })

    describe(':res', function() {
      it('should get response properties', function(done) {
        var server = createServer(':res[x-sent]')

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, 'true')
              return done()
            })
          })
      })
    })

    describe(':remote-addr', function() {
      it('should get remote address', function(done) {
        var server = createServer(':remote-addr')

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, res.text + '')
              return done()
            })
          })
      })

      it('should use req.ip if there', function(done) {
        var server = createServer(':remote-addr', null, null, function(req) {
          req.ip = '10.0.0.1'
        })

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, '10.0.0.1')
              return done()
            })
          })
      })

      it('should work on https server', function(done) {
        var fs = require('fs')
        var https = require('https')
        var cert = fs.readFileSync(__dirname + '/fixtures/server.crt', 'ascii')
        var logger = createLogger(':remote-addr')
        var server = https.createServer({
          key: fs.readFileSync(__dirname + '/fixtures/server.key', 'ascii'),
          cert: cert
        })

        server.on('request', function(req, res) {
          logger(req, res, function(err) {
            delete req._remoteAddress
            res.end(req.connection.remoteAddress)
          })
        })

        var agent = new https.Agent({
          ca: cert
        })
        var createConnection = agent.createConnection

        agent.createConnection = function(options) {
          options.servername = 'morgan.local'
          return createConnection.call(this, options)
        };

        var req = request(server).get('/')
        req.agent(agent)
        req.end(function(err, res) {
          if (err) return done(err)
          getLastLog(function(error, lastLogLine) {
            if (error) return done(error)
            assert.equal(lastLogLine, res.text + '')
            return done()
          })
        })
      })

      it('should work when connection: close', function(done) {
        var server = createServer(':remote-addr')

        request(server)
          .get('/')
          .set('Connection', 'close')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, res.text + '')
              return done()
            })
          })
      })

      it('should work when connection: keep-alive', function(done) {
        var server = createServer(':remote-addr', null, function(req, res, next) {
          delete req._remoteAddress
          next()
        })

        request(server.listen())
          .get('/')
          .set('Connection', 'keep-alive')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, res.text + '')
              res.req.connection.destroy()
              return server.close(done)
            })
          })
      })

      it('should work when req.ip is a getter', function(done) {
        var server = createServer(':remote-addr', null, null, function(req) {
          Object.defineProperty(req, 'ip', {
            get: function() {
              return req.connection.remoteAddress ? '10.0.0.1' : undefined
            }
          })
        })

        request(server)
          .get('/')
          .set('Connection', 'close')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, '10.0.0.1')
              return done()
            })
          })
      })

      it('should not fail if req.connection missing', function(done) {
        var server = createServer(':remote-addr', null, null, function(req) {
          delete req.connection
        })

        request(server.listen())
          .get('/')
          .set('Connection', 'keep-alive')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, res.text + '')
              res.req.connection.destroy()
              server.close(done)
            })
          })
      })
    })

    describe(':remote-user', function() {
      it('should be empty if none present', function(done) {
        var server = createServer(':remote-user')

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, '-')
              done()
            })
          })
      })

      it('should support Basic authorization', function(done) {
        var server = createServer(':remote-user')

        request(server)
          .get('/')
          .set('Authorization', 'Basic dGo6')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, 'tj')
              done()
            })
          })
      })

      it('should be empty for empty Basic authorization user', function(done) {
        var server = createServer(':remote-user')

        request(server)
          .get('/')
          .set('Authorization', 'Basic Og==')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, '-')
              done()
            })
          })
      })
    })

    describe(':response-time', function() {
      it('should be in milliseconds', function(done) {
        var start = Date.now()
        var server = createServer(':response-time')

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              var end = Date.now()
              var ms = parseFloat(lastLogLine)
              assert(ms > 0)
              assert(ms < end - start + 1)
              done()
            })
          })
      })

      it('should be empty without hidden property', function(done) {
        var server = createServer(':response-time', null, function(req, res, next) {
          delete req._startAt
          next()
        })

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, '-')
              done()
            })
          })
      })

      it('should be empty before response', function(done) {
        var server = createServer(':response-time', {
          immediate: true
        })

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, '-')
              done()
            })
          })
      })
    })

    describe(':status', function() {
      it('should get response status', function(done) {
        var server = createServer(':status')

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, res.statusCode + '')
              done()
            })
          })
      })

      it('should not exist before response sent', function(done) {
        var server = createServer(':status', {
          immediate: true
        })

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              assert.equal(lastLogLine, '-')
              done()
            })
          })
      })

      it('should not exist for aborted request', function(done) {
        var stream = {
          write: writeLog
        }
        var server = createServer(':status', {
          stream: stream
        }, function() {
          test.abort()
        })

        function writeLog(log) {
          assert.equal(log, '-')
          server.close()
          done()
        }

        var test = request(server).post('/')
        test.write('0')

        getLastLog(function(error, lastLogLine) {
          if (error) return done(error)
          assert.equal(lastLogLine, '-')
          done()
        })
      })
    })

    describe('custom', function(){
      before(function(){
        morgan.token('customToken', function(){
          return 'valueOfCustomToken';
        });
      });


      it('should get custom token', function(done) {
        var server = createServer(':customToken');

        request(server)
            .get('/')
            .end(function(err, res) {
              if (err) return done(err)
              getLastLog(function(error, lastLogLine) {
                if (error) return done(error)
                assert.equal(lastLogLine, 'valueOfCustomToken')
                done()
              })
            })
      })
    })
  })

  describe('formats', function() {
    describe('combined', function() {
      it('should match expectations', function(done) {
        var server = createServer('combined')

        request(server)
          .get('/')
          .set('Authorization', 'Basic dGo6')
          .set('Referer', 'http://localhost/')
          .set('User-Agent', 'my-ua')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              var line = lastLogLine.replace(/\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2} \+0000/, '_timestamp_')
              assert.equal(line, res.text + ' - tj [_timestamp_] "GET / HTTP/1.1" 200 - "http://localhost/" "my-ua"')
              done()
            })
          })
      })
    })

    describe('common', function() {
      it('should match expectations', function(done) {
        var server = createServer('common')

        request(server)
          .get('/')
          .set('Authorization', 'Basic dGo6')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              var line = lastLogLine.replace(/\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2} \+0000/, '_timestamp_')
              assert.equal(line, res.text + ' - tj [_timestamp_] "GET / HTTP/1.1" 200 -')
              done()
            })
          })
      })
    })

    describe('default', function() {
      it('should match expectations', function(done) {
        var server = createServer('default')

        request(server)
          .get('/')
          .set('Authorization', 'Basic dGo6')
          .set('Referer', 'http://localhost/')
          .set('User-Agent', 'my-ua')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              var line = lastLogLine.replace(/\w+, \d+ \w+ \d+ \d+:\d+:\d+ \w+/, '_timestamp_')
              assert.equal(line, res.text + ' - tj [_timestamp_] "GET / HTTP/1.1" 200 - "http://localhost/" "my-ua"')
              done()
            })
          })
      })
    })

    describe('dev', function() {
      it('should color 200 green', function(done) {
        var server = createServer('dev')

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              lastLogLine = lastLogLine.replace(/\x1b\[(\d+)m/g, '_color_$1_')
              assert.equal(lastLogLine.substr(0, 38), '_color_0_GET / _color_32_200 _color_0_')
              assert.equal(lastLogLine.substr(-9), '_color_0_')
              done()
            })
          })
      })

      it('should color 500 red', function(done) {
        var server = createServer('dev', null, function(req, res, next) {
          res.statusCode = 500
          next()
        })

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              lastLogLine = lastLogLine.replace(/\x1b\[(\d+)m/g, '_color_$1_')
              assert.equal(lastLogLine.substr(0, 38), '_color_0_GET / _color_31_500 _color_0_')
              assert.equal(lastLogLine.substr(-9), '_color_0_')
              done()
            })
          })
      })

      it('should color 400 yelow', function(done) {
        var server = createServer('dev', null, function(req, res, next) {
          res.statusCode = 400
          next()
        })

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              lastLogLine = lastLogLine.replace(/\x1b\[(\d+)m/g, '_color_$1_')
              assert.equal(lastLogLine.substr(0, 38), '_color_0_GET / _color_33_400 _color_0_')
              assert.equal(lastLogLine.substr(-9), '_color_0_')
              done()
            })
          })
      })

      it('should color 300 cyan', function(done) {
        var server = createServer('dev', null, function(req, res, next) {
          res.statusCode = 300
          next()
        })

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              lastLogLine = lastLogLine.replace(/\x1b\[(\d+)m/g, '_color_$1_')
              assert.equal(lastLogLine.substr(0, 38), '_color_0_GET / _color_36_300 _color_0_')
              assert.equal(lastLogLine.substr(-9), '_color_0_')
              done()
            })
          })
      })
    })

    describe('short', function() {
      it('should match expectations', function(done) {
        var server = createServer('short')

        request(server)
          .get('/')
          .set('Authorization', 'Basic dGo6')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              var line = lastLogLine.replace(/\d+\.\d{3} ms/, '_timer_')
              assert.equal(line, res.text + ' tj GET / HTTP/1.1 200 - - _timer_')
              done()
            })
          })
      })
    })

    describe('tiny', function() {
      it('should match expectations', function(done) {
        var server = createServer('tiny')

        request(server)
          .get('/')
          .end(function(err, res) {
            if (err) return done(err)
            getLastLog(function(error, lastLogLine) {
              if (error) return done(error)
              var line = lastLogLine.replace(/\d+\.\d{3} ms/, '_timer_')
              assert.equal(line, 'GET / 200 - - _timer_')
              done()
            })
          })
      })
    })

    describe('custom', function(){
      before(function(){
        morgan.format('customFormat', 'valueOfCustomFormat');
      });


      it('should get custom format', function(done) {
        var server = createServer('customFormat');

        request(server)
            .get('/')
            .end(function(err, res) {
              if (err) return done(err)
              getLastLog(function(error, lastLogLine) {
                if (error) return done(error)
                assert.equal(lastLogLine, 'valueOfCustomFormat')
                done()
              })
            })
      })

      it('should handle custom JSON format', function(done) {
        var server = createServer('{"custom": {"format": "json"}}');

        request(server)
            .get('/')
            .end(function(err, res) {
              if (err) return done(err)
              getLastLog(function(error, lastLogLine) {
                if (error) return done(error)

                assert.equal(JSON.stringify(lastLogLine.custom), '{"format":"json"}');
                done()
              })
            })
      })
    })
  })

  // describe('with buffer option', function() {
  //   it('should flush log periodically', function(done) {
  //     var count = 0;
  //     var server = createServer(':method :url', {
  //       buffer: true,
  //       stream: {
  //         write: writeLog
  //       }
  //     })

  //     function writeLog(log) {
  //       assert.equal(log, 'GET /first\nGET /second\n')
  //       server.close()
  //       done()
  //     }

  //     server = server.listen()
  //     request(server)
  //       .get('/first')
  //       .end(function(err, res) {
  //         if (err) throw err
  //         count++
  //         request(server)
  //           .get('/second')
  //           .end(function(err, res) {
  //             if (err) throw err
  //             count++
  //           })
  //       })
  //   })

  //   it('should accept custom interval', function(done) {
  //     var count = 0;
  //     var server = createServer(':method :url', {
  //       buffer: 200,
  //       stream: {
  //         write: writeLog
  //       }
  //     })

  //     function writeLog(log) {
  //       assert.equal(log, 'GET /first\nGET /second\n')
  //       server.close()
  //       done()
  //     }

  //     server = server.listen()
  //     request(server)
  //       .get('/first')
  //       .end(function(err, res) {
  //         if (err) throw err
  //         count++
  //         request(server)
  //           .get('/second')
  //           .end(function(err, res) {
  //             if (err) throw err
  //             count++
  //           })
  //       })
  //   })
  // })

  describe('with immediate option', function() {
    it('should log before response', function(done) {
      var server = createServer(':method :url :res[x-sent]', {
        immediate: true
      })

      request(server)
        .get('/')
        .end(function(err, res) {
          if (err) return done(err)
          getLastLog(function(error, lastLogLine) {
            if (error) return done(error)
            assert.equal(lastLogLine, 'GET / -')
            done()
          })
        })
    })
  })

  describe('with skip option', function() {
    it('should be able to skip based on request', function(done) {
      function skip(req) {
        return ~req.url.indexOf('skip=true')
      }

      var server = createServer({
        'format': 'default',
        'skip': skip
      })

      request(server)
        .get('/?skip=true')
        .set('Connection', 'close')
        .end(function(err, res) {
          if (err) return done(err)
          getLastLog(function(error, lastLogLine) {
            assert(error == 'no log')
            done()
          })
        })
    })

    it('should be able to skip based on response', function(done) {
      function skip(req, res) {
        return res.statusCode === 200
      }

      var server = createServer({
        'format': 'default',
        'skip': skip
      })

      request(server)
        .get('/')
        .end(function(err, res) {
          if (err) return done(err)
          getLastLog(function(error, lastLogLine) {
            assert(error == 'no log')
            done()
          })
        })
    })
  })

  describe('with collection option', function() {
    before(function() {
      COLLECTION = 'REQUEST2'
      mongoCollection = null
    })

    it('should save logs in other collection', function(done) {
      var server = createServer({
        'format': 'default',
        'collection': COLLECTION
      })

      request(server)
        .get('/')
        .end(function(err, res) {
          if (err) return done(err)
          getLastLog(function(error, lastLogLine) {
            if (error) return done(error)
            assert(lastLogLine)
            done()
          })
        })
    })
  })
})