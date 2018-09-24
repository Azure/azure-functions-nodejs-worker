var logPrefix = "LanguageWorkerConsoleLog";
var worker;
var MIN_MAJOR_VERSION = 10;

try {
  var parts = process.version.split(".");
  if (parts.length < 1) {
    var error = new Error("Could not parse Node.js version");
    throw {
      error: error,
      versionTooLow: undefined
    };
  }

  var major = parseInt(parts[0], 10);
  if (major < MIN_MAJOR_VERSION) {
    var error = new Error(
      "Invalid Node.js version. Must use version greater than 10.0.0"
    );
    throw {
      error: error,
      versionTooLow: undefined
    };
  }
} catch (err) {
  if (err && err.versionTooLow) {
    console.error(
      "Node.js version is too low. Current version " +
        process.version +
        ". Please use a version greater than " +
        MIN_MAJOR_VERSION
    );
  } else {
    console.error(
      "Could not parse Node.js version. Current version " +
        process.version +
        ". Be sure your Node.js version is greater than " +
        MIN_MAJOR_VERSION
    );
  }
  if (err.error) {
    throw err.error;
  } else {
    throw new Error(
      "Could not parse Node.js version. Current version " +
        process.version +
        ". Be sure your Node.js version is greater than " +
        MIN_MAJOR_VERSION
    );
  }
}

try {
  worker = require("../../worker-bundle.js");
} catch (err) {
  console.error(
    `${logPrefix}Couldn't require bundle, falling back to Worker.js. ${err}`
  );
  worker = require("./Worker.js");
}

worker.startNodeWorker(process.argv);
