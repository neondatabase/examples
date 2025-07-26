use tokio_postgres;
use dotenvy::dotenv;
use openssl::ssl::{SslConnector, SslMethod};
use postgres_openssl::MakeTlsConnector;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv()?;
    let conn_string = env::var("DATABASE_URL")?;

    let builder = SslConnector::builder(SslMethod::tls())?;
    let connector = MakeTlsConnector::new(builder.build());

    let (client, connection) = tokio_postgres::connect(&conn_string, connector).await?;
    println!("Connection established");

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    // Fetch all rows from the books table
    let rows = client.query("SELECT * FROM books ORDER BY publication_year;", &[]).await?;

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