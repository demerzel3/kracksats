#!/usr/bin/env node

/* eslint-disable max-len, flowtype/require-valid-file-annotation, flowtype/require-return-type */
/* global packageInformationStores, null, $$SETUP_STATIC_TABLES */

// Used for the resolveUnqualified part of the resolution (ie resolving folder/index.js & file extensions)
// Deconstructed so that they aren't affected by any fs monkeypatching occuring later during the execution
const {statSync, lstatSync, readlinkSync, readFileSync, existsSync, realpathSync} = require('fs');

const Module = require('module');
const path = require('path');
const StringDecoder = require('string_decoder');

const ignorePattern = null ? new RegExp(null) : null;

const pnpFile = path.resolve(__dirname, __filename);
const builtinModules = new Set(Module.builtinModules || Object.keys(process.binding('natives')));

const topLevelLocator = {name: null, reference: null};
const blacklistedLocator = {name: NaN, reference: NaN};

// Used for compatibility purposes - cf setupCompatibilityLayer
const patchedModules = [];
const fallbackLocators = [topLevelLocator];

// Matches backslashes of Windows paths
const backwardSlashRegExp = /\\/g;

// Matches if the path must point to a directory (ie ends with /)
const isDirRegExp = /\/$/;

// Matches if the path starts with a valid path qualifier (./, ../, /)
// eslint-disable-next-line no-unused-vars
const isStrictRegExp = /^\.{0,2}\//;

// Splits a require request into its components, or return null if the request is a file path
const pathRegExp = /^(?![a-zA-Z]:[\\\/]|\\\\|\.{0,2}(?:\/|$))((?:@[^\/]+\/)?[^\/]+)\/?(.*|)$/;

// Keep a reference around ("module" is a common name in this context, so better rename it to something more significant)
const pnpModule = module;

/**
 * Used to disable the resolution hooks (for when we want to fallback to the previous resolution - we then need
 * a way to "reset" the environment temporarily)
 */

let enableNativeHooks = true;

/**
 * Simple helper function that assign an error code to an error, so that it can more easily be caught and used
 * by third-parties.
 */

function makeError(code, message, data = {}) {
  const error = new Error(message);
  return Object.assign(error, {code, data});
}

/**
 * Ensures that the returned locator isn't a blacklisted one.
 *
 * Blacklisted packages are packages that cannot be used because their dependencies cannot be deduced. This only
 * happens with peer dependencies, which effectively have different sets of dependencies depending on their parents.
 *
 * In order to deambiguate those different sets of dependencies, the Yarn implementation of PnP will generate a
 * symlink for each combination of <package name>/<package version>/<dependent package> it will find, and will
 * blacklist the target of those symlinks. By doing this, we ensure that files loaded through a specific path
 * will always have the same set of dependencies, provided the symlinks are correctly preserved.
 *
 * Unfortunately, some tools do not preserve them, and when it happens PnP isn't able anymore to deduce the set of
 * dependencies based on the path of the file that makes the require calls. But since we've blacklisted those paths,
 * we're able to print a more helpful error message that points out that a third-party package is doing something
 * incompatible!
 */

// eslint-disable-next-line no-unused-vars
function blacklistCheck(locator) {
  if (locator === blacklistedLocator) {
    throw makeError(
      `BLACKLISTED`,
      [
        `A package has been resolved through a blacklisted path - this is usually caused by one of your tools calling`,
        `"realpath" on the return value of "require.resolve". Since the returned values use symlinks to disambiguate`,
        `peer dependencies, they must be passed untransformed to "require".`,
      ].join(` `)
    );
  }

  return locator;
}

