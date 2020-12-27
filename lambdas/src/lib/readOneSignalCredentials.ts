import readSecretJson from './readSecretJson'

type Credentials = {
  APP_ID: string
  API_KEY: string
}

const readOneSignalCredentials: () => Promise<Credentials> = () => {
  const { ONESIGNAL_CREDENTIALS_ARN } = process.env

  if (!ONESIGNAL_CREDENTIALS_ARN) {
    throw new Error(
      'To read Kraken credentials you need to set process.env.ONESIGNAL_CREDENTIALS_ARN'
    )
  }

  return readSecretJson(ONESIGNAL_CREDENTIALS_ARN)
}

export default readOneSignalCredentials
