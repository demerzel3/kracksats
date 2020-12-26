import aws from 'aws-sdk'

const readSecretJson: <Res>(arn: string) => Promise<Res> = (arn) =>
  new aws.SecretsManager()
    .getSecretValue({ SecretId: arn })
    .promise()
    .then((result) => {
      if (!result.SecretString) {
        throw new Error(`Unable to load secret ${arn}`)
      }

      return JSON.parse(result.SecretString)
    })

export default readSecretJson
