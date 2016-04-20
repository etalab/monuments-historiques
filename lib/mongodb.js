const MongoClient = require('mongodb').MongoClient;

const MONGODB_URL = process.env.MONGODB_URL || process.env.npm_package_config_MONGODB_URL;

function getCollection(collectionName) {
    return MongoClient.connect(MONGODB_URL)
        .then(db => db.collection(collectionName));
}

module.exports = { getCollection };
