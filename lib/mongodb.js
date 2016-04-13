const MongoClient = require('mongodb').MongoClient;

function getCollection() {
    return MongoClient.connect(process.env.MONGODB_URL || 'mongodb://localhost/urba')
        .then(db => db.collection('servitudes'));
}

module.exports = { getCollection };
