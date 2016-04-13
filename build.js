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

const globalCoverage = new Set();

const datasets = [
    // Normandie
    {
        coverage: ['dep61'],
        resourceId: 'file-packages/6d92006611ee9c9542e65f201f3702427286ada3/N_MONUMENT_HISTO_S_061.TAB',
        recordId: '0ff13b671c8f4baac05a3860644854e7b5f6404d',
        source: 'passerelle',
        decode: 'win1252',
        filters: ['computeAssietteAC1'],
        key: 'codeMerimee',
        mapping: {
            nom: 'properties.NOM',
            codeMerimee: 'properties.REF_MER',
            codeLocal: 'properties.ID_MISTRAL',
            niveauProtection: 'properties.TYPE_JURIDIQUE',
            codeCommune: 'properties.INSEE',
            libelleCommune: 'properties.COMMUNE',
            generateur: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
    {
        coverage: ['dep61'],
        resourceId: 'file-packages/76343b34eb3d432d395ace9fd6eb8e7e3dcf4e19/N_MONUMENT_HISTO_AC1_ZINF_S_061.TAB',
        recordId: '5e288473f74a469e6a9fc2bca07ae6122d506fe3',
        source: 'passerelle',
        decode: 'win1252',
        key: 'codeLocal',
        mapping: {
            nom: 'properties.NOM',
            codeLocal: 'properties.Code',
            codeCommune: 'properties.Insee',
            libelleCommune: 'properties.Commune',
            assiette: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
    // Pays de la Loire
    {
        coverage: ['dep44', 'dep49', 'dep53', 'dep72', 'dep85'],
        resourceId: 'services/556c604a330f1fcd48337cff/feature-types/n_perimetre_mh_r52',
        recordId: '080e1094c6cf64ea3e27bd9cf01b1e1a52c331ed',
        source: 'passerelle',
        filters: ['onlyValidAssiette'],
        key: 'codeMerimee',
        mapping: {
            nom: 'properties.immeuble',
            codeLocal: 'properties.code',
            codeMerimee: 'properties.ref_merim',
            niveauProtection: 'properties.protection',
            codeCommune: 'properties.insee',
            libelleCommune: 'properties.commune',
            assiette: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
    // Bretagne
    {
        coverage: ['dep22', 'dep29', 'dep35', 'dep56'],
        resourceId: 'services/556c6066330f1fcd48338831/feature-types/drac:bretagne_ac1',
        source: 'passerelle',
        filters: ['onlyValidAssiette'],
        key: 'codeMerimee',
        mapping: {
            nom: 'properties.IMMEUBLE',
            adresse: 'properties.ADRESSE',
            codeMerimee: 'properties.REF_MERIM',
            codeCommune: 'properties.INSEE',
            libelleCommune: 'properties.COMMUNE',
            assiette: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
    // Midi-Pyrénées
    {
        coverage: ['dep09', 'dep12', 'dep31', 'dep32', 'dep46', 'dep65', 'dep81', 'dep82'],
        resourceId: 'services/55673a34330f1fcd4832db30/feature-types/monuments_historiques_immeuble',
        source: 'passerelle',
        key: 'codeMerimee',
        mapping: {
            nom: 'properties.libelle',
            codeMerimee: 'properties.cd_merimee',
            generateur: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
    {
        coverage: ['dep09', 'dep12', 'dep31', 'dep32', 'dep46', 'dep65', 'dep81', 'dep82'],
        resourceId: 'services/55673a34330f1fcd4832db30/feature-types/monuments_historiques_perimetr',
        source: 'passerelle',
        key: 'codeMerimee',
        mapping: {
            nom: 'properties.libelle',
            codeMerimee: 'properties.cd_merimee',
            libelleCommune: 'properties.lb_com',
            assiette: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
    // Aquitaine Limousin Poitou Charentes
    {
        coverage: ['dep16'],
        resourceId: 'file-packages/fb05166792170f2475a707dd75c0af588327f759/N_AC1_GENERATEUR_SUP_S_016',
        source: 'passerelle',
        decode: 'win1252',
        key: 'nom',
        filters: ['computeAssietteAC1'],
        mapping: {
            nom: 'properties.NOM_GEN',
            niveauProtection: 'properties.PROTECTION',
            generateur: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
    // Centre
    {
        coverage: ['dep45'],
        resourceId: 'file-packages/357f64f080c4365fb805999ea87d2030ae5726fd/AC1_GENERATEUR_SUP_S_045',
        source: 'passerelle',
        decode: 'win1252',
        key: 'codeMerimee',
        filters: ['computeAssietteAC1'],
        mapping: {
            nom: 'properties.nomGen',
            codeMerimee: 'properties.Ref_merim',
            codeCommune: 'properties.Insee',
            niveauProtection: 'properties.Type',
            generateur: 'geometry',
            codeLocal: 'properties.Code',
        },
        set: {
            type: 'AC1',
        },
    },
    {
        coverage: ['dep45'],
        resourceId: 'file-packages/7731d6d7961499bf08d9a93a24235b6fc7f4b8ee/AC1_ASSIETTE_SUP_S_045',
        source: 'passerelle',
        decode: 'win1252',
        key: 'codeLocal',
        mapping: {
            codeLocal: 'properties.Code',
            assiette: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
    // Hauts-de-France
    {
        coverage: ['dep80'],
        resourceId: 'file-packages/bec1458249a09f7e1346b5823418c5f195b59456/N_AC1_ASSIETTE_SUP_S_080',
        source: 'passerelle',
        decode: 'win1252',
        key: 'codeLocal',
        mapping: {
            nom: 'properties.Libelle',
            codeLocal: 'properties.NOM_ASS',
            codeCommune: 'properties.INSEE',
            libelleCommune: 'properties.Commune',
            assiette: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
    // Grand Est
    {
        coverage: ['dep67'],
        resourceId: 'file-packages/975b57413655249ff7f7437f937e7d16b0d90bc3/N_MONUMENT_HISTO_P_067.TAB',
        source: 'passerelle',
        decode: 'win1252',
        key: 'codeMerimee',
        filters: ['computeAssietteAC1'],
        mapping: {
            nom: 'properties.NOM',
            adresse: 'properties.ADRESSE',
            codeMerimee: 'properties.ID_MERIME',
            libelleCommune: 'properties.COMMUNE',
            codeCommune: 'properties.N_INSEE',
            niveauProtection: 'properties.TYPE_JURIDIQUE',
            generateur: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
    {
        coverage: ['dep67'],
        resourceId: 'file-packages/e5be2f75b6cf2115ce4eea12005fb065fea9af88/N_MONUMENT_HISTO_S_067.TAB',
        source: 'passerelle',
        decode: 'win1252',
        key: 'codeMerimee',
        filters: ['computeAssietteAC1'],
        mapping: {
            nom: 'properties.NOM',
            adresse: 'properties.ADRESSE',
            codeMerimee: 'properties.ID_MERIME',
            libelleCommune: 'properties.COMMUNE',
            codeCommune: 'properties.N_INSEE',
            niveauProtection: 'properties.TYPE_JURIDIQUE',
            generateur: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
    {
        coverage: ['dep68'],
        resourceId: 'file-packages/9387da9ba5d2c583ca64286d3c262381db4ff28b/N_MONUMENT_HISTO_S_068',
        source: 'passerelle',
        decode: 'win1252',
        key: 'codeMerimee',
        filters: ['computeAssietteAC1'],
        mapping: {
            nom: 'properties.Immeuble',
            adresse: 'properties.Adresse',
            codeMerimee: 'properties.Ref_merim',
            libelleCommune: 'properties.Commune',
            codeCommune: 'properties.Insee',
            niveauProtection: 'properties.Protection',
            generateur: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
    {
        coverage: ['dep68'],
        resourceId: 'file-packages/c15b9576bcb997b725df14919b188d4d80f8d793/N_AC1_ASSIETTE_SUP_S_068.shp',
        source: 'passerelle',
        decode: 'win1252',
        key: 'codeMerimee',
        mapping: {
            nom: 'properties.Immeuble',
            adresse: 'properties.Adresse',
            codeMerimee: 'properties.Ref_merim',
            libelleCommune: 'properties.Commune',
            codeCommune: 'properties.Insee',
            niveauProtection: 'properties.Protection',
            assiette: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
    // Auvergne Rhône Alpes
    {
        coverage: ['dep73'],
        resourceId: 'file-packages/61e138a0f0287e348941002cef37d138b9ca6ed9/N_MONUMENT_HISTO_S_073',
        source: 'passerelle',
        key: 'codeMerimee',
        filters: ['computeAssietteAC1'],
        mapping: {
            nom: 'properties.IMMEUBLE',
            codeMerimee: 'properties.REF_MERIM',
            libelleCommune: 'properties.COMMUNE',
            generateur: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
    {
        coverage: ['dep15'],
        resourceId: 'file-packages/709aa4e2c71571b93e473dc8a3ee0b5ec04a3c1c/L_MONUMENTS_HISTO_P_015.TAB',
        source: 'passerelle',
        decode: 'win1252',
        key: 'codeLocal',
        filters: ['computeAssietteAC1'],
        mapping: {
            nom: 'properties.nom',
            codeLocal: 'properties.cod_let',
            codeCommune: 'properties.codcom',
            generateur: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
    {
        coverage: ['dep15'],
        resourceId: 'file-packages/ac43c64619b009943ffead414c5f93c041b15889/L_PERIMPROTECTIONMH_015.TAB',
        source: 'passerelle',
        decode: 'win1252',
        key: 'codeLocal',
        mapping: {
            nom: 'properties.Nom',
            codeLocal: 'properties.Cod_Let',
            codeCommune: 'properties.CodCom',
            libelleCommune: 'properties.Commune',
            assiette: 'geometry',
        },
        set: {
            type: 'AC1',
        },
    },
];

// let pgEnd;

const pgClient = new Promise((resolve, reject) => {
    pg.connect(process.env.PG_URI || 'postgres://localhost/urba', function (err, client/*, done*/) {
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

function removeData() {
    debug('removing data');
    return getCollection().then(servColl => servColl.remove({}));
}

function removeAssietteIndex() {
    debug('removing index');
    return getCollection().then(servColl => servColl.createIndex({ assiette: '2dsphere' }));
}

function createAssietteIndex() {
    debug('creating index');
    return getCollection().then(servColl => servColl.createIndex({ assiette: '2dsphere' }));
}

function importAllDatasets() {
    return Promise.each(datasets, importDataset);
}

removeAssietteIndex()
    .then(removeData)
    .then(importAllDatasets)
    .then(createAssietteIndex)
    .then(() => {
        console.log('Import terminé');
        console.log('Couverture (départements): %s', JSON.stringify(Array.from(globalCoverage.values()).map(dep => dep.substr(3, 2))));
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
