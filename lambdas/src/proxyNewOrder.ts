import aws from 'aws-sdk'

import { BuyerEvent } from './shared/types'

const { BUYER_LAMBDA_ARN } = process.env

export const handler: AWSLambda.APIGatewayProxyHandlerV2 = (event, context) => {
  if (!BUYER_LAMBDA_ARN) {
    throw new Error('Missing BUYER_LAMBDA_ARN')
  }

  if (!event.body) {
    throw new Error('Body is required')
  }

  const proxyPayload: {
    otp?: string
  } = JSON.parse(event.body)
  if (!proxyPayload || !proxyPayload.otp) {
    throw new Error('OTP is required')
  }

  const lambda = new aws.Lambda()
  const payload: BuyerEvent = {
    otp: proxyPayload.otp,
  }

  return lambda
    .invoke({
      FunctionName: BUYER_LAMBDA_ARN,
      Payload: JSON.stringify(payload),
    })
    .promise()
    .then(() => ({
      statusCode: 200,
    }))
}
