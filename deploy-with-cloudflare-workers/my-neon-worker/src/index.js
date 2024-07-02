import { Client } from '@neondatabase/serverless';

export default {
	async fetch(request, env, ctx) {
		const client = new Client(env.DATABASE_URL);
		await client.connect();
		const { rows } = await client.query('SELECT * FROM books_to_read;');
		return new Response(JSON.stringify(rows));
	},
};
