const getCollection = require('./lib/mongodb').getCollection;
const JSONStream = require('JSONStream');
const fs = require('fs');

function streamCollectionToFile(collection) {
    return new Promise((resolve, reject) => {
        collection.find({}).stream().on('error', reject)
            .pipe(JSONStream.stringify()).on('error', reject)
            .pipe(fs.createWriteStream(__dirname + '/dist/mh.json'))
            .on('finish', resolve);
    });
}

getCollection('servitudes')
    .then(streamCollectionToFile)
    .then(() => process.exit(0));
