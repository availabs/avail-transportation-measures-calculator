/* eslint no-console: 0 */

const CalculatorsOutputWriter = require('./CalculatorsOutputWriter');
const CalculatorMetadataWriter = require('./CalculatorMetadataWriter');
const TmcMetadataWriter = require('./TmcMetadataWriter');

const getAuthoritativeVersionCandidacyDisqualifications = require('../../utils/getAuthoritativeVersionCandidacyDisqualifications');

const mkOutputDir = require('./utils/mkOutputDir');

const logAuthoritativeVersionCandicacyMessage = disqualifications => {
  if (disqualifications) {
    console.error(
      'WARNING: This calculator run is ineligible to become an authoritative version for the following reasons:'
    );
    disqualifications.forEach((disqualification, i) => {
      console.error(`\t${i + 1}. ${disqualification}`);
    });
  } else {
    console.error(
      'This calculator is eligible to become an authoritative version.'
    );
  }
};

async function initialize() {
  const { outputDirPath, outputTimestamp } = await mkOutputDir();
  this.outputDirPath = outputDirPath;
  this.outputTimestamp = outputTimestamp;

  this.calculatorsOutputWriter = new CalculatorsOutputWriter(this);
  this.calculatorInstanceOuputFileNames = this.calculatorsOutputWriter.calculatorInstanceOuputFileNames;

  this.tmcMetadataWriter.setOutputDirPath(this.outputDirPath);

  this.authoritativeVersionCandidacyDisqualifications = await getAuthoritativeVersionCandidacyDisqualifications(
    this
  );

  logAuthoritativeVersionCandicacyMessage(
    this.authoritativeVersionCandidacyDisqualifications
  );
}

class OutputWriter {
  constructor({ calculatorSettings, calculators }) {
    this.calculatorSettings = calculatorSettings;
    this.calculators = calculators;

    this.outputFileFormat = calculatorSettings.outputFileFormat;

    this.tmcMetadataWriter = new TmcMetadataWriter(this);
    this.tmcMetadataFileName = this.tmcMetadataWriter.fileName;

    this.requiredTmcMetadata = this.tmcMetadataWriter.requiredTmcMetadata;

    this.ready = initialize.call(this);
  }

  async writeTmcData({ attrs, calculatorsOutput }) {
    await this.ready;
    await Promise.all([
      this.tmcMetadataWriter.write(attrs),
      this.calculatorsOutputWriter.write(calculatorsOutput)
    ]);
  }

  async writeCalculatorMetadata() {
    await this.ready;
    return new CalculatorMetadataWriter(this).write();
  }

  async end() {
    await this.tmcMetadataWriter.end();
    await this.calculatorsOutputWriter.end();
  }
}

module.exports = OutputWriter;
