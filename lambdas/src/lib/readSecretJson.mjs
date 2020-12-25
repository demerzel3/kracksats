import aws from 'aws-sdk'

export default (arn) =>
  new aws.SecretsManager()
    .getSecretValue({ SecretId: arn })
    .promise()
    .then((result) => JSON.parse(result.SecretString))
