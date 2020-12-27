import { handler as buyer } from './buyer'

class FakeContext implements AWSLambda.Context {
  callbackWaitsForEmptyEventLoop = false
  functionName = 'not a real function'
  functionVersion = '1.0.0'
  invokedFunctionArn = 'not a real arn'
  memoryLimitInMB = '128'
  awsRequestId = 'not a real request id'
  logGroupName = 'not a real log group name'
  logStreamName = ' not a real log stream name'
  identity?: AWSLambda.CognitoIdentity
  clientContext?: AWSLambda.ClientContext

  getRemainingTimeInMillis(): number {
    return 0
  }

  // Functions for compatibility with earlier Node.js Runtime v0.10.42
  // No longer documented, so they are deprecated, but they still work
  // as of the 12.x runtime, so they are not removed from the types.

  done(error?: Error, result?: any): void {
    return undefined
  }
  fail(error: Error | string): void {
    return undefined
  }
  succeed(messageOrObject: any, object?: any): void {
    return undefined
  }
}

const context = new FakeContext()
const callback = (...args: any[]) => console.log(...args)

const result = buyer({}, context, callback)

result &&
  result.then(console.log).catch((e: Error) => {
    console.error(e)
    process.exit(1)
  })
