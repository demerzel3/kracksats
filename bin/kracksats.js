#!/usr/bin/env node

// @ts-ignore: Cannot find declaration file
require('source-map-support/register');
const cdk = require('@aws-cdk/core');
const { KracksatsStack } = require('../lib/kracksats-stack');

const app = new cdk.App();

new KracksatsStack(app, 'KracksatsStack');
