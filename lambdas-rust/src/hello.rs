extern crate rusoto_core;
extern crate rusoto_secretsmanager;

use std::error::Error;
use std::env;
use futures::future::Future;

use tokio_core::reactor::Core;
use lambda_runtime::{error::HandlerError, lambda, Context};
use log::{self, error};
use serde_derive::{Deserialize, Serialize};
use simple_error::bail;
use simple_logger;
use rusoto_core::{Region};
use rusoto_secretsmanager::{SecretsManager, SecretsManagerClient, GetSecretValueRequest, GetSecretValueResponse, GetSecretValueError};
use serde_json::{from_str};

#[derive(Deserialize)]
struct CustomEvent {
    #[serde(rename = "firstName")]
    first_name: String,
}

#[derive(Serialize)]
struct CustomOutput {
    message: String,
}

#[derive(Deserialize, Debug)]
struct KrakenCredentials {
    #[serde(rename = "API_KEY")]
    api_key: String,

    #[serde(rename = "API_SECRET")]
    api_secret: String,
}

fn main() -> Result<(), Box<dyn Error>> {
    simple_logger::init_with_level(log::Level::Debug)?;
    lambda!(my_handler);

    Ok(())
}

fn my_handler(e: CustomEvent, c: Context) -> Result<CustomOutput, HandlerError> {
    if e.first_name == "" {
        error!("Empty first name in request {}", c.aws_request_id);
        bail!("Empty first name");
    }

    let credentials_arn = env::var("KRAKEN_CREDENTIALS_ARN").unwrap_or_default();
    if credentials_arn == "" {
        bail!("Missing KRAKEN_CREDENTIALS_ARN");
    }

    let secrets_manager = SecretsManagerClient::new(Region::EuWest1);
    let program = secrets_manager.get_secret_value(GetSecretValueRequest {
        secret_id: credentials_arn.clone(),
        version_id: None,
        version_stage: None,
    })
    .map(|response| -> KrakenCredentials { from_str(&response.secret_string.unwrap()).unwrap() })
    .map(|credentials| {
        println!("Such credentials: {:?}", credentials);
    });

    let mut core = Core::new().unwrap();
    core.run(program).unwrap();

    Ok(CustomOutput {
        message: format!("Hello, {}!", e.first_name),
    })
}
