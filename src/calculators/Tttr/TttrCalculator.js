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

const _ = require('lodash');
const { quantileSorted } = require('simple-statistics');

const { TRUCK } = require('../../enums/npmrdsDatasources');

const { TTTR } = require('../MeasuresNames');

const { ARITHMETIC } = require('../../enums/meanTypes');
const { TRAVEL_TIME, SPEED } = require('../../enums/npmrdsMetrics');

const { numbersComparator, precisionRound } = require('../../utils/MathUtils');

const TimePeriodIdentifier = require('../timePeriods/TimePeriodIdentifier');

const { getNpmrdsMetricKey } = require('../../utils/NpmrdsMetricKey');

const { AMP, MIDD, PMP, WE, OVN } = require('../../enums/pm3TimePeriods');

const {
  names: { MEASURE_DEFAULT_TIME_PERIOD_SPEC, PM3_TIME_PERIOD_SPEC },
  specs: generalTimePeriodSpecs
} = require('../timePeriods/TimePeriodSpecs');

const tttrDefaultTimePeriodSpec = _.pick(
  generalTimePeriodSpecs[PM3_TIME_PERIOD_SPEC],
  [AMP, MIDD, PMP, WE, OVN]
);

const FIFTIETH_PCTL = 0.5;
const NINETYFIFTH_PCTL = 0.95;

class TttrCalculator {
  constructor(calcConfigParams) {
    const {
      measureRules: { configDefaults }
    } = TttrCalculator;

    Object.keys(configDefaults).forEach(k => {
      this[k] = calcConfigParams[k] || configDefaults[k];
    });

    this.measure = TTTR;

    const timePeriodSpec =
      this.measureTimePeriodSpec === MEASURE_DEFAULT_TIME_PERIOD_SPEC
        ? tttrDefaultTimePeriodSpec
        : generalTimePeriodSpecs[this.measureTimePeriodSpec];

    this.timePeriodIdentifier = new TimePeriodIdentifier(timePeriodSpec);

    this.npmrdsMetricKeys = [
      getNpmrdsMetricKey({
        metric: this.metric,
        datasource: this.npmrdsDatasources[0]
      })
    ];

    this.requiredTmcAttributes = this.metric === SPEED ? ['length'] : null;
  }

  async calculateForTmc({ data, attrs: { tmc } }) {
    const {
      npmrdsMetricKeys: [npmrdsMetricKey]
    } = this;

    const metricValuesByTimePeriod = data.reduce((acc, row) => {
      const { dow, hour, [npmrdsMetricKey]: metric_value } = row;

      const timeperiod = this.timePeriodIdentifier.getTimePeriod({
        dow,
        hour
      });

      if (timeperiod) {
        acc[timeperiod] = acc[timeperiod] || [];
        acc[timeperiod].push(metric_value);
      }

      return acc;
    }, {});

    Object.values(metricValuesByTimePeriod).forEach(metricValues =>
      metricValues.sort(numbersComparator)
    );

    const fiftiethPctlsByTimePeriod = Object.keys(
      metricValuesByTimePeriod
    ).reduce((acc, timeperiod) => {
      acc[timeperiod] = quantileSorted(
        metricValuesByTimePeriod[timeperiod],
        FIFTIETH_PCTL
      );
      return acc;
    }, {});

    const ninetyfifthPctlsByTimePeriod = Object.keys(
      metricValuesByTimePeriod
    ).reduce((acc, timeperiod) => {
      acc[timeperiod] = quantileSorted(
        metricValuesByTimePeriod[timeperiod],
        NINETYFIFTH_PCTL
      );
      return acc;
    }, {});

    const tttrByTimePeriod = Object.keys(metricValuesByTimePeriod).reduce(
      (acc, timeperiod) => {
        const fiftiethPctl = precisionRound(
          fiftiethPctlsByTimePeriod[timeperiod]
        );
        const ninetyfifthPctl = precisionRound(
          ninetyfifthPctlsByTimePeriod[timeperiod]
        );

        acc[timeperiod] = precisionRound(ninetyfifthPctl / fiftiethPctl, 2);
        return acc;
      },
      {}
    );

    const ninetyfifthPctlsByTimePeriodRounded = Object.keys(
      ninetyfifthPctlsByTimePeriod
    ).reduce((acc, timePeriod) => {
      acc[timePeriod] = precisionRound(
        ninetyfifthPctlsByTimePeriod[timePeriod]
      );
      return acc;
    }, {});

    const fiftiethPctlsByTimePeriodRounded = Object.keys(
      fiftiethPctlsByTimePeriod
    ).reduce((acc, timePeriod) => {
      acc[timePeriod] = precisionRound(fiftiethPctlsByTimePeriod[timePeriod]);
      return acc;
    }, {});

    return {
      tmc,
      ninetyfifthPctlsByTimePeriod: ninetyfifthPctlsByTimePeriodRounded,
      fiftiethPctlsByTimePeriod: fiftiethPctlsByTimePeriodRounded,
      tttrByTimePeriod
    };
  }
}

TttrCalculator.measureRules = {
  configDefaults: {
    measure: TTTR,
    npmrdsDatasources: [TRUCK],
    timeBinSize: 15,
    meanType: ARITHMETIC,
    metric: TRAVEL_TIME,
    measureTimePeriodSpec: MEASURE_DEFAULT_TIME_PERIOD_SPEC
  },
  supportedNpmrdsMetrics: [TRAVEL_TIME, SPEED]
};

module.exports = TttrCalculator;
