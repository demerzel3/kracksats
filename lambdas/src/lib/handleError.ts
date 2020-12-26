interface CustomError<Err extends Error = Error> {
  new (...args: any[]): Err
}

const handleError: <Err extends Error = Error, Res = void>(
  errorClass: CustomError<Err>,
  handler: (e: Err) => Res
) => (e: Err) => Promise<Res> = (errorClass, handler) => {
  return (error) => {
    if (error instanceof errorClass) {
      return Promise.resolve(handler(error))
    } else {
      return Promise.reject(error)
    }
  }
}

export default handleError
