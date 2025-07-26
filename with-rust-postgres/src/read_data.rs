use dotenvy::dotenv;
use postgres::Client;
use openssl::ssl::{SslConnector, SslMethod};
use postgres_openssl::MakeTlsConnector;
use std::env;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv()?;
    let conn_string = env::var("DATABASE_URL")?;

    let builder = SslConnector::builder(SslMethod::tls())?;
    let connector = MakeTlsConnector::new(builder.build());

    let mut client = Client::connect(&conn_string, connector)?;
    println!("Connection established");

    // Fetch all rows from the books table
    let rows = client.query("SELECT * FROM books ORDER BY publication_year;", &[])?;

    println!("\n--- Book Library ---");
    for row in rows {
        let id: i32 = row.get("id");
        let title: &str = row.get("title");
        let author: &str = row.get("author");
        let year: i32 = row.get("publication_year");
        let in_stock: bool = row.get("in_stock");
        println!("ID: {}, Title: {}, Author: {}, Year: {}, In Stock: {}", id, title, author, year, in_stock);
    }
    println!("--------------------\n");

    Ok(())
}