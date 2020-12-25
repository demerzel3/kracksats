export default (event) => {
  const {
    Records: [
      {
        Sns: {
          Message,
          MessageAttributes: {
            type: { Value: messageType },
          },
        },
      },
    ],
  } = event

  return {
    type: messageType,
    body: JSON.parse(Message),
  }
}
