#!/usr/bin/env node

import 'source-map-support/register'
import * as cdk from '@aws-cdk/core'
import { KracksatsStack } from '../lib/kracksats-stack'

const app = new cdk.App()

new KracksatsStack(app, 'KracksatsStack')
