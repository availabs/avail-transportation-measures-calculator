/* eslint no-await-in-loop: 0 */
const { camelCase } = require('lodash');

const { query } = require('../services/DBService');

const { FREEWAY, NONFREEWAY } = require('../../enums/functionalClasses');

const {
  getRisBasedAadtViewForNpmrdsYear
} = require('../../utils/getRisBasedAadtForTmcsMetadata');

const TMC_SUBSET_SIZE = 1000;

const tmcMetadataTableColumnNames = [
  'tmc',
  'tmctype',
  'roadnumber',
  'roadname',
  'firstname',
  'tmclinear',
  'country',
  'state_name',
  'county_name',
  'zip',
  'direction',
  'startlat',
  'startlong',
  'endlat',
  'endlong',
  'miles',
  'frc',
  'border_set',
  'f_system',
  'urban_code',
  'faciltype',
  'structype',
  'thrulanes',
  'route_numb',
  'route_sign',
  'route_qual',
  'altrtename',
  'aadt',
  'aadt_singl',
  'aadt_combi',
  'aadt_ris',
  'aadt_singl_ris',
  'aadt_combi_ris',
  'nhs',
  'nhs_pct',
  'strhnt_typ',
  'strhnt_pct',
  'truck',
  'state',
  'is_interstate',
  'is_controlled_access',
  'avg_speedlimit',
  'mpo_code',
  'mpo_acrony',
  'mpo_name',
  'ua_code',
  'ua_name',
  'congestion_level',
  'directionality',
  'bounding_box',
  // 'avg_vehicle_occupancy'
  'state_code',
  'county_code',
  'isprimary'
];

const buildDirAadtClause = aadtExpr =>
  `(${aadtExpr}::NUMERIC / LEAST(COALESCE(faciltype,  2), 2)::NUMERIC)::DOUBLE PRECISION`;

const functionalClass = `(CASE WHEN f_system <= 2 THEN '${FREEWAY}' ELSE '${NONFREEWAY}' END)`;

const aadtTruck = `(aadt_combi + aadt_singl)`;
const aadtPass = `(aadt - ${aadtTruck})`;

const directionalAadt = buildDirAadtClause('aadt');
const directionalAadtSingl = buildDirAadtClause('aadt_singl');
const directionalAadtCombi = buildDirAadtClause('aadt_combi');
const directionalAadtTruck = buildDirAadtClause(aadtTruck);
const directionalAadtPass = buildDirAadtClause(aadtPass);

// const avgVehicleOccupancyPass = 1.55;
// const avgVehicleOccupancySingl = 10.25;
// const avgVehicleOccupancyCombi = 1.11;

// From Keith Miller Spreadsheet
const avgVehicleOccupancyPass = 1.7;
// const avgVehicleOccupancySingl = 16.8;
const avgVehicleOccupancySingl = `(CASE ua_code WHEN '63217' THEN 16.8::NUMERIC ELSE 10.7::NUMERIC END)`;
const avgVehicleOccupancyCombi = 1;

const avgVehicleOccupancy = `(
  (
    (${avgVehicleOccupancyPass} * ${aadtPass})
    + (${avgVehicleOccupancySingl} * aadt_singl)
    + (${avgVehicleOccupancyCombi} * aadt_combi)
  ) / NULLIF(aadt, 0)
)`;

const avgVehicleOccupancyTruck = `(
  (
    (${avgVehicleOccupancySingl} * aadt_singl)
    + (${avgVehicleOccupancyCombi} * aadt_combi)
  ) / NULLIF(aadt_singl + aadt_combi, 0)
)`;

const toRisBasedAadt = str => {
  return str
    .replace(/aadt\b/g, 'aadt_ris')
    .replace(/aadt_singl/g, 'aadt_singl_ris')
    .replace(/aadt_combi/g, 'aadt_combi_ris')
    .replace(/Aadt\b/, 'AadtRis')
    .replace(/AadtSingl/, 'AadtSinglRis')
    .replace(/AadtCombi/, 'AadtCombiRis');
};

const alias2DbColsMappings = tmcMetadataTableColumnNames.reduce(
  (acc, col) => {
    acc[camelCase(col)] = col;
    return acc;
  },
  {
    functionalClass,

    aadtTruck,
    aadtPass,
    directionalAadt,
    directionalAadtSingl,
    directionalAadtCombi,
    directionalAadtTruck,
    directionalAadtPass,

    avgVehicleOccupancy,
    avgVehicleOccupancyPass,
    avgVehicleOccupancySingl,
    avgVehicleOccupancyCombi,
    avgVehicleOccupancyTruck,

    risAadtTruck: toRisBasedAadt(aadtTruck),
    risAadtPass: toRisBasedAadt(aadtPass),
    directionalAadtRis: toRisBasedAadt(directionalAadt),
    directionalAadtSinglRis: toRisBasedAadt(directionalAadtSingl),
    directionalAadtCombiRis: toRisBasedAadt(directionalAadtCombi),
    directionalAadtTruckRis: toRisBasedAadt(directionalAadtTruck),
    directionalAadtPassRis: toRisBasedAadt(directionalAadtPass),

    avgVehicleOccupancyRis: toRisBasedAadt(`(
      (
        (${avgVehicleOccupancyPass} * ${aadtPass})
        + (${avgVehicleOccupancySingl} * aadt_singl)
        + (${avgVehicleOccupancyCombi} * aadt_combi)
      ) / NULLIF(aadt_ris, 0)
    )::DOUBLE PRECISION`),

    avgVehicleOccupancyPassRis: avgVehicleOccupancyPass,
    avgVehicleOccupancySinglRis: avgVehicleOccupancySingl,
    avgVehicleOccupancyCombiRis: avgVehicleOccupancyCombi,
    avgVehicleOccupancyTruckRis: toRisBasedAadt(avgVehicleOccupancyTruck)
  }
);

const tmcMetadataFields = Object.keys(alias2DbColsMappings);

const getMetadataForTmcs = async ({ year, tmcs, columns }) => {
  const tmcsArr = Array.isArray(tmcs) ? tmcs.slice() : [tmcs];

  const colAliases = new Set(
    (Array.isArray(columns) ? columns : [columns]).filter(c => c).sort()
  );

  colAliases.add('tmc');

  const selectClauseElems = [...colAliases].map(
    col => `${alias2DbColsMappings[col]} AS "${col}"`
  );

  const risMetadataRequested = columns.some(col => col.match(/ris/i));

  const risBasedAadtView = risMetadataRequested
    ? await getRisBasedAadtViewForNpmrdsYear(year)
    : null;

  const risJoinClause = risMetadataRequested
    ? `LEFT OUTER JOIN ${risBasedAadtView} USING (tmc)`
    : '';

  const sql = `
    SELECT ${selectClauseElems}
      FROM tmc_metadata_${year}
        ${risJoinClause}
      WHERE (
        tmc = ANY($1)
      )
  `;

  const result = [];

  while (tmcsArr.length) {
    const tmcSubset = tmcsArr.splice(0, TMC_SUBSET_SIZE);

    const { rows } = await query(sql, [tmcSubset]);

    result.push(...rows);
  }

  return result;
};

module.exports = {
  tmcMetadataFields,
  getMetadataForTmcs
};
