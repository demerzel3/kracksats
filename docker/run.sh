#!/bin/bash

set -e

. .env.local

docker run -i --rm -v ${PWD}/lambdas-rust/dist/hello:/var/task \
    -e RUST_BACKTRACE=1 \
    -e AWS_REGION=${AWS_REGION} \
    -e AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
    -e AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
    -e KRAKEN_CREDENTIALS_ARN=${KRAKEN_CREDENTIALS_ARN} \
    lambci/lambda:provided handler '{"firstName":"pippo"}'
