import Semver from 'semver';

const packageJson = require('../package.json');

export interface CliConfig {
  analytics: {
    segment: null | {
      key: string;
    };
  };
  errors: {
    sentry: null | {
      dsn: string;
    };
  };
  package: {
    name: string;
    version: string;
  };
  updateNotifier: {
    distTag: string;
  };
}

export function readConfig(): CliConfig {
  let packageManifest = {
    name: process.env.OPTIC_OPENCLI_PACKAGE_NAME || packageJson.name,
    version: process.env.OPTIC_OPENCLI_PACKAGE_VERSION || packageJson.version,
  };

  return {
    analytics: {
      segment: process.env.OPTIC_OPENCLI_SEGMENT_KEY
        ? {
            key: process.env.OPTIC_OPENCLI_SEGMENT_KEY,
          }
        : null,
    },
    errors: {
      sentry: process.env.OPTIC_OPENCLI_SENTRY_DSN
        ? {
            dsn: process.env.OPTIC_OPENCLI_SENTRY_DSN,
          }
        : null,
    },
    package: packageManifest,
    updateNotifier: {
      distTag:
        Semver.parse(packageManifest.version)!.prerelease.length > 0
          ? 'prerelease'
          : 'latest',
    },
  };
}
