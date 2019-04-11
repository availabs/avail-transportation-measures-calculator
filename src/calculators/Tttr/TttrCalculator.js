/*
	From FinalRule:
		The TTTR metric shall be reported to HPMS for each reporting segment (to
		the nearest hundredths) for each of the five time periods identified in
		paragraphs (a)(1)(i) through (v) of this section; the corresponding 95th
		percentile travel times (to the nearest second) and the corresponding normal
		(50th percentile) travel times (to the nearest second).

	From Travel Time Metric Data Reporting Requirements & Specifications
		Truck travel time reliability (TTTR) metric for a reporting segment for “AM Peak.” “AM Peak” is between
		the hours of 6:00 a.m. and 10:00 a.m. for every weekday (Monday through Friday) from January 1st
		through December 31st of the same calendar year, as described in 23 CFR 490.611(a)(1)(i). As described
		in 23 CFR 490.611(a)(3), the reported value for AM Peak Truck Travel Time Reliability (TTTR_AMP) for a
		reporting segment the AM Peak 95th Percentile Truck Travel Time (TTT_AMP95PCT) for that reporting
		segment divided by the AM Peak 50th Percentile Truck Travel Time (TTT_AMP50PCT) for that reporting
		segment and rounded to the nearest hundredth. For computing TTTR_AMP metric, the travel time
		values TTT_AMP50PCT and TTT_AMP95PCT should not be rounded. However, reported
		TTT_AMP50PCT and TTT_AMP95PCT values must be in units of seconds rounded to the nearest integer,
		as required in 23 CFR 490.611(b)(2).
*/

const { quantileSorted } = require('simple-statistics');

const npmrdsDataSourcesEnum = require('../../enums/npmrdsDataSources');

const npmrdsDataSources = Object.keys(npmrdsDataSourcesEnum);
const { TRUCK } = npmrdsDataSourcesEnum;

const { ARITHMETIC, HARMONIC } = require('../../enums/meanTypes');
const { TRAVEL_TIME, SPEED } = require('../../enums/npmrdsMetrics');

const { numbersComparator, precisionRound } = require('../../utils/MathUtils');

const createTimePeriodIdentifier = require('../timePeriods/createTimePeriodIdentifier');

const { getNpmrdsDataKey } = require('../../utils/NpmrdsDataKey');

const {
  names: timePeriodSpecNamesEnum,
  specs: generalTimePeriodSpecs
} = require('../timePeriods/TimePeriodSpecs');

const timePeriodSpecNames = Object.keys(timePeriodSpecNamesEnum);

const {
  MEASURE_DEFAULT_TIME_PERIOD_SPEC,
  PM3_TIME_PERIOD_SPEC
} = timePeriodSpecNamesEnum;

const defaultTimePeriodSpec = generalTimePeriodSpecs[PM3_TIME_PERIOD_SPEC];

const outputFormatters = require('./TttrOutputFormatters');

const TTTR = 'TTTR';
const FIFTIETH_PCTL = 0.5;
const NINETYFIFTH_PCTL = 0.95;

class TttrCalculator {
  constructor(calcConfigParams) {
    this.year = calcConfigParams.year;
    this.meanType = calcConfigParams.meanType;
    this.timeBinSize = calcConfigParams.timeBinSize;

    this.outputFormatter = outputFormatters[calcConfigParams.outputFormat].bind(
      this
    );

    Object.keys(TttrCalculator.configDefaults).forEach(k => {
      this[k] = calcConfigParams[k] || TttrCalculator.configDefaults[k];
    });

    const timePeriodSpec =
      this.timePeriodSpec === MEASURE_DEFAULT_TIME_PERIOD_SPEC
        ? defaultTimePeriodSpec
        : generalTimePeriodSpecs[this.timePeriodSpec];

    this.timePeriodIdentifier = createTimePeriodIdentifier(timePeriodSpec);

    this.npmrdsDataKeys = [getNpmrdsDataKey(this)];
  }

