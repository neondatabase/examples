import { Client } from "@neondatabase/serverless";

export async function onRequestPost(context) {
  const client = new Client(context.env.DATABASE_URL);
  await client.connect();

  // Extract the book details from the request body
  const book = await context.request.json();

  // Logic to insert a new book into your database
  const resp = await client.query(
    "INSERT INTO books_to_read (title, author) VALUES ($1, $2); ",
    [book.title, book.author]
  );

  // Check if insert query was successful
  if (resp.rowCount === 1) {
    return new Response(
      JSON.stringify({ success: true, error: null, data: book }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } else {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to insert book",
        data: book,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
}
