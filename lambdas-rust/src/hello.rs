mod lib;

use std::env;
use std::error::Error;
use std::str::FromStr;

use coinnect::kraken::{KrakenApi, KrakenCreds};
use futures::future::Future;
use lambda_runtime::{error::HandlerError, lambda, Context};
use log::{self, error};
use rusoto_core::Region;
use rusoto_secretsmanager::{GetSecretValueRequest, SecretsManager, SecretsManagerClient};
use serde_derive::{Deserialize, Serialize};
use serde_json;
use simple_error::bail;
use simple_logger;
use tokio_core::reactor::Core;

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

#[derive(Deserialize, Debug)]
struct KrakenBalanceResult {
    #[serde(default, rename = "ZEUR", deserialize_with = "lib::from_str")]
    z_eur: f32,
}

#[derive(Debug)]
struct AskInfo {
    price: f32,
    whole_lot_volume: u32,
    lot_volume: f32,
}

#[derive(Debug)]
struct BidInfo {
    price: f32,
    whole_lot_volume: u32,
    lot_volume: f32,
}

#[derive(Debug)]
struct KrakenTickerResult {
    // a = ask array(<price>, <whole lot volume>, <lot volume>),
    ask: AskInfo,
    // b = bid array(<price>, <whole lot volume>, <lot volume>),
    bid: BidInfo,
    // c = last trade closed array(<price>, <lot volume>),
    // v = volume array(<today>, <last 24 hours>),
    // p = volume weighted average price array(<today>, <last 24 hours>),
    // t = number of trades array(<today>, <last 24 hours>),
    // l = low array(<today>, <last 24 hours>),
    // h = high array(<today>, <last 24 hours>),
    // o = today's opening price
}

fn main() -> Result<(), Box<dyn Error>> {
    simple_logger::init_with_level(log::Level::Debug)?;
    lambda!(my_handler);

    Ok(())
}

fn get_account_balance(client: &mut KrakenApi) -> Result<KrakenBalanceResult, serde_json::Error> {
    let response = client.get_account_balance().unwrap();

    return serde_json::from_value(response.get("result").unwrap().clone());
}

fn get_ticker(client: &mut KrakenApi, pair: &str) -> Result<KrakenTickerResult, serde_json::Error> {
    let response = client.get_ticker_information(pair).unwrap();

    println!("{:?}", response);

    let pair_info = response["result"].as_object().unwrap()[pair].as_object().unwrap();
    let ask_info = pair_info["a"].as_array().unwrap();
    let bid_info = pair_info["b"].as_array().unwrap();

    Ok(KrakenTickerResult {
        ask: AskInfo {
            price: f32::from_str(ask_info[0].as_str().unwrap()).unwrap(),
            whole_lot_volume: u32::from_str(ask_info[1].as_str().unwrap()).unwrap(),
            lot_volume: f32::from_str(ask_info[2].as_str().unwrap()).unwrap(),
        },
        bid: BidInfo {
            price: f32::from_str(bid_info[0].as_str().unwrap()).unwrap(),
            whole_lot_volume: u32::from_str(bid_info[1].as_str().unwrap()).unwrap(),
            lot_volume: f32::from_str(bid_info[2].as_str().unwrap()).unwrap(),
        },
    })
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
    let program = secrets_manager
        .get_secret_value(GetSecretValueRequest {
            secret_id: credentials_arn.clone(),
            version_id: None,
            version_stage: None,
        })
        .map(|response| -> KrakenCredentials {
            serde_json::from_str(&response.secret_string.unwrap()).unwrap()
        })
        .map(|credentials| {
            let creds = KrakenCreds::new("foo", &credentials.api_key, &credentials.api_secret);
            let mut client = KrakenApi::new(creds).unwrap();
            let balance = get_account_balance(&mut client).unwrap();

            let ticker = get_ticker(&mut client, "XXBTZEUR");
            // let result = ;

            println!("Such balance: {:?}", balance.z_eur);
            println!("Such ticker: {:?}", ticker);
        });

    let mut core = Core::new().unwrap();
    core.run(program).unwrap();

    Ok(CustomOutput {
        message: format!("Hello, {}!", e.first_name),
    })
}
