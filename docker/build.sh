set -e

docker run --rm -i \
    -v ${PWD}:/code \
    -v rust-lambda-builder-target:/code/target \
    -v cargo-registry:/root/.cargo/registry \
    -v cargo-git:/root/.cargo/git \
    rust-lambda-builder bash -c "cargo build && cp target/debug/hello lambdas-rust/dist/hello/bootstrap"
