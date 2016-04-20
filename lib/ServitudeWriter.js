'use strict';
const Writable = require('stream').Writable;
const getCollection = require('./mongodb').getCollection;
const _ = require('lodash');

const collectionPromise = getCollection('servitudes');

class ServitudeWriter extends Writable {

    constructor(key) {
        super({ objectMode: true });
        this.key = key;
    }

    _write(chunk, encoding, callback) {
        if (!chunk[this.key]) return callback();

        const query = {};
        query[this.key] = chunk[this.key];
        const changes = _.omit(chunk, this.key);
        collectionPromise.then(collection => {
            collection.findOneAndUpdate(query, _.size(changes) > 0 ? {$set: changes} : {}, { upsert: true }, callback);
        }).catch(callback);
    }

}

module.exports = ServitudeWriter;