let packageInformationStores = new Map([
  ["aws-sdk", new Map([
    ["2.489.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-aws-sdk-2.489.0-5ca376546dd3e912febf3114d2bcfa4d82c5584a/node_modules/aws-sdk/"),
      packageDependencies: new Map([
        ["buffer", "4.9.1"],
        ["events", "1.1.1"],
        ["ieee754", "1.1.8"],
        ["jmespath", "0.15.0"],
        ["querystring", "0.2.0"],
        ["sax", "1.2.1"],
        ["url", "0.10.3"],
        ["uuid", "3.3.2"],
        ["xml2js", "0.4.19"],
        ["aws-sdk", "2.489.0"],
      ]),
    }],
  ])],
  ["buffer", new Map([
    ["4.9.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-buffer-4.9.1-6d1bb601b07a4efced97094132093027c95bc298/node_modules/buffer/"),
      packageDependencies: new Map([
        ["base64-js", "1.3.0"],
        ["ieee754", "1.1.13"],
        ["isarray", "1.0.0"],
        ["buffer", "4.9.1"],
      ]),
    }],
  ])],
  ["base64-js", new Map([
    ["1.3.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-base64-js-1.3.0-cab1e6118f051095e58b5281aea8c1cd22bfc0e3/node_modules/base64-js/"),
      packageDependencies: new Map([
        ["base64-js", "1.3.0"],
      ]),
    }],
  ])],
  ["ieee754", new Map([
    ["1.1.13", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ieee754-1.1.13-ec168558e95aa181fd87d37f55c32bbcb6708b84/node_modules/ieee754/"),
      packageDependencies: new Map([
        ["ieee754", "1.1.13"],
      ]),
    }],
    ["1.1.8", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ieee754-1.1.8-be33d40ac10ef1926701f6f08a2d86fbfd1ad3e4/node_modules/ieee754/"),
      packageDependencies: new Map([
        ["ieee754", "1.1.8"],
      ]),
    }],
  ])],
  ["isarray", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-isarray-1.0.0-bb935d48582cba168c06834957a54a3e07124f11/node_modules/isarray/"),
      packageDependencies: new Map([
        ["isarray", "1.0.0"],
      ]),
    }],
  ])],
  ["events", new Map([
    ["1.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-events-1.1.1-9ebdb7635ad099c70dcc4c2a1f5004288e8bd924/node_modules/events/"),
      packageDependencies: new Map([
        ["events", "1.1.1"],
      ]),
    }],
  ])],
  ["jmespath", new Map([
    ["0.15.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-jmespath-0.15.0-a3f222a9aae9f966f5d27c796510e28091764217/node_modules/jmespath/"),
      packageDependencies: new Map([
        ["jmespath", "0.15.0"],
      ]),
    }],
  ])],
  ["querystring", new Map([
    ["0.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-querystring-0.2.0-b209849203bb25df820da756e747005878521620/node_modules/querystring/"),
      packageDependencies: new Map([
        ["querystring", "0.2.0"],
      ]),
    }],
  ])],
  ["sax", new Map([
    ["1.2.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-sax-1.2.1-7b8e656190b228e81a66aea748480d828cd2d37a/node_modules/sax/"),
      packageDependencies: new Map([
        ["sax", "1.2.1"],
      ]),
    }],
    ["1.2.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-sax-1.2.4-2816234e2378bddc4e5354fab5caa895df7100d9/node_modules/sax/"),
      packageDependencies: new Map([
        ["sax", "1.2.4"],
      ]),
    }],
  ])],
  ["url", new Map([
    ["0.10.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-url-0.10.3-021e4d9c7705f21bbf37d03ceb58767402774c64/node_modules/url/"),
      packageDependencies: new Map([
        ["punycode", "1.3.2"],
        ["querystring", "0.2.0"],
        ["url", "0.10.3"],
      ]),
    }],
  ])],
  ["punycode", new Map([
    ["1.3.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-punycode-1.3.2-9653a036fb7c1ee42342f2325cceefea3926c48d/node_modules/punycode/"),
      packageDependencies: new Map([
        ["punycode", "1.3.2"],
      ]),
    }],
  ])],
  ["uuid", new Map([
    ["3.3.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-uuid-3.3.2-1b4af4955eb3077c501c23872fc6513811587131/node_modules/uuid/"),
      packageDependencies: new Map([
        ["uuid", "3.3.2"],
      ]),
    }],
  ])],
  ["xml2js", new Map([
    ["0.4.19", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-xml2js-0.4.19-686c20f213209e94abf0d1bcf1efaa291c7827a7/node_modules/xml2js/"),
      packageDependencies: new Map([
        ["sax", "1.2.4"],
        ["xmlbuilder", "9.0.7"],
        ["xml2js", "0.4.19"],
      ]),
    }],
  ])],
  ["xmlbuilder", new Map([
    ["9.0.7", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-xmlbuilder-9.0.7-132ee63d2ec5565c557e20f4c22df9aca686b10d/node_modules/xmlbuilder/"),
      packageDependencies: new Map([
        ["xmlbuilder", "9.0.7"],
      ]),
    }],
  ])],
  ["kraken-api", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-kraken-api-1.0.0-d125ca5c906b1b76b0b7126862cdf15969fd9fc4/node_modules/kraken-api/"),
      packageDependencies: new Map([
        ["got", "7.1.0"],
        ["qs", "6.7.0"],
        ["kraken-api", "1.0.0"],
      ]),
    }],
  ])],
  ["got", new Map([
    ["7.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-got-7.1.0-05450fd84094e6bbea56f451a43a9c289166385a/node_modules/got/"),
      packageDependencies: new Map([
        ["decompress-response", "3.3.0"],
        ["duplexer3", "0.1.4"],
        ["get-stream", "3.0.0"],
        ["is-plain-obj", "1.1.0"],
        ["is-retry-allowed", "1.1.0"],
        ["is-stream", "1.1.0"],
        ["isurl", "1.0.0"],
        ["lowercase-keys", "1.0.1"],
        ["p-cancelable", "0.3.0"],
        ["p-timeout", "1.2.1"],
        ["safe-buffer", "5.2.0"],
        ["timed-out", "4.0.1"],
        ["url-parse-lax", "1.0.0"],
        ["url-to-options", "1.0.1"],
        ["got", "7.1.0"],
      ]),
    }],
  ])],
  ["decompress-response", new Map([
    ["3.3.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-decompress-response-3.3.0-80a4dd323748384bfa248083622aedec982adff3/node_modules/decompress-response/"),
      packageDependencies: new Map([
        ["mimic-response", "1.0.1"],
        ["decompress-response", "3.3.0"],
      ]),
    }],
  ])],
  ["mimic-response", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-mimic-response-1.0.1-4923538878eef42063cb8a3e3b0798781487ab1b/node_modules/mimic-response/"),
      packageDependencies: new Map([
        ["mimic-response", "1.0.1"],
      ]),
    }],
  ])],
  ["duplexer3", new Map([
    ["0.1.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-duplexer3-0.1.4-ee01dd1cac0ed3cbc7fdbea37dc0a8f1ce002ce2/node_modules/duplexer3/"),
      packageDependencies: new Map([
        ["duplexer3", "0.1.4"],
      ]),
    }],
  ])],
  ["get-stream", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-get-stream-3.0.0-8e943d1358dc37555054ecbe2edb05aa174ede14/node_modules/get-stream/"),
      packageDependencies: new Map([
        ["get-stream", "3.0.0"],
      ]),
    }],
  ])],
  ["is-plain-obj", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-plain-obj-1.1.0-71a50c8429dfca773c92a390a4a03b39fcd51d3e/node_modules/is-plain-obj/"),
      packageDependencies: new Map([
        ["is-plain-obj", "1.1.0"],
      ]),
    }],
  ])],
  ["is-retry-allowed", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-retry-allowed-1.1.0-11a060568b67339444033d0125a61a20d564fb34/node_modules/is-retry-allowed/"),
      packageDependencies: new Map([
        ["is-retry-allowed", "1.1.0"],
      ]),
    }],
  ])],
  ["is-stream", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-stream-1.1.0-12d4a3dd4e68e0b79ceb8dbc84173ae80d91ca44/node_modules/is-stream/"),
      packageDependencies: new Map([
        ["is-stream", "1.1.0"],
      ]),
    }],
  ])],
  ["isurl", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-isurl-1.0.0-b27f4f49f3cdaa3ea44a0a5b7f3462e6edc39d67/node_modules/isurl/"),
      packageDependencies: new Map([
        ["has-to-string-tag-x", "1.4.1"],
        ["is-object", "1.0.1"],
        ["isurl", "1.0.0"],
      ]),
    }],
  ])],
  ["has-to-string-tag-x", new Map([
    ["1.4.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-has-to-string-tag-x-1.4.1-a045ab383d7b4b2012a00148ab0aa5f290044d4d/node_modules/has-to-string-tag-x/"),
      packageDependencies: new Map([
        ["has-symbol-support-x", "1.4.2"],
        ["has-to-string-tag-x", "1.4.1"],
      ]),
    }],
  ])],
  ["has-symbol-support-x", new Map([
    ["1.4.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-has-symbol-support-x-1.4.2-1409f98bc00247da45da67cee0a36f282ff26455/node_modules/has-symbol-support-x/"),
      packageDependencies: new Map([
        ["has-symbol-support-x", "1.4.2"],
      ]),
    }],
  ])],
  ["is-object", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-is-object-1.0.1-8952688c5ec2ffd6b03ecc85e769e02903083470/node_modules/is-object/"),
      packageDependencies: new Map([
        ["is-object", "1.0.1"],
      ]),
    }],
  ])],
  ["lowercase-keys", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-lowercase-keys-1.0.1-6f9e30b47084d971a7c820ff15a6c5167b74c26f/node_modules/lowercase-keys/"),
      packageDependencies: new Map([
        ["lowercase-keys", "1.0.1"],
      ]),
    }],
  ])],
  ["p-cancelable", new Map([
    ["0.3.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-p-cancelable-0.3.0-b9e123800bcebb7ac13a479be195b507b98d30fa/node_modules/p-cancelable/"),
      packageDependencies: new Map([
        ["p-cancelable", "0.3.0"],
      ]),
    }],
  ])],
  ["p-timeout", new Map([
    ["1.2.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-p-timeout-1.2.1-5eb3b353b7fce99f101a1038880bb054ebbea386/node_modules/p-timeout/"),
      packageDependencies: new Map([
        ["p-finally", "1.0.0"],
        ["p-timeout", "1.2.1"],
      ]),
    }],
  ])],
  ["p-finally", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-p-finally-1.0.0-3fbcfb15b899a44123b34b6dcc18b724336a2cae/node_modules/p-finally/"),
      packageDependencies: new Map([
        ["p-finally", "1.0.0"],
      ]),
    }],
  ])],
  ["safe-buffer", new Map([
    ["5.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-safe-buffer-5.2.0-b74daec49b1148f88c64b68d49b1e815c1f2f519/node_modules/safe-buffer/"),
      packageDependencies: new Map([
        ["safe-buffer", "5.2.0"],
      ]),
    }],
    ["5.1.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-safe-buffer-5.1.2-991ec69d296e0313747d59bdfd2b745c35f8828d/node_modules/safe-buffer/"),
      packageDependencies: new Map([
        ["safe-buffer", "5.1.2"],
      ]),
    }],
  ])],
  ["timed-out", new Map([
    ["4.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-timed-out-4.0.1-f32eacac5a175bea25d7fab565ab3ed8741ef56f/node_modules/timed-out/"),
      packageDependencies: new Map([
        ["timed-out", "4.0.1"],
      ]),
    }],
  ])],
  ["url-parse-lax", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-url-parse-lax-1.0.0-7af8f303645e9bd79a272e7a14ac68bc0609da73/node_modules/url-parse-lax/"),
      packageDependencies: new Map([
        ["prepend-http", "1.0.4"],
        ["url-parse-lax", "1.0.0"],
      ]),
    }],
  ])],
  ["prepend-http", new Map([
    ["1.0.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-prepend-http-1.0.4-d4f4562b0ce3696e41ac52d0e002e57a635dc6dc/node_modules/prepend-http/"),
      packageDependencies: new Map([
        ["prepend-http", "1.0.4"],
      ]),
    }],
  ])],
  ["url-to-options", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-url-to-options-1.0.1-1505a03a289a48cbd7a434efbaeec5055f5633a9/node_modules/url-to-options/"),
      packageDependencies: new Map([
        ["url-to-options", "1.0.1"],
      ]),
    }],
  ])],
  ["qs", new Map([
    ["6.7.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-qs-6.7.0-41dc1a015e3d581f1621776be31afb2876a9b1bc/node_modules/qs/"),
      packageDependencies: new Map([
        ["qs", "6.7.0"],
      ]),
    }],
  ])],
  ["mailparser", new Map([
    ["2.7.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-mailparser-2.7.1-c83d1880cf2300d19eccd8c529bf978b04a0fc97/node_modules/mailparser/"),
      packageDependencies: new Map([
        ["he", "1.2.0"],
        ["html-to-text", "5.1.1"],
        ["iconv-lite", "0.4.24"],
        ["libmime", "4.1.1"],
        ["linkify-it", "2.1.0"],
        ["mailsplit", "4.4.1"],
        ["nodemailer", "6.1.1"],
        ["tlds", "1.203.1"],
        ["mailparser", "2.7.1"],
      ]),
    }],
  ])],
  ["he", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-he-1.2.0-84ae65fa7eafb165fddb61566ae14baf05664f0f/node_modules/he/"),
      packageDependencies: new Map([
        ["he", "1.2.0"],
      ]),
    }],
  ])],
  ["html-to-text", new Map([
    ["5.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-html-to-text-5.1.1-2d89db7bf34bc7bcb7d546b1b228991a16926e87/node_modules/html-to-text/"),
      packageDependencies: new Map([
        ["he", "1.2.0"],
        ["htmlparser2", "3.10.1"],
        ["minimist", "1.2.0"],
        ["lodash", "4.17.11"],
        ["html-to-text", "5.1.1"],
      ]),
    }],
  ])],
  ["htmlparser2", new Map([
    ["3.10.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-htmlparser2-3.10.1-bd679dc3f59897b6a34bb10749c855bb53a9392f/node_modules/htmlparser2/"),
      packageDependencies: new Map([
        ["domelementtype", "1.3.1"],
        ["domhandler", "2.4.2"],
        ["domutils", "1.7.0"],
        ["entities", "1.1.2"],
        ["inherits", "2.0.4"],
        ["readable-stream", "3.4.0"],
        ["htmlparser2", "3.10.1"],
      ]),
    }],
  ])],
  ["domelementtype", new Map([
    ["1.3.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-domelementtype-1.3.1-d048c44b37b0d10a7f2a3d5fee3f4333d790481f/node_modules/domelementtype/"),
      packageDependencies: new Map([
        ["domelementtype", "1.3.1"],
      ]),
    }],
  ])],
  ["domhandler", new Map([
    ["2.4.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-domhandler-2.4.2-8805097e933d65e85546f726d60f5eb88b44f803/node_modules/domhandler/"),
      packageDependencies: new Map([
        ["domelementtype", "1.3.1"],
        ["domhandler", "2.4.2"],
      ]),
    }],
  ])],
  ["domutils", new Map([
    ["1.7.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-domutils-1.7.0-56ea341e834e06e6748af7a1cb25da67ea9f8c2a/node_modules/domutils/"),
      packageDependencies: new Map([
        ["dom-serializer", "0.1.1"],
        ["domelementtype", "1.3.1"],
        ["domutils", "1.7.0"],
      ]),
    }],
  ])],
  ["dom-serializer", new Map([
    ["0.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-dom-serializer-0.1.1-1ec4059e284babed36eec2941d4a970a189ce7c0/node_modules/dom-serializer/"),
      packageDependencies: new Map([
        ["domelementtype", "1.3.1"],
        ["entities", "1.1.2"],
        ["dom-serializer", "0.1.1"],
      ]),
    }],
  ])],
  ["entities", new Map([
    ["1.1.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-entities-1.1.2-bdfa735299664dfafd34529ed4f8522a275fea56/node_modules/entities/"),
      packageDependencies: new Map([
        ["entities", "1.1.2"],
      ]),
    }],
  ])],
  ["inherits", new Map([
    ["2.0.4", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-inherits-2.0.4-0fa2c64f932917c3433a0ded55363aae37416b7c/node_modules/inherits/"),
      packageDependencies: new Map([
        ["inherits", "2.0.4"],
      ]),
    }],
  ])],
  ["readable-stream", new Map([
    ["3.4.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-readable-stream-3.4.0-a51c26754658e0a3c21dbf59163bd45ba6f447fc/node_modules/readable-stream/"),
      packageDependencies: new Map([
        ["inherits", "2.0.4"],
        ["string_decoder", "1.2.0"],
        ["util-deprecate", "1.0.2"],
        ["readable-stream", "3.4.0"],
      ]),
    }],
  ])],
  ["string_decoder", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-string-decoder-1.2.0-fe86e738b19544afe70469243b2a1ee9240eae8d/node_modules/string_decoder/"),
      packageDependencies: new Map([
        ["safe-buffer", "5.1.2"],
        ["string_decoder", "1.2.0"],
      ]),
    }],
  ])],
  ["util-deprecate", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-util-deprecate-1.0.2-450d4dc9fa70de732762fbd2d4a28981419a0ccf/node_modules/util-deprecate/"),
      packageDependencies: new Map([
        ["util-deprecate", "1.0.2"],
      ]),
    }],
  ])],
  ["minimist", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-minimist-1.2.0-a35008b20f41383eec1fb914f4cd5df79a264284/node_modules/minimist/"),
      packageDependencies: new Map([
        ["minimist", "1.2.0"],
      ]),
    }],
  ])],
  ["lodash", new Map([
    ["4.17.11", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-lodash-4.17.11-b39ea6229ef607ecd89e2c8df12536891cac9b8d/node_modules/lodash/"),
      packageDependencies: new Map([
        ["lodash", "4.17.11"],
      ]),
    }],
  ])],
  ["iconv-lite", new Map([
    ["0.4.24", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-iconv-lite-0.4.24-2022b4b25fbddc21d2f524974a474aafe733908b/node_modules/iconv-lite/"),
      packageDependencies: new Map([
        ["safer-buffer", "2.1.2"],
        ["iconv-lite", "0.4.24"],
      ]),
    }],
  ])],
  ["safer-buffer", new Map([
    ["2.1.2", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-safer-buffer-2.1.2-44fa161b0187b9549dd84bb91802f9bd8385cd6a/node_modules/safer-buffer/"),
      packageDependencies: new Map([
        ["safer-buffer", "2.1.2"],
      ]),
    }],
  ])],
  ["libmime", new Map([
    ["4.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-libmime-4.1.1-eb7a60c775ba78c3715ddaec5cd52596a047f8d1/node_modules/libmime/"),
      packageDependencies: new Map([
        ["iconv-lite", "0.4.24"],
        ["libbase64", "1.0.3"],
        ["libqp", "1.1.0"],
        ["libmime", "4.1.1"],
      ]),
    }],
  ])],
  ["libbase64", new Map([
    ["1.0.3", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-libbase64-1.0.3-de3023234abeefeb9d49378804c8a94404f5c98c/node_modules/libbase64/"),
      packageDependencies: new Map([
        ["libbase64", "1.0.3"],
      ]),
    }],
  ])],
  ["libqp", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-libqp-1.1.0-f5e6e06ad74b794fb5b5b66988bf728ef1dedbe8/node_modules/libqp/"),
      packageDependencies: new Map([
        ["libqp", "1.1.0"],
      ]),
    }],
  ])],
  ["linkify-it", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-linkify-it-2.1.0-c4caf38a6cd7ac2212ef3c7d2bde30a91561f9db/node_modules/linkify-it/"),
      packageDependencies: new Map([
        ["uc.micro", "1.0.6"],
        ["linkify-it", "2.1.0"],
      ]),
    }],
  ])],
  ["uc.micro", new Map([
    ["1.0.6", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-uc-micro-1.0.6-9c411a802a409a91fc6cf74081baba34b24499ac/node_modules/uc.micro/"),
      packageDependencies: new Map([
        ["uc.micro", "1.0.6"],
      ]),
    }],
  ])],
  ["mailsplit", new Map([
    ["4.4.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-mailsplit-4.4.1-838603af3c1561e27aedd8599cec2a59c097faa6/node_modules/mailsplit/"),
      packageDependencies: new Map([
        ["libmime", "4.1.1"],
        ["libbase64", "1.0.3"],
        ["libqp", "1.1.0"],
        ["mailsplit", "4.4.1"],
      ]),
    }],
  ])],
  ["nodemailer", new Map([
    ["6.1.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-nodemailer-6.1.1-09e88ef4b3646f01089c5d84d007b872141fb575/node_modules/nodemailer/"),
      packageDependencies: new Map([
        ["nodemailer", "6.1.1"],
      ]),
    }],
    ["6.2.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-nodemailer-6.2.1-20d773925eb8f7a06166a0b62c751dc8290429f3/node_modules/nodemailer/"),
      packageDependencies: new Map([
        ["nodemailer", "6.2.1"],
      ]),
    }],
  ])],
  ["tlds", new Map([
    ["1.203.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-tlds-1.203.1-4dc9b02f53de3315bc98b80665e13de3edfc1dfc/node_modules/tlds/"),
      packageDependencies: new Map([
        ["tlds", "1.203.1"],
      ]),
    }],
  ])],
  ["ramda", new Map([
    ["0.26.1", {
      packageLocation: path.resolve(__dirname, "../../../Library/Caches/Yarn/v4/npm-ramda-0.26.1-8d41351eb8111c55353617fc3bbffad8e4d35d06/node_modules/ramda/"),
      packageDependencies: new Map([
        ["ramda", "0.26.1"],
      ]),
    }],
  ])],
  [null, new Map([
    [null, {
      packageLocation: path.resolve(__dirname, "./"),
      packageDependencies: new Map([
        ["aws-sdk", "2.489.0"],
        ["kraken-api", "1.0.0"],
        ["mailparser", "2.7.1"],
        ["nodemailer", "6.2.1"],
        ["ramda", "0.26.1"],
      ]),
    }],
  ])],
]);

