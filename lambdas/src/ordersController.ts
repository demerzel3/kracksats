import { APIGatewayProxyEventV2 } from 'aws-lambda'
import aws from 'aws-sdk'

import { BuyerEvent } from './shared/types'

const { BUYER_LAMBDA_ARN } = process.env

const handlePost = async (event: APIGatewayProxyEventV2) => {
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
    .then((result) => {
      if (result.FunctionError) {
        const payload = JSON.parse(String(result.Payload))

        throw new Error(payload?.errorMessage || 'UnknownError')
      }

      return {
        statusCode: result.StatusCode,
        headers: {
          'content-type': 'application/json',
        },
        body: String(result.Payload),
      }
    })
}

export const handler: AWSLambda.APIGatewayProxyHandlerV2 = async (
  event,
  context
) => {
  switch (event.requestContext.http.method) {
    case 'GET':
      return {
        statusCode: 200,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          orders: [],
        }),
      }
    case 'POST':
      return handlePost(event).catch((e: unknown) => ({
        statusCode: 500,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          error: true,
          message:
            e instanceof Error ? `${e.name}: ${e.message}` : 'UnknownError',
        }),
      }))
    default:
      return {
        statusCode: 405,
      }
  }
}
