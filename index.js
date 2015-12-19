var carrier = require('carrier')
var mongodb = require('mongodb')
var morgan = require('morgan')
var stream = require('stream')

var MongoClient = mongodb.MongoClient
var PassThroughStream = stream.PassThrough

module.exports = mongoMorgan

function mongoMorgan(mongodbUrl, format, options) {
  var args = Array.prototype.slice.call(arguments);

  if (args.length === 0) {
    throw new Error('mongodbUrl can not be empty.')
  } else if (args.length > 0 && typeof mongodbUrl !== 'string') {
    throw new Error('mongodbUrl can not be object, it should be string.')
  }

  // check format and object
  if (typeof format === 'object') {
    options = format
    format = undefined
  }
  options = options || {}

  var buffer = []
  var collection = options.collection || 'request'

  // create stream for morgan to write to
  var stream = new PassThroughStream()

  // create stream to read from
  var lineStream = carrier.carry(stream)
  lineStream.on('line', onLine)

  // create mongo client
  var mongoCollection = null
  MongoClient.connect(mongodbUrl, onConnect)

  // mixin options
  options.stream = stream



  function onConnect(error, mongoDb) {
    if (error) {
      throw error
    }

    mongoDb.collection(collection, {
      w: 0
    }, function(error, collection) {
      mongoCollection = collection
      while (buffer.length !== 0) {
        var entry = buffer.shift()
        mongoCollection.insert(entry)
      }
    })
  }

  function onLine(line) {
    function makeObjectEntry(line){
      try {
        var entry = JSON.parse(line);
        return typeof entry === 'object' ? entry : undefined;
      }
      catch(ex) {
        return;
      }
    }

    function makeTextEntry(line){
      return {
        time: Date.now(),
            request: line
      };
    }

    var entry = makeObjectEntry(line) || makeTextEntry(line);

    buffer.push(entry)

    if (!mongoCollection) {
      return
    }

    while (buffer.length !== 0) {
      entry = buffer.shift()
      mongoCollection.insert(entry)
    }
  }

  args = []
  if (format) {
    args.push(format)
  }
  if (options) {
    args.push(options)
  }

  return morgan.apply(null, args)
}

module.exports.token = function(name, fn) {
  return morgan.token(name, fn);
};

module.exports.format = function(name, fmt) {
  return morgan.format(name, fmt);
};