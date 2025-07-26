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

    // Delete a data row from the table
    let deleted_rows = client.execute(
        "DELETE FROM books WHERE title = $1",
        &[&"1984"],
    )?;
    
    if deleted_rows > 0 {
        println!("Deleted the book '1984' from the table.");
    } else {
        println!("'1984' not found in the table.");
    }
    
    Ok(())
}