let locatorsByLocations = new Map([
  ["../../../Library/Caches/Yarn/v4/npm-aws-sdk-2.489.0-5ca376546dd3e912febf3114d2bcfa4d82c5584a/node_modules/aws-sdk/", {"name":"aws-sdk","reference":"2.489.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-buffer-4.9.1-6d1bb601b07a4efced97094132093027c95bc298/node_modules/buffer/", {"name":"buffer","reference":"4.9.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-base64-js-1.3.0-cab1e6118f051095e58b5281aea8c1cd22bfc0e3/node_modules/base64-js/", {"name":"base64-js","reference":"1.3.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-ieee754-1.1.13-ec168558e95aa181fd87d37f55c32bbcb6708b84/node_modules/ieee754/", {"name":"ieee754","reference":"1.1.13"}],
  ["../../../Library/Caches/Yarn/v4/npm-ieee754-1.1.8-be33d40ac10ef1926701f6f08a2d86fbfd1ad3e4/node_modules/ieee754/", {"name":"ieee754","reference":"1.1.8"}],
  ["../../../Library/Caches/Yarn/v4/npm-isarray-1.0.0-bb935d48582cba168c06834957a54a3e07124f11/node_modules/isarray/", {"name":"isarray","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-events-1.1.1-9ebdb7635ad099c70dcc4c2a1f5004288e8bd924/node_modules/events/", {"name":"events","reference":"1.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-jmespath-0.15.0-a3f222a9aae9f966f5d27c796510e28091764217/node_modules/jmespath/", {"name":"jmespath","reference":"0.15.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-querystring-0.2.0-b209849203bb25df820da756e747005878521620/node_modules/querystring/", {"name":"querystring","reference":"0.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-sax-1.2.1-7b8e656190b228e81a66aea748480d828cd2d37a/node_modules/sax/", {"name":"sax","reference":"1.2.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-sax-1.2.4-2816234e2378bddc4e5354fab5caa895df7100d9/node_modules/sax/", {"name":"sax","reference":"1.2.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-url-0.10.3-021e4d9c7705f21bbf37d03ceb58767402774c64/node_modules/url/", {"name":"url","reference":"0.10.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-punycode-1.3.2-9653a036fb7c1ee42342f2325cceefea3926c48d/node_modules/punycode/", {"name":"punycode","reference":"1.3.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-uuid-3.3.2-1b4af4955eb3077c501c23872fc6513811587131/node_modules/uuid/", {"name":"uuid","reference":"3.3.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-xml2js-0.4.19-686c20f213209e94abf0d1bcf1efaa291c7827a7/node_modules/xml2js/", {"name":"xml2js","reference":"0.4.19"}],
  ["../../../Library/Caches/Yarn/v4/npm-xmlbuilder-9.0.7-132ee63d2ec5565c557e20f4c22df9aca686b10d/node_modules/xmlbuilder/", {"name":"xmlbuilder","reference":"9.0.7"}],
  ["../../../Library/Caches/Yarn/v4/npm-kraken-api-1.0.0-d125ca5c906b1b76b0b7126862cdf15969fd9fc4/node_modules/kraken-api/", {"name":"kraken-api","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-got-7.1.0-05450fd84094e6bbea56f451a43a9c289166385a/node_modules/got/", {"name":"got","reference":"7.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-decompress-response-3.3.0-80a4dd323748384bfa248083622aedec982adff3/node_modules/decompress-response/", {"name":"decompress-response","reference":"3.3.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-mimic-response-1.0.1-4923538878eef42063cb8a3e3b0798781487ab1b/node_modules/mimic-response/", {"name":"mimic-response","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-duplexer3-0.1.4-ee01dd1cac0ed3cbc7fdbea37dc0a8f1ce002ce2/node_modules/duplexer3/", {"name":"duplexer3","reference":"0.1.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-get-stream-3.0.0-8e943d1358dc37555054ecbe2edb05aa174ede14/node_modules/get-stream/", {"name":"get-stream","reference":"3.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-plain-obj-1.1.0-71a50c8429dfca773c92a390a4a03b39fcd51d3e/node_modules/is-plain-obj/", {"name":"is-plain-obj","reference":"1.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-retry-allowed-1.1.0-11a060568b67339444033d0125a61a20d564fb34/node_modules/is-retry-allowed/", {"name":"is-retry-allowed","reference":"1.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-stream-1.1.0-12d4a3dd4e68e0b79ceb8dbc84173ae80d91ca44/node_modules/is-stream/", {"name":"is-stream","reference":"1.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-isurl-1.0.0-b27f4f49f3cdaa3ea44a0a5b7f3462e6edc39d67/node_modules/isurl/", {"name":"isurl","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-has-to-string-tag-x-1.4.1-a045ab383d7b4b2012a00148ab0aa5f290044d4d/node_modules/has-to-string-tag-x/", {"name":"has-to-string-tag-x","reference":"1.4.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-has-symbol-support-x-1.4.2-1409f98bc00247da45da67cee0a36f282ff26455/node_modules/has-symbol-support-x/", {"name":"has-symbol-support-x","reference":"1.4.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-is-object-1.0.1-8952688c5ec2ffd6b03ecc85e769e02903083470/node_modules/is-object/", {"name":"is-object","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-lowercase-keys-1.0.1-6f9e30b47084d971a7c820ff15a6c5167b74c26f/node_modules/lowercase-keys/", {"name":"lowercase-keys","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-p-cancelable-0.3.0-b9e123800bcebb7ac13a479be195b507b98d30fa/node_modules/p-cancelable/", {"name":"p-cancelable","reference":"0.3.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-p-timeout-1.2.1-5eb3b353b7fce99f101a1038880bb054ebbea386/node_modules/p-timeout/", {"name":"p-timeout","reference":"1.2.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-p-finally-1.0.0-3fbcfb15b899a44123b34b6dcc18b724336a2cae/node_modules/p-finally/", {"name":"p-finally","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-safe-buffer-5.2.0-b74daec49b1148f88c64b68d49b1e815c1f2f519/node_modules/safe-buffer/", {"name":"safe-buffer","reference":"5.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-safe-buffer-5.1.2-991ec69d296e0313747d59bdfd2b745c35f8828d/node_modules/safe-buffer/", {"name":"safe-buffer","reference":"5.1.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-timed-out-4.0.1-f32eacac5a175bea25d7fab565ab3ed8741ef56f/node_modules/timed-out/", {"name":"timed-out","reference":"4.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-url-parse-lax-1.0.0-7af8f303645e9bd79a272e7a14ac68bc0609da73/node_modules/url-parse-lax/", {"name":"url-parse-lax","reference":"1.0.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-prepend-http-1.0.4-d4f4562b0ce3696e41ac52d0e002e57a635dc6dc/node_modules/prepend-http/", {"name":"prepend-http","reference":"1.0.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-url-to-options-1.0.1-1505a03a289a48cbd7a434efbaeec5055f5633a9/node_modules/url-to-options/", {"name":"url-to-options","reference":"1.0.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-qs-6.7.0-41dc1a015e3d581f1621776be31afb2876a9b1bc/node_modules/qs/", {"name":"qs","reference":"6.7.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-mailparser-2.7.1-c83d1880cf2300d19eccd8c529bf978b04a0fc97/node_modules/mailparser/", {"name":"mailparser","reference":"2.7.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-he-1.2.0-84ae65fa7eafb165fddb61566ae14baf05664f0f/node_modules/he/", {"name":"he","reference":"1.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-html-to-text-5.1.1-2d89db7bf34bc7bcb7d546b1b228991a16926e87/node_modules/html-to-text/", {"name":"html-to-text","reference":"5.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-htmlparser2-3.10.1-bd679dc3f59897b6a34bb10749c855bb53a9392f/node_modules/htmlparser2/", {"name":"htmlparser2","reference":"3.10.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-domelementtype-1.3.1-d048c44b37b0d10a7f2a3d5fee3f4333d790481f/node_modules/domelementtype/", {"name":"domelementtype","reference":"1.3.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-domhandler-2.4.2-8805097e933d65e85546f726d60f5eb88b44f803/node_modules/domhandler/", {"name":"domhandler","reference":"2.4.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-domutils-1.7.0-56ea341e834e06e6748af7a1cb25da67ea9f8c2a/node_modules/domutils/", {"name":"domutils","reference":"1.7.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-dom-serializer-0.1.1-1ec4059e284babed36eec2941d4a970a189ce7c0/node_modules/dom-serializer/", {"name":"dom-serializer","reference":"0.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-entities-1.1.2-bdfa735299664dfafd34529ed4f8522a275fea56/node_modules/entities/", {"name":"entities","reference":"1.1.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-inherits-2.0.4-0fa2c64f932917c3433a0ded55363aae37416b7c/node_modules/inherits/", {"name":"inherits","reference":"2.0.4"}],
  ["../../../Library/Caches/Yarn/v4/npm-readable-stream-3.4.0-a51c26754658e0a3c21dbf59163bd45ba6f447fc/node_modules/readable-stream/", {"name":"readable-stream","reference":"3.4.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-string-decoder-1.2.0-fe86e738b19544afe70469243b2a1ee9240eae8d/node_modules/string_decoder/", {"name":"string_decoder","reference":"1.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-util-deprecate-1.0.2-450d4dc9fa70de732762fbd2d4a28981419a0ccf/node_modules/util-deprecate/", {"name":"util-deprecate","reference":"1.0.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-minimist-1.2.0-a35008b20f41383eec1fb914f4cd5df79a264284/node_modules/minimist/", {"name":"minimist","reference":"1.2.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-lodash-4.17.11-b39ea6229ef607ecd89e2c8df12536891cac9b8d/node_modules/lodash/", {"name":"lodash","reference":"4.17.11"}],
  ["../../../Library/Caches/Yarn/v4/npm-iconv-lite-0.4.24-2022b4b25fbddc21d2f524974a474aafe733908b/node_modules/iconv-lite/", {"name":"iconv-lite","reference":"0.4.24"}],
  ["../../../Library/Caches/Yarn/v4/npm-safer-buffer-2.1.2-44fa161b0187b9549dd84bb91802f9bd8385cd6a/node_modules/safer-buffer/", {"name":"safer-buffer","reference":"2.1.2"}],
  ["../../../Library/Caches/Yarn/v4/npm-libmime-4.1.1-eb7a60c775ba78c3715ddaec5cd52596a047f8d1/node_modules/libmime/", {"name":"libmime","reference":"4.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-libbase64-1.0.3-de3023234abeefeb9d49378804c8a94404f5c98c/node_modules/libbase64/", {"name":"libbase64","reference":"1.0.3"}],
  ["../../../Library/Caches/Yarn/v4/npm-libqp-1.1.0-f5e6e06ad74b794fb5b5b66988bf728ef1dedbe8/node_modules/libqp/", {"name":"libqp","reference":"1.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-linkify-it-2.1.0-c4caf38a6cd7ac2212ef3c7d2bde30a91561f9db/node_modules/linkify-it/", {"name":"linkify-it","reference":"2.1.0"}],
  ["../../../Library/Caches/Yarn/v4/npm-uc-micro-1.0.6-9c411a802a409a91fc6cf74081baba34b24499ac/node_modules/uc.micro/", {"name":"uc.micro","reference":"1.0.6"}],
  ["../../../Library/Caches/Yarn/v4/npm-mailsplit-4.4.1-838603af3c1561e27aedd8599cec2a59c097faa6/node_modules/mailsplit/", {"name":"mailsplit","reference":"4.4.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-nodemailer-6.1.1-09e88ef4b3646f01089c5d84d007b872141fb575/node_modules/nodemailer/", {"name":"nodemailer","reference":"6.1.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-nodemailer-6.2.1-20d773925eb8f7a06166a0b62c751dc8290429f3/node_modules/nodemailer/", {"name":"nodemailer","reference":"6.2.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-tlds-1.203.1-4dc9b02f53de3315bc98b80665e13de3edfc1dfc/node_modules/tlds/", {"name":"tlds","reference":"1.203.1"}],
  ["../../../Library/Caches/Yarn/v4/npm-ramda-0.26.1-8d41351eb8111c55353617fc3bbffad8e4d35d06/node_modules/ramda/", {"name":"ramda","reference":"0.26.1"}],
  ["./", topLevelLocator],
]);
exports.findPackageLocator = function findPackageLocator(location) {
  let relativeLocation = normalizePath(path.relative(__dirname, location));

  if (!relativeLocation.match(isStrictRegExp))
    relativeLocation = `./${relativeLocation}`;

  if (location.match(isDirRegExp) && relativeLocation.charAt(relativeLocation.length - 1) !== '/')
    relativeLocation = `${relativeLocation}/`;

  let match;

  if (relativeLocation.length >= 138 && relativeLocation[137] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 138)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 136 && relativeLocation[135] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 136)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 130 && relativeLocation[129] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 130)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 128 && relativeLocation[127] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 128)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 126 && relativeLocation[125] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 126)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 124 && relativeLocation[123] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 124)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 122 && relativeLocation[121] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 122)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 121 && relativeLocation[120] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 121)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 120 && relativeLocation[119] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 120)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 119 && relativeLocation[118] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 119)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 118 && relativeLocation[117] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 118)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 116 && relativeLocation[115] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 116)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 115 && relativeLocation[114] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 115)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 114 && relativeLocation[113] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 114)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 113 && relativeLocation[112] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 113)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 112 && relativeLocation[111] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 112)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 111 && relativeLocation[110] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 111)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 110 && relativeLocation[109] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 110)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 109 && relativeLocation[108] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 109)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 108 && relativeLocation[107] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 108)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 106 && relativeLocation[105] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 106)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 105 && relativeLocation[104] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 105)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 104 && relativeLocation[103] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 104)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 102 && relativeLocation[101] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 102)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 2 && relativeLocation[1] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 2)))
      return blacklistCheck(match);

  return null;
};


/**
 * Returns the module that should be used to resolve require calls. It's usually the direct parent, except if we're
 * inside an eval expression.
 */

function getIssuerModule(parent) {
  let issuer = parent;

  while (issuer && (issuer.id === '[eval]' || issuer.id === '<repl>' || !issuer.filename)) {
    issuer = issuer.parent;
  }

  return issuer;
}

/**
 * Returns information about a package in a safe way (will throw if they cannot be retrieved)
 */

function getPackageInformationSafe(packageLocator) {
  const packageInformation = exports.getPackageInformation(packageLocator);

  if (!packageInformation) {
    throw makeError(
      `INTERNAL`,
      `Couldn't find a matching entry in the dependency tree for the specified parent (this is probably an internal error)`
    );
  }

  return packageInformation;
}

/**
 * Implements the node resolution for folder access and extension selection
 */

function applyNodeExtensionResolution(unqualifiedPath, {extensions}) {
  // We use this "infinite while" so that we can restart the process as long as we hit package folders
  while (true) {
    let stat;

    try {
      stat = statSync(unqualifiedPath);
    } catch (error) {}

    // If the file exists and is a file, we can stop right there

    if (stat && !stat.isDirectory()) {
      // If the very last component of the resolved path is a symlink to a file, we then resolve it to a file. We only
      // do this first the last component, and not the rest of the path! This allows us to support the case of bin
      // symlinks, where a symlink in "/xyz/pkg-name/.bin/bin-name" will point somewhere else (like "/xyz/pkg-name/index.js").
      // In such a case, we want relative requires to be resolved relative to "/xyz/pkg-name/" rather than "/xyz/pkg-name/.bin/".
      //
      // Also note that the reason we must use readlink on the last component (instead of realpath on the whole path)
      // is that we must preserve the other symlinks, in particular those used by pnp to deambiguate packages using
      // peer dependencies. For example, "/xyz/.pnp/local/pnp-01234569/.bin/bin-name" should see its relative requires
      // be resolved relative to "/xyz/.pnp/local/pnp-0123456789/" rather than "/xyz/pkg-with-peers/", because otherwise
      // we would lose the information that would tell us what are the dependencies of pkg-with-peers relative to its
      // ancestors.

      if (lstatSync(unqualifiedPath).isSymbolicLink()) {
        unqualifiedPath = path.normalize(path.resolve(path.dirname(unqualifiedPath), readlinkSync(unqualifiedPath)));
      }

      return unqualifiedPath;
    }

    // If the file is a directory, we must check if it contains a package.json with a "main" entry

    if (stat && stat.isDirectory()) {
      let pkgJson;

      try {
        pkgJson = JSON.parse(readFileSync(`${unqualifiedPath}/package.json`, 'utf-8'));
      } catch (error) {}

      let nextUnqualifiedPath;

      if (pkgJson && pkgJson.main) {
        nextUnqualifiedPath = path.resolve(unqualifiedPath, pkgJson.main);
      }

      // If the "main" field changed the path, we start again from this new location

      if (nextUnqualifiedPath && nextUnqualifiedPath !== unqualifiedPath) {
        const resolution = applyNodeExtensionResolution(nextUnqualifiedPath, {extensions});

        if (resolution !== null) {
          return resolution;
        }
      }
    }

    // Otherwise we check if we find a file that match one of the supported extensions

    const qualifiedPath = extensions
      .map(extension => {
        return `${unqualifiedPath}${extension}`;
      })
      .find(candidateFile => {
        return existsSync(candidateFile);
      });

    if (qualifiedPath) {
      return qualifiedPath;
    }

    // Otherwise, we check if the path is a folder - in such a case, we try to use its index

    if (stat && stat.isDirectory()) {
      const indexPath = extensions
        .map(extension => {
          return `${unqualifiedPath}/index${extension}`;
        })
        .find(candidateFile => {
          return existsSync(candidateFile);
        });

      if (indexPath) {
        return indexPath;
      }
    }

    // Otherwise there's nothing else we can do :(

    return null;
  }
}

/**
 * This function creates fake modules that can be used with the _resolveFilename function.
 * Ideally it would be nice to be able to avoid this, since it causes useless allocations
 * and cannot be cached efficiently (we recompute the nodeModulePaths every time).
 *
 * Fortunately, this should only affect the fallback, and there hopefully shouldn't be a
 * lot of them.
 */

function makeFakeModule(path) {
  const fakeModule = new Module(path, false);
  fakeModule.filename = path;
  fakeModule.paths = Module._nodeModulePaths(path);
  return fakeModule;
}

/**
 * Normalize path to posix format.
 */

function normalizePath(fsPath) {
  fsPath = path.normalize(fsPath);

  if (process.platform === 'win32') {
    fsPath = fsPath.replace(backwardSlashRegExp, '/');
  }

  return fsPath;
}

/**
 * Forward the resolution to the next resolver (usually the native one)
 */

function callNativeResolution(request, issuer) {
  if (issuer.endsWith('/')) {
    issuer += 'internal.js';
  }

  try {
    enableNativeHooks = false;

    // Since we would need to create a fake module anyway (to call _resolveLookupPath that
    // would give us the paths to give to _resolveFilename), we can as well not use
    // the {paths} option at all, since it internally makes _resolveFilename create another
    // fake module anyway.
    return Module._resolveFilename(request, makeFakeModule(issuer), false);
  } finally {
    enableNativeHooks = true;
  }
}

/**
 * This key indicates which version of the standard is implemented by this resolver. The `std` key is the
 * Plug'n'Play standard, and any other key are third-party extensions. Third-party extensions are not allowed
 * to override the standard, and can only offer new methods.
 *
 * If an new version of the Plug'n'Play standard is released and some extensions conflict with newly added
 * functions, they'll just have to fix the conflicts and bump their own version number.
 */

exports.VERSIONS = {std: 1};

/**
 * Useful when used together with getPackageInformation to fetch information about the top-level package.
 */

exports.topLevel = {name: null, reference: null};

/**
 * Gets the package information for a given locator. Returns null if they cannot be retrieved.
 */

exports.getPackageInformation = function getPackageInformation({name, reference}) {
  const packageInformationStore = packageInformationStores.get(name);

  if (!packageInformationStore) {
    return null;
  }

  const packageInformation = packageInformationStore.get(reference);

  if (!packageInformation) {
    return null;
  }

  return packageInformation;
};

/**
 * Transforms a request (what's typically passed as argument to the require function) into an unqualified path.
 * This path is called "unqualified" because it only changes the package name to the package location on the disk,
 * which means that the end result still cannot be directly accessed (for example, it doesn't try to resolve the
 * file extension, or to resolve directories to their "index.js" content). Use the "resolveUnqualified" function
 * to convert them to fully-qualified paths, or just use "resolveRequest" that do both operations in one go.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveToUnqualified = function resolveToUnqualified(request, issuer, {considerBuiltins = true} = {}) {
  // The 'pnpapi' request is reserved and will always return the path to the PnP file, from everywhere

  if (request === `pnpapi`) {
    return pnpFile;
  }

  // Bailout if the request is a native module

  if (considerBuiltins && builtinModules.has(request)) {
    return null;
  }

  // We allow disabling the pnp resolution for some subpaths. This is because some projects, often legacy,
  // contain multiple levels of dependencies (ie. a yarn.lock inside a subfolder of a yarn.lock). This is
  // typically solved using workspaces, but not all of them have been converted already.

  if (ignorePattern && ignorePattern.test(normalizePath(issuer))) {
    const result = callNativeResolution(request, issuer);

    if (result === false) {
      throw makeError(
        `BUILTIN_NODE_RESOLUTION_FAIL`,
        `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer was explicitely ignored by the regexp "null")`,
        {
          request,
          issuer,
        }
      );
    }

    return result;
  }

  let unqualifiedPath;

  // If the request is a relative or absolute path, we just return it normalized

  const dependencyNameMatch = request.match(pathRegExp);

  if (!dependencyNameMatch) {
    if (path.isAbsolute(request)) {
      unqualifiedPath = path.normalize(request);
    } else if (issuer.match(isDirRegExp)) {
      unqualifiedPath = path.normalize(path.resolve(issuer, request));
    } else {
      unqualifiedPath = path.normalize(path.resolve(path.dirname(issuer), request));
    }
  }

  // Things are more hairy if it's a package require - we then need to figure out which package is needed, and in
  // particular the exact version for the given location on the dependency tree

  if (dependencyNameMatch) {
    const [, dependencyName, subPath] = dependencyNameMatch;

    const issuerLocator = exports.findPackageLocator(issuer);

    // If the issuer file doesn't seem to be owned by a package managed through pnp, then we resort to using the next
    // resolution algorithm in the chain, usually the native Node resolution one

    if (!issuerLocator) {
      const result = callNativeResolution(request, issuer);

      if (result === false) {
        throw makeError(
          `BUILTIN_NODE_RESOLUTION_FAIL`,
          `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer doesn't seem to be part of the Yarn-managed dependency tree)`,
          {
            request,
            issuer,
          }
        );
      }

      return result;
    }

    const issuerInformation = getPackageInformationSafe(issuerLocator);

    // We obtain the dependency reference in regard to the package that request it

    let dependencyReference = issuerInformation.packageDependencies.get(dependencyName);

    // If we can't find it, we check if we can potentially load it from the packages that have been defined as potential fallbacks.
    // It's a bit of a hack, but it improves compatibility with the existing Node ecosystem. Hopefully we should eventually be able
    // to kill this logic and become stricter once pnp gets enough traction and the affected packages fix themselves.

    if (issuerLocator !== topLevelLocator) {
      for (let t = 0, T = fallbackLocators.length; dependencyReference === undefined && t < T; ++t) {
        const fallbackInformation = getPackageInformationSafe(fallbackLocators[t]);
        dependencyReference = fallbackInformation.packageDependencies.get(dependencyName);
      }
    }

    // If we can't find the path, and if the package making the request is the top-level, we can offer nicer error messages

    if (!dependencyReference) {
      if (dependencyReference === null) {
        if (issuerLocator === topLevelLocator) {
          throw makeError(
            `MISSING_PEER_DEPENDENCY`,
            `You seem to be requiring a peer dependency ("${dependencyName}"), but it is not installed (which might be because you're the top-level package)`,
            {request, issuer, dependencyName}
          );
        } else {
          throw makeError(
            `MISSING_PEER_DEPENDENCY`,
            `Package "${issuerLocator.name}@${issuerLocator.reference}" is trying to access a peer dependency ("${dependencyName}") that should be provided by its direct ancestor but isn't`,
            {request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName}
          );
        }
      } else {
        if (issuerLocator === topLevelLocator) {
          throw makeError(
            `UNDECLARED_DEPENDENCY`,
            `You cannot require a package ("${dependencyName}") that is not declared in your dependencies (via "${issuer}")`,
            {request, issuer, dependencyName}
          );
        } else {
          const candidates = Array.from(issuerInformation.packageDependencies.keys());
          throw makeError(
            `UNDECLARED_DEPENDENCY`,
            `Package "${issuerLocator.name}@${issuerLocator.reference}" (via "${issuer}") is trying to require the package "${dependencyName}" (via "${request}") without it being listed in its dependencies (${candidates.join(
              `, `
            )})`,
            {request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName, candidates}
          );
        }
      }
    }

    // We need to check that the package exists on the filesystem, because it might not have been installed

    const dependencyLocator = {name: dependencyName, reference: dependencyReference};
    const dependencyInformation = exports.getPackageInformation(dependencyLocator);
    const dependencyLocation = path.resolve(__dirname, dependencyInformation.packageLocation);

    if (!dependencyLocation) {
      throw makeError(
        `MISSING_DEPENDENCY`,
        `Package "${dependencyLocator.name}@${dependencyLocator.reference}" is a valid dependency, but hasn't been installed and thus cannot be required (it might be caused if you install a partial tree, such as on production environments)`,
        {request, issuer, dependencyLocator: Object.assign({}, dependencyLocator)}
      );
    }

    // Now that we know which package we should resolve to, we only have to find out the file location

    if (subPath) {
      unqualifiedPath = path.resolve(dependencyLocation, subPath);
    } else {
      unqualifiedPath = dependencyLocation;
    }
  }

  return path.normalize(unqualifiedPath);
};

/**
 * Transforms an unqualified path into a qualified path by using the Node resolution algorithm (which automatically
 * appends ".js" / ".json", and transforms directory accesses into "index.js").
 */

exports.resolveUnqualified = function resolveUnqualified(
  unqualifiedPath,
  {extensions = Object.keys(Module._extensions)} = {}
) {
  const qualifiedPath = applyNodeExtensionResolution(unqualifiedPath, {extensions});

  if (qualifiedPath) {
    return path.normalize(qualifiedPath);
  } else {
    throw makeError(
      `QUALIFIED_PATH_RESOLUTION_FAILED`,
      `Couldn't find a suitable Node resolution for unqualified path "${unqualifiedPath}"`,
      {unqualifiedPath}
    );
  }
};

/**
 * Transforms a request into a fully qualified path.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveRequest = function resolveRequest(request, issuer, {considerBuiltins, extensions} = {}) {
  let unqualifiedPath;

  try {
    unqualifiedPath = exports.resolveToUnqualified(request, issuer, {considerBuiltins});
  } catch (originalError) {
    // If we get a BUILTIN_NODE_RESOLUTION_FAIL error there, it means that we've had to use the builtin node
    // resolution, which usually shouldn't happen. It might be because the user is trying to require something
    // from a path loaded through a symlink (which is not possible, because we need something normalized to
    // figure out which package is making the require call), so we try to make the same request using a fully
    // resolved issuer and throws a better and more actionable error if it works.
    if (originalError.code === `BUILTIN_NODE_RESOLUTION_FAIL`) {
      let realIssuer;

      try {
        realIssuer = realpathSync(issuer);
      } catch (error) {}

      if (realIssuer) {
        if (issuer.endsWith(`/`)) {
          realIssuer = realIssuer.replace(/\/?$/, `/`);
        }

        try {
          exports.resolveToUnqualified(request, realIssuer, {considerBuiltins});
        } catch (error) {
          // If an error was thrown, the problem doesn't seem to come from a path not being normalized, so we
          // can just throw the original error which was legit.
          throw originalError;
        }

        // If we reach this stage, it means that resolveToUnqualified didn't fail when using the fully resolved
        // file path, which is very likely caused by a module being invoked through Node with a path not being
        // correctly normalized (ie you should use "node $(realpath script.js)" instead of "node script.js").
        throw makeError(
          `SYMLINKED_PATH_DETECTED`,
          `A pnp module ("${request}") has been required from what seems to be a symlinked path ("${issuer}"). This is not possible, you must ensure that your modules are invoked through their fully resolved path on the filesystem (in this case "${realIssuer}").`,
          {
            request,
            issuer,
            realIssuer,
          }
        );
      }
    }
    throw originalError;
  }

  if (unqualifiedPath === null) {
    return null;
  }

  try {
    return exports.resolveUnqualified(unqualifiedPath, {extensions});
  } catch (resolutionError) {
    if (resolutionError.code === 'QUALIFIED_PATH_RESOLUTION_FAILED') {
      Object.assign(resolutionError.data, {request, issuer});
    }
    throw resolutionError;
  }
};

/**
 * Setups the hook into the Node environment.
 *
 * From this point on, any call to `require()` will go through the "resolveRequest" function, and the result will
 * be used as path of the file to load.
 */

exports.setup = function setup() {
  // A small note: we don't replace the cache here (and instead use the native one). This is an effort to not
  // break code similar to "delete require.cache[require.resolve(FOO)]", where FOO is a package located outside
  // of the Yarn dependency tree. In this case, we defer the load to the native loader. If we were to replace the
  // cache by our own, the native loader would populate its own cache, which wouldn't be exposed anymore, so the
  // delete call would be broken.

  const originalModuleLoad = Module._load;

  Module._load = function(request, parent, isMain) {
    if (!enableNativeHooks) {
      return originalModuleLoad.call(Module, request, parent, isMain);
    }

    // Builtins are managed by the regular Node loader

    if (builtinModules.has(request)) {
      try {
        enableNativeHooks = false;
        return originalModuleLoad.call(Module, request, parent, isMain);
      } finally {
        enableNativeHooks = true;
      }
    }

    // The 'pnpapi' name is reserved to return the PnP api currently in use by the program

    if (request === `pnpapi`) {
      return pnpModule.exports;
    }

    // Request `Module._resolveFilename` (ie. `resolveRequest`) to tell us which file we should load

    const modulePath = Module._resolveFilename(request, parent, isMain);

    // Check if the module has already been created for the given file

    const cacheEntry = Module._cache[modulePath];

    if (cacheEntry) {
      return cacheEntry.exports;
    }

    // Create a new module and store it into the cache

    const module = new Module(modulePath, parent);
    Module._cache[modulePath] = module;

    // The main module is exposed as global variable

    if (isMain) {
      process.mainModule = module;
      module.id = '.';
    }

    // Try to load the module, and remove it from the cache if it fails

    let hasThrown = true;

    try {
      module.load(modulePath);
      hasThrown = false;
    } finally {
      if (hasThrown) {
        delete Module._cache[modulePath];
      }
    }

    // Some modules might have to be patched for compatibility purposes

    for (const [filter, patchFn] of patchedModules) {
      if (filter.test(request)) {
        module.exports = patchFn(exports.findPackageLocator(parent.filename), module.exports);
      }
    }

    return module.exports;
  };

  const originalModuleResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function(request, parent, isMain, options) {
    if (!enableNativeHooks) {
      return originalModuleResolveFilename.call(Module, request, parent, isMain, options);
    }

    let issuers;

    if (options) {
      const optionNames = new Set(Object.keys(options));
      optionNames.delete('paths');

      if (optionNames.size > 0) {
        throw makeError(
          `UNSUPPORTED`,
          `Some options passed to require() aren't supported by PnP yet (${Array.from(optionNames).join(', ')})`
        );
      }

      if (options.paths) {
        issuers = options.paths.map(entry => `${path.normalize(entry)}/`);
      }
    }

    if (!issuers) {
      const issuerModule = getIssuerModule(parent);
      const issuer = issuerModule ? issuerModule.filename : `${process.cwd()}/`;

      issuers = [issuer];
    }

    let firstError;

    for (const issuer of issuers) {
      let resolution;

      try {
        resolution = exports.resolveRequest(request, issuer);
      } catch (error) {
        firstError = firstError || error;
        continue;
      }

      return resolution !== null ? resolution : request;
    }

    throw firstError;
  };

  const originalFindPath = Module._findPath;

  Module._findPath = function(request, paths, isMain) {
    if (!enableNativeHooks) {
      return originalFindPath.call(Module, request, paths, isMain);
    }

    for (const path of paths) {
      let resolution;

      try {
        resolution = exports.resolveRequest(request, path);
      } catch (error) {
        continue;
      }

      if (resolution) {
        return resolution;
      }
    }

    return false;
  };

  process.versions.pnp = String(exports.VERSIONS.std);
};

exports.setupCompatibilityLayer = () => {
  // ESLint currently doesn't have any portable way for shared configs to specify their own
  // plugins that should be used (https://github.com/eslint/eslint/issues/10125). This will
  // likely get fixed at some point, but it'll take time and in the meantime we'll just add
  // additional fallback entries for common shared configs.

  for (const name of [`react-scripts`]) {
    const packageInformationStore = packageInformationStores.get(name);
    if (packageInformationStore) {
      for (const reference of packageInformationStore.keys()) {
        fallbackLocators.push({name, reference});
      }
    }
  }

  // Modern versions of `resolve` support a specific entry point that custom resolvers can use
  // to inject a specific resolution logic without having to patch the whole package.
  //
  // Cf: https://github.com/browserify/resolve/pull/174

  patchedModules.push([
    /^\.\/normalize-options\.js$/,
    (issuer, normalizeOptions) => {
      if (!issuer || issuer.name !== 'resolve') {
        return normalizeOptions;
      }

      return (request, opts) => {
        opts = opts || {};

        if (opts.forceNodeResolution) {
          return opts;
        }

        opts.preserveSymlinks = true;
        opts.paths = function(request, basedir, getNodeModulesDir, opts) {
          // Extract the name of the package being requested (1=full name, 2=scope name, 3=local name)
          const parts = request.match(/^((?:(@[^\/]+)\/)?([^\/]+))/);

          // make sure that basedir ends with a slash
          if (basedir.charAt(basedir.length - 1) !== '/') {
            basedir = path.join(basedir, '/');
          }
          // This is guaranteed to return the path to the "package.json" file from the given package
          const manifestPath = exports.resolveToUnqualified(`${parts[1]}/package.json`, basedir);

          // The first dirname strips the package.json, the second strips the local named folder
          let nodeModules = path.dirname(path.dirname(manifestPath));

          // Strips the scope named folder if needed
          if (parts[2]) {
            nodeModules = path.dirname(nodeModules);
          }

          return [nodeModules];
        };

        return opts;
      };
    },
  ]);
};

if (module.parent && module.parent.id === 'internal/preload') {
  exports.setupCompatibilityLayer();

  exports.setup();
}

if (process.mainModule === module) {
  exports.setupCompatibilityLayer();

  const reportError = (code, message, data) => {
    process.stdout.write(`${JSON.stringify([{code, message, data}, null])}\n`);
  };

  const reportSuccess = resolution => {
    process.stdout.write(`${JSON.stringify([null, resolution])}\n`);
  };

  const processResolution = (request, issuer) => {
    try {
      reportSuccess(exports.resolveRequest(request, issuer));
    } catch (error) {
      reportError(error.code, error.message, error.data);
    }
  };

  const processRequest = data => {
    try {
      const [request, issuer] = JSON.parse(data);
      processResolution(request, issuer);
    } catch (error) {
      reportError(`INVALID_JSON`, error.message, error.data);
    }
  };

  if (process.argv.length > 2) {
    if (process.argv.length !== 4) {
      process.stderr.write(`Usage: ${process.argv[0]} ${process.argv[1]} <request> <issuer>\n`);
      process.exitCode = 64; /* EX_USAGE */
    } else {
      processResolution(process.argv[2], process.argv[3]);
    }
  } else {
    let buffer = '';
    const decoder = new StringDecoder.StringDecoder();

    process.stdin.on('data', chunk => {
      buffer += decoder.write(chunk);

      do {
        const index = buffer.indexOf('\n');
        if (index === -1) {
          break;
        }

        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);

        processRequest(line);
      } while (true);
    });
  }
}
