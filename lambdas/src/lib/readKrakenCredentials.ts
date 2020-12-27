import readSecretJson from './readSecretJson'

type Credentials = {
  API_KEY: string
  API_SECRET: string
  READONLY_API_KEY: string
  READONLY_API_SECRET: string
}

const readKrakenCredentials: () => Promise<Credentials> = () => {
  const { KRAKEN_CREDENTIALS_ARN } = process.env

  if (!KRAKEN_CREDENTIALS_ARN) {
    throw new Error(
      'To read Kraken credentials you need to set process.env.KRAKEN_CREDENTIALS_ARN'
    )
  }

  return readSecretJson(KRAKEN_CREDENTIALS_ARN)
}

export default readKrakenCredentials
