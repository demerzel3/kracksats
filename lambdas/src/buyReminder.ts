import * as OneSignal from 'onesignal-node'

import readOneSignalCredentials from './lib/readOneSignalCredentials'

export const handler: AWSLambda.ScheduledHandler = () => {
  const { MOBILE_PLAYER_ID } = process.env

  return readOneSignalCredentials().then((credentials) => {
    const client = new OneSignal.Client(credentials.APP_ID, credentials.API_KEY)

    return client
      .createNotification({
        headings: {
          en: 'Time to stack',
        },
        contents: {
          en: 'Buy yourself some sats.',
        },
        include_player_ids: MOBILE_PLAYER_ID ? [MOBILE_PLAYER_ID] : [],
      })
      .then((response) => response.body)
  })
}
