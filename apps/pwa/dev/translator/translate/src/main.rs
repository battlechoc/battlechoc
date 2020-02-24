use serde::{Serialize, Deserialize};
use std::fmt;

#[derive(Debug, Serialize, Deserialize)]
struct Translations {
    en: String,
    de: String,
}

impl fmt::Display for Translations {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "({}, {})", self.en, self.de)
    }
}

fn main() -> Result<(), serde_yaml::Error> {
    let contents = std::fs::read_to_string("/Users/sebastianbode/development/battlechoc/dev/texts/translations.yaml").expect("Something went wrong reading the file");
    let deserialized_from_file: serde_yaml::Value = serde_yaml::from_str(&contents)?;
    println!("{:?}", deserialized_from_file);

    Ok(())
}