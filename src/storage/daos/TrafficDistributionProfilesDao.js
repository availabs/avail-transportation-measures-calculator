const { chain, equal, fill, mapValues, range, sum } = require('lodash');
const memoizeOne = require('memoize-one');

const { cartesianProduct } = require('../../utils/SetUtils');
const { getNumBinsInDayForTimeBinSize } = require('../../utils/TimeUtils');
const { WEEKEND, WEEKDAY } = require('../../enums/dayTypes');
const AVAILTrafficDistributionProfiles = require('../static/AVAILTrafficDistributionProfiles');
const CATTLabTrafficDistributionProfiles = require('../static/CATTLabTrafficDistributionProfiles');

const TrafficDistributionDOWAdjFactors = require('../static/TrafficDistributionDowAdjustmentFactors');

const getTrafficDistributionProfileName = require('../../utils/getTrafficDistributionProfileName');

const NUM_DAYS_IN_WEEK = 7;
const MINUTES_PER_EPOCH = 5;

const {
  AVAIL,
  CATTLAB
} = require('../../enums/trafficDistributionProfilesVersions');

// AVAIL traffic dist profiles are 5 minute bins CATTLab's are hourly.
// The following creates a table where both are of the same trafficDistributionTimeBinSize
// CONSIDER: Should we smooth out the CATTLab 5-minute binned curve?
const tdpsVersions5minBin = {
  [AVAIL]: AVAILTrafficDistributionProfiles,
  [CATTLAB]: mapValues(CATTLabTrafficDistributionProfiles, tdp =>
    chain(tdp)
      .map(hrCt => fill(Array(12), hrCt / 12))
      .flatten()
      .value()
  )
};

const getTimeBinnedTrafficDistributionProfile = memoizeOne(
  ({
    trafficDistributionProfilesVersion,
    trafficDistributionProfileName,
    trafficDistributionTimeBinSize
  }) => {
    const tdp5min =
      tdpsVersions5minBin[trafficDistributionProfilesVersion][
        trafficDistributionProfileName
      ];

    const timeBinnedTrafficDistributionProfile = chain(tdp5min)
      .chunk(trafficDistributionTimeBinSize / MINUTES_PER_EPOCH)
      .map(sum)
      .value();

    return timeBinnedTrafficDistributionProfile;
  },
  equal
);

const getFractionOfDailyAadtForNpmrdsDataTimeBin = ({
  trafficDistributionProfile,
  trafficDistributionTimeBinSize,
  timeBinSize,
  timeBinNum
}) => {
  // debugger;
  let fractionOfDailyAadt;

  if (trafficDistributionTimeBinSize >= timeBinSize) {
    // Case 1: We need to get a fraction of a single trafficDistributionProfile bin
    const tdpBin = Math.floor(
      (timeBinSize / trafficDistributionTimeBinSize) * timeBinNum
    );
    const tdpFractionForBin = trafficDistributionProfile[tdpBin];

    const binSizeRatio = timeBinSize / trafficDistributionTimeBinSize;

    fractionOfDailyAadt = tdpFractionForBin * binSizeRatio;
  } else {
    // Case 2: We need to get a sum across multiple trafficDistributionProfile bins
    const tdpStartBin = Math.floor(
      (timeBinSize / trafficDistributionTimeBinSize) * timeBinNum
    );
    const tdpEndBin =
      tdpStartBin + Math.floor(timeBinSize / trafficDistributionTimeBinSize);

    const tdpFractions = trafficDistributionProfile.slice(
      tdpStartBin,
      tdpEndBin
    );

    fractionOfDailyAadt = sum(tdpFractions);
  }

  return fractionOfDailyAadt;
};

// returns a 2-d array.
//   1st dimension has length = 7 (dows)
//   2nd dimension has length = num npmrdsData timeBins in day
//     Elements of the inner arrays are the fraction of daily aadt for that dow/timeBin
const getFractionOfDailyAadtByDowByTimeBin = memoizeOne(
  async ({
    functionalClass,
    congestionLevel,
    directionality,
    trafficDistributionProfilesVersion,
    trafficDistributionTimeBinSize,
    timeBinSize
  }) => {
    // Traffic Distribution Profiles at trafficDistributionTimeBinSize resolution
    const profiles = [WEEKEND, WEEKDAY].reduce((acc, dayType) => {
      const trafficDistributionProfileName = getTrafficDistributionProfileName({
        dayType,
        congestionLevel,
        directionality,
        functionalClass
      });

      acc[dayType] = getTimeBinnedTrafficDistributionProfile({
        trafficDistributionProfilesVersion,
        trafficDistributionProfileName,
        trafficDistributionTimeBinSize
      });

      return acc;
    }, {});

    const numBinsInDay = getNumBinsInDayForTimeBinSize(timeBinSize);

    // Fraction of dailyAadt (aadt / 365) throughout the week's timebins
    const fractionOfDailyAadtByDowByTimeBin = cartesianProduct(
      range(NUM_DAYS_IN_WEEK),
      range(numBinsInDay)
    ).reduce((acc, [dow, timeBinNum]) => {
      const dowAdjFactor = TrafficDistributionDOWAdjFactors[dow];
      const trafficDistributionProfile = profiles[dow % 6 ? WEEKDAY : WEEKEND];

      const fractionOfDailyAadtForNpmrdsDataTimeBin = getFractionOfDailyAadtForNpmrdsDataTimeBin(
        {
          trafficDistributionProfile,
          trafficDistributionTimeBinSize,
          timeBinSize,
          timeBinNum
        }
      );

      acc[dow] = acc[dow] || [];
      acc[dow][timeBinNum] =
        fractionOfDailyAadtForNpmrdsDataTimeBin * dowAdjFactor;

      return acc;
    }, []);

    return fractionOfDailyAadtByDowByTimeBin;
  },
  equal
);

module.exports = {
  getFractionOfDailyAadtByDowByTimeBin
};
