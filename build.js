'use strict';
const JSONStream = require('JSONStream');
const request = require('request');
const _ = require('lodash');
const ServitudeWriter = require('./lib/ServitudeWriter');
const Promise = require('bluebird');
const getCollection = require('./lib/mongodb').getCollection;
const debug = require('debug')('prepare-data');
const through2 = require('through2');
const pg = require('pg');
const async = require('async');
const format = require('pg-format');
const iconv = require('iconv-lite');
const combine = require('stream-combiner');
const sources = require('./sources.json');

const globalCoverage = new Set();

// let pgEnd;

const PG_URL = process.env.PG_URL || process.env.npm_package_config_PG_URL;

const pgClient = new Promise((resolve, reject) => {
    pg.connect(PG_URL, function (err, client/*, done*/) {
        if (err) return reject(err);
        // pgEnd = _.once(done);
        resolve(client);
    });
});

const filters = {
    computeAssietteAC1: (row, cb) => {
        if (!row.generateur) return cb(null, row);

        pgClient.then(client => {
            client.query(format("SELECT ST_AsGeoJSON(ST_Buffer(ST_SetSRID(ST_GeomFromGeoJSON('%s'), 4326)::geography, 500)) result;", row.generateur), function (err, result) {
                if (err) console.error(err);
                row.assiette = JSON.parse(result.rows[0].result);
                cb();
            });
        }).catch(cb);
    },
    onlyValidAssiette: (row, cb) => {
        if (!row.assiette) return cb(null, row);

        pgClient.then(client => {
            client.query(format("SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON('%s'), 4326)) result;", row.assiette), function (err, result) {
                if (err) console.error(err);
                const valid = result.rows[0].result;
                if (!valid) {
                    debug('WARN: geometry not valid');
                    row.assiette = undefined;
                }
                cb();
            });
        }).catch(cb);
    },
};

function getPasserelleRequest(resourceId) {
    debug('fetching %s', resourceId);
    return request({
        url: `https://inspire.data.gouv.fr/api/geogw/${resourceId}/download`,
        qs: { format: 'GeoJSON', projection: 'WGS84' },
    });
}

function getParser(dataset) {
    const jsonDecoder = JSONStream.parse('features.*');
    if (dataset.decode) {
        debug('start decoding %s', dataset.decode);
        return combine(
            iconv.decodeStream(dataset.decode),
            jsonDecoder
        );
    }
    return jsonDecoder;
}

function getServitudeWriter(key) {
    return new ServitudeWriter(key);
}

function importDataset(dataset) {
    debug('importing dataset');
    let count = 0;
    dataset.coverage.forEach(dep => globalCoverage.add(dep));
    return new Promise((resolve, reject) => {
        getPasserelleRequest(dataset.resourceId)
            .pipe(getParser(dataset))
            .pipe(through2.obj((row, encoding, cb) => {
                count++;
                const transformedRow = {};
                _.forEach(dataset.mapping, (mappingDef, attrName) => {
                    const val = _.get(row, mappingDef);
                    if (val) transformedRow[attrName] = val;
                });
                _.forEach(dataset.set, (val, attrName) => {
                    transformedRow[attrName] = val;
                });
                if (dataset.filters) {
                    return async.each(dataset.filters, (filterName, filterApplied) => filters[filterName](transformedRow, filterApplied), () => {
                        cb(null, transformedRow);
                    });
                }
                cb(null, transformedRow);
            }))
            .pipe(getServitudeWriter(dataset.key))
            .on('finish', () => {
                debug('finished: %d', count);
                resolve();
            })
            .on('error', reject);
    });
}

function cleanCollection() {
    debug('cleaning collection');
    return getCollection('servitudes').then(servColl => servColl.remove({}));
}

function dropIndexes() {
    debug('dropping all indexes');
    return getCollection('servitudes').then(servColl => servColl.dropIndexes())
        // We must catch the following error. It's not a bug, it's a feature!
        .catch(err => {
            if (err.message.indexOf('ns not found') >= 0) return;
            throw err;
        });
}

function importAllSources() {
    return Promise.each(sources, importDataset);
}

dropIndexes()
    .then(cleanCollection)
    .then(importAllSources)
    .then(() => {
        debug('finished!');
        console.log('Couverture (départements): %s', JSON.stringify(Array.from(globalCoverage.values()).map(dep => dep.substr(3, 2))));
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
