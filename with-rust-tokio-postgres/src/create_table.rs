use tokio_postgres;
use dotenvy::dotenv;
use openssl::ssl::{SslConnector, SslMethod};
use postgres_openssl::MakeTlsConnector;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {

    // Load environment variables from .env file
    dotenv()?;
    let conn_string = env::var("DATABASE_URL")?;

    let builder = SslConnector::builder(SslMethod::tls())?;
    let connector = MakeTlsConnector::new(builder.build());

    let (mut client, connection) = tokio_postgres::connect(&conn_string, connector).await?;
    println!("Connection established");

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    client.batch_execute("DROP TABLE IF EXISTS books;").await?;
    println!("Finished dropping table (if it existed).");

    client.batch_execute(
        "CREATE TABLE books (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            author VARCHAR(255),
            publication_year INT,
            in_stock BOOLEAN DEFAULT TRUE
        );"
    ).await?;
    println!("Finished creating table.");

    // Insert a single book record
    client.execute(
        "INSERT INTO books (title, author, publication_year, in_stock) VALUES ($1, $2, $3, $4)",
        &[&"The Catcher in the Rye", &"J.D. Salinger", &1951, &true],
    ).await?;
    println!("Inserted a single book.");

    // Start a transaction
    let transaction = client.transaction().await?;
    println!("Starting transaction to insert multiple books...");
    
    // Data to be inserted
    let books_to_insert = [
        ("The Hobbit", "J.R.R. Tolkien", 1937, true),
        ("1984", "George Orwell", 1949, true),
        ("Dune", "Frank Herbert", 1965, false),
    ];

    // Loop and insert within the transaction
    for book in &books_to_insert {
        transaction.execute(
            "INSERT INTO books (title, author, publication_year, in_stock) VALUES ($1, $2, $3, $4)",
            &[&book.0, &book.1, &book.2, &book.3],
        ).await?;
    }
    
    // Commit the transaction
    transaction.commit().await?;
    println!("Inserted 3 rows of data.");

    Ok(())
}