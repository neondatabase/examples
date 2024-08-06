use std::env;
use dotenv::dotenv;
use postgres::Client;
use postgres_openssl::MakeTlsConnector;
use openssl::ssl::{SslConnector, SslMethod, SslVerifyMode};

fn main() {
    dotenv().ok();
    let mut builder = SslConnector::builder(SslMethod::tls()).unwrap();
    builder.set_verify(SslVerifyMode::NONE);
    let connector = MakeTlsConnector::new(builder.build());
    let database_url = &env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let mut client = Client::connect(database_url, connector).unwrap();
    client.simple_query("CREATE TABLE IF NOT EXISTS playing_with_neon(id SERIAL PRIMARY KEY, name TEXT NOT NULL, value REAL);").unwrap();
    client.simple_query("INSERT INTO playing_with_neon(name, value) SELECT LEFT(md5(i::TEXT), 10), random() FROM generate_series(1, 10) s(i);").unwrap();
    for row in client.query("SELECT id, name, value FROM playing_with_neon", &[]).unwrap() {
        let id: i32 = row.get(0);
        let name: &str = row.get(1);
        let value: f32 = row.get(2);
        println!("{} | {} | {}", id, name, value);
    }
}
