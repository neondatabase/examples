use worker::{postgres_tls::PassthroughTls, *};

#[event(fetch)]
async fn main(_req: Request, env: Env, _ctx: Context) -> anyhow::Result<Response> {
    let postgres_url = env.var("POSTGRES_URL")?.to_string();
    let config = postgres_url.parse::<tokio_postgres::Config>()?;
    
    // parse the host and port from the postgres_url for more dynamicity
    let host = "ep-...us-east-2.aws.neon.tech";
    let port = 5432;

    // Connect using Worker Socket
    let socket = Socket::builder()
        .secure_transport(SecureTransport::StartTls)
        .connect(host, port)?;

    let (client, connection) = config.connect_raw(socket, PassthroughTls).await?;

    wasm_bindgen_futures::spawn_local(async move {
        if let Err(error) = connection.await {
            console_log!("connection error: {:?}", error);
        }
    });

    // `query` uses a prepared statement which is not supported if Hyperdrive caching is disabled.
    let rows = client.query("SELECT 1", &[]).await.unwrap();
    let value = rows[0].get::<_, i32>(0);
    console_log!("Value: {}", value);

    Ok(Response::ok(format!("{:?}", rows))?)
}
