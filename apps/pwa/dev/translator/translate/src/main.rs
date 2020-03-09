extern crate clap;
extern crate reqwest;

use clap::{App, Arg, SubCommand};
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Serialize, Deserialize)]
struct Translations {
    en: String,
    de: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct TranslationResult {
    translated_text: String
}

#[derive(Deserialize, Debug)]
struct Data {
    translations: Vec<TranslationResult>
}

#[derive(Deserialize, Debug)]
struct TranslationResponse {
    data: Data
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct TranslationRequestBody {
    target: String,
    source: String,
    q: Vec<String>
}

impl fmt::Display for Translations {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "({}, {})", self.en, self.de)
    }
}

fn direct(source_lang: &str, target_lang: &str, words: &Vec<&str>, api_key: &str) -> Result<Vec<String>, String> {
    let request_url = format!(
        "https://translation.googleapis.com/language/translate/v2?key={api_key}",
        api_key = api_key
    );
    let translation_request_body = TranslationRequestBody {
        target: target_lang.to_owned(),
        source: source_lang.to_owned(),
        q: words.into_iter().map(|s| s.to_string()).collect()
    };
    println!("{:?}", translation_request_body);
    let client = reqwest::blocking::Client::new();
    let response = client.post(&request_url).json(&translation_request_body).send();
    let response = match response {
        Ok(resp) => resp,
        Err(e) => return Err(format!("Error while calling translation API: {}", e.to_string())),
    };

    if response.status().is_success() {
        let translation_response:TranslationResponse = match response.json() {
            Ok(parsed) => parsed,
            Err(e) => return Err(format!("Error while fetching response content from translation API: {}", e.to_string())),
        };
        Ok(translation_response.data.translations.into_iter().map(|trans| trans.translated_text).collect())
    } else {
        return Err(format!("other error while calling translation api {:?}", response.status()));
    }
}

fn main() -> Result<(), serde_yaml::Error> {
    let matches = App::new("Battlechoc translation prog")
    .version("0.1.0")
    .author("Sebastian Bode <sebibode@googlemail.com>")
    .about("Generates translation json files from yaml base files and stores results back in the yaml")
    .arg(Arg::with_name("input_file")
        .short("i")
        .long("input")
        .takes_value(true)
        .help("Input yaml file used for translations."))
    .arg(Arg::with_name("output_file")
        .short("o")
        .long("output")
        .takes_value(true)
        .help("Generated json is written to this file."))
    .arg(Arg::with_name("api_key")
        .short("k")
        .long("api_key")
        .takes_value(true)
        .help("API key for the google translation API."))
    .subcommand(SubCommand::with_name("direct")
        .about("direct translation")
        .version("0.1.0")
        .author("Sebastian Bode <sebibode@googlemail.com>")
        .arg(Arg::with_name("words")
            .short("w")
            .required(true)
            .takes_value(true)
            .long("words")
            .help("comma seperated list of words to translate"))
        .arg(Arg::with_name("sourcelang")
            .short("s")
            .long("sourcelang")
            .takes_value(true)
            .default_value("en")
            .help("two letter ISO code of source language assumed for given word"))
        .arg(Arg::with_name("targetlang")
            .short("t")
            .long("targetlang")
            .takes_value(true)
            .default_value("de")
            .help("two letter ISO code of target language assumed for translation"))
        .arg(Arg::with_name("api_key_direct")
            .short("a")
            .long("api_key_direct")
            .required(true)
            .takes_value(true)
            .help("API key for the google translation API.")))
    .get_matches();

    if let Some(matches) = matches.subcommand_matches("direct") {
        let translation_result = direct(
            matches.value_of("sourcelang").unwrap(),
            matches.value_of("targetlang").unwrap(),
            &matches.value_of("words").unwrap().split(",").map(|word| word.trim()).collect(),
            matches.value_of("api_key_direct").unwrap()
        );
        println!("{:?}", translation_result);
    } else {
        println!("Doing the whole thing");

// json --> yaml --> yaml --> json ???
// json --> json
// json --> extract languages --> extract keys from reference language --> extract missing keys from target languages --> call translation api --> fill with results --> save back

        // read yaml
        // determine languages
        // reference language is english
        // determine missing entries compared to reference language
        // translate all missing entries using google api
        // write back to output yaml
        // 
    }
    /*let contents = std::fs::read_to_string(
        "/Users/sebastianbode/development/battlechoc/dev/texts/translations.yaml",
    )
    .expect("Something went wrong reading the file");
    let deserialized_from_file: serde_yaml::Value = serde_yaml::from_str(&contents)?;
    println!("{:?}", deserialized_from_file);*/

    // parse commandline arguments: translate path/to/translations.yaml path/to/translations.json
    // parse list of keys
    // parse list of languages
    // parse list of missing keys for languages
    // call google translator api for missing key strings based on english
    // store modified translations.yaml
    // create .json from translations.yaml

    Ok(())
}
