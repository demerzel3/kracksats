set -e

. .env.local

docker run -i --rm -v ${PWD}/lambdas-rust/dist/hello:/var/task \
    -e AWS_REGION \
    -e AWS_ACCESS_KEY_ID \
    -e AWS_SECRET_ACCESS_KEY \
    -e KRAKEN_CREDENTIALS_ARN=${KRAKEN_CREDENTIALS_ARN} \
    lambci/lambda:provided handler '{"firstName":"pippo"}'