  async calculateForTmc({ data, attrs: { tmc } }) {
    const {
      npmrdsDataKeys: [npmrdsDataKey]
    } = this;

    const metricValuesByTimePeriod = data.reduce((acc, row) => {
      const { [npmrdsDataKey]: metricValue } = row;

      const timePeriod = this.timePeriodIdentifier(row);

      if (timePeriod && metricValue !== null) {
        acc[timePeriod] = acc[timePeriod] || [];
        acc[timePeriod].push(
          this.npmrdsMetric === SPEED ? 1 / metricValue : metricValue
        );
      }

      return acc;
    }, {});

    Object.values(metricValuesByTimePeriod).forEach(metricValues =>
      metricValues.sort(numbersComparator)
    );

    const fiftiethPctlsByTimePeriod = Object.keys(
      metricValuesByTimePeriod
    ).reduce((acc, timePeriod) => {
      acc[timePeriod] = quantileSorted(
        metricValuesByTimePeriod[timePeriod],
        FIFTIETH_PCTL
      );
      return acc;
    }, {});

    const ninetyFifthPctlsByTimePeriod = Object.keys(
      metricValuesByTimePeriod
    ).reduce((acc, timePeriod) => {
      acc[timePeriod] = quantileSorted(
        metricValuesByTimePeriod[timePeriod],
        NINETYFIFTH_PCTL
      );
      return acc;
    }, {});

    const lottrByTimePeriod = Object.keys(metricValuesByTimePeriod).reduce(
      (acc, timePeriod) => {
        const fiftiethPctl = fiftiethPctlsByTimePeriod[timePeriod];
        const ninetyFifthPctl = ninetyFifthPctlsByTimePeriod[timePeriod];

        acc[timePeriod] = precisionRound(ninetyFifthPctl / fiftiethPctl, 2);
        return acc;
      },
      {}
    );

    const ninetyFifthPctlsByTimePeriodRounded = Object.keys(
      ninetyFifthPctlsByTimePeriod
    ).reduce((acc, timePeriod) => {
      acc[timePeriod] = precisionRound(
        this.npmrdsMetric === SPEED
          ? 1 / ninetyFifthPctlsByTimePeriod[timePeriod]
          : ninetyFifthPctlsByTimePeriod[timePeriod]
      );
      return acc;
    }, {});

    const fiftiethPctlsByTimePeriodRounded = Object.keys(
      fiftiethPctlsByTimePeriod
    ).reduce((acc, timePeriod) => {
      acc[timePeriod] = precisionRound(
        this.npmrdsMetric === SPEED
          ? 1 / fiftiethPctlsByTimePeriod[timePeriod]
          : fiftiethPctlsByTimePeriod[timePeriod]
      );
      return acc;
    }, {});

    return this.outputFormatter({
      tmc,
      npmrdsDataKey: this.npmrdsDataKeys[0],
      [this.npmrdsMetric === SPEED
        ? 'fifthPctlsByTimePeriod'
        : 'ninetyFifthPctlsByTimePeriod']: ninetyFifthPctlsByTimePeriodRounded,
      fiftiethPctlsByTimePeriod: fiftiethPctlsByTimePeriodRounded,
      lottrByTimePeriod
    });
  }
}

TttrCalculator.measure = TTTR;
TttrCalculator.configDefaults = {
  meanType: ARITHMETIC,
  npmrdsDataSource: TRUCK,
  npmrdsMetric: TRAVEL_TIME,
  timePeriodSpec: MEASURE_DEFAULT_TIME_PERIOD_SPEC
};
TttrCalculator.configOptions = {
  meanType: [ARITHMETIC, HARMONIC],
  npmrdsDataSource: npmrdsDataSources,
  npmrdsMetric: [TRAVEL_TIME, SPEED],
  timePeriodSpec: timePeriodSpecNames
};
TttrCalculator.defaultTimePeriodSpec = defaultTimePeriodSpec;

module.exports = TttrCalculator;
