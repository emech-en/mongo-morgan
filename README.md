mongo-morgan
============
[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Build Status][travis-image]][travis-url]

This is build upon [morgan](https://github.com/expressjs/morgan) module which saves logs to mongodb database

## API

```js
var mongo-morgan = require('mongo-morgan')
```

### morgan(mongodburl, format, options)

Create a new mongo-morgan logger middleware function using the given `mongodburl`, `format` and `options`.
The `mongodburl` is required and is connection string to mongodb
The `format` (same as [morgan](https://github.com/expressjs/morgan) module) argument may be a string of a predefined name (see below for the names),
a string of a format string, or a function that will produce a log entry. 

#### Options

Options is as same as [morgan](https://github.com/expressjs/morgan) module. Just added `collection` properties.

#### collection

Save logs to the given collection in mongodb. defaults to `requests`. 

```js
// EXAMPLE: save logs to logs collection
morgan('url', 'combined', {
  collection: 'logs'
})
```

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/mongo-morganmorgan.svg?style=flat
[npm-url]: https://npmjs.org/package/mongo-morgan
[travis-image]: https://img.shields.io/travis/emech-en/mongo-morgan.svg?style=flat
[travis-url]: https://travis-ci.org/emech-en/mongo-morgan
[downloads-image]: https://img.shields.io/npm/dm/mongo-morgan.svg?style=flat
[downloads-url]: https://npmjs.org/package/mongo-morgan

