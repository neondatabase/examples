import { neon } from "@neondatabase/serverless";

export default function Page() {
  async function create(formData: FormData) {
    "use server";
    // Create an instance of Neon's TS/JS driver
    const sql = neon(`${process.env.DATABASE_URL}`);
    // Create the comments table if it does not exist
    await sql("CREATE TABLE IF NOT EXISTS comments (comment TEXT)");
    const comment = formData.get("comment");
    // Insert the comment from the form into the Postgres (powered by Neon)
    await sql("INSERT INTO comments (comment) VALUES ($1)", [comment]);
  }
  return (
    <form
      action={create}
      className="bg-white h-screen w-screen flex flex-col items-center justify-center"
    >
      <div className="flex flex-col">
        <input
          type="text"
          name="comment"
          placeholder="Write a comment"
          className="rounded px-4 py-2 border outline-none focus:border-black"
        />
        <button
          type="submit"
          className="max-w-max px-3 py-1 mt-5 rounded bg-black text-white"
        >
          Submit &rarr;
        </button>
      </div>
    </form>
  );
}
