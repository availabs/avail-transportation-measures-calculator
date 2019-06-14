/* eslint no-continue: 0 */

const { isEqual } = require('lodash');
const memoizeOne = require('memoize-one');

const EPOCHS_PER_DAY = 288;

const getNumBinsInDayForTimeBinSize = memoizeOne(timeBinSize =>
  Math.floor((5 / timeBinSize) * EPOCHS_PER_DAY)
);

const buildTimeBinNum2HourTable = memoizeOne(timeBinSize => {
  const numBinsInDay = getNumBinsInDayForTimeBinSize(timeBinSize);

  return [...new Array(numBinsInDay)].map((_, timeBinNum) =>
    Math.floor((timeBinSize * timeBinNum) / 60)
  );
});

const getDaylightSavingsStartDateForYear = memoizeOne(year => ({
  year,
  month: 3,
  date: 14 - new Date(`${year}/03/07`).getDay()
}));

const isLeapYear = memoizeOne(
  year => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
);

const getNumDaysPerMonthForYear = memoizeOne(year => [
  31,
  isLeapYear(year) ? 29 : 28,
  31,
  30,
  31,
  30,
  31,
  31,
  30,
  31,
  30,
  31
]);

const buildDate2DowTableForYear = memoizeOne(year =>
  Object.freeze(
    (() => {
      const numDaysPerMonth = getNumDaysPerMonthForYear(year);
      const d2d = {};

      let dow = new Date(`${year}-01-01T12:00:00`).getDay();

      for (let m = 1; m <= 12; ++m) {
        const mm = `0${m}`.slice(-2);
        for (let d = 1; d <= numDaysPerMonth[m - 1]; ++d) {
          const dd = `0${d}`.slice(-2);

          d2d[`${year}-${mm}-${dd}`] = dow;
          dow = (dow + 1) % 7;
        }
      }

      return d2d;
    })()
  )
);

const getNumBinsForYear = memoizeOne(({ year, timeBinSize }) => {
  const dlsStart = getDaylightSavingsStartDateForYear(year);
  const numDaysPerMonth = getNumDaysPerMonthForYear(year);
  const numBinsInDay = getNumBinsInDayForTimeBinSize(timeBinSize);
  const binNum2Hour = buildTimeBinNum2HourTable(timeBinSize);

  let count = 0;

  for (let month = 1; month <= 12; ++month) {
    for (let date = 1; date <= numDaysPerMonth[month - 1]; ++date) {
      for (let timeBinNum = 0; timeBinNum < numBinsInDay; ++timeBinNum) {
        const hour = binNum2Hour[timeBinNum];

        if (month === dlsStart.month && date === dlsStart.date && hour === 2) {
          continue;
        }

        ++count;
      }
    }
  }

  return count;
}, isEqual);

const getNumBinsPerTimePeriodForYear = memoizeOne(
  ({ year, timeBinSize, timePeriodIdentifier }) => {
    const dlsStart = getDaylightSavingsStartDateForYear(year);
    const numDaysPerMonth = getNumDaysPerMonthForYear(year);
    const date2Dow = buildDate2DowTableForYear(year);
    const numBinsInDay = getNumBinsInDayForTimeBinSize(timeBinSize);
    const binNum2Hour = buildTimeBinNum2HourTable(timeBinSize);

    const counts = {};

    for (let month = 1; month <= 12; ++month) {
      const mm = `0${month}`.slice(-2);

      for (let date = 1; date <= numDaysPerMonth[month - 1]; ++date) {
        const dd = `0${date}`.slice(-2);

        const dow = date2Dow[`${year}-${mm}-${dd}`];

        for (let timeBinNum = 0; timeBinNum < numBinsInDay; ++timeBinNum) {
          const hour = binNum2Hour[timeBinNum];

          if (
            month === dlsStart.month &&
            date === dlsStart.date &&
            hour === 2
          ) {
            continue;
          }

          const timePeriod = timePeriodIdentifier({ hour, dow });

          if (!timePeriod) {
            continue;
          }

          counts[timePeriod] = counts[timePeriod] || 0;
          ++counts[timePeriod];
        }
      }
    }

    return counts;
  },
  isEqual
);

module.exports = {
  getDaylightSavingsStartDateForYear,
  getNumBinsInDayForTimeBinSize,
  buildTimeBinNum2HourTable,
  buildDate2DowTableForYear,
  getNumBinsForYear,
  getNumBinsPerTimePeriodForYear
};
