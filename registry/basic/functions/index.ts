export default {
	async fetch(request: Request): Promise<Response> {
		return Response.json({
			message: "Hello from Neon Functions!",
			method: request.method,
		});
	},
};
